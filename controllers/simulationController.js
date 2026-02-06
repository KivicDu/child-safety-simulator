// ✅ FIXED: simulationController.js
// Fixes: Memory leak (proper Rapier3D cleanup order)

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import physicsEngine from '../services/physicsEngine.js';
import colliderGenerator from '../utils/colliderGenerator.js';
import Agent from '../services/agent.js';
import { getAgeGroup } from '../config/ageGroups.js';
import injuryCalculator from '../services/injuryCalculator.js';
import heatmapGenerator from '../services/heatmapGenerator.js';
import behaviorManager from '../services/behaviorManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SIMULATIONS_DIR = './simulations';
const PARSED_DIR = './parsed';

await fs.mkdir(SIMULATIONS_DIR, { recursive: true });

/**
 * ✅ FIXED: Proper Rapier3D cleanup order
 * 
 * Critical order:
 * 1. Remove Colliders from each RigidBody
 * 2. Remove RigidBodies from World
 * 3. Free World
 * 4. Clear references
 */
function cleanupSimulation(world, agents, colliders) {
  try {
    console.log('🧹 Starting physics cleanup...');
    
    // ✅ Step 1: Collect all rigid bodies
    const allBodies = [];
    
    if (agents && agents.length > 0) {
      agents.forEach(agent => {
        if (agent.body) {
          allBodies.push({ body: agent.body, type: 'agent' });
        }
      });
    }
    
    if (colliders && colliders.length > 0) {
      colliders.forEach(collider => {
        if (collider.body) {
          allBodies.push({ body: collider.body, type: 'collider' });
        }
      });
    }
    
    console.log(`  📦 Found ${allBodies.length} rigid bodies to clean up`);
    
    // ✅ Step 2: Remove all colliders FIRST (critical!)
    let collidersRemoved = 0;
    allBodies.forEach(({ body, type }, index) => {
      try {
        const numColliders = body.numColliders();
        
        // Remove in reverse order (IMPORTANT)
        for (let i = numColliders - 1; i >= 0; i--) {
          try {
            const collider = body.collider(i);
            if (collider && world) {
              world.removeCollider(collider, true); // wakeBodies = true
              collidersRemoved++;
            }
          } catch (colliderErr) {
            console.warn(`  ⚠️ Failed to remove collider ${i} from ${type} ${index}:`, colliderErr.message);
          }
        }
      } catch (err) {
        console.warn(`  ⚠️ Failed to access colliders for ${type} ${index}:`, err.message);
      }
    });
    
    console.log(`  ✅ Removed ${collidersRemoved} colliders`);
    
    // ✅ Step 3: Remove rigid bodies
    let bodiesRemoved = 0;
    allBodies.forEach(({ body, type }, index) => {
      try {
        if (world) {
          world.removeRigidBody(body);
          bodiesRemoved++;
        }
      } catch (err) {
        console.warn(`  ⚠️ Failed to remove ${type} ${index}:`, err.message);
      }
    });
    
    console.log(`  ✅ Removed ${bodiesRemoved} rigid bodies`);
    
    // ✅ Step 4: Free world
    if (world) {
      try {
        world.free();
        console.log('  ✅ Freed physics world');
      } catch (worldErr) {
        console.warn('  ⚠️ World free warning:', worldErr.message);
      }
    }
    
    // ✅ Step 5: Clear references to help GC
    if (agents && agents.length > 0) {
      agents.forEach(agent => {
        agent.body = null;
        if (agent.cleanup) {
          try {
            agent.cleanup();
          } catch (err) {
            console.warn('  ⚠️ Agent cleanup warning:', err.message);
          }
        }
      });
      agents.length = 0;
    }
    
    if (colliders && colliders.length > 0) {
      colliders.forEach(collider => {
        collider.body = null;
      });
      colliders.length = 0;
    }
    
    console.log('✅ Physics cleanup completed successfully');

  } catch (error) {
    console.error('❌ Cleanup error:', error.message);
    console.error('   Stack:', error.stack);
  }
}

