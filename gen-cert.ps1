# ==============================================================================
# Script PowerShell tự động tạo chứng chỉ SSL/TLS tự ký cho Nginx trên Windows
# ==============================================================================

$certDir = "nginx\certs"
if (-not (Test-Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir -Force | Out-Null
}

$opensslPath = "openssl"
if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
    if (Test-Path "C:\Program Files\Git\usr\bin\openssl.exe") {
        $opensslPath = "C:\Program Files\Git\usr\bin\openssl.exe"
    } else {
        Write-Error "Không tìm thấy openssl. Vui lòng cài Git hoặc OpenSSL cho Windows."
        exit 1
    }
}

Write-Host "==> Đang sinh khóa bí mật và chứng chỉ SSL tự ký cho localhost..." -ForegroundColor Cyan

& $opensslPath req -x509 -nodes -days 365 -newkey rsa:2048 `
  -keyout "$certDir\key.pem" `
  -out "$certDir\cert.pem" `
  -subj "/C=VN/ST=Hanoi/L=Hanoi/O=DevOps Lab/OU=System Design/CN=localhost" `
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

Write-Host "==> Đã khởi tạo chứng chỉ thành công tại: $certDir\cert.pem và $certDir\key.pem" -ForegroundColor Green
