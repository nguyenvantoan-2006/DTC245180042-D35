// ==============================================================================
// Router Dành cho Quản trị viên (Admin) & Giáo viên (Teacher):
// Dashboard Thống kê tổng quan, Quản lý Đề thi, Quản lý Câu hỏi,
// Quản lý Toàn bộ Bài nộp của Thí sinh, Quản lý Người dùng & Nhật ký hoạt động
// ==============================================================================

const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { logAppError } = require('../logger');

const router = express.Router();

// Middleware kiểm tra quyền Quản trị viên (Admin) hoặc Giáo viên (Teacher)
function requireAdminOrTeacher(req, res, next) {
  if (!req.session || !req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'teacher')) {
    return res.status(403).render('error', {
      title: '403 Forbidden',
      user: req.session ? req.session.user : null,
      message: 'Truy cập bị từ chối! Bạn không có quyền quản trị viên hoặc giáo viên để vào khu vực này.'
    });
  }
  next();
}

// Middleware chỉ dành riêng cho Admin (VD: Quản lý người dùng)
function requireStrictAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).render('error', {
      title: '403 Forbidden',
      user: req.session ? req.session.user : null,
      message: 'Chức năng này chỉ dành riêng cho Quản trị viên tối cao (Admin)!'
    });
  }
  next();
}

router.use(requireAdminOrTeacher);

// Helper ghi log hoạt động
async function logActivity(req, action, details) {
  try {
    const userId = req.session?.user?.id || null;
    const username = req.session?.user?.username || 'admin';
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    await pool.query(
      'INSERT INTO activity_logs (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
      [userId, username, action, details, clientIp]
    );
  } catch (e) {
    // Không làm gián đoạn request chính nếu ghi log thất bại
  }
}

// ==============================================================================
// 1. DASHBOARD TỔNG QUAN
// ==============================================================================
router.get('/', (req, res) => res.redirect('/admin/dashboard'));

router.get('/dashboard', async (req, res) => {
  try {
    const [[quizzesCount]] = await pool.query('SELECT COUNT(*) AS count FROM quizzes');
    const [[questionsCount]] = await pool.query('SELECT COUNT(*) AS count FROM questions');
    const [[usersCount]] = await pool.query('SELECT COUNT(*) AS count FROM users');
    const [[attemptsCount]] = await pool.query('SELECT COUNT(*) AS count FROM attempts');
    const [[scoreStats]] = await pool.query('SELECT AVG(score) AS avgScore, COUNT(CASE WHEN score >= 5.0 THEN 1 END) AS passCount FROM attempts');

    const totalAttempts = attemptsCount.count || 0;
    const avgScore = scoreStats.avgScore ? Number(scoreStats.avgScore).toFixed(1) : '0.0';
    const passCount = scoreStats.passCount || 0;
    const passRate = totalAttempts > 0 ? Math.round((passCount / totalAttempts) * 100) : 0;

    // Lấy 5 bài nộp mới nhất
    const [recentAttempts] = await pool.query(`
      SELECT a.id, a.score, a.total, a.submitted_at, u.username, q.title AS quiz_title
      FROM attempts a
      JOIN users u ON a.user_id = u.id
      JOIN quizzes q ON a.quiz_id = q.id
      ORDER BY a.submitted_at DESC
      LIMIT 5
    `);

    // Lấy 5 hoạt động gần nhất
    const [recentActivities] = await pool.query(`
      SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 6
    `);

    res.render('admin_dashboard', {
      title: 'Bảng điều khiển Quản trị - Hệ thống Quiz',
      user: req.session.user,
      stats: {
        totalQuizzes: quizzesCount.count,
        totalQuestions: questionsCount.count,
        totalUsers: usersCount.count,
        totalAttempts,
        avgScore,
        passRate
      },
      recentAttempts,
      recentActivities
    });
  } catch (err) {
    logAppError(err, req.session.user.username, req.path);
    res.status(500).render('error', {
      title: 'Lỗi',
      user: req.session.user,
      message: 'Không thể tải bảng điều khiển: ' + err.message
    });
  }
});

