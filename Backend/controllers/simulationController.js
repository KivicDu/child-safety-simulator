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
const __dirname  = path.dirname(__filename);

const PARSED_DIR     = process.env.PARSED_DIR     || './parsed';
const SIMULATION_DIR = process.env.SIMULATION_DIR || './simulations';

await fs.mkdir(SIMULATION_DIR, { recursive: true });

const activeSimulations = new Map();

// Periodic cleanup of stale simulation data
setInterval(() => {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();
  for (const [id, sim] of activeSimulations.entries()) {
    const startTime  = new Date(sim.startedAt).getTime();
    const finishTime = sim.finishedAt ? new Date(sim.finishedAt).getTime() : 0;
    if (
      (sim.status === 'complete' && now - finishTime > ONE_HOUR) ||
      (now - startTime > 2 * ONE_HOUR)
    ) {
      activeSimulations.delete(id);
      console.log(`🗑️ Cleared stale simulation cache: ${id}`);
    }
  }
}, 60 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// §4.2 Floor height enforcement via downward raycast
//
// Problem with old approach: agent.spawnY was used to lock Y during recovery.
// spawnY is the spawn-time floor and becomes stale once the agent moves to a
// different area (ramp, step, multi-level geometry).
//
// Fix: cast a short downward ray from the agent's current XZ each physics frame.
// The hit point gives the real floor at that location.  If no hit is found
// (agent over a void) we fall back to the scene-level floorHeight.
// ─────────────────────────────────────────────────────────────────────────────
function getCurrentFloorY(world, agentPos, sceneFloorHeight) {
  return physicsEngine.getFloorHeightAt(
    world,
    agentPos[0], agentPos[1], agentPos[2],
    sceneFloorHeight,
    5.0
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// START SIMULATION
// ─────────────────────────────────────────────────────────────────────────────
export const startSimulation = async (req, res) => {
  try {
    const { sceneId, agentCount = 10, duration = 10, ageGroupId = 'toddler' } = req.body;

    if (!sceneId) {
      return res.status(400).json({ error: 'sceneId is required' });
    }

    const simulationId = `sim_${Date.now()}`;

    activeSimulations.set(simulationId, {
      status: 'running', progress: 0, startedAt: new Date().toISOString(),
    });

    // Safety timeout
    const safetyTimeout = setTimeout(() => {
      const entry = activeSimulations.get(simulationId);
      if (entry && entry.status === 'running') {
        console.error(`[SIM] ⏰ Safety timeout: ${simulationId}`);
        activeSimulations.set(simulationId, {
          status: 'error',
          progress: entry.progress || 0,
          error: `Simulation timed out after ${duration * 5}s`,
          startedAt: entry.startedAt,
        });
      }
    }, duration * 5 * 1000);

    // Run asynchronously
    (async () => {
      const startTime = Date.now();

      try {
        console.log(`[SIM] ──────────────────────────────────────────`);
        console.log(`[SIM] 🚀 Starting simulation ${simulationId}`);
        console.log(`[SIM]    Scene: ${sceneId}, Agents: ${agentCount}, Duration: ${duration}s, Age: ${ageGroupId}`);

        // Step 1: Load scene data
        console.log(`[SIM] Step 1/5: Loading scene data...`);
        let sceneData;
        try {
          const parsedPath = path.join(PARSED_DIR, `${sceneId}.json`);
          sceneData = JSON.parse(await fs.readFile(parsedPath, 'utf8'));
          console.log(`[SIM]    ✅ Scene loaded (${sceneData.objects?.length || 0} objects)`);
        } catch (e) {
          console.warn(`[SIM]    ⚠️ Could not load scene ${sceneId}, using default 10×10 room.`);
          sceneData = {
            boundingBox: { min: [-5, 0, -5], max: [5, 3, 5] },
            floor: { height: 0 },
            objects: [],
            _scaleFactor: 1.0,
          };
        }

        normalizeSceneToMeters(sceneData);

        const simEntry = activeSimulations.get(simulationId);
        if (simEntry) {
          simEntry.scaleFactor = sceneData._scaleFactor || 1.0;
          activeSimulations.set(simulationId, simEntry);
        }

        // Step 2: Physics engine
        console.log(`[SIM] Step 2/5: Initializing physics engine...`);
        await physicsEngine.init();
        const world = physicsEngine.createWorld();
        console.log(`[SIM]    ✅ Physics engine ready`);

        // Step 3: Colliders
        console.log(`[SIM] Step 3/5: Generating colliders...`);
        const colliders = colliderGenerator.generateCollidersFromScene(sceneData, world, physicsEngine);
        const handleToCollider = new Map();
        colliders.forEach(c => { if (c.collider) handleToCollider.set(c.collider.handle, c); });
        console.log(`[SIM]    ✅ Generated ${colliders.length} colliders`);

        const ageGroup  = getAgeGroup(ageGroupId);
        const floorHeight = (sceneData.floor && typeof sceneData.floor.height === 'number')
          ? sceneData.floor.height
          : (sceneData.boundingBox ? sceneData.boundingBox.min[1] : 0);

        console.log(`[SIM START] Floor Height: ${floorHeight.toFixed(4)}`);

        // FIX Issue 1: Add invisible boundary walls around scene
        const bb = sceneData.boundingBox;
        if (bb) {
          const wallHeight = 3.0;
          const wallThickness = 0.2;
          const cx = (bb.min[0] + bb.max[0]) / 2;
          const cz = (bb.min[2] + bb.max[2]) / 2;
          const sx = (bb.max[0] - bb.min[0]) / 2;
          const sz = (bb.max[2] - bb.min[2]) / 2;
          const wallY = floorHeight + wallHeight / 2;

          // 4 walls: +X, -X, +Z, -Z
          const walls = [
            { x: bb.max[0] + wallThickness, y: wallY, z: cz, hx: wallThickness, hy: wallHeight/2, hz: sz + wallThickness },
            { x: bb.min[0] - wallThickness, y: wallY, z: cz, hx: wallThickness, hy: wallHeight/2, hz: sz + wallThickness },
            { x: cx, y: wallY, z: bb.max[2] + wallThickness, hx: sx + wallThickness, hy: wallHeight/2, hz: wallThickness },
            { x: cx, y: wallY, z: bb.min[2] - wallThickness, hx: sx + wallThickness, hy: wallHeight/2, hz: wallThickness },
          ];
          for (const w of walls) {
            const desc = physicsEngine.rapier.RigidBodyDesc.fixed().setTranslation(w.x, w.y, w.z);
            const body = world.createRigidBody(desc);
            world.createCollider(
              physicsEngine.rapier.ColliderDesc.cuboid(w.hx, w.hy, w.hz).setFriction(0.5),
              body
            );
          }
          console.log(`[SIM]    ✅ Boundary walls created`);
        }

        const handleToBodyPart = new Map();
        const agents = [];

        const isFloor = (c) => {
          if (!c) return false;
          if (c.type === 'floor') return true;
          const n = (c.name || c.id || '').toLowerCase();
          return /floor|vloer|ground|plane|grond|surface/.test(n);
        };

        for (let i = 0; i < agentCount; i++) {
          let spawnPos;
          let validSpawn = false;
          let attempts = 0;
          const halfH = ageGroup.height / 2;
          const r = ageGroup.capsuleRadius || 0.15;
          const spawnShape = new physicsEngine.rapier.Capsule(halfH, r);
          const spawnRot = { w: 1.0, x: 0.0, y: 0.0, z: 0.0 };

          while (!validSpawn && attempts < 50) {
            spawnPos = getRandomSpawnPosition(sceneData.boundingBox, floorHeight, ageGroup);
            // FIX: getRandomSpawnPosition returns array [x,y,z], not object {x,y,z}
            const spX = spawnPos[0], spY = spawnPos[1], spZ = spawnPos[2];
            const pos = new physicsEngine.rapier.Vector3(spX, spY + halfH, spZ);
            let hit = false;
            
            world.intersectionsWithShape(pos, spawnRot, spawnShape, (handle) => {
              const c = world.getCollider(handle);
              const cMeta = handleToCollider.get(handle);
              // FIX-P3: Also check sensor objects with significant volume (beds, mattresses)
              if (c && !isFloor(cMeta)) {
                if (!c.isSensor()) {
                  hit = true;
                } else if (cMeta && cMeta.boundingBox) {
                  const objH = (cMeta.boundingBox.max?.[1] || 0) - (cMeta.boundingBox.min?.[1] || 0);
                  if (objH > 0.15) hit = true;
                }
              }
              return !hit;
            });
            if (!hit) validSpawn = true;
            attempts++;
          }

          if (attempts >= 50 && i === 0) {
            console.warn(`[SIM] Agent ${i} failed to find valid spawn after 50 attempts. Defaulting to forced spawn.`);
          }

          const agentBodyObj = physicsEngine.createAgentMultipartCollider(
            world, spawnPos, ageGroup.height, ageGroup.capsuleRadius,
            ageGroup.anthropometry || null
          );

          const agent     = new Agent(i, spawnPos, agentBodyObj.body, ageGroupId, world);
          agent.spawnY    = floorHeight;   // kept for fall fallback only, not floor lock
          agent.colliders = agentBodyObj.colliders;
          agents.push(agent);

          if (agentBodyObj.colliders.head)  handleToBodyPart.set(agentBodyObj.colliders.head.handle,  'head');
          if (agentBodyObj.colliders.torso) handleToBodyPart.set(agentBodyObj.colliders.torso.handle, 'torso');
          if (agentBodyObj.colliders.legs)  handleToBodyPart.set(agentBodyObj.colliders.legs.handle,  'legs');
        }

        // Step 4: Behaviors
        console.log(`[SIM] Step 4/5: Generating agent behaviors...`);
        const behaviorStartTime = Date.now();
        const { behaviors, rareEvents } = await behaviorManager.generateBehaviorsForScene(sceneData, ageGroupId);
        console.log(`[SIM]    ✅ Behaviors ready in ${Date.now() - behaviorStartTime}ms`);
        behaviorManager.distributeBehaviors(agents, behaviors, rareEvents);

        const eventQueue      = new physicsEngine.rapier.EventQueue(true);

        const handleToAgent = new Map();
        agents.forEach(a => {
          if (a.colliders) {
            Object.values(a.colliders).forEach(c => handleToAgent.set(c.handle, a));
          } else if (a.collider) {
            handleToAgent.set(a.collider.handle, a);
          }
        });

        const collisionEvents = [];
        let contactCandidates = 0, validContacts = 0;
        let dbg_noMatch = 0, dbg_isFloor = 0, dbg_noContact = 0, dbg_outOfBounds = 0;
        let dbg_softIntersections = 0;
        const traceLog = [];

        const deltaTime   = 1 / 60;
        const totalSteps  = duration * 60;

        console.log(`[SIM] Step 5/5: Running physics loop (${totalSteps} steps)...`);
        const loopStartTime = Date.now();

        for (let step = 0; step < totalSteps; step++) {
          if (step > 0 && step % 60 === 0) {
            await new Promise(r => setImmediate(r));
          }

          // §4.2 Floor enforcement: enforce per-agent current floor height
          // before applying behavior movement (fixes spawnY stale-lock bug)
          agents.forEach(agent => {
            if (!agent.body || agent.fallState) return;  // don't interfere with free fall
            const agentPos        = agent.getPosition();
            const currentFloorY   = getCurrentFloorY(world, agentPos, floorHeight);
            const pos             = agent.body.translation();
            
            // agent center should be at currentFloorY + halfHeight
            const targetY = currentFloorY + (ageGroup.height / 2);

            // FIX-H2: Bidirectional floor enforcement
            // Pull UP if below floor
            if (pos.y < targetY - 0.05) {
              agent.body.setNextKinematicTranslation({
                x: pos.x,
                y: targetY,
                z: pos.z,
              });
            }
            // Pull DOWN if floating above floor (but NOT if climbing)
            const isClimbing = agent.currentBehavior?.action === 'climb_on'
              || agent.currentBehavior?.action === 'climb'
              || agent.state === 'INTERACTING';
            if (!isClimbing && pos.y > targetY + 0.15) {
              agent.body.setNextKinematicTranslation({
                x: pos.x,
                y: targetY,
                z: pos.z,
              });
            }
          });

          agents.forEach(agent => agent.update(deltaTime, colliders, agents, sceneData.boundingBox));

          physicsEngine.step(world, deltaTime, eventQueue);

          // Warmup phase
          if (step < 30) {
            eventQueue.drainCollisionEvents(() => {});
            // §4.1 Also drain intersection queue during warmup to avoid backlog
            if (typeof eventQueue.drainIntersectionEvents === 'function') {
              eventQueue.drainIntersectionEvents(() => {});
            }
            continue;
          }

          // ── §4.1 drainCollisionEvents (rigid contacts) ─────────────────────
          eventQueue.drainCollisionEvents((handle1, handle2, started) => {
            try {
              if (!started) return;
              contactCandidates++;

              const agent1    = handleToAgent.get(handle1);
              const agent2    = handleToAgent.get(handle2);
              const collider1 = handleToCollider.get(handle1);
              const collider2 = handleToCollider.get(handle2);
              const agent     = agent1 || agent2;
              const staticObj = collider1 || collider2;

              if (isFloor(collider1) || isFloor(collider2)) { dbg_isFloor++; return; }

              if (!agent || !staticObj) {
                dbg_noMatch++;
                traceLog.push(`NO_MATCH h1=${handle1} h2=${handle2}`);
                return;
              }

              // §4.1 Soft sensors may still appear in drainCollisionEvents on
              // some Rapier builds.  Route them to the intersection handler
              // rather than the injury calculator.
              if (staticObj.isSoft) {
                agent.handleIntersection(staticObj);
                dbg_softIntersections++;
                return;
              }

              const agentHandle = (agent === agent1) ? handle1 : handle2;
              const hitBodyPart = handleToBodyPart.get(agentHandle) || 'unknown';

              const agentCollider = (() => {
                if (!agent.colliders) return null;
                const h = (agent === agent1) ? handle1 : handle2;
                if (agent.colliders.head?.handle  === h) return agent.colliders.head;
                if (agent.colliders.torso?.handle === h) return agent.colliders.torso;
                if (agent.colliders.legs?.handle  === h) return agent.colliders.legs;
                return null;
              })();

              if (!agentCollider) { dbg_noMatch++; return; }

              const contactPointData = physicsEngine.getContactPoint(world, agentCollider, staticObj.collider);

              if (!contactPointData) { dbg_noContact++; return; }

              const { position: contactPoint, normal: contactNormal } = contactPointData;

              if (!validateContactPoint(contactPoint, sceneData.boundingBox)) { dbg_outOfBounds++; return; }

              let agentVelMagnitude = agent.getVelocity();
              if (agentVelMagnitude < 0.01) {
                const intendedSpeed = agent.getRealisticVelocity(
                  agent.currentBehavior?.action || agent.currentBehavior?.type || 'walk'
                );
                agentVelMagnitude = Math.max(agentVelMagnitude, intendedSpeed * 0.8);
              }

              if (contactNormal && agentVelMagnitude > 0) {
                const { velocity: [vx, vy, vz] } = agent;
                const speed = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
                const dot   = Math.abs(
                  (vx / speed) * contactNormal[0] +
                  (vy / speed) * contactNormal[1] +
                  (vz / speed) * contactNormal[2]
                );
                agentVelMagnitude *= (0.3 + 0.7 * dot);
              }

              const stateMultiplier = agent.state === 'INTERACTING'
                ? (1.2 + Math.random() * 1.3)
                : 1.0;
              agentVelMagnitude *= stateMultiplier;

              if (agentVelMagnitude < 0.001) { return; }

              validContacts++;
              traceLog.push(`VALID agent=${agent.id} obj=${staticObj.id} vel=${agentVelMagnitude.toFixed(3)}`);

              collisionEvents.push({
                time:       step * deltaTime,
                agentId:    agent.id,
                objectId:   staticObj.id,
                objectName: staticObj.name || staticObj.id,
                position:   contactPoint,
                normal:     contactNormal,
                velocity:   agentVelMagnitude,
                impactSpeed: agentVelMagnitude,
                bodyPart:   hitBodyPart,
              });

              agent.handleCollision(contactNormal, agentVelMagnitude * 15);

            } catch (err) {
              traceLog.push(`COL_ERR h1=${handle1} h2=${handle2}: ${err.message}`);
            }
          });

          // ── §4.1 drainIntersectionEvents (sensor / soft-object contacts) ────
          // These events are emitted by sensors and were previously lost because
          // only drainCollisionEvents was called in the simulation loop.
          if (typeof eventQueue.drainIntersectionEvents === 'function') {
            eventQueue.drainIntersectionEvents((handle1, handle2, intersecting) => {
              try {
                if (!intersecting) return;

                const agent1    = handleToAgent.get(handle1);
                const agent2    = handleToAgent.get(handle2);
                const collider1 = handleToCollider.get(handle1);
                const collider2 = handleToCollider.get(handle2);
                const agent     = agent1 || agent2;
                const staticObj = collider1 || collider2;

                if (!agent || !staticObj) return;

                // Only handle sensor objects here
                if (!staticObj.isSoft) return;

                // Update wading state on the agent
                agent.handleIntersection(staticObj);
                dbg_softIntersections++;

                // Log a soft interaction event every 30 frames to avoid flooding
                if (step % 30 === 0) {
                  const agentVelMagnitude = agent.getVelocity();
                  if (agentVelMagnitude > 0.1) {
                    validContacts++;
                    collisionEvents.push({
                      time:             step * deltaTime,
                      agentId:          agent.id,
                      objectId:         staticObj.id,
                      objectName:       staticObj.name || staticObj.id,
                      position:         agent.getPosition(),
                      normal:           [0, 1, 0],
                      velocity:         agentVelMagnitude,
                      impactSpeed:      agentVelMagnitude,
                      bodyPart:         'torso',
                      isSoftInteraction: true,
                      injury: {
                        injuryScore: 0,
                        gForce:      0,
                        riskTier:    'safe',
                        gForceTier:  'Observe',
                      },
                    });
                  }
                }
              } catch (err) {
                traceLog.push(`INT_ERR h1=${handle1} h2=${handle2}: ${err.message}`);
              }
            });
          }

          // Live progress updates
          if (step % 10 === 0) {
            const entry = activeSimulations.get(simulationId) || {};
            if (step % 30 === 0) {
              entry.progress = Math.round((step / totalSteps) * 100);
            }
            entry.agentPositions = agents.map(a => {
              const pos = a.getPosition();
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
        console.log(`[SIM]    Soft intersections: ${dbg_softIntersections}`);

        // Injury assessment & summary
        const objectsMap = {};
        sceneData.objects.forEach(obj => { objectsMap[obj.id] = obj; });
        const injuryAssessments = injuryCalculator.calculateBatchInjuries(
          collisionEvents.filter(e => !e.isSoftInteraction),  // soft events have score=0, skip
          ageGroupId,
          objectsMap
        );
        const summary = injuryCalculator.getInjurySummary(injuryAssessments);

        const trajectories = agents.map(agent => {
          const sampledTraj = agent.getSampledTrajectory(600);
          const agentEvents = injuryAssessments.filter(e => e.agentId === agent.id);
          const rawLog      = agent.actionLog || [];
          const logStep     = Math.max(1, Math.floor(rawLog.length / 60));
          const sampledLog  = rawLog.filter((_, i) => i % logStep === 0).slice(0, 60);
          return {
            agentId:    agent.id,
            ageGroupId: agent.ageGroupId,
            positions:  Array.isArray(sampledTraj) ? sampledTraj : [],
            actionLog:  sampledLog,
            collisions: agentEvents.map(e => e.position || [0, 0, 0]),
            finalState: agent.getStatus(),
          };
        });

        const hazardEvents = injuryAssessments.filter(e => 
          (e.injury && e.injury.injuryScore >= 15) || e.velocity > 0.8
        );

        const simulationData = {
          simulationId,
          sceneId,
          ageGroupId,
          config: {
            agentCount, duration,
            ageGroup: ageGroup.name, ageGroupId,
            scaleFactor: sceneData._scaleFactor || 1.0,
            fps: 60,
          },
          trajectories,
          collisionEvents: hazardEvents, // Filtered: Hazard only (Score >= 15 or high impact)
          summary,
          debugStats: {
            contactCandidates, validContacts, floorHeight,
            softIntersections: dbg_softIntersections,
            sceneBBox: sceneData.boundingBox,
            filterBreakdown: {
              noMatch: dbg_noMatch, isFloor: dbg_isFloor,
              noContact: dbg_noContact, outOfBounds: dbg_outOfBounds,
            },
            traceLog: traceLog.slice(0, 50),
          },
          timestamp: new Date().toISOString(),
        };

        const simPath = path.join(SIMULATION_DIR, `${simulationId}.json`);
        await fs.writeFile(simPath, JSON.stringify(simulationData, null, 2));

        // Auto-generate text report
        try {
          const rsi      = injuryCalculator.calculateRoomSafetyIndex(injuryAssessments);
          const tierDist = summary.tierDistribution || {};

          const objScores = {};
          injuryAssessments.forEach(evt => {
            const name = evt.objectName || 'Unknown';
            if (!objScores[name]) objScores[name] = { hits: 0, maxScore: 0, totalScore: 0 };
            objScores[name].hits++;
            objScores[name].maxScore   = Math.max(objScores[name].maxScore, evt.injury?.injuryScore || 0);
            objScores[name].totalScore += (evt.injury?.injuryScore || 0);
          });
          const topHazards = Object.entries(objScores)
            .sort((a, b) => b[1].maxScore - a[1].maxScore)
            .slice(0, 5)
            .map(([name, stats], i) =>
              `  ${i + 1}. ${name} — ${stats.hits} hits, max score ${stats.maxScore}, avg ${Math.round(stats.totalScore / stats.hits)}`
            )
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
            `  Watch:              ${tierDist.watch   || 0}`,
            `  Safe:               ${tierDist.safe    || 0}`,
            `  Total collisions:   ${injuryAssessments.length}`,
            `  Soft interactions:  ${dbg_softIntersections}`,
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

        activeSimulations.set(simulationId, {
          status: 'complete', progress: 100, finishedAt: new Date().toISOString(),
        });

        await cleanupSimulation(world, agents, colliders);

        const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[SIM] ✅ Simulation ${simulationId} COMPLETE in ${totalElapsed}s`);
        console.log(`[SIM]    Contacts: ${contactCandidates} candidates → ${validContacts} valid`);
        console.log(`[SIM]    Soft intersections (sensors): ${dbg_softIntersections}`);
        console.log(`[SIM] ──────────────────────────────────────────`);

      } catch (err) {
        console.error(`[SIM] ❌ Simulation ${simulationId} FAILED:`, err.message, err.stack);
        activeSimulations.set(simulationId, { status: 'error', progress: 0, error: err.message });
      } finally {
        clearTimeout(safetyTimeout);
      }
    })();

    res.json({ success: true, simulationId });

  } catch (error) {
    console.error('❌ Simulation start error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET STATUS
// ─────────────────────────────────────────────────────────────────────────────
export const getSimulationStatus = async (req, res) => {
  try {
    const simulationId = req.params.id;

    if (activeSimulations.has(simulationId)) {
      const entry = activeSimulations.get(simulationId) || {};
      if (entry.status !== 'complete') {
        return res.json({
          success: true,
          status:         entry.status || 'running',
          progress:       typeof entry.progress === 'number' ? entry.progress : 0,
          startedAt:      entry.startedAt || null,
          error:          entry.error || null,
          agentPositions: entry.agentPositions || null,
          simTime:        entry.simTime || null,
          scaleFactor:    entry.scaleFactor || 1.0,
        });
      }
    }

    const simPath = path.join(SIMULATION_DIR, `${simulationId}.json`);
    const data    = await fs.readFile(simPath, 'utf8');
    const simulationData = JSON.parse(data);

    res.json({
      success:       true,
      status:        'complete',
      progress:      100,
      startedAt:     simulationData.timestamp || null,
      resultSummary: simulationData.summary   || {},
      simulationId,
      trajectories:  Array.isArray(simulationData.trajectories) ? simulationData.trajectories : [],
      config:        simulationData.config || { fps: 60, duration: 10 },
      dataPath:      simPath,
    });

  } catch (error) {
    res.status(404).json({ success: false, error: 'Simulation not found' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET COLLISION EVENTS
// ─────────────────────────────────────────────────────────────────────────────
export const getCollisionEvents = async (req, res) => {
  try {
    const simulationId = req.params.id;

    if (activeSimulations.has(simulationId)) {
      const entry = activeSimulations.get(simulationId) || {};
      if (entry.status !== 'complete') {
        return res.status(202).json({ success: false, message: 'Simulation still running' });
      }
    }

    const simPath = path.join(SIMULATION_DIR, `${simulationId}.json`);
    const data    = await fs.readFile(simPath, 'utf8');
    const simulationData = JSON.parse(data);

    res.json({ success: true, events: simulationData.collisionEvents || [] });

  } catch (error) {
    res.status(404).json({ success: false, error: 'Simulation not found' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET HEATMAP
// ─────────────────────────────────────────────────────────────────────────────
export const getSimulationHeatmap = async (req, res) => {
  try {
    const simulationId = req.params.id;
    const simPath      = path.join(SIMULATION_DIR, `${simulationId}.json`);
    const data         = await fs.readFile(simPath, 'utf8');
    const simulationData = JSON.parse(data);
    const events       = simulationData.collisionEvents || [];

    let sceneObjects = {};
    try {
      const parsedPath = path.join(PARSED_DIR, `${simulationData.sceneId}.json`);
      const sceneRaw   = await fs.readFile(parsedPath, 'utf8');
      const sceneData  = JSON.parse(sceneRaw);
      (sceneData.objects || []).forEach(obj => { sceneObjects[obj.id] = obj; });
    } catch (_) {}

    const objectMap = new Map();
    events.forEach(evt => {
      const id = evt.objectId;
      if (!id) return;
      if (!objectMap.has(id)) {
        objectMap.set(id, { objectId: id, objectName: evt.objectName || id, hits: [], collisions: [] });
      }
      const entry = objectMap.get(id);
      entry.hits.push(evt.injury || {});
      if (evt.position && evt.normal) {
        entry.collisions.push({
          position:   evt.position,
          normal:     evt.normal,
          score:      evt.injury?.injuryScore ?? 0,
          gForceTier: evt.injury?.gForceTier  ?? 'Observe',
          riskTier:   evt.injury?.riskTier    ?? 'safe',
        });
      }
    });

    const objectHeatmap = [];
    for (const [objId, entry] of objectMap) {
      const scores    = entry.hits.map(h => h.injuryScore || 0);
      const gForces   = entry.hits.map(h => h.gForce || 0);
      const maxScore  = Math.max(...scores, 0);
      const avgScore  = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const maxGForce = Math.max(...gForces, 0);
      const avgGForce = gForces.length > 0 ? Math.round(gForces.reduce((a, b) => a + b, 0) / gForces.length * 10) / 10 : 0;

      const worstGForceTier = maxGForce >= 50 ? 'Serious Injury' : maxGForce >= 20 ? 'Soft Injury' : 'Observe';

      const bodyParts = {};
      entry.hits.forEach(h => { if (h.bodyPart) bodyParts[h.bodyPart] = (bodyParts[h.bodyPart] || 0) + 1; });
      const primaryBodyPart = Object.entries(bodyParts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

      const intensity  = Math.max(0, Math.min(1.0, maxScore / 80));
      const heatColor  = scoreToRGB(maxScore) || [0, 1, 0];
      const sceneObj   = sceneObjects[objId];
      const boundingBox = sceneObj?.boundingBox || null;

      const recommendations = injuryCalculator.generateSafetyRecommendations(
        entry.objectName, worstGForceTier, primaryBodyPart, maxScore
      );

      objectHeatmap.push({
        objectId: objId,
        objectName: entry.objectName,
        boundingBox,
        totalHits: entry.hits.length,
        collisions: entry.collisions,
        collisionPositions: entry.collisions.map(c => c.position),
        maxInjuryScore: maxScore, avgInjuryScore: avgScore,
        maxGForce, avgGForce, worstGForceTier, primaryBodyPart,
        heatColor: Array.isArray(heatColor) ? heatColor : [0, 1, 0],
        intensity:  typeof intensity === 'number' ? intensity : 0,
        recommendations: Array.isArray(recommendations) ? recommendations : [],
      });
    }

    objectHeatmap.sort((a, b) => b.maxInjuryScore - a.maxInjuryScore);

    const rsi = injuryCalculator.calculateRoomSafetyIndex(events);

    let zoneAnalysis = null;
    try {
      const parsedPath = path.join(PARSED_DIR, `${simulationData.sceneId}.json`);
      const sceneRaw2  = await fs.readFile(parsedPath, 'utf8');
      const sceneData2 = JSON.parse(sceneRaw2);
      if (sceneData2.boundingBox) zoneAnalysis = analyzeZones(events, sceneData2.boundingBox);
    } catch (_) {}

    res.json({
      success:        true,
      simulationId,
      heatmap:        objectHeatmap,
      roomSafetyIndex: rsi,
      zoneAnalysis,
      stats: {
        totalEvents:     events.length,
        uniqueObjectsHit: objectMap.size,
        duration:        simulationData.config?.duration || 10,
      },
      pointHeatmap: events.map(evt => ({
        position:    evt.position,
        intensity:   (evt.injury?.injuryScore || 0) / 100,
        injuryScore: evt.injury?.injuryScore || 0,
        gForce:      evt.injury?.gForce || 0,
        riskTier:    evt.injury?.riskTier || 'safe',
        gForceTier:  evt.injury?.gForceTier || 'Observe',
        objectName:  evt.objectName,
      })),
    });

  } catch (error) {
    console.error('Heatmap error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate heatmap: ' + error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET REPORT
// ─────────────────────────────────────────────────────────────────────────────
export const getSimulationReport = async (req, res) => {
  try {
    const simulationId = req.params.id;
    const reportPath   = path.join(SIMULATION_DIR, `${simulationId}_report.txt`);

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

// ─────────────────────────────────────────────────────────────────────────────
// ZONE ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────
function analyzeZones(events, sceneBounds) {
  const GRID_SIZE = 8;
  const xMin = sceneBounds.min[0], xMax = sceneBounds.max[0];
  const zMin = sceneBounds.min[2], zMax = sceneBounds.max[2];
  const cellW = (xMax - xMin) / GRID_SIZE;
  const cellD = (zMax - zMin) / GRID_SIZE;

  const grid = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      grid.push({
        row, col,
        bounds: {
          minX: xMin + col * cellW, maxX: xMin + (col + 1) * cellW,
          minZ: zMin + row * cellD, maxZ: zMin + (row + 1) * cellD,
        },
        center: [xMin + (col + 0.5) * cellW, sceneBounds.min[1], zMin + (row + 0.5) * cellD],
        events: 0, totalScore: 0, maxScore: 0, objects: new Set(),
      });
    }
  }

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

  const zones = grid.map(cell => {
    const avgScore = cell.events > 0 ? cell.totalScore / cell.events : 0;
    let classification = 'safe';
    if (avgScore >= 60)      classification = 'danger';
    else if (avgScore >= 35) classification = 'hazard';
    else if (avgScore >= 10) classification = 'caution';
    return {
      row: cell.row, col: cell.col, center: cell.center, bounds: cell.bounds,
      classification, events: cell.events,
      avgScore: Math.round(avgScore), maxScore: cell.maxScore, objects: [...cell.objects],
    };
  });

  const summary = {
    safe:    zones.filter(z => z.classification === 'safe').length,
    caution: zones.filter(z => z.classification === 'caution').length,
    hazard:  zones.filter(z => z.classification === 'hazard').length,
    danger:  zones.filter(z => z.classification === 'danger').length,
    gridSize: GRID_SIZE,
  };

  return { zones, summary };
}

// Score → RGB (green → yellow → orange → red)
function scoreToRGB(score) {
  try {
    if (typeof score !== 'number' || isNaN(score)) score = 0;
    const t = Math.min(1, Math.max(0, score / 100));
    let r, g, b;
    if      (t < 0.25) { r = t * 4; g = 1;                   b = 0; }
    else if (t < 0.5)  { r = 1;     g = 1;                   b = 0; }
    else if (t < 0.75) { r = 1;     g = 1 - (t - 0.5) * 2;  b = 0; }
    else               { r = 1;     g = Math.max(0, 1 - (t - 0.5) * 2); b = 0; }
    const result = [
      Math.round(r * 255) / 255,
      Math.round(g * 255) / 255,
      Math.round(b * 255) / 255,
    ];
    return Array.isArray(result) && result.length === 3 ? result : [0, 1, 0];
  } catch (e) {
    return [0, 1, 0];
  }
}

function validateContactPoint(point, sceneBounds) {
  if (!point || !Array.isArray(point) || point.length !== 3) return false;
  if (point.some(v => !Number.isFinite(v))) return false;
  const margin = 10.0;
  const [x, y, z] = point;
  if (x < sceneBounds.min[0] - margin || x > sceneBounds.max[0] + margin) return false;
  if (y < sceneBounds.min[1] - margin || y > sceneBounds.max[1] + margin) return false;
  if (z < sceneBounds.min[2] - margin || z > sceneBounds.max[2] + margin) return false;
  return true;
}

function getRandomSpawnPosition(bbox, floorHeight, ageGroup = null) {
  const heightOffset = ageGroup ? (ageGroup.height / 2 + 0.05) : 0.5;
  if (!bbox) return [0, floorHeight + heightOffset, 0];
  const margin = 1.0;
  return [
    bbox.min[0] + margin + Math.random() * (bbox.max[0] - bbox.min[0] - 2 * margin),
    floorHeight + heightOffset,
    bbox.min[2] + margin + Math.random() * (bbox.max[2] - bbox.min[2] - 2 * margin),
  ];
}

async function cleanupSimulation(world, agents, colliders) {
  console.log('🧹 Starting physics cleanup...');
  try {
    agents.forEach(agent => {
      try {
        if (agent.collider && world.getCollider(agent.collider.handle)) {
          world.removeCollider(agent.collider, true);
        }
        if (agent.colliders) {
          Object.values(agent.colliders).forEach(c => {
            if (c && world.getCollider(c.handle)) world.removeCollider(c, true);
          });
        }
      } catch (_) {}
      agent.cleanup();
    });

    colliders.forEach(collider => {
      try {
        if (collider.collider && world.getCollider(collider.collider.handle)) {
          world.removeCollider(collider.collider, true);
        }
      } catch (_) {}
    });

    const bodyHandles = [];
    world.forEachRigidBody(body => { bodyHandles.push(body.handle); });

    let removedBodies = 0;
    bodyHandles.forEach(handle => {
      try {
        const body = world.getRigidBody(handle);
        if (body) { world.removeRigidBody(body); removedBodies++; }
      } catch (_) {}
    });

    world.free();
    console.log(`✅ Physics cleanup done — ${removedBodies} bodies freed`);

    if (global.gc) {
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const freed = ((before - process.memoryUsage().heapUsed) / 1024 / 1024).toFixed(1);
      console.log(`🗑️ GC freed ${freed}MB`);
    }
  } catch (error) {
    console.error('⚠️ Cleanup error:', error.message);
  }
}