/**
 * ✅ MAIN ENDPOINT - Enhanced error handling
 */
export const startSimulation = async (req, res) => {
  let world = null;
  let agents = [];
  let colliders = [];
  let responseSent = false;

  try {
    const { 
      sceneId, 
      agentCount = 10, 
      duration = 10,
      ageGroupId = 'toddler',
      enableAIBehaviors = true  
    } = req.body;

    if (!sceneId) {
      return res.status(400).json({ error: 'sceneId is required' });
    }
    
    // ✅ Validate parameters
    if (agentCount > 50) {
      return res.status(400).json({ error: 'agentCount too high (max 50)' });
    }
    
    if (duration > 60) {
      return res.status(400).json({ error: 'duration too long (max 60s)' });
    }

    console.log(`🚀 Starting simulation for scene: ${sceneId}`);
    console.log(`   Agents: ${agentCount}, Duration: ${duration}s, Age: ${ageGroupId}`);
    console.log(`   AI Behaviors: ${enableAIBehaviors ? 'ENABLED' : 'DISABLED'}`);

    const ageGroup = getAgeGroup(ageGroupId);
    if (!ageGroup) {
      return res.status(400).json({ error: 'Invalid age group' });
    }

    // Load scene data
    const scenePath = path.join(PARSED_DIR, `${sceneId}.json`);
    const sceneData = JSON.parse(await fs.readFile(scenePath, 'utf8'));

    // Initialize physics engine
    await physicsEngine.init();

    // Create new world for this simulation
    world = physicsEngine.createWorld();

    // Generate colliders
    colliders = colliderGenerator.generateCollidersFromScene(
      sceneData,
      world,
      physicsEngine
    );

    // Create agents with age-specific parameters
    const bounds = sceneData.boundingBox;
    const floorHeight = sceneData.floor.height + ageGroup.height / 2;

    for (let i = 0; i < agentCount; i++) {
      const randomPos = [
        bounds.min[0] + Math.random() * (bounds.max[0] - bounds.min[0]),
        floorHeight,
        bounds.min[2] + Math.random() * (bounds.max[2] - bounds.min[2])
      ];

      const body = physicsEngine.createAgentCollider(
        world, 
        randomPos,
        ageGroup.height,
        ageGroup.capsuleRadius
      );
      
      const agent = new Agent(`agent_${i}`, randomPos, body, ageGroupId); 
      agents.push(agent);
    }

    console.log(`✅ Created ${agents.length} ${ageGroup.name} agents`);

    // Generate and distribute AI behaviors
    if (enableAIBehaviors) {
      console.log('🤖 Generating AI behaviors...');
      try {
        const { behaviors, rareEvents } = await behaviorManager.generateBehaviorsForScene(
          sceneData,
          ageGroupId
        );

        behaviorManager.distributeBehaviors(agents, behaviors, rareEvents);
        console.log(`✅ AI behaviors distributed to agents`);
      } catch (error) {
        console.warn('⚠️ AI behavior generation failed, using defaults:', error.message);
      }
    }

    // Run simulation
    const simulationId = `sim_${Date.now()}`;
    
    const collisionEvents = [];
    const collisionMap = new Map();
    const MAX_COLLISION_EVENTS = 2000;
    
    const fps = 60;
    const totalSteps = duration * fps;

    console.log(`⚙️ Running simulation: ${totalSteps} steps...`);

    for (let step = 0; step < totalSteps; step++) {
      // Update all agents
      agents.forEach(agent => {
        agent.update(1/fps, colliders, agents, bounds);
      });

      // Step physics world
      physicsEngine.step(world, 1/fps);

      // Collision detection with deduplication
      if (step % 15 === 0) {
        agents.forEach(agent => {
          const agentPos = agent.getPosition();
          const agentRadius = ageGroup.capsuleRadius; 
          
          colliders.forEach(objCollider => {
            if (objCollider.id === 'floor') return;
            
            const bbox = objCollider.boundingBox;
            if (!bbox) return;

            // Calculate closest point on bounding box
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
                // Deduplicate collisions
                const collisionKey = `${agent.id}_${objCollider.id}`;
                const lastCollisionTime = collisionMap.get(collisionKey);
                
                // Only record if 30+ frames since last collision with same object
                if (!lastCollisionTime || (step - lastCollisionTime) > 30) {
                  
                  // ✅ Priority system if at limit
                  if (collisionEvents.length >= MAX_COLLISION_EVENTS) {
                    const priority = velocity * 10 + (agentPos[1] > ageGroup.height * 0.8 ? 20 : 0);
                    
                    const lowestPriority = Math.min(...collisionEvents.map(e => 
                      (e.velocity || 0) * 10 + (e.position[1] > ageGroup.height * 0.8 ? 20 : 0)
                    ));
                    
                    if (priority > lowestPriority) {
                      const lowestIndex = collisionEvents.findIndex(e => 
                        ((e.velocity || 0) * 10 + (e.position[1] > ageGroup.height * 0.8 ? 20 : 0)) === lowestPriority
                      );
                      if (lowestIndex !== -1) {
                        collisionEvents.splice(lowestIndex, 1);
                      }
                    } else {
                      collisionMap.set(collisionKey, step);
                      return;
                    }
                  }
                  
                  // Check hard limit
                  if (collisionEvents.length < MAX_COLLISION_EVENTS) {
                    collisionEvents.push({
                      time: step / fps,
                      agentId: agent.id,
                      agentState: agent.state,
                      objectId: objCollider.id,
                      objectName: objCollider.name || 'unknown',
                      position: [...agentPos],
                      velocity: velocity,
                      impact: velocity
                    });
                  }
                  
                  collisionMap.set(collisionKey, step);
                }
              }
            }
          });
        });
      }

      // Log progress every 60 steps (1 second)
      if (step % 60 === 0) {
        const progress = (step/totalSteps*100).toFixed(0);
        console.log(`   Step ${step}/${totalSteps} (${progress}%) - Collisions: ${collisionEvents.length}`);
      }
    }

    // Sampled trajectories
    const trajectories = agents.map(agent => ({
      agentId: agent.id,
      positions: agent.getSampledTrajectory(30),
      finalState: agent.getStatus()
    }));

    // Calculate injuries
    const objectsMap = {};
    sceneData.objects.forEach(obj => {
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

    const behaviorStats = analyzeBehaviorPerformance(agents, collisionsWithInjury);

    // Save simulation results
    const results = {
      simulationId,
      sceneId,
      ageGroupId,  
      timestamp: new Date().toISOString(),
      config: {
        agentCount,
        duration,
        fps
      },
      collisionEvents: collisionsWithInjury,
      trajectories,
      behaviorStats,
      summary: {
        totalCollisions: collisionEvents.length,
        agentsInvolved: new Set(collisionEvents.map(e => e.agentId)).size,
        objectsHit: new Set(collisionEvents.map(e => e.objectId)).size,
        injury: injurySummary
      }
    };

    const resultsPath = path.join(SIMULATIONS_DIR, `${simulationId}.json`);
    await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));

    console.log(`✅ Simulation complete!`);
    console.log(`   Total collisions: ${collisionEvents.length}`);
    console.log(`   Avg injury score: ${injurySummary.averageScore}`);
    console.log(`   Critical events: ${injurySummary.criticalCount}`);
    console.log(`   Saved to: ${resultsPath}`);

    // ✅ Send response before cleanup
    if (!responseSent) {
      res.json({
        success: true,
        simulationId,
        summary: results.summary
      });
      responseSent = true;
    }

  } catch (error) {
    console.error('❌ Simulation error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    
    if (!responseSent && !res.headersSent) {
      res.status(500).json({ error: error.message });
      responseSent = true;
    }
    
  } finally {
    // ✅ ALWAYS cleanup, even on error
    console.log('🧹 Cleaning up simulation resources...');
    cleanupSimulation(world, agents, colliders);
    
    // ✅ Log memory before GC
    const memBefore = process.memoryUsage().heapUsed;
    
    // ✅ Force garbage collection if available
    if (global.gc) {
      global.gc();
      const memAfter = process.memoryUsage().heapUsed;
      const freedMB = ((memBefore - memAfter) / 1024 / 1024).toFixed(1);
      console.log(`🗑️ GC freed ${freedMB}MB`);
      console.log(`   Heap used: ${(memAfter / 1024 / 1024).toFixed(0)}MB`);
    }
  }
};

