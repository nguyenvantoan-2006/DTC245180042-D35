// ==============================================================================
// Router Dành cho Thí sinh (Student):
// Xem danh sách đề thi, làm bài trắc nghiệm với đồng hồ đếm ngược,
// TỰ ĐỘNG CHẤM ĐIỂM Ở SERVER (không tin dữ liệu điểm từ client), xem lịch sử & xem lại bài
// ==============================================================================

const express = require('express');
const { pool } = require('../db');
const { logQuizSubmission, logAppError } = require('../logger');
const { quizSubmissionsTotal } = require('../metrics');

const router = express.Router();

// Middleware yêu cầu đăng nhập
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// GET / - Chuyển hướng trang chủ về /quizzes hoặc /admin/dashboard
router.get('/', requireAuth, (req, res) => {
  if (req.session.user.role === 'admin' || req.session.user.role === 'teacher') {
    return res.redirect('/admin/dashboard');
  }
  res.redirect('/quizzes');
});

// GET /quizzes - Danh sách đề thi
router.get('/quizzes', requireAuth, async (req, res) => {
  try {
    const [quizzes] = await pool.query(
      `SELECT q.id, q.title, q.duration_min, COUNT(qst.id) AS question_count
       FROM quizzes q
       LEFT JOIN questions qst ON q.id = qst.quiz_id
       GROUP BY q.id
       ORDER BY q.id ASC`
    );

    res.render('quizzes', {
      title: 'Danh sách đề thi - Hệ thống Quiz',
      user: req.session.user,
      quizzes
    });
  } catch (err) {
    logAppError(err, req.session.user.username, req.path);
    res.status(500).render('error', {
      title: 'Lỗi máy chủ',
      user: req.session.user,
      message: 'Không thể tải danh sách đề thi: ' + err.message
    });
  }
});

// GET /quizzes/:id - Vào phòng thi, lấy câu hỏi và các lựa chọn
router.get('/quizzes/:id', requireAuth, async (req, res) => {
  const quizId = parseInt(req.params.id, 10);
  if (isNaN(quizId)) return res.redirect('/quizzes');

  try {
    const [quizRows] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (quizRows.length === 0) {
      return res.status(404).render('error', {
        title: 'Không tìm thấy đề thi',
        user: req.session.user,
        message: 'Đề thi yêu cầu không tồn tại.'
      });
    }
    const quiz = quizRows[0];

    // Lấy danh sách câu hỏi
    const [questions] = await pool.query(
      'SELECT id, content FROM questions WHERE quiz_id = ? ORDER BY id ASC',
      [quizId]
    );

    // Lấy danh sách đáp án (BẢO MẬT: KHÔNG SELECT is_correct gửi ra client)
    const [options] = await pool.query(
      `SELECT o.id, o.question_id, o.content 
       FROM options o 
       JOIN questions q ON o.question_id = q.id 
       WHERE q.quiz_id = ? 
       ORDER BY o.id ASC`,
      [quizId]
    );

    // Gộp đáp án vào từng câu hỏi
    const questionsWithOptions = questions.map(q => ({
      ...q,
      options: options.filter(opt => opt.question_id === q.id)
    }));

    res.render('quiz_detail', {
      title: `${quiz.title} - Làm bài thi`,
      user: req.session.user,
      quiz,
      questions: questionsWithOptions
    });
  } catch (err) {
    logAppError(err, req.session.user.username, req.path);
    res.status(500).render('error', {
      title: 'Lỗi',
      user: req.session.user,
      message: 'Không thể tải đề thi: ' + err.message
    });
  }
});

