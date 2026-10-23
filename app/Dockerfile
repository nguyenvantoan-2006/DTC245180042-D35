# ==============================================================================
# Dockerfile cho Quiz App (Node.js 20 Alpine)
# Áp dụng Hardening: Non-root user (node), no dev tools, pin version
# ==============================================================================

FROM node:20.12.2-alpine3.19 AS base

# Cài đặt wget cho healthcheck nếu cần
RUN apk --no-cache add wget

WORKDIR /usr/src/app

# Sao chép file định nghĩa package trước để tận dụng Docker cache layer
COPY package.json package-lock.json ./

# Cài đặt các gói phụ thuộc production
RUN npm ci --omit=dev && npm cache clean --force

# Sao chép mã nguồn ứng dụng
COPY src/ ./src/

# Đổi quyền sở hữu toàn bộ thư mục sang user 'node' (uid: 1000)
RUN chown -R node:node /usr/src/app

# BẬT BẢO MẬT: Chạy container dưới quyền user thông thường, không dùng root
USER node

# Khai báo cổng ứng dụng lắng nghe
EXPOSE 3000

# Khởi động ứng dụng trực tiếp bằng node runtime (không nodemon)
CMD ["node", "src/server.js"]
