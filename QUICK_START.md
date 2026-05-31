# ⚡ Quick Start Guide (5 phút)

Hướng dẫn bắt đầu nhanh Child Safety Simulator

---

## 🚀 Chỉ 3 Bước!

### Bước 1️⃣: Cài Đặt Tất Cả (2 phút)

#### Windows:
```cmd
start-dev.cmd
```

#### macOS / Linux:
```bash
./start-dev.sh
```

#### Hoặc thủ công:
```bash
npm run install-all
```

---

### Bước 2️⃣: Chạy Dự Án (30 giây)

```bash
npm run dev
```

**Đợi cho đến khi thấy:**
```
✅ Backend: 🚀 Child Safety Simulator Server running at http://localhost:3000
✅ Frontend: VITE v6 ready in 150ms
```

---

### Bước 3️⃣: Truy Cập (30 giây)

Mở browser:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000/api/

---

## 📍 Vậy thế là xong! 🎉

Backend + Frontend chạy cùng lúc, giao tiếp tự động qua API.

---

## 🎯 Tiếp Theo?

### Phát Triển:

```bash
# Terminal này vừa mở Frontend + Backend
npm run dev

# Hay chạy riêng (mở 2 terminal):
npm run dev:backend    # Terminal 1
npm run dev:frontend   # Terminal 2
```

Code → Save → Auto reload! ✨

### Deploy:

```bash
npm run build       # Build cả 2
npm start           # Chạy production (port 3000)
```

---

## 📚 Cần Trợ Giúp?

| Vấn đề | Giải Pháp |
|--------|----------|
| **Port đang dùng** | Xem [TROUBLESHOOTING.md](TROUBLESHOOTING.md#-port-issues) |
| **Dependencies lỗi** | Chạy `npm run install-all` lại |
| **Build thất bại** | Xem [TROUBLESHOOTING.md](TROUBLESHOOTING.md#-build-issues) |
| **API không kết nối** | Chắc Backend đang chạy port 3000 |

---

## 📖 Tài Liệu Đầy Đủ

- [SETUP.md](SETUP.md) - Thiết lập chi tiết
- [STRUCTURE.md](STRUCTURE.md) - Cấu trúc project
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) - API endpoints
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Giải quyết lỗi
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deploy production
- [VERIFICATION_CHECKLIST.md](VERIFICATION_CHECKLIST.md) - Kiểm tra setup

---

## 🔥 Pro Tips

### Chạy riêng lẻ nếu cần:
```bash
npm run dev:backend    # Chỉ backend (port 3000)
npm run dev:frontend   # Chỉ frontend (port 5173)
```

### Build production:
```bash
npm run build
# Output: Frontend/dist/
npm start
# Visit: http://localhost:3000
```

### Kiểm tra server health:
```bash
curl http://localhost:3000/admin/status
```

### Xem logs:
```bash
npm run dev  # Logs in terminal
```

---

**Đó là tất cả! Start developing! 🚀**