// POST /quizzes/:id/submit - Tự động chấm điểm ở SERVER
router.post('/quizzes/:id/submit', requireAuth, async (req, res) => {
  const quizId = parseInt(req.params.id, 10);
  const userId = req.session.user.id;
  const username = req.session.user.username;
  const userAnswers = req.body.answers || {}; // Dạng { "1": "4", "2": "7" }

  try {
    // 1. Lấy thông tin đề thi
    const [quizRows] = await pool.query('SELECT title FROM quizzes WHERE id = ?', [quizId]);
    const quizTitle = quizRows.length > 0 ? quizRows[0].title : `Đề thi #${quizId}`;

    // 2. Truy vấn đáp án chính xác từ Database (Chỉ Server có quyền biết)
    const [correctRows] = await pool.query(
      `SELECT q.id AS question_id, o.id AS correct_option_id
       FROM questions q
       JOIN options o ON q.id = o.question_id
       WHERE q.quiz_id = ? AND o.is_correct = 1`,
      [quizId]
    );

    const totalQuestions = correctRows.length;
    let correctCount = 0;
    const answerDetails = [];

    // 3. So sánh câu trả lời của thí sinh
    correctRows.forEach(row => {
      const qId = row.question_id.toString();
      const selectedOptionId = userAnswers[qId] ? parseInt(userAnswers[qId], 10) : null;
      const isCorrect = (selectedOptionId !== null && selectedOptionId === row.correct_option_id);
      if (isCorrect) {
        correctCount++;
      }
      answerDetails.push({
        questionId: row.question_id,
        selectedOptionId,
        isCorrect
      });
    });

    // 4. Tính điểm theo thang điểm 10 (làm tròn 2 chữ số thập phân)
    const rawScore = totalQuestions > 0 ? (correctCount / totalQuestions) * 10 : 0;
    const finalScore = Number(rawScore.toFixed(2));

    // 5. Lưu kết quả vào bảng attempts
    const [attemptResult] = await pool.query(
      'INSERT INTO attempts (user_id, quiz_id, score, total, submitted_at) VALUES (?, ?, ?, ?, NOW())',
      [userId, quizId, finalScore, totalQuestions]
    );
    const attemptId = attemptResult.insertId;

    // 6. Lưu chi tiết từng câu trả lời vào attempt_answers
    for (const detail of answerDetails) {
      await pool.query(
        'INSERT INTO attempt_answers (attempt_id, question_id, selected_option_id, is_correct) VALUES (?, ?, ?, ?)',
        [attemptId, detail.questionId, detail.selectedOptionId, detail.isCorrect ? 1 : 0]
      );
    }

    // 7. Ghi nhật ký hoạt động
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    await pool.query(
      'INSERT INTO activity_logs (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
      [
        userId,
        username,
        'NỘP BÀI THI',
        `Nộp bài '${quizTitle}' - Đạt ${finalScore}/10 điểm (${correctCount}/${totalQuestions} câu đúng)`,
        clientIp
      ]
    );

    // 8. Cập nhật Prometheus metric & Pino logger
    quizSubmissionsTotal.inc();
    logQuizSubmission(username, quizId, finalScore, totalQuestions, req.path);

    res.redirect(`/quizzes/${quizId}/result?attemptId=${attemptId}`);
  } catch (err) {
    logAppError(err, username, req.path);
    res.status(500).render('error', {
      title: 'Lỗi nộp bài',
      user: req.session.user,
      message: 'Không thể chấm điểm và lưu kết quả: ' + err.message
    });
  }
});

// GET /quizzes/:id/result - Xem kết quả vừa làm xong
router.get('/quizzes/:id/result', requireAuth, async (req, res) => {
  const quizId = parseInt(req.params.id, 10);
  const attemptId = parseInt(req.query.attemptId, 10);
  const userId = req.session.user.id;
  const userRole = req.session.user.role;

  if (!attemptId) return res.redirect('/quizzes');

  try {
    let query = `
      SELECT a.*, q.title AS quiz_title 
      FROM attempts a 
      JOIN quizzes q ON a.quiz_id = q.id 
      WHERE a.id = ?
    `;
    const params = [attemptId];

    if (userRole !== 'admin' && userRole !== 'teacher') {
      query += ' AND a.user_id = ?';
      params.push(userId);
    }

    const [attemptRows] = await pool.query(query, params);

    if (attemptRows.length === 0) {
      return res.redirect('/quizzes');
    }

    res.render('quiz_result', {
      title: 'Kết quả bài thi - Hệ thống Quiz',
      user: req.session.user,
      attempt: attemptRows[0]
    });
  } catch (err) {
    logAppError(err, req.session.user.username, req.path);
    res.status(500).render('error', {
      title: 'Lỗi',
      user: req.session.user,
      message: 'Không thể tải kết quả: ' + err.message
    });
  }
});

