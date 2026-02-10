// Simple E2E test: starts a simulation for an existing parsed scene and polls status
// Usage: node test/run_sim_e2e.js

const BASE = process.env.BASE || 'http://localhost:3000';
const SCENE_ID = process.env.SCENE_ID || '1770485531976-bedroom';

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

(async ()=>{
  console.log('Starting E2E test against', BASE);
  try{
    const startResp = await fetch(`${BASE}/api/simulate/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneId: SCENE_ID, agentCount: 6, duration: 8, ageGroupId: 'toddler' })
    });

    const startJson = await startResp.json();
    if(!startJson.success){
      console.error('Start failed:', startJson);
      process.exit(1);
    }

    const simId = startJson.simulationId;
    console.log('Simulation started:', simId);

    // Poll
    for(let i=0;i<120;i++){
      const s = await fetch(`${BASE}/api/simulate/${simId}/status`);
      const j = await s.json();
      console.log(i, 'status:', j.status, 'progress:', j.progress || 0);
      if(j.status === 'complete'){
        console.log('Simulation complete, fetching events...');
        const ev = await fetch(`${BASE}/api/simulate/${simId}/events`);
        const evj = await ev.json();
        console.log('Events:', (evj.events || []).length);
        process.exit(0);
      }
      await sleep(2000);
    }

    console.error('Timed out waiting for simulation to finish');
    process.exit(2);

  }catch(err){
    console.error('E2E error', err);
    process.exit(3);
  }
})();
