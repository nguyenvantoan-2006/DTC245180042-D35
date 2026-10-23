// ==============================================================================
// Kết nối Cơ sở dữ liệu MySQL bằng mysql2/promise Connection Pool
// Áp dụng Prepared Statement (placeholder ?) cho mọi câu truy vấn để chống SQL Injection
// ==============================================================================

const mysql = require('mysql2/promise');
const { logger } = require('./logger');

const dbConfig = {
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'quiz_user',
  password: process.env.MYSQL_PASSWORD || 'QuizUserPassword_2026!',
  database: process.env.MYSQL_DATABASE || 'quiz_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00'
};

const pool = mysql.createPool(dbConfig);

// Kiểm tra kết nối ban đầu
async function testConnection(retries = 15, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const connection = await pool.getConnection();
      await connection.query('SELECT 1');
      connection.release();
      logger.info({ msg: `[DB] Kết nối thành công tới MySQL (${dbConfig.host}:${dbConfig.port})` });
      return true;
    } catch (err) {
      logger.warn({ msg: `[DB] Lần thử kết nối ${i}/${retries} thất bại (${err.message}). Thử lại sau ${delayMs}ms...` });
      if (i === retries) {
        logger.error({ msg: `[DB] Không thể kết nối tới MySQL sau ${retries} lần thử: ${err.message}` });
        throw err;
      }
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
}

module.exports = {
  pool,
  testConnection
};
