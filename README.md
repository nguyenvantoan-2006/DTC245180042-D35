# HỆ THỐNG QUIZ / THI TRẮC NGHIỆM TRỰC TUYẾN
**Đề tài số 35 - Môn: Triển khai và Quản trị Hệ thống Phần mềm**

---

## 1. GIỚI THIỆU DỰ ÁN
Dự án là hệ thống phần mềm thi trắc nghiệm trực tuyến được container hóa hoàn toàn bằng **Docker Compose**, phục vụ kiểm tra, đánh giá kiến thức với sự phân định rõ ràng giữa hạ tầng mạng, bảo mật (Hardening), cơ chế chấm điểm tự động ở Server và kiến trúc microservices.

### Các công nghệ sử dụng trong Giai đoạn 1:
- **Web App**: Node.js 20 (`node:20.12.2-alpine3.19`) + Express, EJS template engine, CSS thuần.
- **Database**: MySQL 8.0 (`mysql:8.0.36`) + phpMyAdmin (`phpmyadmin:5.2.1-apache`).
- **Reverse Proxy**: Nginx (`nginx:1.25.4-alpine`) cấu hình SSL tự ký, TLS 1.2/1.3, Rate limiting và HTTP Security Headers.

---

## 2. TÀI KHOẢN DEMO KHỞI TẠO SẴN
Dữ liệu mẫu được tự động nạp thông qua script `src/seed.js` khi hệ thống khởi chạy lần đầu:

| Vai trò | Tên đăng nhập (Username) | Mật khẩu mặc định | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `Admin@123456` | Quản trị viên: Quản lý đề thi, câu hỏi & đáp án |
| **Giáo viên** | `giaovien` (hoặc `teacher`) | `Teacher@123456` | Giáo viên: Tạo và quản lý đề thi, soạn câu hỏi trắc nghiệm |
| **Student** | `student` (hoặc `student1`, `student2`) | `Student@123456` | Thí sinh / Học sinh: Tham gia thi, xem lịch sử và kết quả |
| **MySQL App** | `quiz_user` | `26082006` | Quyền: `SELECT, INSERT, UPDATE, DELETE` |
| **MySQL Root** | `root` | `26082006` | Dùng đăng nhập phpMyAdmin hoặc bảo trì |

---

## 3. CÁCH CÀI ĐẶT VÀ KHỞI CHẠY (QUICK START)

### Bước 1: Chuẩn bị file biến môi trường và sinh chứng chỉ SSL

> **Ghi chú**: Chứng chỉ SSL đã được tạo sẵn trong thư mục `nginx/certs/`. Nếu bạn muốn tự tạo lại:

**Trên Windows (PowerShell):**
```powershell
# 1. Tạo file .env nếu chưa có
Copy-Item .env.example .env

# 2. Sinh chứng chỉ SSL tự ký
.\gen-cert.ps1
```

**Trên Linux / macOS / Git Bash:**
```bash
# 1. Tạo file .env từ file mẫu
cp .env.example .env

# 2. Cấp quyền thực thi và tạo chứng chỉ SSL tự ký cho Nginx
chmod +x gen-cert.sh
./gen-cert.sh
```

### Bước 2: Khởi động hệ thống với Docker Compose
```bash
docker compose up -d --build
```

### Bước 3: Kiểm tra trạng thái các container
```bash
docker compose ps
docker compose logs -f
```

---

## 4. BẢNG ĐƯỜNG DẪN TRUY CẬP HỆ THỐNG

