# 📡 API Documentation

Base URL: `http://localhost:3000`

## 🔐 Authentication Endpoints

### Register User
**POST** `/api/auth/register`

Create a new user account

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "confirmPassword": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "user": {
    "id": "1234567890",
    "name": "John Doe",
    "email": "john@example.com",
    "token": "8e0456e86650a6b814fddb63cbf12e812e05a472738fa385dc71cc126d882edd",
    "createdAt": "2026-02-09T16:04:02.682Z"
  }
}
```

**Status Codes:**
- `200` - Registration successful
- `400` - Invalid input or email already exists
- `500` - Server error

---

### Login User
**POST** `/api/auth/login`

Authenticate and get a token

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "1234567890",
    "name": "John Doe",
    "email": "john@example.com",
    "token": "newtoken123...",
    "lastLogin": "2026-02-09T16:05:00.000Z"
  }
}
```

**Status Codes:**
- `200` - Login successful
- `400` - Missing credentials
- `401` - Invalid email or password
- `500` - Server error

---

### Verify Token
**GET** `/api/auth/verify`

Validate a token and get user info

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "1234567890",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Status Codes:**
- `200` - Token valid
- `401` - Invalid or expired token
- `500` - Server error

---

### Get Profile
**GET** `/api/auth/profile`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "1234567890",
    "name": "John Doe",
    "email": "john@example.com",
    "createdAt": "2026-02-09T16:04:02.682Z"
  }
}
```

---

### Update Profile
**PUT** `/api/auth/profile`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Jane Doe"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "1234567890",
    "name": "Jane Doe",
    "email": "john@example.com",
    "updatedAt": "2026-02-09T16:06:00.000Z"
  }
}
```

---

### Logout
**POST** `/api/auth/logout`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

**Status Codes:**
- `200` - Logout successful
- `400` - No token provided
- `500` - Server error

---

## 🎯 Core Simulation Endpoints

### 1. Generate Simulation
**POST** `/api/simulation/generate`

Tạo một simulation mới từ GLB model

**Request Body:**
```json
{
  "modelPath": "/uploads/model.glb",
  "ageGroup": "toddler|preschool|school",
  "roomType": "bedroom|kitchen|bathroom|livingroom",
  "hazards": ["fall", "burn", "electric", "suffocation"],
  "duration": 300
}
```

**Response:**
```json
{
  "simulationId": "sim_1770485565870",
  "status": "running",
  "ageGroup": "toddler",
  "hazards": ["fall", "burn"],
  "startTime": "2024-12-08T10:30:00Z",
  "estimatedDuration": 300000
}
```

**Status Codes:**
- `200` - Simulation created successfully
- `400` - Invalid request parameters
- `500` - Server error

---

### 2. Run Simulation Step
**POST** `/api/simulation/runStep`

Chạy một step trong simulation

**Request Body:**
```json
{
  "simulationId": "sim_1770485565870",
  "action": "move|interact|grab",
  "targetObject": "bed|lamp|door",
  "parameters": {
    "position": [0.5, 0.3, 0.2],
    "duration": 100
  }
}
```

**Response:**
```json
{
  "simulationId": "sim_1770485565870",
  "stepNumber": 5,
  "action": "move",
  "result": "success|warning|injury",
  "injury": {
    "type": "fall",
    "severity": 1-10,
    "description": "Child fell from 0.5m height"
  },
  "time": 1000,
  "nextPossibleActions": ["move", "interact"]
}
```

**Status Codes:**
- `200` - Step executed
- `400` - Invalid action
- `404` - Simulation not found
- `500` - Server error

---

### 3. Get Simulation Status
**GET** `/simulation/{simulationId}`

Lấy trạng thái hiện tại của simulation

**Response:**
```json
{
  "simulationId": "sim_1770485565870",
  "status": "running|completed|paused|error",
  "progress": 45,
  "ageGroup": "toddler",
  "roomType": "bedroom",
  "totalSteps": 12,
  "elapsedTime": 120000,
  "injuries": [
    {
      "timestamp": 1000,
      "type": "fall",
      "severity": 5,
      "description": "..."
    }
  ],
  "hazardsDetected": ["bed-fall", "lamp-impact"],
  "safetyScore": 45
}
```

**Status Codes:**
- `200` - Simulation found
- `404` - Simulation not found

---

### 4. Pause Simulation
**POST** `/simulation/{simulationId}/pause`

Tạm dừng simulation đang chạy

**Response:**
```json
{
  "simulationId": "sim_1770485565870",
  "status": "paused",
  "currentStep": 12,
  "canResume": true
}
```

---

### 5. Resume Simulation
**POST** `/simulation/{simulationId}/resume`

Tiếp tục simulation đã tạm dừng

**Response:**
```json
{
  "simulationId": "sim_1770485565870",
  "status": "running",
  "resumedAt": "2024-12-08T10:35:00Z"
}
```

---

### 6. Stop Simulation
**POST** `/simulation/{simulationId}/stop`

Dừng simulation và lấy báo cáo cuối cùng

**Response:**
```json
{
  "simulationId": "sim_1770485565870",
  "status": "completed",
  "totalTime": 300000,
  "totalSteps": 25,
  "injuryCount": 3,
  "safetyScore": 35,
  "report": {
    "hazardsFound": ["fall", "burn"],
    "criticalAreas": ["bed", "lamp"],
    "recommendations": ["Place safety rails", "Use power outlet covers"]
  }
}
```

