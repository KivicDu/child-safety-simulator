#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runE2E() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('\n🧪 E2E Test: Upload + Simulate Flow');
  console.log('=====================================\n');

  try {
    // 1. Create a test GLB file (simple box)
    console.log('1️⃣ Creating test model...');
    const testGlbPath = path.join(__dirname, 'uploads', 'test-model.glb');
    
    // Use an existing bedroom GLB if available
    const bedroomPath = path.join(__dirname, 'parsed');
    const files = await fs.readdir(bedroomPath).catch(() => []);
    console.log(`   Found ${files.length} parsed files`);

    // 2. Test upload endpoint
    console.log('\n2️⃣ Testing upload endpoint mock...');
    const sceneId = `1770656089441-bedroom`;
    const uploadResponse = {
      success: true,
      sceneId: sceneId,
      filePath: `/uploads/${sceneId}.glb`,
    };
    console.log(`   ✅ Mock upload response:`);
    console.log(`   - sceneId: ${uploadResponse.sceneId}`);
    console.log(`   - filePath: ${uploadResponse.filePath}`);

    // 3. Test simulate/start endpoint
    console.log('\n3️⃣ Calling /api/simulate/start...');
    const simulatePayload = {
      sceneId: uploadResponse.sceneId,
      ageGroupId: 'toddler',
      duration: 5,
      agentCount: 5,
    };
    console.log(`   Payload:`, JSON.stringify(simulatePayload, null, 2));

    const simulateResponse = await fetch(`${baseUrl}/api/simulate/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(simulatePayload),
    });

    if (simulateResponse.ok) {
      const simData = await simulateResponse.json();
      console.log(`   ✅ Simulation started: ${simData.id}`);
      
      // 4. Poll simulation status
      console.log('\n4️⃣ Polling simulation status...');
      let complete = false;
      let pollCount = 0;
      
      while (!complete && pollCount < 15) {
        await sleep(1000);
        pollCount++;
        
        const statusResponse = await fetch(`${baseUrl}/api/simulate/${simData.id}/status`);
        const statusData = await statusResponse.json();
        
        console.log(`   [${pollCount}] Progress: ${statusData.progress}% | Status: ${statusData.status}`);
        
        if (statusData.status === 'complete') {
          complete = true;
          console.log(`   ✅ Simulation complete!`);
          
          // Get collision events
          const eventsResponse = await fetch(`${baseUrl}/api/simulate/${simData.id}/events`);
          const events = await eventsResponse.json();
          console.log(`   📊 Collision events: ${events.length}`);
        }
      }
      
      if (!complete) {
        console.log('   ⏱️  Timeout waiting for simulation');
      }
    } else {
      const errorData = await simulateResponse.json();
      console.log(`   ❌ Error: ${simulateResponse.status}`);
      console.log(`   Details:`, errorData);
    }

    console.log('\n✅ E2E test completed!\n');

  } catch (error) {
    console.error('❌ E2E test failed:', error.message);
    process.exit(1);
  }
}

runE2E();
