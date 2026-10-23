// ==============================================================================
// Script khởi tạo dữ liệu mẫu (Seed Data)
// Tự động kiểm tra và thêm 1 Admin, 2 Student, 2 Quiz (mỗi quiz 5 câu hỏi)
// Chạy tự động khi khởi động nếu bảng users còn rỗng
// ==============================================================================

const bcrypt = require('bcryptjs');
const { pool } = require('./db');
const { logger } = require('./logger');

async function seedData() {
  try {
    const [userRows] = await pool.query('SELECT COUNT(*) AS total FROM users');
    if (userRows[0].total > 0) {
      logger.info({ msg: '[SEED] Bảng users đã có dữ liệu, bỏ qua bước khởi tạo mẫu.' });
      return;
    }

    logger.info({ msg: '[SEED] Bảng users đang trống. Bắt đầu nạp dữ liệu mẫu...' });

    // 1. Tạo mật khẩu hash bcrypt với salt rounds = 10
    const adminPass = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
    const teacherPass = process.env.SEED_TEACHER_PASSWORD || 'Teacher@123456';
    const studentPass = process.env.SEED_STUDENT_PASSWORD || 'Student@123456';

    const adminHash = await bcrypt.hash(adminPass, 10);
    const teacherHash = await bcrypt.hash(teacherPass, 10);
    const studentHash = await bcrypt.hash(studentPass, 10);

    // 2. Thêm các tài khoản mẫu: Admin, Giáo viên (teacher, giaovien), Học sinh (student, student1, student2)
    const [adminResult] = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      ['admin', adminHash, 'admin']
    );
    const adminId = adminResult.insertId;

    await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)',
      [
        'giaovien', teacherHash, 'teacher',
        'teacher', teacherHash, 'teacher',
        'student', studentHash, 'student',
        'student1', studentHash, 'student',
        'student2', studentHash, 'student'
      ]
    );

    logger.info({ msg: '[SEED] Đã tạo các tài khoản mẫu: admin, giaovien (teacher), student' });

    // 3. Quiz 1: Kiến thức Mạng máy tính & Docker cơ bản (15 phút)
    const [quiz1Result] = await pool.query(
      'INSERT INTO quizzes (title, duration_min, created_by) VALUES (?, ?, ?)',
      ['Kiến thức Mạng máy tính & Docker cơ bản', 15, adminId]
    );
    const quiz1Id = quiz1Result.insertId;

    const quiz1Questions = [
      {
        q: 'Giao thức nào cung cấp kết nối mạng bảo mật mã hóa trên tầng Transport thay cho HTTP?',
        options: [
          { text: 'FTP', correct: false },
          { text: 'HTTPS (SSL/TLS)', correct: true },
          { text: 'SNMP', correct: false },
          { text: 'Telnet', correct: false }
        ]
      },
      {
        q: 'Trong Docker Compose, thuộc tính nào dùng để đảm bảo một dịch vụ chỉ khởi động sau khi dịch vụ phụ thuộc đã sẵn sàng (healthy)?',
        options: [
          { text: 'restart: always', correct: false },
          { text: 'links: []', correct: false },
          { text: 'depends_on: condition: service_healthy', correct: true },
          { text: 'expose: []', correct: false }
        ]
      },
      {
        q: 'Chế độ mạng nào trong Docker cách ly hoàn toàn container không cho truy cập trực tiếp ra bên ngoài qua gateway?',
        options: [
          { text: 'bridge thông thường', correct: false },
          { text: 'host', correct: false },
          { text: 'internal: true', correct: true },
          { text: 'macvlan', correct: false }
        ]
      },
      {
        q: 'Reverse Proxy Nginx lắng nghe cổng HTTPS tiêu chuẩn nào trên máy chủ?',
        options: [
          { text: 'Cổng 80', correct: false },
          { text: 'Cổng 443', correct: true },
          { text: 'Cổng 8080', correct: false },
          { text: 'Cổng 3306', correct: false }
        ]
      },
      {
        q: 'Lệnh Docker nào dùng để liệt kê tài nguyên CPU và RAM tiêu thụ thời gian thực của các container đang chạy?',
        options: [
          { text: 'docker stats', correct: true },
          { text: 'docker ps -a', correct: false },
          { text: 'docker inspect', correct: false },
          { text: 'docker diff', correct: false }
        ]
      }
    ];

    for (const qItem of quiz1Questions) {
      const [qRes] = await pool.query(
        'INSERT INTO questions (quiz_id, content) VALUES (?, ?)',
        [quiz1Id, qItem.q]
      );
      const questionId = qRes.insertId;
      for (const opt of qItem.options) {
        await pool.query(
          'INSERT INTO options (question_id, content, is_correct) VALUES (?, ?, ?)',
          [questionId, opt.text, opt.correct ? 1 : 0]
        );
      }
    }

    // 4. Quiz 2: Quản trị Hệ thống & DevOps căn bản (10 phút)
    const [quiz2Result] = await pool.query(
      'INSERT INTO quizzes (title, duration_min, created_by) VALUES (?, ?, ?)',
      ['Quản trị Hệ thống & DevOps căn bản', 10, adminId]
    );
    const quiz2Id = quiz2Result.insertId;

    const quiz2Questions = [
      {
        q: 'Header bảo mật HTTP nào ngăn chặn tấn công Clickjacking bằng cách cấm nhúng trang web vào iframe?',
        options: [
          { text: 'X-Frame-Options: SAMEORIGIN / DENY', correct: true },
          { text: 'Content-Type: text/html', correct: false },
          { text: 'Server: Apache', correct: false },
          { text: 'Cache-Control: no-cache', correct: false }
        ]
      },
      {
        q: 'Trong Prometheus, mô hình thu thập số liệu giám sát (metrics collection) mặc định hoạt động theo cơ chế nào?',
        options: [
          { text: 'Push (Client tự động bắn metric lên Prometheus)', correct: false },
          { text: 'Pull / Scrape (Prometheus định kỳ cào metric từ HTTP endpoint)', correct: true },
          { text: 'Peer-to-peer', correct: false },
          { text: 'Gửi qua email', correct: false }
        ]
      },
      {
        q: 'Để hạn chế rủi ro container bị chiếm quyền điều khiển (escape container), biện pháp Hardening nào nên áp dụng?',
        options: [
          { text: 'Chạy ứng dụng với non-root user và bật security_opt: no-new-privileges', correct: true },
          { text: 'Bật privileged: true cho tất cả container', correct: false },
          { text: 'Chạy quyền root mặc định', correct: false },
          { text: 'Cấp quyền cap_add: [ALL]', correct: false }
        ]
      },
      {
        q: 'Công cụ nào trong hệ sinh thái Grafana Labs chuyên đảm nhiệm việc thu thập log container và đẩy về Loki?',
        options: [
          { text: 'Promtail', correct: true },
          { text: 'mysqld-exporter', correct: false },
          { text: 'cAdvisor', correct: false },
          { text: 'Kibana', correct: false }
        ]
      },
      {
        q: 'Tại sao cần bật app.set("trust proxy", 1) trong ứng dụng Express khi đặt sau Reverse Proxy Nginx?',
        options: [
          { text: 'Để ứng dụng nhận diện đúng IP thật của Client và giao thức HTTPS từ header X-Forwarded-*', correct: true },
          { text: 'Để tắt tường lửa của Node.js', correct: false },
          { text: 'Để cho phép bất kỳ ai cũng có thể làm admin', correct: false },
          { text: 'Để tăng tốc độ CPU', correct: false }
        ]
      }
    ];

    for (const qItem of quiz2Questions) {
      const [qRes] = await pool.query(
        'INSERT INTO questions (quiz_id, content) VALUES (?, ?)',
        [quiz2Id, qItem.q]
      );
      const questionId = qRes.insertId;
      for (const opt of qItem.options) {
        await pool.query(
          'INSERT INTO options (question_id, content, is_correct) VALUES (?, ?, ?)',
          [questionId, opt.text, opt.correct ? 1 : 0]
        );
      }
    }

    logger.info({ msg: '[SEED] Hoàn tất nạp 2 đề thi mẫu (mỗi đề 5 câu hỏi kèm 4 đáp án) thành công!' });
  } catch (err) {
    logger.error({ msg: `[SEED] Lỗi trong quá trình nạp dữ liệu mẫu: ${err.message}` });
  }
}

module.exports = { seedData };
