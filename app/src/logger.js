// ==============================================================================
// Cấu hình ghi log tập trung bằng Pino (Chuẩn JSON 1 dòng ra stdout)
// Phục vụ thu thập log tự động qua Promtail và truy vấn bằng LogQL trên Loki
// ==============================================================================

const pino = require('pino');
const pinoHttp = require('pino-http');

// Khởi tạo logger Pino ghi ra stdout
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label })
  },
  base: null // Bỏ pid và hostname để log JSON gọn gàng, chuẩn trường yêu cầu
});

// Middleware ghi log từng request HTTP với chuẩn JSON 1 dòng (time, level, msg, user, path, status)
function httpLogger(req, res, next) {
  // Bỏ qua log request healthcheck và metrics để tránh làm loãng log
  if (req.url === '/health' || req.url === '/metrics') {
    return next();
  }

  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'error' : (res.statusCode >= 400 ? 'warn' : 'info');
    logger[level]({
      time: new Date().toISOString(),
      level,
      user: req.session?.user?.username || 'anonymous',
      path: req.originalUrl || req.url,
      status: res.statusCode,
      msg: `${req.method} ${req.originalUrl || req.url} completed`
    });
  });

  next();
}

// Các hàm tiện ích ghi log nghiệp vụ theo yêu cầu Đề 35:
// Bắt buộc có các trường: time, level, msg, user, path, status.
// Log đăng nhập luôn chứa từ khóa "login" để truy vấn LogQL {container="quiz-app"} |= "login".

function logLoginSuccess(username, path = '/login') {
  logger.info({
    time: new Date().toISOString(),
    level: 'info',
    user: username,
    path,
    status: 200,
    msg: `login successful for user: ${username}`
  });
}

function logLoginFailure(username, path = '/login', reason = 'Sai tên đăng nhập hoặc mật khẩu') {
  logger.warn({
    time: new Date().toISOString(),
    level: 'warn',
    user: username || 'anonymous',
    path,
    status: 401,
    msg: `login failed for user ${username || 'unknown'}: ${reason}`
  });
}

function logQuizSubmission(username, quizId, score, total, path = '/quizzes/submit') {
  logger.info({
    time: new Date().toISOString(),
    level: 'info',
    user: username,
    path,
    status: 200,
    msg: `submit quiz: user ${username} completed quiz #${quizId} with score ${score}/${total}`
  });
}

function logAppError(err, user = 'anonymous', path = '/') {
  logger.error({
    time: new Date().toISOString(),
    level: 'error',
    user,
    path,
    status: 500,
    msg: `error: ${err.message || err}`
  });
}

module.exports = {
  logger,
  httpLogger,
  logLoginSuccess,
  logLoginFailure,
  logQuizSubmission,
  logAppError
};
