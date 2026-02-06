import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import physicsEngine from '../services/physicsEngine.js';
import colliderGenerator from '../utils/colliderGenerator.js';
import Agent from '../services/agent.js';
import { getAgeGroup, getAgeGroupIds } from '../config/ageGroups.js';
import injuryCalculator from '../services/injuryCalculator.js';
import heatmapGenerator from '../services/heatmapGenerator.js';
import behaviorManager from '../services/behaviorManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SIMULATIONS_DIR = './simulations';
const PARSED_DIR = './parsed';

/**
 * ✅ Helper: Yield to event loop
 */
const yieldToEventLoop = () => new Promise(resolve => setImmediate(resolve));

/**
 * ✅ Helper: Sequential execution with delay
 */
const sequentialWithDelay = async (tasks, delayMs) => {
  const results = [];
  for (const task of tasks) {
    try {
      const result = await task();
      results.push(result);
    } catch (error) {
      console.error('❌ Task failed:', error.message);
      results.push({ error: error.message });
    }
    
    if (delayMs > 0 && results.length < tasks.length) {
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
  return results;
};

/**
 * ✅ MAIN ENDPOINT - Fixed streaming response
 */
export const batchSimulateAllAges = async (req, res) => {
  console.log('📨 [BATCH] Request received');
  
  const { 
    sceneId, 
    agentCount = 10, 
    duration = 10, 
    enableAIBehaviors = true 
  } = req.body;
  
  if (!sceneId) {
    return res.status(400).json({ error: 'sceneId is required' });
  }
  
  const batchTimestamp = Date.now();
  let clientDisconnected = false;
  let responseSent = false;

  // ✅ Setup streaming to keep connection alive
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Connection', 'keep-alive');
  
  // ✅ DON'T use chunked encoding - causes issues with some clients
  // res.setHeader('Transfer-Encoding', 'chunked');

  console.log(`🚀 Batch simulation starting`);
  console.log(`   Scene: ${sceneId}`);
  console.log(`   Agents: ${agentCount}, Duration: ${duration}s`);
  console.log(`   AI: ${enableAIBehaviors ? 'ENABLED' : 'DISABLED'}`);

  // ✅ Track client disconnect (but don't stop!)
  req.on('close', () => {
    console.log('⚠️ Client disconnected (e.g., Postman closed)');
    console.log('   Server will continue simulation and save results');
    clientDisconnected = true;
  });

  req.on('aborted', () => {
    console.log('⚠️ Request aborted');
    clientDisconnected = true;
  });

  try {
    // ✅ Initialize physics engine once
    await physicsEngine.init();
    console.log('✅ Physics engine ready');

    // Load scene
    console.log('📂 Loading scene...');
    const scenePath = path.join(PARSED_DIR, `${sceneId}.json`);
    const sceneData = JSON.parse(await fs.readFile(scenePath, 'utf8'));
    console.log(`✅ Scene loaded: ${sceneData.objects?.length || 0} objects`);

    const ageGroupIds = getAgeGroupIds();
    const behaviorCache = new Map();

    // ========================================================================
    // STEP 1: AI GENERATION (Sequential with 4s delay to avoid rate limits)
    // ========================================================================
    
    if (enableAIBehaviors) {
      console.log('\n🤖 Generating AI behaviors (sequential)...');
      
      const behaviorTasks = ageGroupIds.map(ageGroupId => async () => {
        console.log(`   🔄 Generating for ${ageGroupId}...`);
        
        try {
          const result = await behaviorManager.generateBehaviorsForScene(
            sceneData, 
            ageGroupId
          );
          
          console.log(`   ✅ ${ageGroupId}: ${result.behaviors?.length || 0} behaviors`);
          
          return { 
            ageGroupId, 
            behaviors: result.behaviors || [], 
            rareEvents: result.rareEvents || [] 
          };
          
        } catch (error) {
          console.error(`   ❌ ${ageGroupId} failed:`, error.message);
          return { 
            ageGroupId, 
            behaviors: [], 
            rareEvents: [], 
            error: error.message 
          };
        }
      });

      // Execute sequentially with 4s delay (15 req/min limit)
      const aiResults = await sequentialWithDelay(behaviorTasks, 4000);
      
      // Cache results
      aiResults.forEach(result => {
        if (result.ageGroupId && !result.error) {
          behaviorCache.set(result.ageGroupId, {
            behaviors: result.behaviors,
            rareEvents: result.rareEvents
          });
        }
      });
      
      console.log('✅ AI generation complete\n');
    } else {
      console.log('ℹ️ AI behaviors disabled\n');
    }

    // ========================================================================
    // STEP 2: RUN SIMULATIONS (Sequential)
    // ========================================================================
    
    console.log('🎮 Running simulations...\n');
    const allResults = {};
    
    for (let i = 0; i < ageGroupIds.length; i++) {
      const ageGroupId = ageGroupIds[i];
      
      console.log(`[${i + 1}/${ageGroupIds.length}] Simulating ${ageGroupId}...`);
      
      // Yield to event loop
      await yieldToEventLoop();
      
      try {
        const result = await runSingleAgeSimulation(
          ageGroupId,
          sceneData,
          agentCount,
          duration,
          enableAIBehaviors,
          behaviorCache.get(ageGroupId) || { behaviors: [], rareEvents: [] },
          batchTimestamp
        );
        
        allResults[ageGroupId] = {
          simulationId: result.simulationId,
          summary: result.summary,
          behaviorStats: result.behaviorStats
        };
        
        console.log(`✅ ${ageGroupId} complete: ${result.summary?.totalCollisions || 0} collisions`);
        
        // Force GC between simulations
        if (global.gc) {
          global.gc();
        }
        
      } catch (error) {
        console.error(`❌ ${ageGroupId} failed:`, error.message);
        allResults[ageGroupId] = {
          error: error.message,
          simulationId: null,
          summary: null
        };
      }
    }

    console.log('\n✅ All simulations complete!');
    console.log(`   Total: ${Object.keys(allResults).length}/${ageGroupIds.length}`);

    // ========================================================================
    // STEP 3: SEND RESPONSE
    // ========================================================================
    
    if (!responseSent && !res.headersSent) {
      const response = {
        success: true,
        batchId: `batch_${batchTimestamp}`,
        results: allResults,
        metadata: {
          sceneId,
          agentCount,
          duration,
          aiEnabled: enableAIBehaviors,
          timestamp: new Date().toISOString()
        }
      };
      
      console.log('📤 Sending response...');
      res.json(response);
      responseSent = true;
      console.log('✅ Response sent successfully');
    } else {
      console.log('⚠️ Cannot send response - already sent or client gone');
    }

  } catch (error) {
    console.error('❌ Batch simulation error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    
    if (!responseSent && !res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
      responseSent = true;
    }
  }
};

/**
 * ✅ FIXED: Single simulation with proper cleanup
 */
async function runSingleAgeSimulation(
  ageGroupId,
  sceneData,
  agentCount,
  duration,
  enableAIBehaviors,
  behaviorData,
  batchTimestamp
) {
  console.log(`   🔧 Initializing ${ageGroupId}...`);
  
  const ageGroup = getAgeGroup(ageGroupId);
  if (!ageGroup) {
    throw new Error(`Invalid age group: ${ageGroupId}`);
  }
  
  let world = null;
  const agents = [];
  let colliders = [];
  
  try {
    // Create physics world
    world = physicsEngine.createWorld();
    
    // Generate colliders
    colliders = colliderGenerator.generateCollidersFromScene(
      sceneData,
      world,
      physicsEngine
    );
    
    console.log(`   ✅ Created ${colliders.length} colliders`);
    
    // Create agents
    const bounds = sceneData.boundingBox || { 
      min: [-5, 0, -5], 
      max: [5, 5, 5] 
    };
    
    const floorHeight = sceneData.floor?.height || 0;
    const startHeight = floorHeight + ageGroup.height / 2;
    
    for (let i = 0; i < agentCount; i++) {
      const randomPos = [
        bounds.min[0] + Math.random() * (bounds.max[0] - bounds.min[0]),
        startHeight,
        bounds.min[2] + Math.random() * (bounds.max[2] - bounds.min[2])
      ];
      
      const rigidBody = physicsEngine.createAgentCollider(
        world,
        randomPos,
        ageGroup.height,
        ageGroup.capsuleRadius
      );
      
      const agent = new Agent(`agent_${i}`, randomPos, rigidBody, ageGroupId);
      
      // Apply behaviors if enabled
      if (enableAIBehaviors && behaviorData.behaviors?.length > 0) {
        agent.behaviorQueue = [...behaviorData.behaviors];
      }
      
      agents.push(agent);
    }
    
    console.log(`   ✅ Created ${agents.length} agents`);
    
    // Run simulation
    const fps = 60;
    const totalSteps = duration * fps;
    const collisionEvents = [];
    const collisionMap = new Map();
    const MAX_COLLISIONS = 1000;
    
    console.log(`   ⚙️ Running ${totalSteps} steps...`);
    
    for (let step = 0; step < totalSteps; step++) {
      // Yield every 100 frames to prevent blocking
      if (step % 100 === 0) {
        await yieldToEventLoop();
      }
      
      // Update agents
      agents.forEach(agent => {
        agent.update(1/fps, colliders, agents, bounds);
      });
      
      // Step physics
      physicsEngine.step(world, 1/fps);
      
      // Collision detection (every 15 frames)
      if (step % 15 === 0) {
        agents.forEach(agent => {
          const agentPos = agent.getPosition();
          const agentRadius = ageGroup.capsuleRadius;
          
          colliders.forEach(collider => {
            if (collider.id === 'floor') return;
            
            const bbox = collider.boundingBox;
            if (!bbox) return;
            
            // Simple AABB collision check
            const closestPoint = [
              Math.max(bbox.min[0], Math.min(agentPos[0], bbox.max[0])),
              Math.max(bbox.min[1], Math.min(agentPos[1], bbox.max[1])),
              Math.max(bbox.min[2], Math.min(agentPos[2], bbox.max[2]))
            ];
            
            const dx = agentPos[0] - closestPoint[0];
            const dy = agentPos[1] - closestPoint[1];
            const dz = agentPos[2] - closestPoint[2];
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (distance < agentRadius) {
              const velocity = agent.getVelocity();
              
              if (velocity > 0.1) {
                const key = `${agent.id}_${collider.id}`;
                const lastTime = collisionMap.get(key);
                
                if (!lastTime || (step - lastTime) > 30) {
                  if (collisionEvents.length < MAX_COLLISIONS) {
                    collisionEvents.push({
                      time: step / fps,
                      agentId: agent.id,
                      objectId: collider.id,
                      objectName: collider.name || 'unknown',
                      position: [...agentPos],
                      velocity: velocity
                    });
                  }
                  
                  collisionMap.set(key, step);
                }
              }
            }
          });
        });
      }
      
      // Progress every 3 seconds
      if (step % (fps * 3) === 0 && step > 0) {
        const progress = ((step / totalSteps) * 100).toFixed(0);
        console.log(`   ${progress}%`);
      }
    }
    
    console.log(`   ✅ Simulation complete: ${collisionEvents.length} collisions`);
    
    // Calculate injuries
    const objectsMap = {};
    sceneData.objects?.forEach(obj => {
      objectsMap[obj.id] = obj;
    });
    
    const collisionsWithInjury = injuryCalculator.calculateBatchInjuries(
      collisionEvents,
      ageGroupId,
      objectsMap
    );
    
    const injurySummary = injuryCalculator.getInjurySummary(
      collisionsWithInjury
    );
    
    // Get trajectories
    const trajectories = agents.map(agent => ({
      agentId: agent.id,
      positions: agent.getSampledTrajectory(30)
    }));
    
    // Generate heatmap
    const heatmap = heatmapGenerator.generateHeatmap(
      collisionsWithInjury,
      sceneData.boundingBox,
      { cellSize: 0.5, smoothing: true }
    );
    
    const heatmapData = heatmapGenerator.exportForRendering(heatmap);
    
    // Behavior stats
    const behaviorStats = {
      enabled: enableAIBehaviors,
      totalBehaviors: agents.reduce((sum, a) => sum + (a.behaviorQueue?.length || 0), 0),
      completedBehaviors: agents.reduce((sum, a) => 
        sum + (a.behaviorQueue?.filter(b => b.completed).length || 0), 0
      )
    };
    
    // Build results
    const simulationId = `sim_${batchTimestamp}_${ageGroupId}`;
    
    const results = {
      simulationId,
      sceneId: sceneData.id,
      ageGroupId,
      timestamp: new Date().toISOString(),
      config: {
        agentCount,
        duration,
        fps,
        aiEnabled: enableAIBehaviors
      },
      collisionEvents: collisionsWithInjury,
      trajectories,
      heatmap: heatmapData,
      behaviorStats,
      summary: {
        totalCollisions: collisionEvents.length,
        agentsInvolved: new Set(collisionEvents.map(e => e.agentId)).size,
        objectsHit: new Set(collisionEvents.map(e => e.objectId)).size,
        injury: injurySummary
      }
    };
    
    // Save to file
    const filePath = path.join(SIMULATIONS_DIR, `${simulationId}.json`);
    await fs.writeFile(filePath, JSON.stringify(results, null, 2));
    console.log(`   💾 Saved: ${simulationId}.json`);
    
    return results;
    
  } finally {
    // ✅ CRITICAL: Always cleanup
    console.log(`   🧹 Cleaning up ${ageGroupId}...`);
    
    // Remove agents
    if (agents.length > 0 && world) {
      agents.forEach(agent => {
        try {
          if (agent.body) {
            world.removeRigidBody(agent.body);
          }
          if (agent.cleanup) {
            agent.cleanup();
          }
        } catch (err) {
          console.warn(`   ⚠️ Agent cleanup warning:`, err.message);
        }
      });
      agents.length = 0;
    }
    
    // Remove colliders
    if (colliders.length > 0 && world) {
      colliders.forEach(collider => {
        try {
          if (collider.body) {
            world.removeRigidBody(collider.body);
          }
        } catch (err) {
          console.warn(`   ⚠️ Collider cleanup warning:`, err.message);
        }
      });
      colliders.length = 0;
    }
    
    // Free world
    if (world) {
      try {
        world.free();
      } catch (err) {
        console.warn(`   ⚠️ World cleanup warning:`, err.message);
      }
    }
    
    console.log(`   ✅ Cleanup complete`);
  }
}