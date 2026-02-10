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

        for (let i = 0; i < agentCount; i++) {
          const spawnPos = getRandomSpawnPosition(sceneData.boundingBox, floorHeight);
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

        const eventQueue = new physicsEngine.rapier.EventQueue(true);
        const handleToCollider = new Map();
        colliders.forEach(c => { if (c.collider) handleToCollider.set(c.collider.handle, c); });
        const handleToAgent = new Map();
        agents.forEach(a => { if (a.collider) handleToAgent.set(a.collider.handle, a); });

        const collisionEvents = [];
        let contactCandidates = 0;
        let validContacts = 0;
        const deltaTime = 1 / 60;
        const totalSteps = duration * 60;

        for (let step = 0; step < totalSteps; step++) {
          physicsEngine.step(world, deltaTime, eventQueue);

          eventQueue.drainCollisionEvents((handle1, handle2, started) => {
            if (!started) return;
            contactCandidates++;
            const agent1 = handleToAgent.get(handle1);
            const agent2 = handleToAgent.get(handle2);
            const collider1 = handleToCollider.get(handle1);
            const collider2 = handleToCollider.get(handle2);
            const agent = agent1 || agent2;
            const collider = collider1 || collider2;
            if (!agent || !collider) return;
            if (collider.type === 'floor') return;

            const contactPointData = physicsEngine.getContactPoint(world, agent.collider, collider.collider);
            if (!contactPointData) return;
            const { position: contactPoint, normal: contactNormal } = contactPointData;
            // temporary: relax validation margin to ensure we don't filter valid contacts
            if (!validateContactPoint(contactPoint, sceneData.boundingBox)) return;

            const agentVel = agent.getVelocity();
            validContacts++;
            collisionEvents.push({
              time: step * deltaTime,
              agentId: agent.id,
              objectId: collider.id,
              objectName: collider.name || collider.id,
              position: contactPoint,
              normal: contactNormal,
              velocity: agent.velocity,
              impactSpeed: agentVel
            });
          });

          agents.forEach(agent => agent.update(deltaTime, colliders, agents, sceneData.boundingBox));

          // Update progress periodically
          if (step % 30 === 0) {
            const progress = Math.round((step / totalSteps) * 100);
            const entry = activeSimulations.get(simulationId) || {};
            entry.progress = progress;
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
        error: entry.error || null
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

    const heatmapData = (simulationData.collisionEvents || []).map(event => ({
      position: event.position,
      injuryScore: event.injury?.injuryScore || 0,
      riskTier: event.injury?.riskTier || 'safe'
    }));

    res.json({
      success: true,
      heatmap: heatmapData
    });

  } catch (error) {
    res.status(404).json({ 
      success: false,
      error: 'Simulation not found' 
    });
  }
};

// 🔥 FIX 7: Validate contact point coordinates
function validateContactPoint(point, sceneBounds) {
  if (!point || !Array.isArray(point) || point.length !== 3) {
    return false;
  }

  // Check for NaN or Infinity
  if (point.some(v => !Number.isFinite(v))) {
    return false;
  }

  // Check within scene bounds (with margin)
  // NOTE: increased margin to avoid filtering contacts due to coordinate variance during debugging
  const margin = 20.0;
  const [x, y, z] = point;
  
  if (x < sceneBounds.min[0] - margin || x > sceneBounds.max[0] + margin) return false;
  if (y < sceneBounds.min[1] - margin || y > sceneBounds.max[1] + margin) return false;
  if (z < sceneBounds.min[2] - margin || z > sceneBounds.max[2] + margin) return false;

  return true;
}

function getRandomSpawnPosition(bbox, floorHeight) {
  if (!bbox) {
    return [0, floorHeight + 0.5, 0];
  }

  const margin = 1.0;

  return [
    bbox.min[0] + margin + Math.random() * (bbox.max[0] - bbox.min[0] - 2 * margin),
    floorHeight + 0.5,
    bbox.min[2] + margin + Math.random() * (bbox.max[2] - bbox.min[2] - 2 * margin)
  ];
}

async function cleanupSimulation(world, agents, colliders) {
  console.log('🧹 Starting physics cleanup...');
  
  try {
    // Count before cleanup
    const rigidBodyCount = world.bodies.len();
    console.log(`  📦 Found ${rigidBodyCount} rigid bodies to clean up`);

    // Remove agents
    agents.forEach(agent => {
      if (agent.collider && world.getCollider(agent.collider.handle)) {
        world.removeCollider(agent.collider, true);
      }
      agent.cleanup();
    });
    console.log(`  ✅ Removed ${agents.length} colliders`);

    // Remove scene colliders
    colliders.forEach(collider => {
      if (collider.collider && world.getCollider(collider.collider.handle)) {
        world.removeCollider(collider.collider, true);
      }
    });

    // Remove all remaining rigid bodies
    let removedBodies = 0;
    world.forEachRigidBody((body) => {
      world.removeRigidBody(body);
      removedBodies++;
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