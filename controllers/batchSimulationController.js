import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import physicsEngine from '../services/physicsEngine.js';
import colliderGenerator from '../utils/colliderGenerator.js';
import behaviorManager from '../services/behaviorManager.js';
import injuryCalculator from '../services/injuryCalculator.js';
import heatmapGenerator from '../services/heatmapGenerator.js';
import Agent from '../services/agent.js';
import { getAllAgeGroups } from '../config/ageGroups.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PARSED_DIR = process.env.PARSED_DIR || './parsed';
const SIMULATION_DIR = process.env.SIMULATION_DIR || './simulations';

// Ensure simulation directory exists
await fs.mkdir(SIMULATION_DIR, { recursive: true });

/**
 * ✅ ENHANCED: Batch simulate all age groups with progress tracking
 * Route: POST /api/simulate/batch-all-ages
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

    // Load scene data
    const parsedPath = path.join(PARSED_DIR, `${sceneId}.json`);
    const sceneData = JSON.parse(await fs.readFile(parsedPath, 'utf8'));

    // Get all age groups
    const ageGroups = getAllAgeGroups();
    const results = {};

    console.log(`\n📊 Running ${ageGroups.length} simulations...`);

    // Run simulation for each age group
    for (let i = 0; i < ageGroups.length; i++) {
      const ageGroup = ageGroups[i];
      const ageGroupId = ageGroup.id;

      const groupStartTime = Date.now();
      
      console.log(`\n[${i + 1}/${ageGroups.length}] 🧒 ${ageGroup.name} (${ageGroupId})`);

      try {
        // Run single simulation
        const simulationResult = await runSingleSimulation(
          sceneId,
          sceneData,
          ageGroupId,
          ageGroup,
          agentCount,
          duration
        );

        // Save simulation data
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
 * Run single simulation for one age group
 */
async function runSingleSimulation(sceneId, sceneData, ageGroupId, ageGroup, agentCount, duration) {
  console.log(`   🔧 Initializing physics...`);

  // Initialize physics
  await physicsEngine.init();
  const world = physicsEngine.createWorld();

  // Generate colliders
  const colliders = colliderGenerator.generateCollidersFromScene(
    sceneData,
    world,
    physicsEngine
  );

  console.log(`   🤖 Generating AI behaviors...`);

  // Generate behaviors
  const { behaviors, rareEvents } = await behaviorManager.generateBehaviorsForScene(
    sceneData,
    ageGroupId
  );

  console.log(`   🧒 Spawning ${agentCount} agents...`);

  // Create agents
  const agents = [];
  const floorHeight = sceneData.floor?.height || 0;

  for (let i = 0; i < agentCount; i++) {
    const spawnPos = getRandomSpawnPosition(sceneData.boundingBox, floorHeight);
    
    const rigidBody = physicsEngine.createAgentCollider(
      world,
      spawnPos,
      ageGroup.height,
      ageGroup.capsuleRadius
    );

    const agent = new Agent(i, spawnPos, rigidBody, ageGroupId);
    agents.push(agent);
  }

  // Distribute behaviors
  behaviorManager.distributeBehaviors(agents, behaviors, rareEvents);

  console.log(`   ⚡ Running physics simulation...`);

  // Run simulation
  const collisionEvents = [];
  const deltaTime = 1 / 60; // 60 FPS
  const totalSteps = duration * 60;

  for (let step = 0; step < totalSteps; step++) {
    // Update physics
    physicsEngine.step(world, deltaTime);

    // Update agents
    agents.forEach(agent => {
      agent.update(
        deltaTime,
        colliders,
        agents,
        sceneData.boundingBox
      );
    });

    // Detect collisions
    const stepCollisions = detectCollisions(agents, colliders, step * deltaTime);
    collisionEvents.push(...stepCollisions);

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

  // Generate summary
  const summary = injuryCalculator.getInjurySummary(injuryAssessments);

  // Collect trajectories
  const trajectories = agents.map(agent => ({
    agentId: agent.id,
    positions: agent.getSampledTrajectory(30), // Max 30 points
    finalState: agent.getStatus()
  }));

  console.log(`   ✅ Simulation data compiled`);

  // Cleanup
  agents.forEach(agent => agent.cleanup());

  return {
    simulationId: null, // Will be set by caller
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
 * Detect collisions for current frame
 */
function detectCollisions(agents, colliders, currentTime) {
  const events = [];

  agents.forEach(agent => {
    const agentPos = agent.getPosition();
    const agentVel = agent.getVelocity();

    // Only check if agent is moving
    if (agentVel < 0.1) return;

    colliders.forEach(collider => {
      if (collider.type === 'floor') return; // Skip floor

      const bbox = collider.boundingBox;
      if (!bbox) return;

      // Simple AABB collision check
      const inX = agentPos[0] >= bbox.min[0] && agentPos[0] <= bbox.max[0];
      const inY = agentPos[1] >= bbox.min[1] && agentPos[1] <= bbox.max[1];
      const inZ = agentPos[2] >= bbox.min[2] && agentPos[2] <= bbox.max[2];

      if (inX && inY && inZ) {
        events.push({
          time: currentTime,
          agentId: agent.id,
          objectId: collider.id,
          objectName: collider.name || collider.id,
          position: [...agentPos],
          velocity: agentVel
        });
      }
    });
  });

  return events;
}

/**
 * Get random spawn position within scene bounds
 */
function getRandomSpawnPosition(bbox, floorHeight) {
  if (!bbox) {
    return [0, floorHeight + 0.5, 0];
  }

  const margin = 1.0; // Stay away from walls

  return [
    bbox.min[0] + margin + Math.random() * (bbox.max[0] - bbox.min[0] - 2 * margin),
    floorHeight + 0.5,
    bbox.min[2] + margin + Math.random() * (bbox.max[2] - bbox.min[2] - 2 * margin)
  ];
}