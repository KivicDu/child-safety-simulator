import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function testSimulation() {
  try {
    console.log('🧪 Starting simulation test...\n');

    // Use an existing scene
    const sceneId = '1780203081838-Another_bedroom';
    
    // Test 1: Start a simulation with infant
    console.log('Step 1: Starting simulation with infant...');
    console.log(`  Scene: ${sceneId}`);
    console.log(`  Duration: 25 seconds\n`);
    
    const simRes = await axios.post(`${BASE_URL}/api/simulate/start`, {
      sceneId,
      ageGroupId: 'infant',
      agentCount: 1,
      duration: 25
    });
    const simId = simRes.data.simulationId || simRes.data._id || simRes.data.id;
    console.log(`✅ Simulation started: ${simId}\n`);

    // Test 2: Wait for simulation to complete
    console.log('⏳ Waiting for simulation to complete...');
    let completed = false;
    let attempts = 0;
    while (!completed && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
      try {
        const statusRes = await axios.get(`${BASE_URL}/api/simulate/${simId}/status`);
        if (statusRes.data.status !== 'running') {
          completed = true;
          console.log(`✅ Simulation completed in ${attempts * 2} seconds`);
        } else {
          process.stdout.write('.');
        }
      } catch (e) {
        // Status endpoint might not be available
      }
    }

    // Test 3: Get simulation report
    console.log('\nStep 2: Getting simulation report...');
    try {
      const reportRes = await axios.get(`${BASE_URL}/api/simulate/${simId}/report`);
      const report = reportRes.data;
      
      console.log(`\n📊 SIMULATION REPORT:`);
      if (report.agents && report.agents.length > 0) {
        const agent = report.agents[0];
        console.log(`  Agent Details:`);
        console.log(`    ID: ${agent.id || 'N/A'}`);
        console.log(`    Age Group: ${agent.ageGroupId || 'N/A'}`);
        console.log(`    Total Distance: ${agent.totalDistance?.toFixed(2) || 'N/A'}m`);
        console.log(`    Max Distance from Start: ${agent.maxDistFromStart?.toFixed(2) || 'N/A'}m`);
        console.log(`    Behaviors Executed: ${agent.behaviors?.length || 0}`);
        if (agent.behaviors && agent.behaviors.length > 0) {
          console.log(`\n  First 5 Behaviors:`);
          agent.behaviors.slice(0, 5).forEach((b, idx) => {
            console.log(`    [${idx + 1}] ${b.id}: ${b.duration?.toFixed(1) || 'N/A'}s`);
          });
        }
      } else {
        console.log(`  No agents found in report`);
      }
    } catch (err) {
      console.log(`  Note: ${err.message}`);
    }

    console.log('\n✅ Test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data?.message || error.response?.data || error.message);
  }
}

testSimulation();
