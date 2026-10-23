// ==============================================================================
// Router Xác thực: Đăng ký / Đăng nhập / Đăng xuất
// Bảo vệ mật khẩu bằng bcrypt, chống SQL Injection bằng Prepared Statement
// ==============================================================================

const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { logLoginSuccess, logLoginFailure, logAppError } = require('../logger');
const { quizLoginTotal } = require('../metrics');

const router = express.Router();

// Middleware chuyển hướng nếu đã đăng nhập
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'admin' || req.session.user.role === 'teacher') {
      return res.redirect('/admin/quizzes');
    }
    return res.redirect('/quizzes');
  }
  next();
}

// GET /login - Hiển thị giao diện đăng nhập
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', {
    title: 'Đăng nhập - Hệ thống Quiz',
    error: req.session.flashError || null,
    success: req.session.flashSuccess || null
  });
  req.session.flashError = null;
  req.session.flashSuccess = null;
});

// POST /login - Xử lý đăng nhập với express-validator và rate limit Nginx
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Vui lòng nhập tên đăng nhập'),
    body('password').notEmpty().withMessage('Vui lòng nhập mật khẩu')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    const { username, password } = req.body;

    if (!errors.isEmpty()) {
      quizLoginTotal.inc({ result: 'failure' });
      logLoginFailure(username, req.path, 'Dữ liệu không hợp lệ');
      return res.status(400).render('login', {
        title: 'Đăng nhập - Hệ thống Quiz',
        error: errors.array()[0].msg,
        success: null
      });
    }

    try {
      // Prepared Statement chống SQL Injection
      const [rows] = await pool.query(
        'SELECT id, username, password_hash, role, status FROM users WHERE username = ?',
        [username]
      );

      if (rows.length === 0) {
        quizLoginTotal.inc({ result: 'failure' });
        logLoginFailure(username, req.path, 'Tài khoản không tồn tại');
        return res.status(401).render('login', {
          title: 'Đăng nhập - Hệ thống Quiz',
          error: 'Tên đăng nhập hoặc mật khẩu không chính xác',
          success: null
        });
      }

      const user = rows[0];
      const isMatch = await bcrypt.compare(password, user.password_hash);

      if (!isMatch) {
        quizLoginTotal.inc({ result: 'failure' });
        logLoginFailure(username, req.path, 'Mật khẩu sai');
        return res.status(401).render('login', {
          title: 'Đăng nhập - Hệ thống Quiz',
          error: 'Tên đăng nhập hoặc mật khẩu không chính xác',
          success: null
        });
      }

      // Kiểm tra trạng thái phê duyệt tài khoản (status)
      if (user.status === 'pending') {
        quizLoginTotal.inc({ result: 'failure' });
        logLoginFailure(username, req.path, 'Tài khoản đang chờ duyệt');
        return res.status(403).render('login', {
          title: 'Đăng nhập - Hệ thống Quiz',
          error: 'Tài khoản của bạn đang ở trạng thái CHỜ DUYỆT. Vui lòng đợi Quản trị viên (Admin) xét duyệt trước khi đăng nhập!',
          success: null
        });
      }

      if (user.status === 'rejected') {
        quizLoginTotal.inc({ result: 'failure' });
        logLoginFailure(username, req.path, 'Tài khoản đã bị từ chối');
        return res.status(403).render('login', {
          title: 'Đăng nhập - Hệ thống Quiz',
          error: 'Tài khoản của bạn đã bị Quản trị viên TỪ CHỐI kích hoạt. Vui lòng liên hệ nhà trường!',
          success: null
        });
      }

      // Đăng nhập thành công -> Lưu session
      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role
      };

      quizLoginTotal.inc({ result: 'success' });
      logLoginSuccess(user.username, req.path);

      // Ghi nhật ký đăng nhập
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      pool.query(
        'INSERT INTO activity_logs (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
        [user.id, user.username, 'ĐĂNG NHẬP', `Đăng nhập thành công với vai trò ${user.role}`, clientIp]
      ).catch(() => {});

      if (user.role === 'admin' || user.role === 'teacher') {
        return res.redirect('/admin/dashboard');
      }
      return res.redirect('/quizzes');
    } catch (err) {
      logAppError(err, username, req.path);
      return res.status(500).render('login', {
        title: 'Đăng nhập - Hệ thống Quiz',
        error: 'Có lỗi hệ thống xảy ra, vui lòng thử lại sau',
        success: null
      });
    }
  }
);

