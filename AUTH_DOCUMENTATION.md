# Authentication System Documentation

## Overview

The Child Safety Simulator now includes a complete authentication system with:
- ✅ User registration
- ✅ User login with token-based auth
- ✅ Token verification
- ✅ Profile management
- ✅ Logout functionality

## How It Works

### Storage

Users are stored in `Backend/data/users.json` with the following structure:
```json
{
  "id": "timestamp",
  "name": "User Name",
  "email": "user@example.com",
  "password": "sha256-hashed-password",
  "token": "random-32-byte-hex-token",
  "createdAt": "ISO-timestamp",
  "lastLogin": "ISO-timestamp",
  "updatedAt": "ISO-timestamp"
}
```

### Security

- Passwords are hashed using SHA-256
- Tokens are 64-character random hex strings
- Tokens are cleared on logout
- All sensitive data (passwords) is stripped from responses

## API Endpoints

### 1. Register
```bash
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword",
  "confirmPassword": "securePassword"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Registration successful",
  "user": {
    "id": "1770653042680",
    "name": "John Doe",
    "email": "john@example.com",
    "token": "8e0456e86650a6b814fddb63cbf12e812e05a472738fa385dc71cc126d882edd",
    "createdAt": "2026-02-09T16:04:02.682Z"
  }
}
```

### 2. Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securePassword"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "1770653042680",
    "name": "John Doe",
    "email": "john@example.com",
    "token": "newtoken...",
    "lastLogin": "2026-02-09T16:05:00.000Z"
  }
}
```

### 3. Verify Token
```bash
GET /api/auth/verify
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "1770653042680",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

### 4. Get Profile
```bash
GET /api/auth/profile
Authorization: Bearer <token>
```

### 5. Update Profile
```bash
PUT /api/auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Jane Doe"
}
```

### 6. Logout
```bash
POST /api/auth/logout
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

## Testing

Run the auth test suite:
```bash
npm run test:auth
```

This will test all auth endpoints:
1. ✅ User registration
2. ✅ User login
3. ✅ Token verification
4. ✅ Get profile
5. ✅ Update profile
6. ✅ Logout
7. ✅ Rejected expired token

## Frontend Integration

### Store Token in localStorage

After login/register:
```javascript
const response = await fetch('/api/auth/login', { ... });
const data = await response.json();
if (data.success) {
  localStorage.setItem('user', JSON.stringify(data.user));
  localStorage.setItem('token', data.user.token);
}
```

### Use Token in API Calls

```javascript
const token = localStorage.getItem('token');
fetch('/api/simulate/start', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({...})
});
```

### Check if Logged In

```javascript
const token = localStorage.getItem('token');
const user = localStorage.getItem('user');

if (token && user) {
  // User is logged in
  const userData = JSON.parse(user);
  console.log('Logged in as:', userData.name);
} else {
  // User not logged in
  navigate('/login');
}
```

### Logout

```javascript
localStorage.removeItem('token');
localStorage.removeItem('user');
navigate('/login');
```

## Error Handling

| Status | Error | Meaning |
|--------|-------|---------|
| 400 | Invalid input | Missing required fields or validation failed |
| 400 | Email already exists | User already registered with that email |
| 400 | Passwords do not match | Confirmation password doesn't match |
| 401 | Invalid email or password | Login credentials wrong |
| 401 | No token provided | Missing Authorization header |
| 401 | Invalid or expired token | Token is invalid or user logged out |
| 500 | Server error | Internal server error |

## Future Enhancements

- [ ] Password reset via email
- [ ] Email verification
- [ ] 2FA (Two-Factor Authentication)
- [ ] JWT tokens with expiration
- [ ] Database (MongoDB/PostgreSQL) instead of JSON file
- [ ] Rate limiting on auth endpoints
- [ ] Session management
- [ ] OAuth integration (Google, GitHub)
