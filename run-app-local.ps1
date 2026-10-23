# ==============================================================================
# Script khởi chạy nhanh Quiz App trực tiếp trên Windows (Node.js + MySQL cục bộ)
# ==============================================================================

Write-Host "==> Đang khởi động Quiz App với MySQL cục bộ (Port 3000)..." -ForegroundColor Cyan

$env:PORT = "3000"
$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "3306"
$env:MYSQL_USER = "root"
$env:MYSQL_PASSWORD = "26082006"
$env:MYSQL_DATABASE = "quiz_db"
$env:NODE_ENV = "development"
$env:COOKIE_SECURE = "false"
$env:SESSION_SECRET = "c8f5d02e3b6a4a1f9e8d7c6b5a43210fe987654321abcdef0123456789abcdef"
$env:SEED_ADMIN_PASSWORD = "Admin@123456"
$env:SEED_TEACHER_PASSWORD = "Teacher@123456"
$env:SEED_STUDENT_PASSWORD = "Student@123456"

cd app
node src/server.js