function analyzeBehaviorPerformance(agents, collisions) {
  const stats = {
    totalBehaviorsExecuted: 0,
    completedBehaviors: 0,
    rareEventsTriggered: 0,
    stateDistribution: {
      IDLE: 0,
      MOVING: 0,
      INTERACTING: 0,
      FALLING: 0,
      RARE_EVENT: 0
    },
    agentDetails: []
  };

  agents.forEach(agent => {
    const status = agent.getStatus();
    
    stats.stateDistribution[status.state]++;

    if (agent.behaviorQueue) {
      stats.totalBehaviorsExecuted += agent.behaviorQueue.length;
      stats.completedBehaviors += agent.behaviorQueue.filter(b => b.completed).length;
    }

    if (agent.participatingInRareEvent) {
      stats.rareEventsTriggered++;
    }

    stats.agentDetails.push({
      id: agent.id,
      finalState: status.state,
      behaviorsCompleted: agent.behaviorQueue ? agent.behaviorQueue.filter(b => b.completed).length : 0,
      collisionsInvolved: collisions.filter(c => c.agentId === agent.id).length
    });
  });

  return stats;
}

export const getSimulationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const resultsPath = path.join(SIMULATIONS_DIR, `${id}.json`);
    
    const data = await fs.readFile(resultsPath, 'utf8');
    const results = JSON.parse(data);

    res.json({
      status: 'completed',
      ...results
    });

  } catch (error) {
    res.status(404).json({ error: 'Simulation not found' });
  }
};