// GET /register - Hiển thị form đăng ký
router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('register', {
    title: 'Đăng ký tài khoản - Hệ thống Quiz',
    error: req.session.flashError || null
  });
  req.session.flashError = null;
});

// POST /register - Đăng ký tài khoản mới (Chỉ dành cho Student và Teacher, mặc định Pending)
router.post(
  '/register',
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Tên đăng nhập phải từ 3 đến 30 ký tự')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Tên đăng nhập chỉ chứa chữ cái, số và dấu gạch dưới'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Mật khẩu phải có độ dài tối thiểu 6 ký tự'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Mật khẩu xác nhận không khớp');
      }
      return true;
    }),
    body('role').isIn(['student', 'teacher']).withMessage('Vai trò đăng ký không hợp lệ! Chỉ cho phép Sinh viên hoặc Giáo viên.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    const { username, password, role } = req.body;

    if (!errors.isEmpty()) {
      return res.status(400).render('register', {
        title: 'Đăng ký tài khoản - Hệ thống Quiz',
        error: errors.array()[0].msg
      });
    }

    // Bảo mật: Tuyệt đối không cho phép đăng ký vai trò admin công cộng
    if (role !== 'student' && role !== 'teacher') {
      return res.status(400).render('register', {
        title: 'Đăng ký tài khoản - Hệ thống Quiz',
        error: 'Chỉ có Sinh viên/Học sinh và Giáo viên mới có quyền đăng ký. Tài khoản Quản trị viên không thể tự đăng ký!'
      });
    }

    try {
      // Kiểm tra tên người dùng đã tồn tại chưa
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
      if (existing.length > 0) {
        return res.status(400).render('register', {
          title: 'Đăng ký tài khoản - Hệ thống Quiz',
          error: 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác'
        });
      }

      // Hash mật khẩu an toàn
      const passwordHash = await bcrypt.hash(password, 10);
      const assignedRole = role === 'teacher' ? 'teacher' : 'student';

      // Tài khoản tự đăng ký bắt buộc phải có status = 'pending' để chờ Admin duyệt
      const [insRes] = await pool.query(
        'INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, ?, ?)',
        [username, passwordHash, assignedRole, 'pending']
      );

      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      pool.query(
        'INSERT INTO activity_logs (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
        [insRes.insertId, username, 'ĐĂNG KÝ', `Đăng ký tài khoản mới (${assignedRole}) - Trạng thái: Chờ Admin duyệt`, clientIp]
      ).catch(() => {});

      req.session.flashSuccess = 'Đăng ký tài khoản thành công! Tài khoản đang ở trạng thái CHỜ DUYỆT. Vui lòng đợi Quản trị viên (Admin) phê duyệt trước khi đăng nhập.';
      return res.redirect('/login');
    } catch (err) {
      logAppError(err, username, req.path);
      return res.status(500).render('register', {
        title: 'Đăng ký tài khoản - Hệ thống Quiz',
        error: 'Lỗi đăng ký tài khoản: ' + err.message
      });
    }
  }
);

// GET /logout - Đăng xuất và hủy phiên
router.get('/logout', (req, res) => {
  const user = req.session ? req.session.user : null;
  if (user) {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    pool.query(
      'INSERT INTO activity_logs (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
      [user.id, user.username, 'ĐĂNG XUẤT', 'Người dùng đã đăng xuất khỏi phiên làm việc', clientIp]
    ).catch(() => {});
  }
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
