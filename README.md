# HỆ THỐNG QUIZ / THI TRẮC NGHIỆM TRỰC TUYẾN
**Môn học: Triển khai và Quản trị Hệ thống Phần mềm**  
**Đề tài số: 35** | **Mã sinh viên: DTC245180042**  
**Kho lưu trữ GitHub:** [https://github.com/nguyenvantoan-2006/DTC245180042-D35](https://github.com/nguyenvantoan-2006/DTC245180042-D35)

---

## 1. GIỚI THIỆU TỔNG QUAN HỆ THỐNG
Dự án triển khai một hệ thống phần mềm thi trắc nghiệm trực tuyến hoàn chỉnh được container hóa toàn bộ bằng **Docker Compose**, tích hợp đầy đủ hệ sinh thái DevOps tiêu chuẩn công nghiệp:
- **Web App**: Node.js 20 Express, giao diện EJS template engine, CSS thuần hiện đại.
- **Database**: MySQL 8.0 lưu trữ bền vững với Docker Volume + phpMyAdmin quản trị trực quan.
- **Reverse Proxy**: Nginx 1.25 Alpine cấu hình HTTPS tự ký, TLS 1.2/1.3, Rate limiting chống brute-force và HTTP Security Headers.
- **Monitoring (Giám sát)**: Prometheus v2.51.0 + Grafana 10.4.0 (Tự động nạp 3 Dashboard: Container cAdvisor, Web Server Nginx + App, Database MySQL qua Provisioning).
- **Logging (Quản trị Log tập trung)**: Grafana Loki 2.9.4 + Promtail 2.9.4 (Thu thập log container qua Docker socket, truy vấn bằng LogQL).
- **Hardening (Bảo mật chuyên sâu)**: 10 biện pháp bảo mật thực tế (Non-root, Network Isolation 3 vùng, Read-only container, Least Privilege DB, Rate limiting...).

---

## 2. BẢNG DỊCH VỤ, CỔNG VÀ ĐƯỜNG DẪN TRUY CẬP

| Dịch vụ | Địa chỉ URL | Cổng Host | Vai trò & Ghi chú |
| :--- | :--- | :---: | :--- |
| **Website Quiz chính** | [https://localhost](https://localhost) | `443` | Truy cập an toàn qua Nginx HTTPS (HTTP :80 tự động redirect 301) |
| **phpMyAdmin** | [https://localhost/pma/](https://localhost/pma/) | `8081` | Quản trị MySQL (hoặc truy cập trực tiếp qua `http://localhost:8081`) |
| **Grafana Dashboard** | [http://localhost:3001](http://localhost:3001) | `3001` | Trực quan hóa 3 Dashboard (Tài khoản: `admin` / `GrafanaAdminPassword_2026!`) |
| **Prometheus Web UI** | [http://localhost:9090](http://localhost:9090) | `9090` | Xem trạng thái thu thập số liệu (Kiểm tra menu *Status* -> *Targets*) |
| **Loki Log API** | `http://localhost:3100/ready` | `3100` | Endpoint nhận và chỉ mục hóa log từ Promtail |
| **Quiz App (Nội bộ)** | `http://app:3000` | *Không mở* | Chỉ giao tiếp nội bộ qua mạng Docker `frontend` và `monitoring` |
| **MySQL 8.0 (Nội bộ)** | `db:3306` | *Không mở* | Cách ly hoàn toàn trong mạng `backend (internal: true)` |

> **Lưu ý về SSL Tự ký**: Khi truy cập trình duyệt lần đầu tại `https://localhost`, hãy bấm **"Nâng cao" (Advanced)** -> Chọn **"Tiếp tục truy cập localhost (không an toàn)"** do đây là chứng chỉ Self-Signed dành cho môi trường thực hành.

---

## 3. DANH SÁCH TÀI KHOẢN MẪU KHỞI TẠO SẴN

Hệ thống tự động nạp dữ liệu người dùng, đề thi mẫu và câu hỏi trắc nghiệm qua script `src/seed.js`:

| Vai trò | Tên đăng nhập | Mật khẩu khởi tạo | Quyền hạn trong hệ thống |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `admin` | `Admin@123456` | Toàn quyền: Phê duyệt tài khoản mới, tạo/sửa đề thi, quản lý người dùng, xem audit logs |
| **Giáo viên (Teacher)** | `giaovien` | `Teacher@123456` | Tạo đề thi mới, soạn câu hỏi và đáp án trắc nghiệm |
| **Thí sinh (Student)** | `student` | `Student@123456` | Tham gia làm bài thi trắc nghiệm, bấm nộp bài, xem điểm số và lịch sử bài làm |
| **MySQL App User** | `quiz_user` | `26082006` | User của app: Chỉ có quyền `SELECT, INSERT, UPDATE, DELETE` trên `quiz_db.*` |
| **MySQL Root** | `root` | `26082006` | Quản trị DB cấp cao: Dùng đăng nhập vào phpMyAdmin |

---

## 4. HƯỚNG DẪN KHỞI CHẠY HỆ THỐNG (CHỈ VỚI 1 LỆNH)

### Bước 1: Chuẩn bị file biến môi trường và sinh chứng chỉ SSL

> *Chứng chỉ SSL mẫu đã được tạo sẵn trong thư mục `nginx/certs/`.*

- **Trên Windows (PowerShell):**
  ```powershell
  # Tạo file .env từ file mẫu
  Copy-Item .env.example .env

  # Sinh chứng chỉ SSL tự ký nếu muốn làm mới
  .\gen-cert.ps1
  ```

- **Trên Linux / macOS / Git Bash:**
  ```bash
  cp .env.example .env
  chmod +x gen-cert.sh
  ./gen-cert.sh
  ```

### Bước 2: Khởi chạy toàn bộ hệ thống bằng Docker Compose
```bash
docker compose up -d --build
```

### Bước 3: Kiểm tra trạng thái toàn bộ 12 Container
```bash
docker compose ps
```
*Tất cả 12 container (`quiz-nginx`, `quiz-app`, `quiz-db`, `quiz-pma`, `quiz-prometheus`, `quiz-grafana`, `quiz-cadvisor`, `quiz-node-exporter`, `quiz-mysqld-exporter`, `quiz-nginx-exporter`, `quiz-loki`, `quiz-promtail`) đều ở trạng thái `Up`.*

---

## 5. HƯỚNG DẪN KIỂM CHỨNG GIÁM SÁT VÀ LOG TẬP TRUNG

### A. Kiểm tra Prometheus Targets:
Truy cập [http://localhost:9090/targets](http://localhost:9090/targets), xác nhận **cả 6 targets đều UP (xanh lá)**:
1. `quiz-app` (Node.js Express metrics)
2. `cadvisor` (Container metrics)
3. `node-exporter` (Host OS metrics)
4. `mysql` (mysqld-exporter metrics)
5. `nginx` (nginx-prometheus-exporter metrics)
6. `prometheus` (Internal metrics)

### B. Xem 3 Dashboard tự động trong Grafana:
Đăng nhập Grafana tại [http://localhost:3001](http://localhost:3001) (`admin` / `GrafanaAdminPassword_2026!`). Vào menu **Dashboards** -> thư mục **Quiz System**:
1. **1. Giám sát Container (cAdvisor)**: Theo dõi CPU rate, Memory bytes, Network In/Out của từng container `quiz-*`.
2. **2. Giám sát Web Server & App (Nginx + Node.js)**: Theo dõi Active connections, Requests/s, tổng lượt Đăng nhập và Nộp bài thi.
3. **3. Giám sát Database (MySQL 8.0)**: Theo dõi số kết nối mở (Connected Threads), Queries/sec, Uptime và InnoDB Buffer Pool.

### C. Truy vấn Log bằng LogQL trong Grafana Explore:
Vào Grafana -> Chọn menu **Explore** -> Chọn Datasource là **Loki** -> Nhập 4 câu query LogQL sau:
1. Xem toàn bộ log Nginx:
   ```logql
   {container="quiz-nginx"}
   ```
2. Lọc log lỗi ứng dụng App:
   ```logql
   {container="quiz-app"} |= "error"
   ```
3. Lọc log từ chối truy cập MySQL:
   ```logql
   {container="quiz-db"} |= "Access denied"
   ```
4. Thống kê tốc độ gửi request POST Nginx theo thời gian:
   ```logql
   sum(rate({container="quiz-nginx"} |= "POST" [5m]))
   ```

---

## 6. DANH MỤC 10 BIỆN PHÁP BẢO MẬT (HARDENING)
Chi tiết cấu hình và lệnh kiểm chứng xem tại file [docs/HARDENING.md](docs/HARDENING.md):
1. **Non-Root Container**: App chạy quyền user `node` (`uid=1000`).
2. **Network Isolation 3 vùng**: `backend` là `internal: true`, giấu kín MySQL và App.
3. **Least Privilege Database**: User `quiz_user` chỉ có 4 quyền thao tác DML, cấm DDL.
4. **Nginx Security Headers & TLS Hardening**: `server_tokens off;`, HSTS, X-Frame-Options, CSP.
5. **Bắt buộc HTTPS**: Chuyển hướng tự động mã lỗi HTTP 301 sang HTTPS 443.
6. **Hệ thống file chỉ đọc (Read-Only)**: Container app bật `read_only: true` và `tmpfs: /tmp`.
7. **Tước bỏ Linux Capabilities**: `cap_drop: [ALL]` và `security_opt: [no-new-privileges:true]`.
8. **Rate Limiting chống Brute-Force**: Giới hạn 5 request/phút tại `/login`.
9. **Quản lý biến môi trường an toàn**: Băm `bcrypt` salt=10, loại trừ `.env` khỏi Git.
10. **Bảo vệ cổng nội bộ**: Cổng phpMyAdmin chỉ mở localhost, Nginx chặn `/metrics` công cộng.

---

## 7. CẤU TRÚC THƯ MỤC DỰ ÁN
```text
DTC245180042-D35/
├── docker-compose.yml       # Tích hợp toàn bộ 12 services và 3 networks
├── .env.example             # File biến môi trường mẫu
├── .env                     # File cấu hình thực tế (được bảo vệ bởi .gitignore)
├── .gitignore               # Loại bỏ .env, certs, node_modules, data volumes
├── README.md                # Tài liệu hướng dẫn chi tiết
├── gen-cert.sh / .ps1       # Script tự động sinh chứng chỉ SSL tự ký
├── app/                     # Mã nguồn Node.js Express + Dockerfile non-root
├── db/                      # Script init.sh tạo DB và phân quyền Least Privilege
├── nginx/                   # Cấu hình Reverse Proxy, HTTPS, Rate limit, stub_status
├── prometheus/              # Cấu hình prometheus.yml thu thập 6 target
├── grafana/                 # Provisioning tự nạp Datasource và 3 Dashboard JSON
├── loki/                    # Cấu hình loki-config.yml (Schema v12)
├── promtail/                # Cấu hình promtail-config.yml đọc Docker socket
├── docs/                    # Tài liệu chuyên sâu phục vụ bảo vệ đồ án
│   ├── HARDENING.md         # Bảng 10 biện pháp bảo mật và lệnh kiểm chứng
│   ├── CHECKLIST_SCREENSHOT.md # Danh mục 20 ảnh chụp màn hình cần thiết
│   └── GIAI_THICH.md        # Kiến trúc hệ thống và 15 câu hỏi - đáp vấn đáp
└── docx/                    # Thư mục chứa Báo cáo tổng hợp ≥ 10 trang
```