export const getCollisionEvents = async (req, res) => {
  try {
    const { id } = req.params;
    const resultsPath = path.join(SIMULATIONS_DIR, `${id}.json`);
    
    const data = await fs.readFile(resultsPath, 'utf8');
    const results = JSON.parse(data);

    res.json({
      events: results.collisionEvents,
      summary: results.summary,
      behaviorStats: results.behaviorStats
    });

  } catch (error) {
    res.status(404).json({ error: 'Simulation not found' });
  }
};

export const getSimulationHeatmap = async (req, res) => {
  try {
    const { id } = req.params;
    const { cellSize = 0.5, smoothing = true } = req.query;
    
    console.log(`🗺️ Generating heatmap for simulation: ${id}`);
    
    const resultsPath = path.join(SIMULATIONS_DIR, `${id}.json`);
    const data = await fs.readFile(resultsPath, 'utf8');
    const results = JSON.parse(data);
    
    const scenePath = path.join(PARSED_DIR, `${results.sceneId}.json`);
    const sceneData = JSON.parse(await fs.readFile(scenePath, 'utf8'));
    
    const heatmap = heatmapGenerator.generateHeatmap(
      results.collisionEvents,
      sceneData.boundingBox,
      { 
        cellSize: parseFloat(cellSize), 
        smoothing: smoothing === 'true' 
      }
    );
    
    const renderData = heatmapGenerator.exportForRendering(heatmap);
    
    console.log(`✅ Heatmap generated: ${renderData.width}x${renderData.height} grid`);
    
    res.json({
      success: true,
      heatmap: renderData
    });
    
  } catch (error) {
    console.error('❌ Heatmap generation error:', error);
    res.status(500).json({ error: error.message });
  }
};