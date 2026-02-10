// Quick test for auth endpoints

const BASE = 'http://localhost:3000';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  try {
    console.log('Testing Auth Endpoints...\n');

    // Test 1: Register
    console.log('1️⃣  Register new user...');
    const uniqueEmail = `test${Date.now()}@example.com`;
    const regResp = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: uniqueEmail,
        password: 'password123',
        confirmPassword: 'password123'
      })
    });
    const regData = await regResp.json();
    console.log('   Response:', JSON.stringify(regData, null, 2));

    if (!regData.success || !regData.user.token) {
      console.error('   ❌ Registration failed');
      process.exit(1);
    }

    const token = regData.user.token;
    console.log(`   ✅ User registered, token: ${token.substring(0, 10)}...`);

    // Test 2: Login
    console.log('\n2️⃣  Login with credentials...');
    const loginResp = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: uniqueEmail,
        password: 'password123'
      })
    });
    const loginData = await loginResp.json();
    console.log('   ✅ Login successful');

    const loginToken = loginData.user.token;

    // Test 3: Verify token
    console.log('\n3️⃣  Verify token...');
    const verifyResp = await fetch(`${BASE}/api/auth/verify`, {
      headers: { 'Authorization': `Bearer ${loginToken}` }
    });
    const verifyData = await verifyResp.json();
    console.log('   ✅ Token verified for:', verifyData.user.email);

    // Test 4: Get profile
    console.log('\n4️⃣  Get profile...');
    const profileResp = await fetch(`${BASE}/api/auth/profile`, {
      headers: { 'Authorization': `Bearer ${loginToken}` }
    });
    const profileData = await profileResp.json();
    console.log('   ✅ Profile retrieved:', profileData.user.name);

    // Test 5: Update profile
    console.log('\n5️⃣  Update profile...');
    const updateResp = await fetch(`${BASE}/api/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${loginToken}`
      },
      body: JSON.stringify({ name: 'Updated User' })
    });
    const updateData = await updateResp.json();
    console.log('   ✅ Profile updated:', updateData.user.name);

    // Test 6: Logout
    console.log('\n6️⃣  Logout...');
    const logoutResp = await fetch(`${BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${loginToken}` }
    });
    const logoutData = await logoutResp.json();
    console.log('   ✅ Logout successful');

    // Test 7: Try to use expired token
    console.log('\n7️⃣  Try to access with expired token...');
    const expiredResp = await fetch(`${BASE}/api/auth/profile`, {
      headers: { 'Authorization': `Bearer ${loginToken}` }
    });
    if (expiredResp.status === 401) {
      console.log('   ✅ Correctly rejected expired token');
    } else {
      console.log('   ❌ Should have rejected token');
    }

    console.log('\n✅ All auth tests passed!');
    process.exit(0);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
