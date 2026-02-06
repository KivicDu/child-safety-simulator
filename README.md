# 👶 Child Safety Simulator: AI-Driven Risk Analysis
> Một hệ thống giả lập va chạm và phân tích rủi ro cho trẻ em dựa trên AI Gemini và Vật lý 3D thời gian thực.

[![Node.js Version](https://img.shields.io/badge/node-v18%2B-green.svg)](https://nodejs.org/)
[![Physics](https://img.shields.io/badge/Physics-Rapier3D-orange.svg)](https://rapier.rs/)
[![AI Engine](https://img.shields.io/badge/AI-Gemini%20Flash-blue.svg)](https://deepmind.google/technologies/gemini/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📖 Tổng quan dự án
Dự án này giải quyết bài toán an toàn trẻ em trong môi trường nội thất. Bằng cách kết hợp **Vật lý 3D** (để mô phỏng va chạm thực) và **AI** (để mô phỏng hành vi trẻ em theo độ tuổi), hệ thống giúp xác định các "điểm đen" nguy hiểm trong phòng trước khi trẻ thực sự bước vào.



## 🚀 Tính năng nổi bật

### 🧠 1. AI Behavior Engine (Gemini Powered)
Không giống các robot di chuyển ngẫu nhiên, các "Agent" trong hệ thống có hành vi dựa trên tâm sinh lý từng độ tuổi:
- **Infant/Toddler:** Xu hướng tò mò các ổ điện, vật nhỏ trên sàn.
- **Preschool/School:** Hoạt động mạnh, hay chạy nhảy và va chạm với góc cạnh nội thất.

### ⚙️ 2. High-Performance Physics Simulation
Sử dụng **Rapier3D (Rust-based engine)** nén thành WebAssembly (WASM) để đạt hiệu năng tính toán cực cao, cho phép chạy hàng nghìn bước giả lập trong vài giây.

### 📊 3. Risk Heatmap & Data Visualization
Dữ liệu va chạm được tổng hợp thành bản đồ nhiệt (Heatmap), cho phép người dùng nhìn thấy ngay vị trí nào trong phòng có tần suất va chạm cao nhất.



---

## 🛠 Tech Stack (Công nghệ sử dụng)

- **Core:** Node.js (Express.js)
- **AI:** Google Gemini API (Generative AI)
- **Physics:** `@dimforge/rapier3d-compat`
- **Frontend Visualization:** Three.js, OrbitControls
- **Infrastructure:** Git/GitHub, Clean Architecture

---

## 📦 Hướng dẫn cài đặt & Chạy thử

### 1. Yêu cầu hệ thống
- Node.js >= 18.x
- Một API Key của Google Gemini (miễn phí tại [Google AI Studio](https://aistudio.google.com/))

### 2. Cài đặt
```bash
git clone [https://github.com/KivicDu/child-safety-simulator.git](https://github.com/KivicDu/child-safety-simulator.git)
cd child-safety-simulator
npm install