// ==============================================================================
// 2. QUẢN LÝ ĐỀ THI
// ==============================================================================
router.get('/quizzes', async (req, res) => {
  try {
    const [quizzes] = await pool.query(
      `SELECT q.*, COUNT(qst.id) AS question_count
       FROM quizzes q
       LEFT JOIN questions qst ON q.id = qst.quiz_id
       GROUP BY q.id
       ORDER BY q.id DESC`
    );

    res.render('admin_quizzes', {
      title: 'Quản lý Đề thi - Admin',
      user: req.session.user,
      quizzes,
      success: req.session.flashSuccess || null,
      error: req.session.flashError || null
    });
    req.session.flashSuccess = null;
    req.session.flashError = null;
  } catch (err) {
    logAppError(err, req.session.user.username, req.path);
    res.status(500).render('error', {
      title: 'Lỗi',
      user: req.session.user,
      message: 'Lỗi nạp danh sách đề thi: ' + err.message
    });
  }
});

// GET /admin/quizzes/new - Form tạo đề thi mới
router.get('/quizzes/new', (req, res) => {
  res.render('admin_quiz_form', {
    title: 'Tạo đề thi mới - Admin',
    user: req.session.user,
    quiz: null,
    error: null
  });
});

// POST /admin/quizzes/new - Xử lý lưu đề thi mới
router.post(
  '/quizzes/new',
  [
    body('title').trim().notEmpty().withMessage('Tiêu đề đề thi không được để trống'),
    body('duration_min').isInt({ min: 1, max: 180 }).withMessage('Thời lượng thi phải từ 1 đến 180 phút')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    const { title, duration_min } = req.body;

    if (!errors.isEmpty()) {
      return res.status(400).render('admin_quiz_form', {
        title: 'Tạo đề thi mới - Admin',
        user: req.session.user,
        quiz: { title, duration_min },
        error: errors.array()[0].msg
      });
    }

    try {
      const [result] = await pool.query(
        'INSERT INTO quizzes (title, duration_min, created_by) VALUES (?, ?, ?)',
        [title, parseInt(duration_min, 10), req.session.user.id]
      );
      await logActivity(req, 'TẠO ĐỀ THI', `Tạo đề thi mới '#${result.insertId} - ${title}' (${duration_min} phút)`);
      req.session.flashSuccess = 'Đã tạo đề thi thành công! Bây giờ bạn có thể thêm các câu hỏi.';
      res.redirect(`/admin/quizzes/${result.insertId}/questions`);
    } catch (err) {
      logAppError(err, req.session.user.username, req.path);
      res.status(500).render('admin_quiz_form', {
        title: 'Tạo đề thi mới - Admin',
        user: req.session.user,
        quiz: { title, duration_min },
        error: 'Lỗi lưu đề thi: ' + err.message
      });
    }
  }
);

// GET /admin/quizzes/:id/edit - Form sửa đề thi
router.get('/quizzes/:id/edit', async (req, res) => {
  const quizId = parseInt(req.params.id, 10);
  try {
    const [rows] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (rows.length === 0) return res.redirect('/admin/quizzes');

    res.render('admin_quiz_form', {
      title: 'Chỉnh sửa đề thi - Admin',
      user: req.session.user,
      quiz: rows[0],
      error: null
    });
  } catch (err) {
    res.redirect('/admin/quizzes');
  }
});