// GET /quizzes/attempts/:id/review - Xem chi tiết đáp án & câu trả lời của bài làm
router.get('/quizzes/attempts/:id/review', requireAuth, async (req, res) => {
  const attemptId = parseInt(req.params.id, 10);
  const userId = req.session.user.id;
  const userRole = req.session.user.role;

  if (isNaN(attemptId)) return res.redirect('/history');

  try {
    let attemptQuery = `
      SELECT a.*, q.title AS quiz_title, u.username
      FROM attempts a
      JOIN quizzes q ON a.quiz_id = q.id
      JOIN users u ON a.user_id = u.id
      WHERE a.id = ?
    `;
    const params = [attemptId];

    if (userRole !== 'admin' && userRole !== 'teacher') {
      attemptQuery += ' AND a.user_id = ?';
      params.push(userId);
    }

    const [attemptRows] = await pool.query(attemptQuery, params);
    if (attemptRows.length === 0) {
      return res.redirect('/history');
    }
    const attempt = attemptRows[0];

    // Lấy danh sách câu hỏi của bài thi
    const [questions] = await pool.query(
      'SELECT id, content FROM questions WHERE quiz_id = ? ORDER BY id ASC',
      [attempt.quiz_id]
    );

    // Lấy các đáp án
    const [options] = await pool.query(
      `SELECT o.id, o.question_id, o.content, o.is_correct 
       FROM options o 
       JOIN questions q ON o.question_id = q.id 
       WHERE q.quiz_id = ? 
       ORDER BY o.id ASC`,
      [attempt.quiz_id]
    );

    // Lấy câu trả lời của thí sinh từ attempt_answers
    const [userAnswers] = await pool.query(
      'SELECT question_id, selected_option_id, is_correct FROM attempt_answers WHERE attempt_id = ?',
      [attemptId]
    );

    const answersMap = {};
    let correctCount = 0;
    userAnswers.forEach(ans => {
      answersMap[ans.question_id] = {
        selectedOptionId: ans.selected_option_id,
        isCorrect: Boolean(ans.is_correct)
      };
      if (ans.is_correct) correctCount++;
    });

    const detailedQuestions = questions.map(q => {
      const ansInfo = answersMap[q.id] || { selectedOptionId: null, isCorrect: false };
      return {
        ...q,
        selectedOptionId: ansInfo.selectedOptionId,
        isCorrect: ansInfo.isCorrect,
        options: options.filter(opt => opt.question_id === q.id)
      };
    });

    res.render('quiz_review', {
      title: `Chi tiết bài làm: ${attempt.quiz_title}`,
      user: req.session.user,
      attempt,
      questions: detailedQuestions,
      correctCount
    });
  } catch (err) {
    logAppError(err, req.session.user.username, req.path);
    res.status(500).render('error', {
      title: 'Lỗi nạp bài thi',
      user: req.session.user,
      message: 'Không thể xem chi tiết bài làm: ' + err.message
    });
  }
});

// GET /history - Lịch sử các lần làm bài của thí sinh
router.get('/history', requireAuth, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [history] = await pool.query(
      `SELECT a.id, a.score, a.total, a.submitted_at, q.title AS quiz_title, q.id AS quiz_id
       FROM attempts a
       JOIN quizzes q ON a.quiz_id = q.id
       WHERE a.user_id = ?
       ORDER BY a.submitted_at DESC`,
      [userId]
    );

    res.render('history', {
      title: 'Lịch sử bài thi - Hệ thống Quiz',
      user: req.session.user,
      history
    });
  } catch (err) {
    logAppError(err, req.session.user.username, req.path);
    res.status(500).render('error', {
      title: 'Lỗi',
      user: req.session.user,
      message: 'Không thể tải lịch sử làm bài: ' + err.message
    });
  }
});

module.exports = router;