---

## 📤 File Upload Endpoints

### Upload GLB Model
**POST** `/api/upload`

Upload 3D model file (GLB format)

**Request:**
```
Content-Type: multipart/form-data

file: <binary GLB file>
metadata: {
  "uploadedBy": "user@example.com",
  "description": "Bedroom model"
}
```

**Response:**
```json
{
  "uploadId": "upload_1770528648461",
  "filename": "1770528648461-bedroom.glb",
  "url": "/uploads/1770528648461-bedroom.glb",
  "size": 2048576,
  "uploadedAt": "2024-12-08T10:30:00Z",
  "status": "ready"
}
```

**Status Codes:**
- `200` - File uploaded
- `400` - Invalid file format
- `413` - File too large (max 200MB)
- `500` - Upload error

---

## 👥 Batch Simulation Endpoints

### Run Batch Simulation
**POST** `/api/batch/simulate`

Jalankan multiple simulations sekaligus

**Request Body:**
```json
{
  "models": [
    "/uploads/bedroom.glb",
    "/uploads/kitchen.glb"
  ],
  "ageGroups": ["toddler", "school"],
  "hazardTypes": "all|common|critical",
  "concurrency": 2
}
```

**Response:**
```json
{
  "batchId": "batch_1234567890",
  "status": "running",
  "totalSimulations": 4,
  "completedSimulations": 0,
  "progress": 0,
  "estimatedTime": 3600000
}
```

---

### Get Batch Status
**GET** `/api/batch/{batchId}`

Lấy trạng thái batch simulation

**Response:**
```json
{
  "batchId": "batch_1234567890",
  "status": "running|completed",
  "statistics": {
    "totalSimulations": 4,
    "completedSimulations": 2,
    "avgSafetyScore": 42,
    "totalInjuries": 7,
    "riskLevel": "high"
  },
  "simulations": [
    {
      "simulationId": "sim_xxx",
      "model": "bedroom.glb",
      "ageGroup": "toddler",
      "safetyScore": 35
    }
  ]
}
```

---

## 🔧 Admin Endpoints

### Server Status
**GET** `/admin/status`

Lấy trạng thái server chi tiết

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-12-08T10:35:00Z",
  "uptime": 3600,
  "memory": {
    "heapUsedMB": 256,
    "heapTotalMB": 512,
    "rssMB": 350,
    "percentage": "50.0"
  },
  "activeSimulations": 2,
  "activeRequests": [
    {
      "path": "/api/simulation/generate",
      "duration": "25.3s"
    }
  ],
  "timeouts": {
    "clientRequest": "10min",
    "serverProcessing": "11min",
    "serverSocket": "12min"
  }
}
```

---

### Force Garbage Collection
**POST** `/admin/gc`

Force garbage collection (development only)

**Response:**
```json
{
  "success": true,
  "freedMB": 128,
  "heapUsedMB": 256,
  "heapTotalMB": 512
}
```

**Notes:**
- Hanya tersedia dalam development mode
- Memerlukan flag `--expose-gc`

---

## 🔐 Error Responses

Tất cả endpoints trả về error format:

```json
{
  "error": "Error message",
  "requestId": "req_1234567890_abc123",
  "timestamp": "2024-12-08T10:35:00Z",
  "path": "/api/simulation/generate",
  "method": "POST"
}
```

### Common Error Codes:
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (resource doesn't exist)
- `413` - Payload Too Large (file too big)
- `500` - Internal Server Error
- `503` - Service Unavailable (memory pressure)

---

## 📊 Rate Limiting

Status hiện tại: **No rate limiting** (có thể thêm sau)

Timeouts konfigurasi:
- Client request: **10 menit**
- Server processing: **11 menit**
- Keep-alive: **11 menit**

---

## 🔄 WebSocket Endpoints (Future)

Reserved untuk real-time simulation streaming:
```
WS /ws/simulation/{simulationId}
- Events: step_complete, injury_detected, simulation_paused
```

---

## 📚 Example: Complete Workflow

```javascript
// 1. Upload model
const uploadRes = await fetch('http://localhost:3000/api/upload', {
  method: 'POST',
  body: formData
});
const { url } = await uploadRes.json();

// 2. Generate simulation
const simRes = await fetch('http://localhost:3000/api/simulation/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    modelPath: url,
    ageGroup: 'toddler',
    roomType: 'bedroom',
    hazards: ['fall', 'burn']
  })
});
const { simulationId } = await simRes.json();

// 3. Run step
const stepRes = await fetch('http://localhost:3000/api/simulation/runStep', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    simulationId,
    action: 'move',
    targetObject: 'bed'
  })
});
const { result, injury } = await stepRes.json();

// 4. Stop and get report
const stopRes = await fetch(`http://localhost:3000/simulation/${simulationId}/stop`, {
  method: 'POST'
});
const { report, safetyScore } = await stopRes.json();
```

---

## 🎨 Response Headers

Tất cả responses có headers:
```
Content-Type: application/json; charset=utf-8
Content-Encoding: gzip (nếu > 1KB)
X-Request-Id: req_1234567890_abc123
X-Response-Time: 125ms
```

---

**Last Updated:** 2024-12-08