// POST /admin/quizzes/:id/edit - Cập nhật đề thi
router.post(
  '/quizzes/:id/edit',
  [
    body('title').trim().notEmpty().withMessage('Tiêu đề đề thi không được để trống'),
    body('duration_min').isInt({ min: 1, max: 180 }).withMessage('Thời lượng thi phải từ 1 đến 180 phút')
  ],
  async (req, res) => {
    const quizId = parseInt(req.params.id, 10);
    const errors = validationResult(req);
    const { title, duration_min } = req.body;

    if (!errors.isEmpty()) {
      return res.status(400).render('admin_quiz_form', {
        title: 'Chỉnh sửa đề thi - Admin',
        user: req.session.user,
        quiz: { id: quizId, title, duration_min },
        error: errors.array()[0].msg
      });
    }

    try {
      await pool.query(
        'UPDATE quizzes SET title = ?, duration_min = ? WHERE id = ?',
        [title, parseInt(duration_min, 10), quizId]
      );
      await logActivity(req, 'SỬA ĐỀ THI', `Cập nhật thông tin đề thi #${quizId} - ${title}`);
      req.session.flashSuccess = 'Đã cập nhật đề thi thành công!';
      res.redirect('/admin/quizzes');
    } catch (err) {
      logAppError(err, req.session.user.username, req.path);
      res.redirect('/admin/quizzes');
    }
  }
);

// POST /admin/quizzes/:id/delete - Xóa đề thi
router.post('/quizzes/:id/delete', async (req, res) => {
  const quizId = parseInt(req.params.id, 10);
  try {
    const [[quiz]] = await pool.query('SELECT title FROM quizzes WHERE id = ?', [quizId]);
    await pool.query('DELETE FROM quizzes WHERE id = ?', [quizId]);
    await logActivity(req, 'XÓA ĐỀ THI', `Xóa đề thi #${quizId} (${quiz ? quiz.title : ''})`);
    req.session.flashSuccess = 'Đã xóa đề thi thành công!';
  } catch (err) {
    req.session.flashError = 'Lỗi khi xóa đề thi: ' + err.message;
  }
  res.redirect('/admin/quizzes');
});

// ==============================================================================
// 3. QUẢN LÝ CÂU HỎI
// ==============================================================================
router.get('/quizzes/:id/questions', async (req, res) => {
  const quizId = parseInt(req.params.id, 10);
  try {
    const [quizRows] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (quizRows.length === 0) return res.redirect('/admin/quizzes');

    const [questions] = await pool.query(
      'SELECT * FROM questions WHERE quiz_id = ? ORDER BY id ASC',
      [quizId]
    );

    const [options] = await pool.query(
      `SELECT o.* 
       FROM options o 
       JOIN questions q ON o.question_id = q.id 
       WHERE q.quiz_id = ? 
       ORDER BY o.id ASC`,
      [quizId]
    );

    const fullQuestions = questions.map(q => ({
      ...q,
      options: options.filter(opt => opt.question_id === q.id)
    }));

    res.render('admin_questions', {
      title: `Quản lý câu hỏi: ${quizRows[0].title}`,
      user: req.session.user,
      quiz: quizRows[0],
      questions: fullQuestions,
      error: req.session.flashError || null,
      success: req.session.flashSuccess || null
    });
    req.session.flashError = null;
    req.session.flashSuccess = null;
  } catch (err) {
    logAppError(err, req.session.user.username, req.path);
    res.redirect('/admin/quizzes');
  }
});

