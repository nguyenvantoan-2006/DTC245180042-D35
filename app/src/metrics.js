// ==============================================================================
// Cấu hình Prometheus Metrics bằng prom-client cho Node.js Express
// Cung cấp endpoint GET /metrics cho Prometheus scrape nội bộ
// ==============================================================================

const promClient = require('prom-client');

// Tạo Registry riêng để quản lý các metric
const register = new promClient.Registry();

// 1. Kích hoạt thu thập Default Metrics của Node.js (CPU, Memory, Event Loop, GC...)
promClient.collectDefaultMetrics({ register, prefix: 'nodejs_' });

// 2. Metric: http_requests_total{method, route, status}
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Tổng số lượt yêu cầu HTTP gửi đến ứng dụng',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

// 3. Metric: http_request_duration_seconds (Histogram theo route)
const httpRequestDurationSeconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Thời gian xử lý HTTP request tính bằng giây',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});

// 4. Metric nghiệp vụ: quiz_login_total{result} ('success' | 'failure')
const quizLoginTotal = new promClient.Counter({
  name: 'quiz_login_total',
  help: 'Tổng số lần đăng nhập vào hệ thống',
  labelNames: ['result'],
  registers: [register]
});

// 5. Metric nghiệp vụ: quiz_submissions_total
const quizSubmissionsTotal = new promClient.Counter({
  name: 'quiz_submissions_total',
  help: 'Tổng số bài trắc nghiệm đã được nộp thành công',
  registers: [register]
});

// Middleware ghi nhận thời gian và số lượng request HTTP
function metricsMiddleware(req, res, next) {
  // Không tính request vào chính endpoint /metrics và /health
  if (req.path === '/metrics' || req.path === '/health') {
    return next();
  }

  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationSeconds = diff[0] + diff[1] / 1e9;

    // Chuẩn hóa route để tránh bùng nổ cardinality metric do id động
    let route = req.baseUrl || '';
    if (req.route && req.route.path) {
      route += req.route.path;
    } else {
      // Thay thế các ID số dạng /123 thành /:id
      route = req.path.replace(/\/\d+/g, '/:id');
    }
    if (!route) route = '/';

    const labels = {
      method: req.method,
      route,
      status: res.statusCode.toString()
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });

  next();
}

module.exports = {
  register,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  quizLoginTotal,
  quizSubmissionsTotal,
  metricsMiddleware
};
