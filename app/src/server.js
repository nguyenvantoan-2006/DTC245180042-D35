// ==============================================================================
// Server chính của Hệ thống Quiz (Node.js 20 Express)
// Tuân thủ các yêu cầu hạ tầng: Trust Proxy, Secure Cookie, Healthcheck, Metrics
// ==============================================================================

const path = require('path');
const express = require('express');
const session = require('express-session');

const { logger, httpLogger, logAppError } = require('./logger');
const { pool, testConnection } = require('./db');
const { seedData } = require('./seed');
const { register, metricsMiddleware } = require('./metrics');

const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quiz');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// 1. Cấu hình Trust Proxy (BẮT BUỘC vì ứng dụng nằm sau Reverse Proxy Nginx)
// Giúp Express đọc đúng IP Client (X-Forwarded-For) và giao thức HTTPS (X-Forwarded-Proto)
app.set('trust proxy', 1);

// 2. Cấu hình View Engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 3. Phục vụ static file (CSS, JS) từ thư mục public nội bộ (không dùng CDN)
app.use(express.static(path.join(__dirname, 'public')));

// 4. Parse request body
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 5. Cấu hình Session Cookie với độ an toàn cao
// httpOnly: Chống đánh cắp cookie qua mã độc XSS
// sameSite: 'lax': Bảo vệ chống giả mạo request chéo (CSRF)
// secure: true: Bắt buộc cookie chỉ truyền tải qua kênh mã hóa HTTPS
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'default_fallback_session_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // Ở môi trường production sau Nginx HTTPS thì secure: true; khi test local HTTP thì secure: false
      secure: process.env.COOKIE_SECURE === 'false' ? false : (process.env.NODE_ENV === 'production'),
      maxAge: 24 * 60 * 60 * 1000 // Phiên làm việc kéo dài 24h
    }
  })
);

// 6. Gắn Middleware ghi log (Pino) và thu thập số liệu (Prometheus)
app.use(httpLogger);
app.use(metricsMiddleware);

// 7. Cung cấp biến người dùng đăng nhập cho tất cả view EJS
app.use((req, res, next) => {
  res.locals.currentUser = req.session ? req.session.user : null;
  next();
});

// ==============================================================================
// CÁC ENDPOINT QUẢN TRỊ HẠ TẦNG (HEALTH & METRICS)
// ==============================================================================

// GET /health - Kiểm tra tính sẵn sàng của ứng dụng và cơ sở dữ liệu
app.get('/health', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    await connection.query('SELECT 1');
    connection.release();

    return res.status(200).json({
      status: 'ok',
      db: 'connected',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error({ msg: `[HEALTHCHECK] Database ping failed: ${err.message}` });
    return res.status(503).json({
      status: 'error',
      db: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /metrics - Endpoint xuất dữ liệu Prometheus (Chỉ cho phép truy cập nội bộ)
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// ==============================================================================
// ĐĂNG KÝ CÁC ROUTE NGHIỆP VỤ
// ==============================================================================

app.use('/', authRoutes);
app.use('/', quizRoutes);
app.use('/admin', adminRoutes);

// Xử lý 404 Not Found
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Không tìm thấy trang',
    user: req.session ? req.session.user : null,
    message: `Trang '${req.originalUrl}' không tồn tại trên hệ thống.`
  });
});

// Xử lý lỗi tập trung (Error Handler)
app.use((err, req, res, next) => {
  const username = req.session?.user?.username || 'anonymous';
  logAppError(err, username, req.originalUrl);

  res.status(err.status || 500).render('error', {
    title: 'Lỗi hệ thống',
    user: req.session ? req.session.user : null,
    message: 'Đã xảy ra sự cố nội bộ. Vui lòng liên hệ quản trị viên.'
  });
});

// ==============================================================================
// KHỞI ĐỘNG SERVER
// ==============================================================================

async function startServer() {
  try {
    logger.info({ msg: '==> [SERVER] Đang kiểm tra kết nối Database...' });
    await testConnection();

    logger.info({ msg: '==> [SERVER] Đang kiểm tra và khởi tạo dữ liệu mẫu (Seed)...' });
    await seedData();

    app.listen(PORT, '0.0.0.0', () => {
      logger.info({
        msg: `==> [SERVER] Quiz App đang lắng nghe tại cổng http://0.0.0.0:${PORT}`
      });
    });
  } catch (err) {
    logger.fatal({ msg: `==> [SERVER] Khởi động ứng dụng thất bại: ${err.message}` });
    process.exit(1);
  }
}

startServer();