// POST /admin/quizzes/:id/questions/add - Thêm câu hỏi và 4 đáp án
router.post(
  '/quizzes/:id/questions/add',
  [
    body('content').trim().notEmpty().withMessage('Nội dung câu hỏi không được để trống'),
    body('option1').trim().notEmpty().withMessage('Đáp án 1 không được để trống'),
    body('option2').trim().notEmpty().withMessage('Đáp án 2 không được để trống'),
    body('option3').trim().notEmpty().withMessage('Đáp án 3 không được để trống'),
    body('option4').trim().notEmpty().withMessage('Đáp án 4 không được để trống'),
    body('correct_option').isIn(['1', '2', '3', '4']).withMessage('Vui lòng chọn 1 đáp án đúng')
  ],
  async (req, res) => {
    const quizId = parseInt(req.params.id, 10);
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      req.session.flashError = errors.array()[0].msg;
      return res.redirect(`/admin/quizzes/${quizId}/questions`);
    }

    const { content, option1, option2, option3, option4, correct_option } = req.body;
    const correctIdx = parseInt(correct_option, 10);

    const opts = [
      { text: option1, isCorrect: correctIdx === 1 },
      { text: option2, isCorrect: correctIdx === 2 },
      { text: option3, isCorrect: correctIdx === 3 },
      { text: option4, isCorrect: correctIdx === 4 }
    ];

    try {
      const [qResult] = await pool.query(
        'INSERT INTO questions (quiz_id, content) VALUES (?, ?)',
        [quizId, content]
      );
      const questionId = qResult.insertId;

      for (const opt of opts) {
        await pool.query(
          'INSERT INTO options (question_id, content, is_correct) VALUES (?, ?, ?)',
          [questionId, opt.text, opt.isCorrect ? 1 : 0]
        );
      }

      await logActivity(req, 'THÊM CÂU HỎI', `Thêm câu hỏi mới vào đề thi #${quizId}`);
      req.session.flashSuccess = 'Đã thêm câu hỏi và 4 đáp án thành công!';
    } catch (err) {
      logAppError(err, req.session.user.username, req.path);
      req.session.flashError = 'Lỗi khi thêm câu hỏi: ' + err.message;
    }

    res.redirect(`/admin/quizzes/${quizId}/questions`);
  }
);

// POST /admin/questions/:id/delete - Xóa câu hỏi
router.post('/questions/:id/delete', async (req, res) => {
  const questionId = parseInt(req.params.id, 10);
  const quizId = parseInt(req.body.quiz_id, 10);

  try {
    await pool.query('DELETE FROM questions WHERE id = ?', [questionId]);
    await logActivity(req, 'XÓA CÂU HỎI', `Xóa câu hỏi #${questionId} khỏi đề thi #${quizId}`);
    req.session.flashSuccess = 'Đã xóa câu hỏi thành công!';
  } catch (err) {
    req.session.flashError = 'Lỗi khi xóa câu hỏi: ' + err.message;
  }

  res.redirect(`/admin/quizzes/${quizId}/questions`);
});

// ==============================================================================
// 4. QUẢN LÝ BÀI NỘP CỦA THÍ SINH (SUBMISSIONS & SCORES)
// ==============================================================================
router.get('/attempts', async (req, res) => {
  const quizId = req.query.quiz_id ? parseInt(req.query.quiz_id, 10) : null;
  const search = req.query.search ? req.query.search.trim() : null;

  try {
    // Lấy danh sách đề thi để hiển thị dropdown lọc
    const [quizzes] = await pool.query('SELECT id, title FROM quizzes ORDER BY id ASC');

    let query = `
      SELECT a.id, a.score, a.total, a.submitted_at, u.username, q.title AS quiz_title, q.id AS quiz_id
      FROM attempts a
      JOIN users u ON a.user_id = u.id
      JOIN quizzes q ON a.quiz_id = q.id
      WHERE 1=1
    `;
    const params = [];

    if (quizId) {
      query += ' AND a.quiz_id = ?';
      params.push(quizId);
    }

    if (search) {
      query += ' AND u.username LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY a.submitted_at DESC';

    const [attempts] = await pool.query(query, params);

    res.render('admin_attempts', {
      title: 'Quản lý Kết quả thi - Admin',
      user: req.session.user,
      attempts,
      quizzes,
      selectedQuizId: quizId,
      search
    });
  } catch (err) {
    logAppError(err, req.session.user.username, req.path);
    res.status(500).render('error', {
      title: 'Lỗi',
      user: req.session.user,
      message: 'Không thể nạp danh sách kết quả bài làm: ' + err.message
    });
  }
});

// POST /admin/attempts/:id/delete - Xóa lượt nộp (reset bài thi cho học sinh)
router.post('/attempts/:id/delete', async (req, res) => {
  const attemptId = parseInt(req.params.id, 10);
  try {
    await pool.query('DELETE FROM attempts WHERE id = ?', [attemptId]);
    await logActivity(req, 'XÓA BÀI NỘP', `Quản trị viên xóa lượt thi #${attemptId} để thí sinh thi lại`);
    res.redirect('/admin/attempts');
  } catch (err) {
    res.redirect('/admin/attempts');
  }
});

// ==============================================================================
// 5. QUẢN LÝ NGƯỜI DÙNG & TÀI KHOẢN (Chỉ dành cho Admin)
// ==============================================================================
router.get('/users', requireStrictAdmin, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, role, status, created_at FROM users ORDER BY id DESC'
    );

    res.render('admin_users', {
      title: 'Quản lý người dùng - Admin',
      user: req.session.user,
      users,
      createdUser: req.session.createdUserCredential || null,
      success: req.session.flashSuccess || null,
      error: req.session.flashError || null
    });
    req.session.createdUserCredential = null;
    req.session.flashSuccess = null;
    req.session.flashError = null;
  } catch (err) {
    logAppError(err, req.session.user.username, req.path);
    res.status(500).render('error', {
      title: 'Lỗi',
      user: req.session.user,
      message: 'Không thể nạp danh sách người dùng: ' + err.message
    });
  }
});

