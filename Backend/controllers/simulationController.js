import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import physicsEngine from '../services/physicsEngine.js';
import colliderGenerator from '../utils/colliderGenerator.js';
import behaviorManager from '../services/behaviorManager.js';
import injuryCalculator from '../services/injuryCalculator.js';
import Agent from '../services/agent.js';
import { getAgeGroup } from '../config/ageGroups.js';
import { normalizeSceneToMeters } from '../utils/scaleNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PARSED_DIR = process.env.PARSED_DIR || './parsed';
const SIMULATION_DIR = process.env.SIMULATION_DIR || './simulations';

await fs.mkdir(SIMULATION_DIR, { recursive: true });

const activeSimulations = new Map();

// 🧹 Periodic cleanup of old simulation data (running every hour)
setInterval(() => {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();
  
  for (const [id, sim] of activeSimulations.entries()) {
    const startTime = new Date(sim.startedAt).getTime();
    const finishTime = sim.finishedAt ? new Date(sim.finishedAt).getTime() : 0;
    
    // Remove if completed > 1 hour ago OR running > 2 hours (stuck?)
    if ((sim.status === 'complete' && now - finishTime > ONE_HOUR) ||
        (now - startTime > 2 * ONE_HOUR)) {
      activeSimulations.delete(id);
      console.log(`🗑️ Cleared stale simulation cache: ${id}`);
    }
  }
}, 60 * 60 * 1000);

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

    // Safety timeout: force-fail if simulation exceeds expected wall-clock time
    const safetyTimeout = setTimeout(() => {
      const entry = activeSimulations.get(simulationId);
      if (entry && entry.status === 'running') {
        console.error(`[SIM] ⏰ Safety timeout reached for ${simulationId} — forcing error status`);
        activeSimulations.set(simulationId, {
          status: 'error',
          progress: entry.progress || 0,
          error: `Simulation timed out after ${duration * 5}s (wall-clock). Check server logs for details.`,
          startedAt: entry.startedAt
        });
      }
    }, duration * 5 * 1000);

    // Run simulation asynchronously
    (async () => {
      const startTime = Date.now();

      try {
        console.log(`[SIM] ──────────────────────────────────────────`);
        console.log(`[SIM] 🚀 Starting simulation ${simulationId}`);
        console.log(`[SIM]    Scene: ${sceneId}, Agents: ${agentCount}, Duration: ${duration}s, Age: ${ageGroupId}`);

        // Step 1: Load scene data
        console.log(`[SIM] Step 1/5: Loading scene data...`);
        const parsedPath = path.join(PARSED_DIR, `${sceneId}.json`);
        const sceneData = JSON.parse(await fs.readFile(parsedPath, 'utf8'));
        console.log(`[SIM]    ✅ Scene loaded (${sceneData.objects?.length || 0} objects)`);

        // Normalize scene coordinates to meters (handles GLB files in inches/cm/feet/mm)
        normalizeSceneToMeters(sceneData);

        // Step 2: Initialize physics engine
        console.log(`[SIM] Step 2/5: Initializing physics engine...`);
        await physicsEngine.init();
        const world = physicsEngine.createWorld();
        console.log(`[SIM]    ✅ Physics engine ready`);

        // Step 3: Generate colliders
        console.log(`[SIM] Step 3/5: Generating colliders from scene...`);
        const colliders = colliderGenerator.generateCollidersFromScene(sceneData, world, physicsEngine);
        console.log(`[SIM]    ✅ Generated ${colliders.length} static colliders`);

        const ageGroup = getAgeGroup(ageGroupId);
        const agents = [];
        const floorHeight = sceneData.floor?.height || 0;
        console.log(`[SIM START] Scene: ${sceneId}, Floor Height: ${floorHeight.toFixed(4)}`);
        console.log(`[SIM START] BBox Min: ${JSON.stringify(sceneData.boundingBox.min)}, Max: ${JSON.stringify(sceneData.boundingBox.max)}`);

        // Map collision handles to specific body parts
        const handleToBodyPart = new Map();

        for (let i = 0; i < agentCount; i++) {
          const spawnPos = getRandomSpawnPosition(sceneData.boundingBox, floorHeight, ageGroup);
          
          // 🔥 USE MULTIPART COLLIDER
          const agentBodyObj = physicsEngine.createAgentMultipartCollider(
            world,
            spawnPos,
            ageGroup.height,
            ageGroup.capsuleRadius
          );
          
          // Agent stores the main body
          const agent = new Agent(i, spawnPos, agentBodyObj.body, ageGroupId);
          agent.colliders = agentBodyObj.colliders; // Store all parts
          agents.push(agent);

          // Map handles -> body parts
          if (agentBodyObj.colliders.head) handleToBodyPart.set(agentBodyObj.colliders.head.handle, 'head');
          if (agentBodyObj.colliders.torso) handleToBodyPart.set(agentBodyObj.colliders.torso.handle, 'torso');
          if (agentBodyObj.colliders.legs) handleToBodyPart.set(agentBodyObj.colliders.legs.handle, 'legs');
        }

        // Step 4: Generate behaviors (may call Gemini AI or use fallback)
        console.log(`[SIM] Step 4/5: Generating agent behaviors...`);
        const behaviorStartTime = Date.now();
        const { behaviors, rareEvents } = await behaviorManager.generateBehaviorsForScene(
          sceneData,
          ageGroupId
        );
        console.log(`[SIM]    ✅ Behaviors ready in ${Date.now() - behaviorStartTime}ms (${behaviors.length} behaviors, ${rareEvents.length} rare events)`);
        behaviorManager.distributeBehaviors(agents, behaviors, rareEvents);

        const eventQueue = new physicsEngine.rapier.EventQueue(true);
        const handleToCollider = new Map();
        colliders.forEach(c => { if (c.collider) handleToCollider.set(c.collider.handle, c); });
        
        // Map any of the agent's collider handles to the agent instance
        const handleToAgent = new Map();
        agents.forEach(a => {
          if (a.colliders) {
            Object.values(a.colliders).forEach(c => handleToAgent.set(c.handle, a));
          } else if (a.collider) {
             handleToAgent.set(a.collider.handle, a); // Fallback
          }
        });

        const collisionEvents = [];
        let contactCandidates = 0;
        let validContacts = 0;
        let dbg_noMatch = 0, dbg_isFloor = 0, dbg_noContact = 0, dbg_outOfBounds = 0;
        const traceLog = [];
        const deltaTime = 1 / 60;
        const totalSteps = duration * 60;

        console.log(`[SIM] Step 5/5: Running physics loop (${totalSteps} steps)...`);
        const loopStartTime = Date.now();

        for (let step = 0; step < totalSteps; step++) {
          // Yield to event loop every 60 steps so HTTP status polls can respond
          if (step > 0 && step % 60 === 0) {
            await new Promise(r => setImmediate(r));
          }
          // Update agent velocity and state before physics step
          agents.forEach(agent => agent.update(deltaTime, colliders, agents, sceneData.boundingBox));

          physicsEngine.step(world, deltaTime, eventQueue);

          // Warmup phase: allow physics to stabilize before recording interactions
          if (step < 30) {
            eventQueue.drainCollisionEvents(() => {});
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
            const staticObj = collider1 || collider2;

            // Debug LOG every contact
            if (contactCandidates % 100 === 0 || step < 60) {
                 console.log(`[SIM DEBUG] Event ${contactCandidates}: Agent? ${!!agent}, Obj? ${!!staticObj} (${staticObj?.name}), Floor? ${staticObj?.type === 'floor'}`);
            }

            if (!agent && !staticObj) {
               // Both handles unrecognized — likely agent-to-agent contact, skip
               return;
            }

            // Ignore floor / ground collisions (by type AND by name patterns)
            const isFloor = (c) => {
              if (!c) return false;
              if (c.type === 'floor') return true;
              const n = (c.name || c.id || '').toLowerCase();
              return /floor|vloer|ground|plane|grond|surface/.test(n);
            };
            if (isFloor(collider1) || isFloor(collider2)) {
               dbg_isFloor++;
               return;
            }

            if (!agent || !staticObj) { dbg_noMatch++; traceLog.push(`NO_MATCH h1=${handle1} h2=${handle2} a=${!!agent} c=${!!staticObj}`); return; }

            // Identify which part of the agent was hit
            const agentHandle = (agent === agent1) ? handle1 : handle2;
            const hitBodyPart = handleToBodyPart.get(agentHandle) || 'unknown';

            // Get the specific collider for contact point check
            const agentCollider = (agent === agent1) ? 
              (agent.colliders.head.handle === handle1 ? agent.colliders.head : 
               agent.colliders.torso.handle === handle1 ? agent.colliders.torso : agent.colliders.legs) 
              : 
              (agent.colliders.head.handle === handle2 ? agent.colliders.head : 
               agent.colliders.torso.handle === handle2 ? agent.colliders.torso : agent.colliders.legs);

            traceLog.push(`PRE_CONTACT agent=${agent.id} obj=${staticObj.id} part=${hitBodyPart}`);
            
            const contactPointData = physicsEngine.getContactPoint(world, agentCollider, staticObj.collider);
            if (!contactPointData) { dbg_noContact++; traceLog.push(`NO_CONTACT agent=${agent.id} obj=${staticObj.id}`); return; }
            const { position: contactPoint, normal: contactNormal } = contactPointData;
            
            if (!validateContactPoint(contactPoint, sceneData.boundingBox)) { dbg_outOfBounds++; traceLog.push(`OOB pt=${JSON.stringify(contactPoint)}`); return; }

            // Calculate impact velocity magnitude
            let agentVelMagnitude = agent.getVelocity();

            // Kinematic bodies can report near-zero velocity from position deltas
            // because setNextKinematicTranslation teleports rather than displacing smoothly.
            // Fall back to the agent's intended movement speed when measured velocity is too low.
            if (agentVelMagnitude < 0.01) {
              const intendedSpeed = agent.getRealisticVelocity(
                agent.currentBehavior?.action || agent.currentBehavior?.type || 'walk'
              );
              agentVelMagnitude = Math.max(agentVelMagnitude, intendedSpeed * 0.8);
            }

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

            // Filter insignificant contacts (only truly zero-velocity resting contacts)
            if (agentVelMagnitude < 0.001) {
              traceLog.push(`LOW_VEL agent=${agent.id} vel=${agentVelMagnitude.toFixed(6)}`);
              return;
            }

            validContacts++;
            traceLog.push(`VALID agent=${agent.id} obj=${staticObj.id} vel=${agentVelMagnitude.toFixed(3)}`);
            collisionEvents.push({
              time: step * deltaTime,
              agentId: agent.id,
              objectId: staticObj.id,
              objectName: staticObj.name || staticObj.id,
              position: contactPoint,
              normal: contactNormal,
              velocity: agentVelMagnitude,
              impactSpeed: agentVelMagnitude,
              bodyPart: hitBodyPart // 🔥 Pass specific body part (head/torso/legs)
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
              // Ensure position is always a valid array [x, y, z]
              let posArray = [0, 0, 0];
              if (Array.isArray(pos) && pos.length >= 3) {
                posArray = [pos[0], pos[1], pos[2]];
              } else if (pos && typeof pos === 'object') {
                posArray = [pos.x || 0, pos.y || 0, pos.z || 0];
              }
              return { agentId: a.id, position: posArray };
            });
            entry.simTime = (step * deltaTime).toFixed(2);
            activeSimulations.set(simulationId, entry);
          }
        }

        console.log(`[SIM]    ✅ Physics loop complete in ${Date.now() - loopStartTime}ms`);

        // Calculate injuries & summary
        const objectsMap = {};
        sceneData.objects.forEach(obj => { objectsMap[obj.id] = obj; });
        const injuryAssessments = injuryCalculator.calculateBatchInjuries(collisionEvents, ageGroupId, objectsMap);
        const summary = injuryCalculator.getInjurySummary(injuryAssessments);

        const trajectories = agents.map(agent => {
          const sampledTraj = agent.getSampledTrajectory(600);
          const agentEvents = injuryAssessments.filter(e => e.agentId === agent.id);
          // Sample action log to match trajectory density (keep ~1 per 10 frames for compactness)
          const rawLog = agent.actionLog || [];
          const logStep = Math.max(1, Math.floor(rawLog.length / 60));
          const sampledLog = rawLog.filter((_, i) => i % logStep === 0).slice(0, 60);
          return {
            agentId: agent.id,
            ageGroupId: agent.ageGroupId,
            positions: Array.isArray(sampledTraj) ? sampledTraj : [],
            actionLog: sampledLog,
            collisions: agentEvents.map(e => e.position || [0, 0, 0]),
            finalState: agent.getStatus()
          };
        });

        const simulationData = {
          simulationId,
          sceneId,
          ageGroupId,
          config: { agentCount, duration, ageGroup: ageGroup.name, ageGroupId },
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

        // ── Auto-generate summary text report ──
        try {
          const rsi = injuryCalculator.calculateRoomSafetyIndex(injuryAssessments);
          const tierDist = summary.tierDistribution || {};

          // Top 5 most dangerous objects
          const objScores = {};
          injuryAssessments.forEach(evt => {
            const name = evt.objectName || 'Unknown';
            if (!objScores[name]) objScores[name] = { hits: 0, maxScore: 0, totalScore: 0 };
            objScores[name].hits++;
            objScores[name].maxScore = Math.max(objScores[name].maxScore, evt.injury?.injuryScore || 0);
            objScores[name].totalScore += (evt.injury?.injuryScore || 0);
          });
          const topHazards = Object.entries(objScores)
            .sort((a, b) => b[1].maxScore - a[1].maxScore)
            .slice(0, 5)
            .map(([name, stats], i) => `  ${i + 1}. ${name} — ${stats.hits} hits, max score ${stats.maxScore}, avg ${Math.round(stats.totalScore / stats.hits)}`)
            .join('\n');

          const reportLines = [
            '═══════════════════════════════════════════════════',
            '       CHILD SAFETY SIMULATION — AUDIT REPORT      ',
            '═══════════════════════════════════════════════════',
            '',
            `Date:           ${new Date().toISOString()}`,
            `Simulation ID:  ${simulationId}`,
            `Scene:          ${sceneId}`,
            `Age Group:      ${ageGroup.name} (${ageGroup.ageRange})`,
            `Agents:         ${agentCount}`,
            `Duration:       ${duration}s`,
            '',
            '── ROOM SAFETY INDEX ──',
            `  Score: ${rsi.score}/100  (Grade ${rsi.grade})`,
            '',
            '── INCIDENT BREAKDOWN ──',
            `  Critical/Dangerous: ${(tierDist.critical || 0) + (tierDist.dangerous || 0)}`,
            `  Warning:            ${tierDist.warning || 0}`,
            `  Watch:              ${tierDist.watch || 0}`,
            `  Safe:               ${tierDist.safe || 0}`,
            `  Total collisions:   ${injuryAssessments.length}`,
            '',
            '── TOP 5 HAZARDOUS OBJECTS ──',
            topHazards || '  (No hazards detected)',
            '',
            '── BIOMECHANICS SUMMARY ──',
            `  Average Injury Score: ${summary.averageScore}`,
            `  Max Injury Score:     ${summary.maxScore}`,
            `  Max HIC₁₅:           ${summary.hic15?.max || 'N/A'}`,
            `  Max Impact Force:     ${summary.impactForce?.maxN || 'N/A'} N`,
            '',
            '═══════════════════════════════════════════════════',
            '  Generated by Child Safety Simulator',
            '═══════════════════════════════════════════════════',
          ].join('\n');

          const reportPath = path.join(SIMULATION_DIR, `${simulationId}_report.txt`);
          await fs.writeFile(reportPath, reportLines);
          console.log(`  📄 Auto-report saved: ${reportPath}`);
        } catch (reportErr) {
          console.warn('  ⚠️ Auto-report generation failed:', reportErr.message);
        }

        // Mark complete
        activeSimulations.set(simulationId, { status: 'complete', progress: 100, finishedAt: new Date().toISOString() });

        // Cleanup
        await cleanupSimulation(world, agents, colliders);

        const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[SIM] ✅ Simulation ${simulationId} COMPLETE in ${totalElapsed}s`);
        console.log(`[SIM]    Contacts: ${contactCandidates} candidates → ${validContacts} valid`);
        console.log(`[SIM]    Filters: floor=${dbg_isFloor}, noMatch=${dbg_noMatch}, noContact=${dbg_noContact}, OOB=${dbg_outOfBounds}`);
        console.log(`[SIM] ──────────────────────────────────────────`);

      } catch (err) {
        console.error(`[SIM] ❌ Simulation ${simulationId} FAILED:`, err.message);
        console.error(err.stack);
        activeSimulations.set(simulationId, { status: 'error', progress: 0, error: err.message });
      } finally {
        clearTimeout(safetyTimeout);
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

    // If simulation is active and still running, return current progress
    if (activeSimulations.has(simulationId)) {
      const entry = activeSimulations.get(simulationId) || {};
      if (entry.status !== 'complete') {
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
      // If complete, fall through to read full data from the saved JSON file
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
      // Include trajectories and config for playback
      trajectories: Array.isArray(simulationData.trajectories) ? simulationData.trajectories : [],
      config: simulationData.config || { fps: 60, duration: 10 },
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
          collisions: [] // Store { position, normal }
        });
      }
      const entry = objectMap.get(id);
      entry.hits.push(evt.injury || {});
      if (evt.position && evt.normal) {
        entry.collisions.push({
          position: evt.position,
          normal: evt.normal,
          score: evt.injury?.injuryScore ?? 0,
          gForceTier: evt.injury?.gForceTier ?? 'Observe',
          riskTier: evt.injury?.riskTier ?? 'safe',
        });
      }
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
      const intensity = Math.max(0, Math.min(1.0, maxScore / 80)); // Ensure 0-1 range
      const heatColor = scoreToRGB(maxScore) || [0, 1, 0]; // Fallback to green if undefined

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
        collisions: entry.collisions, // New structured data
        collisionPositions: entry.collisions.map(c => c.position), // Add collisionPositions for legacy support
        maxInjuryScore: maxScore,
        avgInjuryScore: avgScore,
        maxGForce,
        avgGForce,
        worstGForceTier,
        primaryBodyPart,
        heatColor: Array.isArray(heatColor) ? heatColor : [0, 1, 0],
        intensity: typeof intensity === 'number' ? intensity : 0,
        recommendations: Array.isArray(recommendations) ? recommendations : []
      });
    }

    // Sort by danger (most dangerous first)
    objectHeatmap.sort((a, b) => b.maxInjuryScore - a.maxInjuryScore);

    // ── Calculate Room Safety Index ──
    const rsi = injuryCalculator.calculateRoomSafetyIndex(events);

    // ── Zone Analysis ──
    let zoneAnalysis = null;
    try {
      const parsedPath = path.join(PARSED_DIR, `${simulationData.sceneId}.json`);
      const sceneRaw2 = await fs.readFile(parsedPath, 'utf8');
      const sceneData2 = JSON.parse(sceneRaw2);
      if (sceneData2.boundingBox) {
        zoneAnalysis = analyzeZones(events, sceneData2.boundingBox);
      }
    } catch (_) { /* scene not found, skip zones */ }

    res.json({
      success: true,
      simulationId: simulationId,
      heatmap: objectHeatmap,
      roomSafetyIndex: rsi, 
      zoneAnalysis,
      stats: {
        totalEvents: events.length,
        uniqueObjectsHit: objectMap.size,
        duration: simulationData ? (simulationData.config?.duration || 10) : 10
      },
      // Also keep raw point heatmap for fallback
      pointHeatmap: events.map(evt => ({
        position: evt.position,
        intensity: (evt.injury?.injuryScore || 0) / 100,
        injuryScore: evt.injury?.injuryScore || 0,
        gForce: evt.injury?.gForce || 0,
        riskTier: evt.injury?.riskTier || 'safe',
        gForceTier: evt.injury?.gForceTier || 'Observe',
        objectName: evt.objectName
      }))
    });

  } catch (error) {
    console.error('Heatmap error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate heatmap: ' + error.message 
    });
  }
};

// ===========================================================================
// GET /api/simulate/:id/report — Download the auto-generated text report
// ===========================================================================
export const getSimulationReport = async (req, res) => {
  try {
    const simulationId = req.params.id;
    const reportPath = path.join(SIMULATION_DIR, `${simulationId}_report.txt`);

    try {
      await fs.access(reportPath);
    } catch {
      return res.status(404).json({ success: false, error: 'Report not found. Run a simulation first.' });
    }

    const reportContent = await fs.readFile(reportPath, 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="safety_report_${simulationId}.txt"`);
    res.send(reportContent);
  } catch (error) {
    console.error('Report download error:', error);
    res.status(500).json({ success: false, error: 'Failed to download report' });
  }
};

// ===========================================================================
// ZONE ANALYSIS — Divide room into grid and classify safe/hazard zones
// ===========================================================================
function analyzeZones(events, sceneBounds) {
  const GRID_SIZE = 8; // 8×8 grid
  const xMin = sceneBounds.min[0], xMax = sceneBounds.max[0];
  const zMin = sceneBounds.min[2], zMax = sceneBounds.max[2];
  const cellW = (xMax - xMin) / GRID_SIZE;
  const cellD = (zMax - zMin) / GRID_SIZE;

  // Initialize grid
  const grid = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      grid.push({
        row, col,
        bounds: {
          minX: xMin + col * cellW,
          maxX: xMin + (col + 1) * cellW,
          minZ: zMin + row * cellD,
          maxZ: zMin + (row + 1) * cellD,
        },
        center: [
          xMin + (col + 0.5) * cellW,
          sceneBounds.min[1],
          zMin + (row + 0.5) * cellD,
        ],
        events: 0,
        totalScore: 0,
        maxScore: 0,
        objects: new Set(),
      });
    }
  }

  // Assign events to cells
  events.forEach(evt => {
    if (!evt.position || !Array.isArray(evt.position)) return;
    const [x, , z] = evt.position;
    const col = Math.floor((x - xMin) / cellW);
    const row = Math.floor((z - zMin) / cellD);
    const idx = row * GRID_SIZE + col;
    if (idx >= 0 && idx < grid.length) {
      const cell = grid[idx];
      cell.events++;
      const score = evt.injury?.injuryScore || 0;
      cell.totalScore += score;
      cell.maxScore = Math.max(cell.maxScore, score);
      if (evt.objectName) cell.objects.add(evt.objectName);
    }
  });

  // Classify each cell
  const zones = grid.map(cell => {
    const avgScore = cell.events > 0 ? cell.totalScore / cell.events : 0;
    let classification = 'safe';
    if (avgScore >= 60) classification = 'danger';
    else if (avgScore >= 35) classification = 'hazard';
    else if (avgScore >= 10) classification = 'caution';

    return {
      row: cell.row,
      col: cell.col,
      center: cell.center,
      bounds: cell.bounds,
      classification,
      events: cell.events,
      avgScore: Math.round(avgScore),
      maxScore: cell.maxScore,
      objects: [...cell.objects],
    };
  });

  // Summary counts
  const summary = {
    safe: zones.filter(z => z.classification === 'safe').length,
    caution: zones.filter(z => z.classification === 'caution').length,
    hazard: zones.filter(z => z.classification === 'hazard').length,
    danger: zones.filter(z => z.classification === 'danger').length,
    gridSize: GRID_SIZE,
  };

  return { zones, summary };
}

// Score → RGB color (green→yellow→orange→red)
function scoreToRGB(score) {
  try {
    if (typeof score !== 'number' || isNaN(score)) score = 0;
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
    const result = [Math.round(r * 255) / 255, Math.round(g * 255) / 255, Math.round(b * 255) / 255];
    return Array.isArray(result) && result.length === 3 ? result : [0, 1, 0]; // Fallback
  } catch (e) {
    console.warn('[Backend] scoreToRGB error:', e);
    return [0, 1, 0]; // Green fallback
  }
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
  const margin = 10.0;
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

    // Remove agent colliders (including multipart)
    agents.forEach(agent => {
      try {
        // Remove main collider if exists
        if (agent.collider && world.getCollider(agent.collider.handle)) {
          world.removeCollider(agent.collider, true);
        }
        
        // Remove multipart colliders
        if (agent.colliders) {
          Object.values(agent.colliders).forEach(c => {
            if (c && world.getCollider(c.handle)) {
              world.removeCollider(c, true);
            }
          });
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