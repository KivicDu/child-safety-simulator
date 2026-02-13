import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import physicsEngine from '../services/physicsEngine.js';
import colliderGenerator from '../utils/colliderGenerator.js';
import behaviorManager from '../services/behaviorManager.js';
import injuryCalculator from '../services/injuryCalculator.js';
import Agent from '../services/agent.js';
import { getAgeGroup } from '../config/ageGroups.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PARSED_DIR = process.env.PARSED_DIR || './parsed';
const SIMULATION_DIR = process.env.SIMULATION_DIR || './simulations';

await fs.mkdir(SIMULATION_DIR, { recursive: true });

const activeSimulations = new Map();

export const startSimulation = async (req, res) => {
  try {
    const { sceneId, agentCount = 10, duration = 10, ageGroupId = 'toddler' } = req.body;

    if (!sceneId) {
      return res.status(400).json({ error: 'sceneId is required' });
    }

    const simulationId = `sim_${Date.now()}`;

    // Create initial entry in activeSimulations map
    activeSimulations.set(simulationId, {
      status: 'running',
      progress: 0,
      startedAt: new Date().toISOString()
    });

    // Run simulation asynchronously
    (async () => {
      const startTime = Date.now();

      try {
        const parsedPath = path.join(PARSED_DIR, `${sceneId}.json`);
        const sceneData = JSON.parse(await fs.readFile(parsedPath, 'utf8'));

        // Initialize physics
        await physicsEngine.init();
        const world = physicsEngine.createWorld();

        const colliders = colliderGenerator.generateCollidersFromScene(sceneData, world, physicsEngine);

        const ageGroup = getAgeGroup(ageGroupId);
        const agents = [];
        const floorHeight = sceneData.floor?.height || 0;
        console.log(`[SIM START] Scene: ${sceneId}, Floor Height: ${floorHeight.toFixed(4)}`);
        console.log(`[SIM START] BBox Min: ${JSON.stringify(sceneData.boundingBox.min)}, Max: ${JSON.stringify(sceneData.boundingBox.max)}`);

        for (let i = 0; i < agentCount; i++) {
          const spawnPos = getRandomSpawnPosition(sceneData.boundingBox, floorHeight, ageGroup);
          const agentBodyObj = physicsEngine.createAgentCollider(
            world,
            spawnPos,
            ageGroup.height,
            ageGroup.capsuleRadius
          );
          const agent = new Agent(i, spawnPos, agentBodyObj.body, ageGroupId);
          agent.collider = agentBodyObj.collider;
          agents.push(agent);
        }

        // Initialize and distribute agent behaviors based on scene data
        const { behaviors, rareEvents } = await behaviorManager.generateBehaviorsForScene(
          sceneData,
          ageGroupId
        );
        behaviorManager.distributeBehaviors(agents, behaviors, rareEvents);

        const eventQueue = new physicsEngine.rapier.EventQueue(true);
        const handleToCollider = new Map();
        colliders.forEach(c => { if (c.collider) handleToCollider.set(c.collider.handle, c); });
        const handleToAgent = new Map();
        agents.forEach(a => { if (a.collider) handleToAgent.set(a.collider.handle, a); });

        const collisionEvents = [];
        let contactCandidates = 0;
        let validContacts = 0;
        let dbg_noMatch = 0, dbg_isFloor = 0, dbg_noContact = 0, dbg_outOfBounds = 0;
        const traceLog = [];
        const deltaTime = 1 / 60;
        const totalSteps = duration * 60;

        for (let step = 0; step < totalSteps; step++) {
          // Update agent velocity and state before physics step
          agents.forEach(agent => agent.update(deltaTime, colliders, agents, sceneData.boundingBox));

          physicsEngine.step(world, deltaTime, eventQueue);

          // Warmup phase: allow physics to stabilize before recording interactions
          if (step < 30) {
            eventQueue.drainCollisionEvents(() => {}); // drain but discard
            continue;
          }

          eventQueue.drainCollisionEvents((handle1, handle2, started) => {
            try {
            if (!started) return;
            contactCandidates++;
            const agent1 = handleToAgent.get(handle1);
            const agent2 = handleToAgent.get(handle2);
            const collider1 = handleToCollider.get(handle1);
            const collider2 = handleToCollider.get(handle2);
            const agent = agent1 || agent2;
            const collider = collider1 || collider2;

            if (!agent || !collider) { dbg_noMatch++; traceLog.push(`NO_MATCH h1=${handle1} h2=${handle2} a=${!!agent} c=${!!collider}`); return; }
            if (collider.type === 'floor') { dbg_isFloor++; return; }

            traceLog.push(`PRE_CONTACT h1=${handle1} h2=${handle2} agent=${agent.id} obj=${collider.id} type=${collider.type}`);
            const contactPointData = physicsEngine.getContactPoint(world, agent.collider, collider.collider);
            if (!contactPointData) { dbg_noContact++; traceLog.push(`NO_CONTACT h1=${handle1} h2=${handle2}`); return; }
            const { position: contactPoint, normal: contactNormal } = contactPointData;
            if (!validateContactPoint(contactPoint, sceneData.boundingBox)) { dbg_outOfBounds++; traceLog.push(`OOB pt=${JSON.stringify(contactPoint)}`); return; }

            // Calculate impact velocity magnitude
            let agentVelMagnitude = agent.getVelocity();

            // Apply impact angle attenuation (glancing blows reduce force)
            if (contactNormal && agentVelMagnitude > 0) {
              // Compute dot product of velocity direction and contact normal
              const velMag = agentVelMagnitude;
              const vx = agent.velocity[0], vy = agent.velocity[1], vz = agent.velocity[2];
              const speed = Math.sqrt(vx*vx + vy*vy + vz*vz) || 1;
              const dot = Math.abs((vx/speed) * contactNormal[0] + (vy/speed) * contactNormal[1] + (vz/speed) * contactNormal[2]);
              // dot=1 → head-on, dot=0 → glancing. Scale between 0.3 and 1.0
              const angleFactor = 0.3 + 0.7 * dot;
              agentVelMagnitude *= angleFactor;
            }

            // Adjust for agent interaction state (e.g., higher force during active play)
            const stateMultiplier = agent.state === 'INTERACTING' ? (1.2 + Math.random() * 1.3) : 1.0;
            agentVelMagnitude *= stateMultiplier;

            // Filter insignificant contacts
            if (agentVelMagnitude < 0.05) {
              traceLog.push(`LOW_VEL agent=${agent.id} vel=${agentVelMagnitude.toFixed(4)}`);
              return;
            }

            validContacts++;
            traceLog.push(`VALID agent=${agent.id} obj=${collider.id} vel=${agentVelMagnitude.toFixed(3)}`);
            collisionEvents.push({
              time: step * deltaTime,
              agentId: agent.id,
              objectId: collider.id,
              objectName: collider.name || collider.id,
              position: contactPoint,
              normal: contactNormal,
              velocity: agentVelMagnitude,
              impactSpeed: agentVelMagnitude
            });
            } catch (err) {
              traceLog.push(`ERROR h1=${handle1} h2=${handle2}: ${err.message}`);
            }
          });

          // Log warning if agents are far from everything
          if (step % 120 === 0 && step > 0) { // Every 2 seconds
             if (contactCandidates === 0) {
                 const pos0 = agents[0] ? agents[0].getPosition() : 'N/A';
                 console.warn(`[SIM STEP ${step}] ⚠️ 0 Candidates. Agent 0 Pos: ${JSON.stringify(pos0)}`);
             }
          }

          // Update progress and agent positions periodically
          if (step % 10 === 0) {
            const entry = activeSimulations.get(simulationId) || {};
            // Update progress every 30 steps
            if (step % 30 === 0) {
              entry.progress = Math.round((step / totalSteps) * 100);
            }
            // Always update agent positions for live visualization
            entry.agentPositions = agents.map(a => {
              const pos = a.getPosition();
              return { agentId: a.id, position: Array.isArray(pos) ? pos : [pos.x || 0, pos.y || 0, pos.z || 0] };
            });
            entry.simTime = (step * deltaTime).toFixed(2);
            activeSimulations.set(simulationId, entry);
          }
        }

        // Calculate injuries & summary
        const objectsMap = {};
        sceneData.objects.forEach(obj => { objectsMap[obj.id] = obj; });
        const injuryAssessments = injuryCalculator.calculateBatchInjuries(collisionEvents, ageGroupId, objectsMap);
        const summary = injuryCalculator.getInjurySummary(injuryAssessments);

        const trajectories = agents.map(agent => ({ agentId: agent.id, positions: agent.getSampledTrajectory(30), finalState: agent.getStatus() }));

        const simulationData = {
          simulationId,
          sceneId,
          ageGroupId,
          config: { agentCount, duration, ageGroup: ageGroup.name },
          trajectories,
          collisionEvents: injuryAssessments,
          summary,
          debugStats: {
            contactCandidates,
            validContacts,
            floorHeight,
            sceneBBox: sceneData.boundingBox,
            filterBreakdown: { noMatch: dbg_noMatch, isFloor: dbg_isFloor, noContact: dbg_noContact, outOfBounds: dbg_outOfBounds },
            traceLog: traceLog.slice(0, 50) // First 50 trace entries
          },
          timestamp: new Date().toISOString()
        };

        const simPath = path.join(SIMULATION_DIR, `${simulationId}.json`);
        await fs.writeFile(simPath, JSON.stringify(simulationData, null, 2));

        // Mark complete
        activeSimulations.set(simulationId, { status: 'complete', progress: 100, finishedAt: new Date().toISOString() });

        // Cleanup
        await cleanupSimulation(world, agents, colliders);

        console.log(`Simulation ${simulationId} complete. Saved to ${simPath}`);
        console.log(`  🔎 Contact candidates: ${contactCandidates}  |  Valid contacts recorded: ${validContacts}`);

      } catch (err) {
        console.error('Async simulation error:', err);
        activeSimulations.set(simulationId, { status: 'error', progress: 0, error: err.message });
      }
    })();

    // Return immediately with simulationId
    res.json({ success: true, simulationId });

  } catch (error) {
    console.error('❌ Simulation start error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getSimulationStatus = async (req, res) => {
  try {
    const simulationId = req.params.id;

    // If simulation is active, return current progress
    if (activeSimulations.has(simulationId)) {
      const entry = activeSimulations.get(simulationId) || {};
      return res.json({
        success: true,
        status: entry.status || 'running',
        progress: typeof entry.progress === 'number' ? entry.progress : 0,
        startedAt: entry.startedAt || null,
        error: entry.error || null,
        agentPositions: entry.agentPositions || null,
        simTime: entry.simTime || null
      });
    }

    // Otherwise, try to load saved simulation result
    const simPath = path.join(SIMULATION_DIR, `${simulationId}.json`);
    const data = await fs.readFile(simPath, 'utf8');
    const simulationData = JSON.parse(data);

    res.json({
      success: true,
      status: 'complete',
      progress: 100,
      startedAt: simulationData.timestamp || null,
      resultSummary: simulationData.summary || {},
      simulationId,
      dataPath: simPath
    });

  } catch (error) {
    res.status(404).json({ 
      success: false,
      error: 'Simulation not found' 
    });
  }
};

export const getCollisionEvents = async (req, res) => {
  try {
    const simulationId = req.params.id;

    // If simulation is still running (not complete), indicate 202
    if (activeSimulations.has(simulationId)) {
      const entry = activeSimulations.get(simulationId) || {};
      if (entry.status !== 'complete') {
        return res.status(202).json({ success: false, message: 'Simulation still running' });
      }
    }

    const simPath = path.join(SIMULATION_DIR, `${simulationId}.json`);
    const data = await fs.readFile(simPath, 'utf8');
    const simulationData = JSON.parse(data);

    res.json({
      success: true,
      events: simulationData.collisionEvents || []
    });

  } catch (error) {
    res.status(404).json({ 
      success: false,
      error: 'Simulation not found' 
    });
  }
};

export const getSimulationHeatmap = async (req, res) => {
  try {
    const simulationId = req.params.id;
    const simPath = path.join(SIMULATION_DIR, `${simulationId}.json`);
    
    const data = await fs.readFile(simPath, 'utf8');
    const simulationData = JSON.parse(data);
    const events = simulationData.collisionEvents || [];

    // Load parsed scene for bounding boxes
    let sceneObjects = {};
    try {
      const parsedPath = path.join(PARSED_DIR, `${simulationData.sceneId}.json`);
      const sceneRaw = await fs.readFile(parsedPath, 'utf8');
      const sceneData = JSON.parse(sceneRaw);
      (sceneData.objects || []).forEach(obj => { sceneObjects[obj.id] = obj; });
    } catch (_) { /* scene file may not exist */ }

    // ── Aggregate events per object ──
    const objectMap = new Map();
    events.forEach(evt => {
      const id = evt.objectId;
      if (!id) return;
      if (!objectMap.has(id)) {
        objectMap.set(id, {
          objectId: id,
          objectName: evt.objectName || id,
          hits: [],
          positions: []
        });
      }
      const entry = objectMap.get(id);
      entry.hits.push(evt.injury || {});
      if (evt.position) entry.positions.push(evt.position);
    });

    // ── Build per-object heatmap ──
    const objectHeatmap = [];
    for (const [objId, entry] of objectMap) {
      const scores = entry.hits.map(h => h.injuryScore || 0);
      const gForces = entry.hits.map(h => h.gForce || 0);
      const maxScore = Math.max(...scores, 0);
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const maxGForce = Math.max(...gForces, 0);
      const avgGForce = gForces.length > 0 ? Math.round(gForces.reduce((a, b) => a + b, 0) / gForces.length * 10) / 10 : 0;

      // Worst g-force tier
      const worstGForceTier = maxGForce >= 50 ? 'Serious Injury' : maxGForce >= 20 ? 'Soft Injury' : 'Observe';

      // Body parts hit
      const bodyParts = {};
      entry.hits.forEach(h => { if (h.bodyPart) bodyParts[h.bodyPart] = (bodyParts[h.bodyPart] || 0) + 1; });
      const primaryBodyPart = Object.entries(bodyParts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

      // Color: intensity maps 0-100 score → green→yellow→orange→red
      const intensity = Math.min(1.0, maxScore / 80);
      const heatColor = scoreToRGB(maxScore);

      // Bounding box from scene
      const sceneObj = sceneObjects[objId];
      const boundingBox = sceneObj?.boundingBox || null;

      // Safety recommendations
      const recommendations = injuryCalculator.generateSafetyRecommendations(
        entry.objectName, worstGForceTier, primaryBodyPart, maxScore
      );

      objectHeatmap.push({
        objectId: objId,
        objectName: entry.objectName,
        boundingBox,
        totalHits: entry.hits.length,
        collisionPositions: entry.positions,
        maxInjuryScore: maxScore,
        avgInjuryScore: avgScore,
        maxGForce,
        avgGForce,
        worstGForceTier,
        primaryBodyPart,
        heatColor,
        intensity,
        recommendations
      });
    }

    // Sort by danger (most dangerous first)
    objectHeatmap.sort((a, b) => b.maxInjuryScore - a.maxInjuryScore);

    res.json({
      success: true,
      objectHeatmap,
      // Also keep raw point heatmap for fallback
      pointHeatmap: events.map(evt => ({
        position: evt.position,
        injuryScore: evt.injury?.injuryScore || 0,
        gForce: evt.injury?.gForce || 0,
        riskTier: evt.injury?.riskTier || 'safe',
        gForceTier: evt.injury?.gForceTier || 'Observe',
        objectName: evt.objectName
      }))
    });

  } catch (error) {
    res.status(404).json({ 
      success: false,
      error: 'Simulation not found' 
    });
  }
};

// Score → RGB color (green→yellow→orange→red)
function scoreToRGB(score) {
  const t = Math.min(1, Math.max(0, score / 100));
  let r, g, b;
  if (t < 0.25) {        // green → yellow-green
    r = t * 4; g = 1; b = 0;
  } else if (t < 0.5) {  // yellow-green → yellow
    r = 1; g = 1; b = 0;
  } else if (t < 0.75) { // yellow → orange
    r = 1; g = 1 - (t - 0.5) * 2; b = 0;
  } else {               // orange → red
    r = 1; g = Math.max(0, 1 - (t - 0.5) * 2); b = 0;
  }
  return [Math.round(r * 255) / 255, Math.round(g * 255) / 255, Math.round(b * 255) / 255];
}

// Validate contact point coordinates against scene bounds
function validateContactPoint(point, sceneBounds) {
  if (!point || !Array.isArray(point) || point.length !== 3) {
    return false;
  }

  // Check for NaN or Infinity
  if (point.some(v => !Number.isFinite(v))) {
    return false;
  }

  // Check within scene bounds (with reasonable margin)
  const margin = 5.0;
  const [x, y, z] = point;
  
  if (x < sceneBounds.min[0] - margin || x > sceneBounds.max[0] + margin) return false;
  if (y < sceneBounds.min[1] - margin || y > sceneBounds.max[1] + margin) return false;
  if (z < sceneBounds.min[2] - margin || z > sceneBounds.max[2] + margin) return false;

  return true;
}

// Calculate spawn position with age-specific height offset
function getRandomSpawnPosition(bbox, floorHeight, ageGroup = null) {
  const heightOffset = ageGroup ? (ageGroup.height / 2 + 0.05) : 0.5;

  if (!bbox) {
    return [0, floorHeight + heightOffset, 0];
  }

  const margin = 1.0;

  return [
    bbox.min[0] + margin + Math.random() * (bbox.max[0] - bbox.min[0] - 2 * margin),
    floorHeight + heightOffset,
    bbox.min[2] + margin + Math.random() * (bbox.max[2] - bbox.min[2] - 2 * margin)
  ];
}

// Cleanup physics entities and resources
async function cleanupSimulation(world, agents, colliders) {
  console.log('🧹 Starting physics cleanup...');
  
  try {
    // Count before cleanup
    const rigidBodyCount = world.bodies.len();
    console.log(`  📦 Found ${rigidBodyCount} rigid bodies to clean up`);

    // Remove agent colliders
    agents.forEach(agent => {
      try {
        if (agent.collider && world.getCollider(agent.collider.handle)) {
          world.removeCollider(agent.collider, true);
        }
      } catch (e) { /* collider already removed */ }
      agent.cleanup();
    });
    console.log(`  ✅ Removed ${agents.length} agent colliders`);

    // Remove scene colliders
    colliders.forEach(collider => {
      try {
        if (collider.collider && world.getCollider(collider.collider.handle)) {
          world.removeCollider(collider.collider, true);
        }
      } catch (e) { /* collider already removed */ }
    });

    // Collect body handles before removal to avoid mutation issues during iteration
    const bodyHandles = [];
    world.forEachRigidBody((body) => {
      bodyHandles.push(body.handle);
    });
    
    let removedBodies = 0;
    bodyHandles.forEach(handle => {
      try {
        const body = world.getRigidBody(handle);
        if (body) {
          world.removeRigidBody(body);
          removedBodies++;
        }
      } catch (e) { /* body already removed */ }
    });
    console.log(`  ✅ Removed ${removedBodies} rigid bodies`);

    // Free world
    world.free();
    console.log(`  ✅ Freed physics world`);

    console.log('✅ Physics cleanup completed successfully');

    // Force garbage collection if available
    if (global.gc) {
      const heapBefore = process.memoryUsage().heapUsed;
      global.gc();
      const heapAfter = process.memoryUsage().heapUsed;
      const freedMB = ((heapBefore - heapAfter) / 1024 / 1024).toFixed(1);
      console.log(`🗑️ GC freed ${freedMB}MB`);
      console.log(`   Heap used: ${(heapAfter / 1024 / 1024).toFixed(0)}MB`);
    }

  } catch (error) {
    console.error('⚠️ Cleanup error:', error.message);
  }
}