// POST /admin/users/new - Thêm người dùng mới (Trực tiếp từ Admin -> Mặc định Active)
router.post(
  '/users/new',
  requireStrictAdmin,
  [
    body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username từ 3 đến 30 ký tự'),
    body('password').isLength({ min: 6 }).withMessage('Mật khẩu tối thiểu 6 ký tự'),
    body('role').isIn(['admin', 'teacher', 'student']).withMessage('Vai trò không hợp lệ')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.flashError = errors.array()[0].msg;
      return res.redirect('/admin/users');
    }

    const { username, password, role } = req.body;

    try {
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
      if (existing.length > 0) {
        req.session.flashError = `Tên đăng nhập '${username}' đã tồn tại!`;
        return res.redirect('/admin/users');
      }

      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);

      const [resUser] = await pool.query(
        'INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, ?, ?)',
        [username, hash, role, 'active']
      );

      await logActivity(req, 'TẠO TÀI KHOẢN', `Tạo tài khoản mới '${username}' với quyền ${role} (Đã kích hoạt)`);
      
      // Lưu thông tin tài khoản và mật khẩu vừa tạo để hiển thị thông báo nổi bật cho Admin
      req.session.createdUserCredential = {
        username,
        password,
        role,
        isReset: false
      };
      req.session.flashSuccess = `Đã tạo tài khoản '${username}' thành công!`;
    } catch (err) {
      req.session.flashError = 'Lỗi tạo tài khoản: ' + err.message;
    }

    res.redirect('/admin/users');
  }
);

// POST /admin/users/:id/approve - Phê duyệt tài khoản đang chờ
router.post('/users/:id/approve', requireStrictAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  try {
    const [[targetUser]] = await pool.query('SELECT username, role, status FROM users WHERE id = ?', [userId]);
    if (!targetUser) {
      req.session.flashError = 'Tài khoản không tồn tại!';
      return res.redirect('/admin/users');
    }

    await pool.query("UPDATE users SET status = 'active' WHERE id = ?", [userId]);
    await logActivity(req, 'DUYỆT TÀI KHOẢN', `Admin phê duyệt tài khoản '${targetUser.username}' (Vai trò: ${targetUser.role})`);
    req.session.flashSuccess = `Đã phê duyệt tài khoản '${targetUser.username}' thành công! Người dùng hiện đã có thể đăng nhập.`;
  } catch (err) {
    req.session.flashError = 'Lỗi khi phê duyệt tài khoản: ' + err.message;
  }
  res.redirect('/admin/users');
});

