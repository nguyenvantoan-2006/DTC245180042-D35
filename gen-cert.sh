#!/bin/bash
# ==============================================================================
# Script tự động tạo chứng chỉ SSL/TLS tự ký (Self-signed Certificate) cho Nginx
# ==============================================================================

set -e

CERT_DIR="nginx/certs"
mkdir -p "$CERT_DIR"

echo "==> Đang sinh khóa bí mật và chứng chỉ SSL tự ký cho localhost..."

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -subj "/C=VN/ST=Hanoi/L=Hanoi/O=DevOps Lab/OU=System Design/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# Phân quyền chặt chẽ cho file khóa bí mật (chỉ owner đọc được)
chmod 600 "$CERT_DIR/key.pem"
chmod 644 "$CERT_DIR/cert.pem"

echo "==> Khởi tạo chứng chỉ thành công tại: $CERT_DIR/cert.pem và $CERT_DIR/key.pem"
