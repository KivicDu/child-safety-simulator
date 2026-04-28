import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyScaleToSceneData } from '../utils/scaleNormalizer.js';
import scaleAuthority from '../services/scaleAuthority.js';
import behaviorManager from '../services/behaviorManager.js';
import injuryCalculator from '../services/injuryCalculator.js';
import Agent from '../services/agent.js';
import { getAllAgeGroups } from '../config/ageGroups.js';
import physicsEngine from '../services/physicsEngine.js';
import colliderGenerator from '../utils/colliderGenerator.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PARSED_DIR = process.env.PARSED_DIR || './parsed';
const SIMULATION_DIR = process.env.SIMULATION_DIR || './simulations';

fs.mkdir(SIMULATION_DIR, { recursive: true }).catch(() => {});

/**
 * Batch simulate all age groups with progress tracking
 */
export const batchSimulateAllAges = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { sceneId, agentCount = 10, duration = 10 } = req.body;

    if (!sceneId) {
      return res.status(400).json({ error: 'sceneId is required' });
    }

    console.log(`\n🔄 BATCH SIMULATION START`);
    console.log(`   Scene: ${sceneId}`);
    console.log(`   Agents: ${agentCount}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Age Groups: 5 (all)`);

    const parsedPath = path.join(PARSED_DIR, `${sceneId}.json`);
    const sceneData = JSON.parse(await fs.readFile(parsedPath, 'utf8'));

    let scaleFactor = sceneData._scaleFactor;
    if (!scaleFactor) {
      const scaleInfo = scaleAuthority.detectScale(sceneData);
      scaleFactor = scaleInfo.factor;
    }
    applyScaleToSceneData(sceneData, scaleFactor);

    const ageGroups = getAllAgeGroups();
    const results = {};

    console.log(`\n📊 Running ${ageGroups.length} simulations...`);

    for (let i = 0; i < ageGroups.length; i++) {
      const ageGroup = ageGroups[i];
      const ageGroupId = ageGroup.id;

      const groupStartTime = Date.now();
      
      console.log(`\n[${i + 1}/${ageGroups.length}] 🧒 ${ageGroup.name} (${ageGroupId})`);

      try {
        const simulationResult = await runSingleSimulation(
          sceneId,
          sceneData,
          ageGroupId,
          ageGroup,
          agentCount,
          duration
        );

        const simulationId = `sim_${sceneId}_${ageGroupId}_${Date.now()}`;
        const simPath = path.join(SIMULATION_DIR, `${simulationId}.json`);
        
        await fs.writeFile(simPath, JSON.stringify(simulationResult, null, 2));

        results[ageGroupId] = {
          success: true,
          simulationId,
          timestamp: new Date().toISOString(),
          duration: ((Date.now() - groupStartTime) / 1000).toFixed(1) + 's',
          stats: {
            totalCollisions: simulationResult.collisionEvents?.length || 0,
            criticalInjuries: simulationResult.collisionEvents?.filter(
              e => e.injury && e.injury.injuryScore > 70
            ).length || 0
          }
        };

        console.log(`   ✅ Completed in ${results[ageGroupId].duration}`);
        console.log(`   📊 ${results[ageGroupId].stats.totalCollisions} collisions`);
        console.log(`   ⚠️  ${results[ageGroupId].stats.criticalInjuries} critical injuries`);

      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        
        results[ageGroupId] = {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    const successCount = Object.values(results).filter(r => r.success).length;

    console.log(`\n✅ BATCH SIMULATION COMPLETE`);
    console.log(`   Total time: ${totalDuration}s`);
    console.log(`   Success: ${successCount}/${ageGroups.length}`);
    console.log(`   Average: ${(totalDuration / ageGroups.length).toFixed(1)}s per age group`);

    res.json({
      success: true,
      sceneId,
      totalDuration: totalDuration + 's',
      successCount,
      totalGroups: ageGroups.length,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Batch simulation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Run single simulation with ACCURATE contact point detection
 */
async function runSingleSimulation(sceneId, sceneData, ageGroupId, ageGroup, agentCount, duration) {
  console.log(`   🔧 Initializing physics...`);

  await physicsEngine.init();
  const world = physicsEngine.createWorld();

  const colliders = colliderGenerator.generateCollidersFromScene(
    sceneData,
    world,
    physicsEngine
  );

  console.log(`   🤖 Generating AI behaviors...`);

  const { behaviors, rareEvents } = await behaviorManager.generateBehaviorsForScene(
    sceneData,
    ageGroupId
  );

  console.log(`   🧒 Spawning ${agentCount} agents...`);

  const handleToCollider = new Map();
  colliders.forEach(c => {
    if (c.collidersArr) {
      c.collidersArr.forEach(coll => handleToCollider.set(coll.handle, c));
    } else if (c.collider) {
      handleToCollider.set(c.collider.handle, c);
    }
  });

  const agents = [];
  const floorHeight = sceneData.floor?.height || 0;

  for (let i = 0; i < agentCount; i++) {
    let spawnPos;
    let validSpawn = false;
    let attempts = 0;
    let actualFloorY = floorHeight;
    const r = ageGroup.capsuleRadius || 0.15;
    const internalHalfH = Math.max(0.01, (ageGroup.height - 2 * r) / 2);
    const spawnShape = new physicsEngine.rapier.Capsule(internalHalfH, r);
    const spawnRot = { w: 1.0, x: 0.0, y: 0.0, z: 0.0 };

    while (!validSpawn && attempts < 50) {
      spawnPos = getRandomSpawnPosition(sceneData.boundingBox, floorHeight, ageGroup);
      const spX = spawnPos[0], spZ = spawnPos[2];

      const castFromY = floorHeight + 1.5;
      actualFloorY = physicsEngine.getFloorHeightAt(
        world, spX, castFromY, spZ,
        floorHeight, 3.0
      );

      if (actualFloorY > floorHeight + 0.3) {
        attempts++;
        continue;
      }

      const spawnCenterY = actualFloorY + 0.02 + r + internalHalfH;
      const pos = new physicsEngine.rapier.Vector3(spX, spawnCenterY, spZ);
      let hit = false;
      
      world.intersectionsWithShape(pos, spawnRot, spawnShape, (handle) => {
        const c = world.getCollider(handle);
        const cMeta = handleToCollider.get(handle);
        const isFloor = cMeta?.type === 'floor' || /floor|vloer|ground|plane|grond|surface/.test((cMeta?.name || cMeta?.id || '').toLowerCase());
        
        let localHit = false;
        if (c && !isFloor) {
          if (!c.isSensor()) localHit = true;
          else if (cMeta && cMeta.boundingBox) {
            const objH = (cMeta.boundingBox.max?.[1] || 0) - (cMeta.boundingBox.min?.[1] || 0);
            if (objH > 0.15) localHit = true;
          }
        }
        
        if (localHit && i === 0) {
          fs.appendFile('spawn_debug.log', `      [SPAWN DEBUG] Agent 0 obj: ${cMeta?.name || cMeta?.id} (isSensor: ${c?.isSensor()})\n`).catch(()=>{});
        }
        if (localHit) hit = true;
        return !hit;
      });
      if (!hit) validSpawn = true;
      
      if (i === 0) {
        await fs.appendFile('spawn_debug.log', `      [SPAWN DEBUG] Attempt ${attempts}: x/z=${spX.toFixed(2)}/${spZ.toFixed(2)}, castY=${castFromY.toFixed(2)}, floorY=${actualFloorY.toFixed(2)}, hit=${hit}\n`).catch(()=>{});
      }
      attempts++;
    }

    if (attempts >= 50 && i === 0) {
      console.warn(`[SIM] Agent ${i} failed to find valid spawn after 50 attempts.`);
    }

    spawnPos[1] = actualFloorY + 0.02;

    const agentBodyObj = physicsEngine.createAgentMultipartCollider(
      world,
      spawnPos,
      ageGroup.height,
      ageGroup.capsuleRadius,
      ageGroup.anthropometry || null
    );

    const agent = new Agent(i, spawnPos, agentBodyObj.body, ageGroupId, world);
    agent.spawnY = actualFloorY;
    agent.colliders = agentBodyObj.colliders;
    agents.push(agent);
  }

  behaviorManager.distributeBehaviors(agents, behaviors, rareEvents);

  console.log(`   ⚡ Running physics simulation...`);

  const eventQueue = new physicsEngine.rapier.EventQueue(true);

  const handleToAgent = new Map();
  agents.forEach(a => {
    if (a.colliders) {
      ['head', 'torso', 'legs'].forEach(part => {
        const c = a.colliders[part];
        if (c) handleToAgent.set(c.handle, a);
      });
    }
  });

  const collisionEvents = [];
  const deltaTime = 1 / 60; // 60 FPS
  const totalSteps = duration * 60;

  for (let step = 0; step < totalSteps; step++) {
    // Step physics with event queue
    physicsEngine.step(world, deltaTime, eventQueue);

    // Warmup: skip first 30 frames for physics stabilization
    if (step < 30) {
      eventQueue.drainCollisionEvents(() => {});
      continue;
    }

    // Drain REAL collision events with ACCURATE contact points
    eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      if (!started) return; 

      const agent1 = handleToAgent.get(handle1);
      const agent2 = handleToAgent.get(handle2);
      const collider1 = handleToCollider.get(handle1);
      const collider2 = handleToCollider.get(handle2);

      // One must be agent, one must be collider
      const agent = agent1 || agent2;
      const collider = collider1 || collider2;

      if (!agent || !collider) return;
      // Skip floor/ground collisions by type or name pattern
      const isFloor = (c) => {
        if (!c) return false;
        if (c.type === 'floor') return true;
        const n = (c.name || c.id || '').toLowerCase();
        return /floor|vloer|ground|plane|grond|surface/.test(n);
      };
      if (isFloor(collider)) return;

      const contactPointData = physicsEngine.getContactPoint(
        world,
        agent.collider,
        collider.collider
      );

      if (!contactPointData) {
        console.warn(`⚠️  No contact manifold for agent ${agent.id} <-> ${collider.id}`);
        return;
      }

      const { position: contactPoint, normal: contactNormal } = contactPointData;

      // Validate contact point
      if (!validateContactPoint(contactPoint, sceneData.boundingBox)) {
        console.warn(`⚠️  Invalid contact point:`, contactPoint);
        return;
      }

      const agentVel = agent.getVelocity();

      collisionEvents.push({
        time: step * deltaTime,
        agentId: agent.id,
        objectId: collider.id,
        objectName: collider.name || collider.id,
        position: contactPoint,
        normal: contactNormal,
        velocity: agentVel,           
        impactSpeed: agentVel           
      });
    });

    // Update agents
    agents.forEach(agent => {
      agent.update(
        deltaTime,
        colliders,
        agents,
        sceneData.boundingBox
      );
    });

    // Progress log every 60 steps (1 second)
    if (step % 60 === 0 && step > 0) {
      const currentTime = (step / 60).toFixed(0);
      process.stdout.write(`\r   ⏱️  ${currentTime}s / ${duration}s`);
    }
  }

  console.log(`\r   ⏱️  ${duration}s / ${duration}s - Complete!`);

  console.log(`   📊 Processing ${collisionEvents.length} collision events...`);

  // Calculate injuries
  const objectsMap = {};
  sceneData.objects.forEach(obj => {
    objectsMap[obj.id] = obj;
  });

  const injuryAssessments = injuryCalculator.calculateBatchInjuries(
    collisionEvents,
    ageGroupId,
    objectsMap
  );

  const summary = injuryCalculator.getInjurySummary(injuryAssessments);

  // Collect trajectories
  const trajectories = agents.map(agent => ({
    agentId: agent.id,
    positions: agent.getSampledTrajectory(600),
    finalState: agent.getStatus()
  }));

  console.log(`   ✅ Simulation data compiled`);

  // Proper physics cleanup (was missing world cleanup entirely)
  try {
    // Remove agent colliders first
    agents.forEach(agent => {
      try {
        if (agent.collider && world.getCollider(agent.collider.handle)) {
          world.removeCollider(agent.collider, true);
        }
      } catch (e) { /* already removed */ }
      agent.cleanup();
    });

    // Remove scene colliders
    colliders.forEach(collider => {
      try {
        if (collider.collider && world.getCollider(collider.collider.handle)) {
          world.removeCollider(collider.collider, true);
        }
      } catch (e) { /* already removed */ }
    });

    // Collect body handles first, then remove (avoid mutation during iteration)
    const bodyHandles = [];
    world.forEachRigidBody((body) => {
      bodyHandles.push(body.handle);
    });
    bodyHandles.forEach(handle => {
      try {
        const body = world.getRigidBody(handle);
        if (body) world.removeRigidBody(body);
      } catch (e) { /* already removed */ }
    });

    // Free the physics world
    world.free();
    console.log(`   🧹 Physics world cleaned up`);
  } catch (cleanupErr) {
    console.warn(`   ⚠️ Cleanup warning: ${cleanupErr.message}`);
  }

  return {
    simulationId: null,
    sceneId,
    ageGroupId,
    config: { agentCount, duration, ageGroup: ageGroup.name },
    trajectories,
    collisionEvents: injuryAssessments,
    summary,
    timestamp: new Date().toISOString()
  };
}

/**
 *  Validate contact point coordinates
 */
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

function getRandomSpawnPosition(bbox, floorHeight, ageGroup = null) {
  const heightOffset = ageGroup ? (ageGroup.height / 2 + 0.05) : 0.5;

  if (!bbox) {
    return [0, floorHeight + heightOffset, 0];
  }

  const margin = ageGroup ? (ageGroup.capsuleRadius * 2) : 0.3;
  const width = Math.max(0, bbox.max[0] - bbox.min[0] - 2 * margin);
  const depth = Math.max(0, bbox.max[2] - bbox.min[2] - 2 * margin);

  return [
    bbox.min[0] + margin + Math.random() * width,
    floorHeight + heightOffset,
    bbox.min[2] + margin + Math.random() * depth
  ];
}