// POST /admin/users/:id/reject - Từ chối phê duyệt tài khoản
router.post('/users/:id/reject', requireStrictAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  try {
    const [[targetUser]] = await pool.query('SELECT username, role, status FROM users WHERE id = ?', [userId]);
    if (!targetUser) {
      req.session.flashError = 'Tài khoản không tồn tại!';
      return res.redirect('/admin/users');
    }

    await pool.query("UPDATE users SET status = 'rejected' WHERE id = ?", [userId]);
    await logActivity(req, 'TỪ CHỐI TÀI KHOẢN', `Admin từ chối cấp quyền tài khoản '${targetUser.username}' (Vai trò: ${targetUser.role})`);
    req.session.flashSuccess = `Đã từ chối cấp quyền tài khoản '${targetUser.username}'.`;
  } catch (err) {
    req.session.flashError = 'Lỗi khi từ chối tài khoản: ' + err.message;
  }
  res.redirect('/admin/users');
});

// POST /admin/users/:id/reset-password - Đổi/Reset mật khẩu cho người dùng
router.post('/users/:id/reset-password', requireStrictAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    req.session.flashError = 'Mật khẩu mới phải có tối thiểu 6 ký tự!';
    return res.redirect('/admin/users');
  }

  try {
    const [[user]] = await pool.query('SELECT username, role FROM users WHERE id = ?', [userId]);
    if (!user) {
      req.session.flashError = 'Người dùng không tồn tại!';
      return res.redirect('/admin/users');
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
    await logActivity(req, 'ĐỔI MẬT KHẨU', `Đổi mật khẩu tài khoản '${user.username}'`);

    req.session.createdUserCredential = {
      username: user.username,
      password: newPassword,
      role: user.role,
      isReset: true
    };
    req.session.flashSuccess = `Đã cập nhật mật khẩu cho tài khoản '${user.username}'!`;
  } catch (err) {
    req.session.flashError = 'Lỗi cập nhật mật khẩu: ' + err.message;
  }

  res.redirect('/admin/users');
});

// POST /admin/users/:id/delete - Xóa người dùng
router.post('/users/:id/delete', requireStrictAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  if (userId === req.session.user.id) {
    req.session.flashError = 'Bạn không thể tự xóa tài khoản của chính mình!';
    return res.redirect('/admin/users');
  }

  try {
    const [[userToDelete]] = await pool.query('SELECT username FROM users WHERE id = ?', [userId]);
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    await logActivity(req, 'XÓA TÀI KHOẢN', `Xóa tài khoản '${userToDelete ? userToDelete.username : userId}'`);
    req.session.flashSuccess = 'Đã xóa tài khoản thành công!';
  } catch (err) {
    req.session.flashError = 'Lỗi khi xóa người dùng: ' + err.message;
  }

  res.redirect('/admin/users');
});

// ==============================================================================
// 6. NHẬT KÝ HOẠT ĐỘNG HỆ THỐNG (AUDIT LOGS)
// ==============================================================================
router.get('/activity', async (req, res) => {
  const actionFilter = req.query.action || null;

  try {
    let query = 'SELECT * FROM activity_logs';
    const params = [];

    if (actionFilter) {
      query += ' WHERE action = ?';
      params.push(actionFilter);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const [activities] = await pool.query(query, params);

    res.render('admin_activity', {
      title: 'Nhật ký hoạt động hệ thống - Admin',
      user: req.session.user,
      activities,
      actionFilter
    });
  } catch (err) {
    logAppError(err, req.session.user.username, req.path);
    res.status(500).render('error', {
      title: 'Lỗi',
      user: req.session.user,
      message: 'Không thể nạp nhật ký hoạt động: ' + err.message
    });
  }
});

module.exports = router;