| Dịch vụ | Địa chỉ URL | Ghi chú cấu hình |
| :--- | :--- | :--- |
| **Website chính** | [https://localhost](https://localhost) | Tự động chuyển hướng từ `http://localhost` (301) |
| **phpMyAdmin** | [https://localhost/pma/](https://localhost/pma/) | Proxy qua Nginx đường dẫn con `/pma/` |
| **Kiểm tra Healthcheck** | [http://localhost:3000/health](http://localhost:3000/health) | Chỉ mở trong mạng Docker nội bộ |
| **Prometheus Metrics** | `http://app:3000/metrics` | Nginx chặn truy cập từ ngoài (Trả về 404) |

> **Lưu ý chứng chỉ tự ký**: Khi truy cập trình duyệt lần đầu, hãy chọn **"Advanced" -> "Proceed to localhost (unsafe)"** do đây là chứng chỉ Self-Signed dành cho môi trường thực hành.

---

## 5. BẢNG DANH MỤC BIỆN PHÁP BẢO MẬT HẠ TẦNG (HARDENING)

| STT | Biện pháp | Cấu hình kỹ thuật | Tác dụng bảo mật | Cách kiểm chứng thực tế |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Chạy Non-Root Container** | `USER node` trong Dockerfile; `user: "1000:1000"` trong compose | Ngăn kẻ tấn công leo thang chiếm quyền root máy chủ host nếu container bị xâm nhập. | `docker compose exec app id` (kết quả trả về `uid=1000(node)`). |
| **2** | **Network Isolation (Cách ly mạng)** | `backend` có `internal: true`; DB và phpMyAdmin không publish port ra host | MySQL không lộ cổng 3306 ra Internet; chỉ Nginx mới có thể đóng vai trò cổng ngõ duy nhất. | Thử kết nối từ host: `telnet localhost 3306` hoặc `nc -zv localhost 3306` -> Bị từ chối kết nối. |
| **3** | **Quản lý mật khẩu an toàn & Băm Bcrypt** | `.env.example` riêng biệt, `.env` nằm trong `.gitignore`; băm `bcrypt` salt=10 | Không lộ secret lên Git; chống giải mã ngược bảng dữ liệu nếu bị rò rỉ. | Xem DB qua phpMyAdmin hoặc CLI: cột `password_hash` là chuỗi băm `$2a$10$...`. |
| **4** | **Phân quyền tối thiểu DB (Least Privilege)** | User `quiz_user` chỉ cấp `SELECT, INSERT, UPDATE, DELETE` trên `quiz_db.*` | Ngăn rủi ro app bị lỗi thực thi lệnh phá hoại như `DROP DATABASE`, `ALTER TABLE`, hoặc truy cập DB khác. | Đăng nhập bằng `quiz_user` chạy thử: `DROP TABLE users;` -> MySQL báo lỗi `Access denied`. |
| **5** | **Nginx Security Headers & TLS Hardening** | `server_tokens off;`, `ssl_protocols TLSv1.2 TLSv1.3;`, `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, `CSP` | Chống lộ phiên bản máy chủ web, chống Clickjacking, MIME-sniffing, buộc mã hóa HTTPS và ngăn chặn XSS. | `curl -kI https://localhost` -> Kiểm tra các header trả về trong HTTP response. |
| **6** | **Chống ghi và hạ quyền Container App** | `read_only: true`, `tmpfs: /tmp`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]` | Không cho ghi mã độc vào hệ thống file container; tước bỏ toàn bộ Linux capabilities nguy hiểm. | `docker compose exec app touch /test.txt` -> Báo lỗi `Read-only file system`. |
| **7** | **Rate Limiting chống Brute-Force** | `limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;` tại `/login` | Ngăn chặn tấn công thử mật khẩu liên tục vào tài khoản hệ thống. | Dùng vòng lặp curl gửi liên tiếp 10 request POST tới `/login`: từ request thứ 6 sẽ nhận HTTP `429 Too Many Requests`. |
| **8** | **Healthcheck & Khởi động tuần tự** | `healthcheck` trên `db` và `app`; `depends_on: condition: service_healthy` | Đảm bảo Web app chỉ chạy khi DB đã ping thành công; Nginx chỉ đón traffic khi App sẵn sàng. | Quan sát `docker compose ps`: các dịch vụ hiển thị trạng thái `(healthy)`. |
| **9** | **Bảo vệ Endpoint /metrics** | Nginx chặn `location /metrics { return 404; }` | Không làm lộ số liệu giám sát hệ thống ra công cộng; chỉ Prometheus nội bộ mới đọc được. | `curl -k https://localhost/metrics` -> Nhận mã lỗi `404 Not Found`. |
| **10**| **Chống SQL Injection & XSS** | Dùng Prepared Statement (`?`) với `mysql2/promise`; escape EJS `<%= %>` | Loại trừ triệt để nguy cơ tiêm lệnh SQL và thực thi script độc hại trên trình duyệt. | Nhập `' OR '1'='1` vào ô đăng nhập -> Hệ thống không bị bypass và xử lý bình thường. |

---

## 6. DANH SÁCH FILE VÀ CẤU TRÚC GIAI ĐOẠN 1
```
quiz-system/
├── docker-compose.yml       # Khai báo dịch vụ db, app, phpmyadmin, nginx
├── .env.example             # Biến môi trường mẫu
├── .env                     # File cấu hình thực tế (đã bảo vệ bằng .gitignore)
├── .gitignore               # Loại trừ .env, certs, node_modules
├── README.md                # Tài liệu hướng dẫn & giải trình Hardening
├── gen-cert.sh              # Script sinh chứng chỉ SSL tự ký
├── app/
│   ├── Dockerfile           # Multi-layer, node:20-alpine, non-root user
│   ├── .dockerignore        # Bỏ qua node_modules, .env khi build
│   ├── package.json         # Danh mục thư viện bắt buộc
│   ├── package-lock.json    # Khóa phiên bản phụ thuộc
│   └── src/
│       ├── server.js        # Khởi tạo Express, trust proxy, session, metrics & healthcheck
│       ├── db.js            # MySQL connection pool với retry và prepared statements
│       ├── logger.js        # Pino logger định dạng JSON 1 dòng cho Loki
│       ├── metrics.js       # prom-client thu thập default & custom metrics
│       ├── seed.js          # Nạp tự động 1 admin, 2 student, 2 quiz
│       ├── routes/          # auth.js, quiz.js, admin.js
│       ├── views/           # Các trang EJS (login, register, quiz, admin, history...)
│       └── public/          # style.css (CSS thuần), timer.js (đồng hồ thi)
├── db/
│   └── init.sh              # Script khởi tạo DB & phân quyền MySQL least privilege
└── nginx/
    ├── nginx.conf           # Cấu hình HTTPS, upstream, rate limit, CSP, /pma/
    └── certs/               # Thư mục chứa cert.pem và key.pem
```
