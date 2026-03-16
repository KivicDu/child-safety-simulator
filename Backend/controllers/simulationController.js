import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyScaleToSceneData } from '../utils/scaleNormalizer.js';
import scaleAuthority from '../services/scaleAuthority.js';
import behaviorManager from '../services/behaviorManager.js';
import injuryCalculator from '../services/injuryCalculator.js';
import Agent from '../services/agent.js';
import { getAgeGroup } from '../config/ageGroups.js';
import { initDeterministicMath, restoreMathRandom } from '../utils/seededRandom.js';
import physicsEngine from '../services/physicsEngine.js';
import colliderGenerator from '../utils/colliderGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PARSED_DIR     = process.env.PARSED_DIR     || './parsed';
const SIMULATION_DIR = process.env.SIMULATION_DIR || './simulations';

fs.mkdir(SIMULATION_DIR, { recursive: true }).catch(() => {});

const activeSimulations = new Map();

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

// Lấy Y mặt sàn tại vị trí XZ hiện tại của agent bằng raycast xuống.
// Ray bắn từ đỉnh đầu agent để tránh bắt leg collider của chính agent.
//
// [CEILING-ESCAPE FIX] maxDist expanded to cover full room height.
// Old: maxDist = halfH*2 + 1.5 = 2.32m  — too short when agent is above 2m
// (castFromY=5.706 from ceiling agent, ray only reaches 3.386, misses floor at 0.169)
// New: maxDist = castFromY - sceneFloorHeight + 0.5  — always reaches floor regardless
// of current agent altitude. Capped to prevent performance issues in large scenes.
function getCurrentFloorY(world, bodyCentreY, agentHalfH, xPos, zPos, sceneFloorHeight, agentBodyToIgnore = null) {
  const castFromY = bodyCentreY + agentHalfH + 0.5;
  // Ensure ray always reaches the actual floor from any altitude
  const minDist   = agentHalfH * 2 + 1.5;          // minimum: covers normal floor range
  const fullDist  = castFromY - sceneFloorHeight + 0.5;  // exact distance to floor
  const maxDist   = Math.min(Math.max(minDist, fullDist), 30.0);  // cap at 30m for perf
  return physicsEngine.getFloorHeightAt(
    world, xPos, castFromY, zPos,
    sceneFloorHeight, maxDist, agentBodyToIgnore
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPAWN HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Tạo exclusion zones từ đồ vật chạm sàn để tránh random vào trong đồ vật.
function buildFurnitureExclusionZones(sceneObjects, floorHeight, padding) {
  if (!sceneObjects || !sceneObjects.length) return [];
  return sceneObjects
    .filter(obj => {
      if (!obj.boundingBox) return false;
      const { min, max } = obj.boundingBox;
      const objHeight = max[1] - min[1];
      return min[1] <= floorHeight + 0.40
          && max[1]  >  floorHeight + 0.10
          && objHeight > 0.10;
    })
    .map(obj => ({
      minX: obj.boundingBox.min[0] - padding,
      maxX: obj.boundingBox.max[0] + padding,
      minZ: obj.boundingBox.min[2] - padding,
      maxZ: obj.boundingBox.max[2] + padding,
    }));
}

function isInsideExclusionZone(x, z, zones) {
  return zones.some(z2 => x >= z2.minX && x <= z2.maxX && z >= z2.minZ && z <= z2.maxZ);
}

function getRandomSpawnPosition(bbox, floorHeight, ageGroup, exclusionZones, maxTries = 20) {
  if (!bbox) return [0, floorHeight, 0];
  const margin = ageGroup ? (ageGroup.capsuleRadius * 2) : 0.3;
  const width  = Math.max(0, bbox.max[0] - bbox.min[0] - 2 * margin);
  const depth  = Math.max(0, bbox.max[2] - bbox.min[2] - 2 * margin);

  for (let t = 0; t < maxTries; t++) {
    const x = bbox.min[0] + margin + Math.random() * width;
    const z = bbox.min[2] + margin + Math.random() * depth;
    if (!isInsideExclusionZone(x, z, exclusionZones)) {
      return [x, floorHeight, z];
    }
  }
  return null;
}

// Pre-compute lưới các ô XZ đi được.
// [BUG-3 FIX] castFromY = bb.max[1] - 0.2 (gần trần) thay vì floorHeight + agentHeight + 0.5.
// Với phòng ngủ: bb.max[1] ≈ 6.5m, castFromY ≈ 6.3m, xuyên qua tất cả đồ vật.
// Lọc: chỉ nhận hitY trong ±0.15m của floorHeight đã xác nhận → không nhận mặt giường.
function buildWalkableGrid(world, bb, floorHeight, agentHeight, capsuleRadius,
                           handleToCollider, isFloor, rapier) {
  const _bbDiag  = bb ? Math.hypot(bb.max[0] - bb.min[0], bb.max[2] - bb.min[2]) : 10;
  const GRID_STEP = Math.max(0.2, Math.min(0.5, _bbDiag / 60));
  const margin    = capsuleRadius * 2;

  // Bắn từ gần trần xuống để xuyên qua toàn bộ đồ vật
  const roomTop    = bb?.max?.[1] ?? (floorHeight + 3.0);
  const castFromY  = roomTop - 0.2;
  const maxRayDist = castFromY - floorHeight + 0.5;

  const walkable = [];

  for (let x = bb.min[0] + margin; x <= bb.max[0] - margin; x += GRID_STEP) {
    for (let z = bb.min[2] + margin; z <= bb.max[2] - margin; z += GRID_STEP) {
      const ray = new rapier.Ray({ x, y: castFromY, z }, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(ray, maxRayDist, true, 2);

      if (!hit) {
        // Không có gì cả → không gian trống đến sàn
        walkable.push({ x, z });
        continue;
      }

      const meta = handleToCollider.get(hit.colliderHandle);
      const toi  = hit.toi ?? hit.timeOfImpact ?? 0;
      const hitY = castFromY - toi;

      // [BUG-2 FIX] Nới lỏng từ ±0.15m → ±0.30m: phòng ngừa confirmedFloorY
      // lệch nhỏ (do floating-point tích lũy hoặc collider geom offset) làm
      // toàn bộ floor cells bị reject → 0 walkable cells.
      // 0.30m đủ nhỏ để loại mặt giường (thường +0.5m trở lên).
      if (Math.abs(hitY - floorHeight) > 0.30) continue;

      if (isFloor(meta) || Math.abs(hitY - floorHeight) < 0.06) {
        walkable.push({ x, z });
      }
    }
  }

  console.log(`[SPAWN] Walkable grid built: ${walkable.length} cells (step=${GRID_STEP.toFixed(2)}m, castFromY=${castFromY.toFixed(2)}m, floor=${floorHeight.toFixed(3)}m)`);
  return walkable;
}

// Kiểm tra collision đầy đủ tại XZ.
// [BUG-3 FIX] castFromY dùng roomTop thực tế thay vì hardcoded floorHeight + 4.0.
// Hỗ trợ truyền bb từ ngoài vào để biết chiều cao phòng.
function checkSpawnPoint(x, z, world, floorHeight, agentHeight, capsuleRadius,
                          ageGroup, handleToCollider, isFloor, rapier, bb = null) {
  // Bắn từ gần trần nhà xuống để xuyên qua đồ vật, chỉ nhận sàn thật
  const roomTop    = bb?.max?.[1] ?? (floorHeight + 4.0);
  const castFromY  = roomTop - 0.2;
  const maxRayDist = castFromY - floorHeight + 0.5;

  const ray = new rapier.Ray({ x, y: castFromY, z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, maxRayDist, true, 2);
  let actualFloorY = floorHeight;

  if (hit) {
    const hitMeta = handleToCollider.get(hit.colliderHandle);
    const toi     = hit.toi ?? hit.timeOfImpact ?? 0;
    const hitY    = castFromY - toi;

    // [BUG-2 FIX] Nới lỏng ±0.15m → ±0.30m — nhất quán với buildWalkableGrid.
    if (Math.abs(hitY - floorHeight) > 0.30) {
      return { valid: false, actualFloorY: floorHeight };
    }

    if (isFloor(hitMeta) || Math.abs(hitY - floorHeight) < 0.06) {
      actualFloorY = hitY;
    } else {
      return { valid: false, actualFloorY: floorHeight };
    }
  }

  // Multi-part body sweep
  const spawnBodyCenterY = actualFloorY + (agentHeight / 2);
  const spawnRot         = { w: 1.0, x: 0.0, y: 0.0, z: 0.0 };
  const spawnShapes      = physicsEngine.getAgentSpawnShapes(agentHeight, capsuleRadius, ageGroup.anthropometry || null);
  let isBlocked = false;

  for (const part of spawnShapes) {
    if (isBlocked) break;
    const partCenterY  = spawnBodyCenterY + part.centerOffsetY;
    const paddedParams = [...part.params];
    paddedParams[paddedParams.length - 1] *= 1.15;
    const checkPos = { x, y: partCenterY, z };
    const shape    = part.shape === rapier.Ball
      ? new rapier.Ball(paddedParams[0])
      : new rapier.Capsule(paddedParams[0], paddedParams[1]);

    world.intersectionsWithShape(checkPos, spawnRot, shape, (handle) => {
      const meta = handleToCollider.get(handle);
      if (!meta || isFloor(meta) || meta.type === 'wall' || meta.id === 'boundary_wall') return true;
      isBlocked = true;
      return false;
    }, 2);
  }

  // Ankle sphere
  if (!isBlocked) {
    const anklePos   = { x, y: actualFloorY + capsuleRadius + 0.05, z };
    const ankleShape = new rapier.Ball(capsuleRadius * 1.15);
    world.intersectionsWithShape(anklePos, spawnRot, ankleShape, (handle) => {
      const meta = handleToCollider.get(handle);
      if (!meta || isFloor(meta) || meta.type === 'wall' || meta.id === 'boundary_wall') return true;
      isBlocked = true;
      return false;
    }, 2);
  }

  return { valid: !isBlocked, actualFloorY };
}

// ─────────────────────────────────────────────────────────────────────────────
// START SIMULATION
// ─────────────────────────────────────────────────────────────────────────────
export const startSimulation = async (req, res) => {
  console.log('--- ENTERED startSimulation ROUTE ---');
  try {
    const { sceneId, agentCount = 10, duration = 30, ageGroupId = 'early_toddler', simulationSeed = null } = req.body;

    if (!sceneId) {
      return res.status(400).json({ error: 'sceneId is required' });
    }

    const simulationId = `sim_${Date.now()}`;

    activeSimulations.set(simulationId, {
      status: 'running', progress: 0, startedAt: new Date().toISOString(),
    });

    // [PERF-FIX-1] Tăng safety timeout từ duration×5 → duration×10.
    // Với 10 worlds × 25 trimesh colliders, physics loop mất ~5× realtime tối thiểu.
    // duration×5 = 150s cho simulation 30s → bị trigger trước khi loop hoàn thành.
    // duration×10 = 300s đủ margin cho cả scene phức tạp và máy chậm.
    const safetyTimeout = setTimeout(() => {
      const entry = activeSimulations.get(simulationId);
      if (entry && entry.status === 'running') {
        console.error(`[SIM] ⏰ Safety timeout: ${simulationId}`);
        activeSimulations.set(simulationId, {
          status: 'error',
          progress: entry.progress || 0,
          error: `Simulation timed out after ${duration * 10}s`,
          startedAt: entry.startedAt,
        });
      }
    }, duration * 10 * 1000);

    (async () => {
      initDeterministicMath(simulationSeed);
      const startTime = Date.now();

      try {
        console.log(`[SIM] ──────────────────────────────────────────`);
        console.log(`[SIM] 🚀 Starting simulation ${simulationId}`);
        console.log(`[SIM]    Scene: ${sceneId}, Agents: ${agentCount}, Duration: ${duration}s, Age: ${ageGroupId}, Seed: ${simulationSeed}`);

        // Step 1: Load scene
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

        // ── [RC#0 FIX] Double-scaling guard ─────────────────────────────────
        // sceneData đã được scale tại upload time (sceneController.uploadModel).
        // _sceneUnit = 'meters' nếu applyScaleToSceneData đã chạy thành công.
        // Nếu gọi lại applyScaleToSceneData với _scaleFactor != 1.0, mọi spatial
        // quantity bị nhân đôi: floor.height, boundingBox, OBB, collisionMesh →
        // colliders sai vị trí, castRay miss floor, agents spawn trên trần nhà.
        //
        // Guard: chỉ apply nếu data chưa ở metres (chưa scale lần nào).
        // Nếu đã scale (_sceneUnit === 'meters'), bỏ qua hoàn toàn.
        let scaleFactor = sceneData._scaleFactor;
        if (sceneData._sceneUnit === 'meters') {
          // Data đã ở đơn vị metres từ lúc upload → KHÔNG scale lại
          console.log(`[SIM]    ✓ Scene already in metres (_scaleFactor=${scaleFactor?.toFixed(4)}), skipping re-scale`);
        } else {
          // Data chưa scale (không qua uploadModel, ví dụ fallback default room)
          if (!scaleFactor) {
            const scaleInfo = scaleAuthority.detectScale(sceneData);
            scaleFactor = scaleInfo.factor;
          }
          applyScaleToSceneData(sceneData, scaleFactor);
        }
        const simEntry = activeSimulations.get(simulationId);
        if (simEntry) {
          simEntry.scaleFactor = sceneData._scaleFactor || 1.0;
          activeSimulations.set(simulationId, simEntry);
        }

        // Step 2: Physics
        console.log(`[SIM] Step 2/5: Initializing physics engine...`);
        await physicsEngine.init();
        console.log(`[SIM]    ✅ Physics engine ready`);

        const ageGroup    = getAgeGroup(ageGroupId);
        const bb          = sceneData.boundingBox;
        // ── [SPAWN-ROOT FIX] Validate floorHeight before use ──────────────────
        // ROOT CAUSE of ceiling spawning:
        //   glbParser may set sceneData.floor.height = bb.max[1] (ceiling Y)
        //   instead of bb.min[1] (floor Y). This places the physics floor collider
        //   at ceiling level → all spawn raycasts filter out real floor hits
        //   (|hitY − floorHeight| > 0.30 rejects every hit that IS the real floor)
        //   → every fallback resolves to confirmedFloorY = ceiling → agents spawn there.
        //
        // VALIDATION: Floor Y must be in the BOTTOM 30% of the room height.
        //   If sceneData.floor.height is closer to bb.max[1] than bb.min[1],
        //   it's misidentified — use bb.min[1] instead.
        //
        // SECONDARY VALIDATION: floor.height must be ≤ bb.min[1] + 0.5m
        //   (floor surface cannot be more than 50cm above the lowest bbox point).
        let floorHeight;
        {
          const rawFH = (sceneData.floor && typeof sceneData.floor.height === 'number')
            ? sceneData.floor.height
            : null;

          if (rawFH !== null && bb) {
            const roomH       = bb.max[1] - bb.min[1];
            const distFromBot = Math.abs(rawFH - bb.min[1]);
            const distFromTop = Math.abs(rawFH - bb.max[1]);

            // Guard 1: if floor.height is closer to ceiling than floor → likely ceiling Y
            const isCeilingValue = roomH > 0.5 && distFromTop < distFromBot;
            // Guard 2: floor cannot be more than 50cm above the absolute bottom of bbox
            const isTooHigh      = rawFH > bb.min[1] + 0.50;

            if (isCeilingValue || isTooHigh) {
              console.warn(
                `[SIM-SPAWN] ⚠️ sceneData.floor.height=${rawFH.toFixed(4)} looks wrong ` +
                `(closer to ceiling=${bb.max[1].toFixed(3)} than floor=${bb.min[1].toFixed(3)}). ` +
                `Falling back to bb.min[1]=${bb.min[1].toFixed(4)}.`
              );
              floorHeight = bb.min[1];
            } else {
              floorHeight = rawFH;
            }
          } else {
            floorHeight = rawFH ?? (bb ? bb.min[1] : 0);
          }
        }

        console.log(`[SIM START] Floor Height: ${floorHeight.toFixed(4)}, BBox Y: [${bb?.min[1].toFixed(3)}, ${bb?.max[1].toFixed(3)}]`);

        // isFloor: xác định collider có phải là sàn không
        const isFloor = (collider) => {
          if (!collider) return false;
          const name = (collider.name || collider.id || '').toLowerCase();
          const type = (collider.type || '').toLowerCase();

          if (type === 'floor') return true;
          if (type === 'ceiling' || type === 'roof' || type === 'wall') return false;

          if (/ceiling|plafond|decke|plafon|soffitto|techo|roof|dach|wall|muro|pared|top|upper/.test(name)) return false;
          if (/rug|carpet|mat($|[_\s])|platform|bed|sofa/.test(name)) return true;
          if (/floor|vloer|ground|plane|grond|surface/.test(name)) {
            return !/lamp|fan|mirror|cabinet|shelf|desk|table|stool/.test(name);
          }

          if (collider.boundingBox) {
            const objHeight = collider.boundingBox.max[1] - collider.boundingBox.min[1];
            if (collider.boundingBox.max[1] > floorHeight + 1.2) return false;
            if (collider.boundingBox.max[1] <= floorHeight + 0.12) return true;
            if (objHeight <= 0.15 && collider.boundingBox.max[1] <= floorHeight + 0.25) return true;
            if (objHeight > 0.3 && objHeight < 1.0 && /bed|sofa|platform/.test(name)) return true;
          }

          return false;
        };

        console.log(`[SIM] Step 3/5: Creating ${agentCount} independent worlds...`);
        const simWorlds = [];
        const allAgents = [];
        let confirmedFloorY = floorHeight;

        for (let i = 0; i < agentCount; i++) {
          const world     = physicsEngine.createWorld();
          const colliders = colliderGenerator.generateCollidersFromScene(sceneData, world, physicsEngine);

          // ── [BUG-1 FIX] Explicit floor collider — default collision group ──
          // KHÔNG dùng setCollisionGroups → floor ở default group → castRay tìm thấy
          // → confirmFloorSurface hoạt động → confirmedFloorY chính xác.
          let explicitFloorHandle = null;
          {
            const fDesc = physicsEngine.rapier.RigidBodyDesc.fixed()
              .setTranslation(0, floorHeight - 0.05, 0);
            const fBody = world.createRigidBody(fDesc);
            const fColl = world.createCollider(
              physicsEngine.rapier.ColliderDesc.cuboid(100, 0.05, 100)
                .setFriction(0.9)
                .setRestitution(0.0)
                .setActiveEvents(physicsEngine.rapier.ActiveEvents.COLLISION_EVENTS),
              // NOTE: NO setCollisionGroups — default group so castRay hits this
              fBody
            );
            explicitFloorHandle = fColl.handle;
          }

          // ── [BUG-1 FIX v3] Warm-up steps PHẢI chạy SAU KHI explicit floor được tạo ──
          // v2 chạy 4 warm-up steps TRƯỚC khi tạo explicit floor → BVH broad-phase không
          // có explicit floor body → confirmFloorSurface/buildWalkableGrid castRay miss floor
          // → 0 walkable cells → tất cả agents rơi vào last-resort → spawn tại cùng 1 điểm.
          // Fix: tạo explicit floor TRƯỚC, chạy warm-up SAU → broad-phase rebuild có floor.
          for (let _ws = 0; _ws < 6; _ws++) physicsEngine.step(world);

          const handleToCollider = new Map();
          colliders.forEach(c => {
            if (c.collidersArr) {
              c.collidersArr.forEach(coll => handleToCollider.set(coll.handle, c));
            } else if (c.collider) {
              handleToCollider.set(c.collider.handle, c);
            }
          });

          if (explicitFloorHandle !== null) {
            handleToCollider.set(explicitFloorHandle, {
              type:        'floor',
              id:          'explicit_floor',
              name:        'floor',
              boundingBox: { min: [-100, floorHeight - 0.1, -100], max: [100, floorHeight, 100] },
              isSoft:      false,
            });
          }

          // ── [BUG-1 FIX] confirmFloorSurface bây giờ tìm thấy sàn ──────────
          {
            const rawConfirmed = physicsEngine.confirmFloorSurface(world, bb, floorHeight);
            // [SPAWN-ROOT FIX] Validate confirmFloorSurface result.
            // If it returns a value closer to bb.max[1] than bb.min[1], something went wrong.
            if (bb) {
              const roomH = bb.max[1] - bb.min[1];
              const distFromBot = Math.abs(rawConfirmed - bb.min[1]);
              const distFromTop = Math.abs(rawConfirmed - bb.max[1]);
              if (roomH > 0.5 && distFromTop < distFromBot) {
                console.warn(
                  `[SIM-SPAWN] ⚠️ confirmFloorSurface=${rawConfirmed.toFixed(4)} looks like ceiling. ` +
                  `Overriding with floorHeight=${floorHeight.toFixed(4)}.`
                );
                confirmedFloorY = floorHeight;
              } else {
                confirmedFloorY = rawConfirmed;
              }
            } else {
              confirmedFloorY = rawConfirmed;
            }
          }

          // ── Tường vô hình bao quanh phòng ──────────────────────────────────
          // Walls giữ nguyên setCollisionGroups(0x00010001) như code gốc.
          // Lý do: KCC của agent cũng ở group mặc định (0xFFFF) nên vẫn va chạm
          // với wall (0x0001 membership → mask 0x0001 → KCC có bit 0x0001 → match).
          // Đây là hành vi đúng. Bỏ groups khỏi walls (như trong v3 trước) làm
          // KCC coi walls như dynamic bodies và block horizontal movement.
          if (bb) {
            const wallHeight    = (bb.max[1] - bb.min[1]) + 1.0; // bao phủ toàn chiều cao phòng
            const wallThickness = 0.3;
            const cx  = (bb.min[0] + bb.max[0]) / 2;
            const cz  = (bb.min[2] + bb.max[2]) / 2;
            const sx  = (bb.max[0] - bb.min[0]) / 2;
            const sz  = (bb.max[2] - bb.min[2]) / 2;
            const wallY = bb.min[1] + wallHeight / 2;

            const walls = [
              { x: bb.max[0] + wallThickness / 2, y: wallY, z: cz,  hx: wallThickness / 2, hy: wallHeight / 2, hz: sz + wallThickness },
              { x: bb.min[0] - wallThickness / 2, y: wallY, z: cz,  hx: wallThickness / 2, hy: wallHeight / 2, hz: sz + wallThickness },
              { x: cx, y: wallY, z: bb.max[2] + wallThickness / 2,  hx: sx + wallThickness, hy: wallHeight / 2, hz: wallThickness / 2 },
              { x: cx, y: wallY, z: bb.min[2] - wallThickness / 2,  hx: sx + wallThickness, hy: wallHeight / 2, hz: wallThickness / 2 },
            ];
            for (const w of walls) {
              const desc = physicsEngine.rapier.RigidBodyDesc.fixed().setTranslation(w.x, w.y, w.z);
              const body = world.createRigidBody(desc);
              const wallCollider = world.createCollider(
                physicsEngine.rapier.ColliderDesc.cuboid(w.hx, w.hy, w.hz)
                  .setFriction(0.3)
                  .setRestitution(0.0),
                body
              );
              handleToCollider.set(wallCollider.handle, {
                type: 'wall', id: 'boundary_wall', name: 'wall', isSoft: false,
              });
            }
          }

          const r = ageGroup.capsuleRadius || 0.15;

          // ── SPAWN STRATEGY ────────────────────────────────────────────────
          const exclusionZones = buildFurnitureExclusionZones(
            sceneData.objects, confirmedFloorY, r * 0.5
          );

          let actualFloorY = confirmedFloorY;
          let spawnPos     = null;
          let validSpawn   = false;

          // Giai đoạn 1+2: 50 lần thử random với pre-filter + physics check
          let attempts = 0;
          while (!validSpawn && attempts < 50) {
            attempts++;
            const candidate = getRandomSpawnPosition(
              bb, confirmedFloorY, ageGroup, exclusionZones
            );
            if (!candidate) continue;

            const { valid, actualFloorY: floorY } = checkSpawnPoint(
              candidate[0], candidate[2],
              world, confirmedFloorY, ageGroup.height, r,
              ageGroup, handleToCollider, isFloor, physicsEngine.rapier, bb
            );

            if (valid) {
              spawnPos     = candidate;
              actualFloorY = floorY;
              validSpawn   = true;
            }
          }

          // Giai đoạn 3: Walkable grid fallback
          if (!validSpawn && bb) {
            console.warn(`[SPAWN] ⚠️ Agent ${i}: 50 random attempts failed, trying walkable grid...`);

            const walkableGrid = buildWalkableGrid(
              world, bb, confirmedFloorY, ageGroup.height, r,
              handleToCollider, isFloor, physicsEngine.rapier
            );

            walkableGrid.sort(() => Math.random() - 0.5);

            for (const cell of walkableGrid) {
              const { valid, actualFloorY: floorY } = checkSpawnPoint(
                cell.x, cell.z,
                world, confirmedFloorY, ageGroup.height, r,
                ageGroup, handleToCollider, isFloor, physicsEngine.rapier, bb
              );
              if (valid) {
                spawnPos     = [cell.x, floorY, cell.z];
                actualFloorY = floorY;
                validSpawn   = true;
                console.log(`[SPAWN] ✅ Agent ${i}: walkable grid found clear cell [${cell.x.toFixed(2)}, ${cell.z.toFixed(2)}]`);
                break;
              }
            }
          }

          // ── [BUG-3 FIX] Last resort — scan 100 vị trí random + center ────────
          // Phiên bản cũ chỉ bắn tại center phòng → trúng mặt giường/bàn
          // (center phòng ngủ thường bị đồ vật chiếm) → agents escape UP → trần.
          // [SPAWN-DIVERSE FIX] Tăng từ 29→99 candidates, và fallback cuối cùng
          // dùng XZ ngẫu nhiên (không phải center) để 10 agents không cùng điểm.
          if (!validSpawn) {
            console.warn(`[SPAWN] ⚠️ Agent ${i}: all strategies failed, scanning 100 last-resort positions`);
            const cx = bb ? (bb.min[0] + bb.max[0]) / 2 : 0;
            const cz = bb ? (bb.min[2] + bb.max[2]) / 2 : 0;

            const roomTop   = bb ? bb.max[1] : confirmedFloorY + 3.0;
            const highCastY = roomTop - 0.2;
            const maxDist   = highCastY - confirmedFloorY + 0.5;

            // 99 random + center cuối cùng (center hay bị furniture block)
            const lrCandidates = /** @type {[number, number][]} */ ([]);
            if (bb) {
              const lrMargin = r * 2;
              const lrW = Math.max(0, bb.max[0] - bb.min[0] - 2 * lrMargin);
              const lrD = Math.max(0, bb.max[2] - bb.min[2] - 2 * lrMargin);
              for (let t = 0; t < 99; t++) {
                lrCandidates.push([
                  bb.min[0] + lrMargin + Math.random() * lrW,
                  bb.min[2] + lrMargin + Math.random() * lrD,
                ]);
              }
            }
            lrCandidates.push([cx, cz]); // center là phương án cuối cùng

            let lrFound = false;
            for (const [lx, lz] of lrCandidates) {
              const lrRay = new physicsEngine.rapier.Ray(
                { x: lx, y: highCastY, z: lz },
                { x: 0, y: -1, z: 0 }
              );
              const lrHit = world.castRay(lrRay, maxDist, true, 2);

              if (lrHit) {
                const hitY = highCastY - (lrHit.toi ?? lrHit.timeOfImpact ?? 0);
                if (Math.abs(hitY - confirmedFloorY) <= 0.30) {
                  actualFloorY = hitY;
                  spawnPos     = [lx, actualFloorY, lz];
                  lrFound      = true;
                  console.warn(`[SPAWN] ✅ Agent ${i}: last-resort found floor Y=${hitY.toFixed(4)} at [${lx.toFixed(2)}, ${lz.toFixed(2)}]`);
                  break;
                }
              }
            }

            if (!lrFound) {
              // [SPAWN-DIVERSE FIX] Không dùng center cố định — mỗi agent dùng XZ ngẫu nhiên
              // để tránh 10 agents spawn chồng lên nhau tại cùng 1 điểm.
              actualFloorY = confirmedFloorY;
              if (bb) {
                const lrMargin = r * 2;
                const lrW = Math.max(0, bb.max[0] - bb.min[0] - 2 * lrMargin);
                const lrD = Math.max(0, bb.max[2] - bb.min[2] - 2 * lrMargin);
                const fallbackX = bb.min[0] + lrMargin + Math.random() * lrW;
                const fallbackZ = bb.min[2] + lrMargin + Math.random() * lrD;
                spawnPos = [fallbackX, actualFloorY, fallbackZ];
              } else {
                spawnPos = [cx, actualFloorY, cz];
              }
              console.warn(`[SPAWN] ⚠️ Agent ${i}: last-resort exhausted 100 positions → random fallback at [${spawnPos[0].toFixed(2)}, ${spawnPos[2].toFixed(2)}]`);
            }
          }

          // [SPAWN-FREEZE FIX] feetY phải đặt legs capsule bottom TRÊN floor surface.
          // legs capsule radius = capsuleRadius * 0.75 (từ createAgentMultipartCollider).
          // Khi feetY - legsRadius < floorSurface → legs NẰM TRONG floor cuboid →
          // KCC.computeColliderMovement() phát hiện penetration ngay frame 0 →
          // block toàn bộ XZ movement → agent đứng im mãi mãi.
          // Old: clearance=0.05m cố định → với legsRadius=0.1125, bottom = feetY-0.1125
          //      = floor+0.05-0.1125 = floor-0.0625 → NẰM TRONG floor. Bug đã xác nhận.
          // Fix: clearance = legsRadius + 0.02m buffer → legs bottom = floor + 0.02m luôn.
          const _legsRadius = (ageGroup.capsuleRadius || 0.15) * 0.75;
          const _KCC_SPAWN_CLEARANCE = _legsRadius + 0.02;
          spawnPos[1] = actualFloorY + _KCC_SPAWN_CLEARANCE;

          console.log(`[SPAWN DEBUG] Agent ${i}: confirmedFloorY=${confirmedFloorY.toFixed(4)}, actualFloorY=${actualFloorY.toFixed(4)}, feetY=${spawnPos[1].toFixed(4)}, XZ=[${spawnPos[0].toFixed(2)}, ${spawnPos[2].toFixed(2)}]`);

          const agentBodyObj = physicsEngine.createAgentMultipartCollider(
            world, spawnPos, ageGroup.height, ageGroup.capsuleRadius,
            ageGroup.anthropometry || null
          );

          // ── [BUG-4 FIX] Post-spawn settling loop — UNCONDITIONAL CLAMP ────
          // Phiên bản cũ: clamp chỉ khi pos.y > threshold + 0.15.
          // Vấn đề: agent bị physics đẩy lên 1-3m trong settling (va chạm với
          // OBB collider phình to của đồ vật xoay) → vượt threshold → clamp về
          // settleY → bị đẩy lên lại → vòng lặp không hội tụ → kết thúc settling
          // vẫn ở trên cao → agent tự do rơi trong main loop → bounce lại.
          //
          // Fix: SAU MỖI physics step trong settling, LUÔN LUÔN set body về
          // đúng vị trí sàn, không có điều kiện. Physics engine sẽ phát hiện
          // không có overlap và giữ nguyên → hội tụ tại sàn đúng sau 2-3 step.
          //
          // settleBodyCentreY = feetY + halfH = target body center when on floor
          const halfH = ageGroup.height / 2;
          const settleBodyCentreY = actualFloorY + _KCC_SPAWN_CLEARANCE + halfH;

          const SETTLE_STEPS = 10;
          for (let s = 0; s < SETTLE_STEPS; s++) {
            physicsEngine.step(world, 1 / 60, null);

            // UNCONDITIONAL: luôn reset về sàn đúng sau mỗi step
            // Điều này ngăn bounce tích lũy qua nhiều step
            agentBodyObj.body.setNextKinematicTranslation({
              x: spawnPos[0],
              y: settleBodyCentreY,
              z: spawnPos[2],
            });
          }

          // ── [SETTLE-FIX] Validate body position after settling ──────────────
          // After settling, check if the body has drifted from settleBodyCentreY.
          // Physics depenetration with trimesh furniture can push the body away.
          // If so, force it back to the correct floor position.
          physicsEngine.step(world, 1 / 60, null);

          {
            const postPos = agentBodyObj.body.translation();
            const drift   = Math.abs(postPos.y - settleBodyCentreY);
            if (drift > 0.05) {
              console.warn(
                `[SPAWN] Agent ${i}: body drifted ${drift.toFixed(3)}m after settling ` +
                `(from ${settleBodyCentreY.toFixed(4)} to ${postPos.y.toFixed(4)}). Forcing back.`
              );
              agentBodyObj.body.setNextKinematicTranslation({
                x: spawnPos[0],
                y: settleBodyCentreY,
                z: spawnPos[2],
              });
              physicsEngine.step(world, 1 / 60, null);
            }
          }

          const agent     = new Agent(i, spawnPos, agentBodyObj.body, ageGroupId, world);
          agent.spawnY    = actualFloorY;
          agent.colliders = agentBodyObj.colliders;
          agent.collider  = agentBodyObj.colliders?.legs ?? agentBodyObj.colliders?.torso ?? null;
          allAgents.push(agent);

          const handleToAgent    = new Map();
          const handleToBodyPart = new Map();
          if (agent.colliders) {
            Object.values(agent.colliders).forEach(c => handleToAgent.set(c.handle, agent));
          }
          if (agentBodyObj.colliders.head)  handleToBodyPart.set(agentBodyObj.colliders.head.handle,  'head');
          if (agentBodyObj.colliders.torso) handleToBodyPart.set(agentBodyObj.colliders.torso.handle, 'torso');
          if (agentBodyObj.colliders.legs)  handleToBodyPart.set(agentBodyObj.colliders.legs.handle,  'legs');

          const handSensors = physicsEngine.createHandSensors(
            world, ageGroup.height, ageGroup.capsuleRadius, ageGroup.anthropometry || null
          );
          agent.handSensors = handSensors;

          const handSensorHandles = new Map();
          if (handSensors?.left?.collider) {
            handleToAgent.set(handSensors.left.collider.handle, agent);
            handSensorHandles.set(handSensors.left.collider.handle, 'left');
          }
          if (handSensors?.right?.collider) {
            handleToAgent.set(handSensors.right.collider.handle, agent);
            handSensorHandles.set(handSensors.right.collider.handle, 'right');
          }

          const eventQueue = new physicsEngine.rapier.EventQueue(true);

          simWorlds.push({
            world, agent, colliders, handleToCollider, handleToAgent,
            handleToBodyPart, handSensorHandles, eventQueue, confirmedFloorY,
          });
        }

        console.log(`[SIM]    ✅ Created ${simWorlds.length} independent worlds (1 agent each)`);

        // Step 4: Behaviors
        console.log(`[SIM] Step 4/5: Generating agent behaviors...`);
        const behaviorStartTime = Date.now();
        const { behaviors, rareEvents } = await behaviorManager.generateBehaviorsForScene(sceneData, ageGroupId);
        console.log(`[SIM]    ✅ Behaviors ready in ${Date.now() - behaviorStartTime}ms`);
        behaviorManager.distributeBehaviors(allAgents, behaviors, rareEvents);

        const collisionEvents = [];
        let contactCandidates = 0, validContacts = 0;
        let dbg_noMatch = 0, dbg_isFloor = 0, dbg_noContact = 0, dbg_outOfBounds = 0;
        let dbg_softIntersections = 0;
        const traceLog = [];

        const deltaTime  = 1 / 60;
        const totalSteps = duration * 60;

        console.log(`[SIM] Step 5/5: Running physics loop (${totalSteps} steps × ${simWorlds.length} worlds)...`);
        const loopStartTime = Date.now();

        // [PERF-FIX-8] Cache các giá trị không đổi ra ngoài inner loop.
        // agentHalfH, roomHeight là hằng số trong suốt simulation — không cần tính lại mỗi frame.
        const _agentHalfH  = ageGroup.height / 2;
        const _roomHeight  = (bb ? bb.max[1] - bb.min[1] : 4.0);

        for (let step = 0; step < totalSteps; step++) {
          // [PERF-FIX-3] Giảm setImmediate từ mỗi 60 steps (1s sim) → mỗi 300 steps (5s sim).
          // Old: 30 context switches cho simulation 30s → overhead event loop không cần thiết.
          // 300 steps = 5s sim-time vẫn đủ responsive cho status polling (client poll mỗi 2s).
          if (step > 0 && step % 300 === 0) {
            await new Promise(r => setImmediate(r));
          }

          for (const sim of simWorlds) {
            const {
              world, agent, colliders, handleToCollider, handleToAgent,
              handleToBodyPart, handSensorHandles, eventQueue, confirmedFloorY: simFloorY,
            } = sim;

            if (agent.body && !agent.fallState) {
              const pos        = agent.body.translation();
              const agentHalfH = _agentHalfH;  // [PERF-FIX-8] cached

              // ── [CASCADE-TELEPORT FIX] ──────────────────────────────────────
              // ROOT CAUSE (from log analysis):
              //   getCurrentFloorY does a downward raycast from castFromY = posY + halfH + 0.5.
              //   When the ray hits a FURNITURE TOP (e.g. a shelf at Y=1.2m) before reaching
              //   the actual floor (Y=0.169m), it returns furniture_top as "currentFloorY".
              //   targetY = furniture_top + halfH + 0.02 = 1.2 + 0.41 + 0.02 = 1.63m.
              //   Since pos.y (0.629m) < targetY - 0.03 (1.60m) → agent TELEPORTED UP to 1.63m!
              //   Next frame: new castFromY hits higher furniture → teleports again → reaches
              //   ceiling at bb.max[1]=4.366m → agents stuck at Y≈4.796m forever.
              //
              // MATHEMATICAL PROOF (early_toddler):
              //   settleBodyCentreY = 0.1693+0.05+0.41 = 0.629m (correct)
              //   IF shelf top at Y=1.2m → currentFloorY=1.2 → targetY=1.63 → TELEPORT
              //   IF closet top at Y=1.8m → currentFloorY=1.8 → targetY=2.23 → TELEPORT
              //   Ceiling at 4.366m → currentFloorY=4.366 → targetY=4.796 → STUCK ✗
              //
              // FIX STRATEGY:
              //   (A) Clamp currentFloorY to [simFloorY−0.05, simFloorY+maxStepH]
              //       so furniture tops are never mistaken for floor.
              //   (B) Replace the upward-only teleport with a bilateral floor clamp:
              //       - Anti-fall-through: if feet < simFloorY → push UP
              //       - Anti-ceiling:      if body  > ceilMax  → push DOWN to floor
              //   (C) Use DIRECT floor Y (simFloorY) for the ground snap, not furniture Y.
              // ─────────────────────────────────────────────────────────────────

              const agentFootY  = pos.y - agentHalfH;
              const floorSurface = simFloorY;                     // validated actual floor Y
              const floorBodyY   = floorSurface + agentHalfH + 0.02;  // body centre on floor

              // (A) Anti-fall-through: feet went below actual floor (tunnelled) → snap up
              if (agentFootY < floorSurface - 0.05) {
                agent.setSafeTranslation({ x: pos.x, y: floorBodyY, z: pos.z });
                if (agent._vertVel !== undefined) agent._vertVel = 0;
              }

              // [BUG-BC FIX] _vertVel tích lũy đến -20 m/s dù agent đang đứng trên sàn.
              // Root cause: 10 frames đầu grounded=false (KCC chưa có computedGrounded từ trước)
              // → _vertVel = -9.81*dt mỗi frame → sau 60 frames không detect ground = -20 m/s.
              // Khi _vertVel = -20: desired.y = -0.333m/frame → KCC dùng hết collision budget
              // chống lực đẩy xuống → corrected.x/z = 0 → agent freeze hoàn toàn.
              // 
              // Fix: nếu agent đang ở gần sàn đúng (feetY trong ±0.15m của simFloorY)
              // → reset _vertVel về 0. Đây là safety net cho trường hợp KCC không detect ground.
              if (agent._vertVel !== undefined && agent._vertVel < -1.0) {
                const feetAboveFloor = agentFootY - floorSurface;
                if (feetAboveFloor >= -0.15 && feetAboveFloor <= 0.30) {
                  // Agent đang gần sàn → _vertVel tích lũy là false negative, reset
                  agent._vertVel = 0;
                }
              }

              // (B) Anti-ceiling: body rose above max reasonable altitude → snap back to floor
              const roomHeight = _roomHeight;  // [PERF-FIX-8] cached
              const maxBodyAlt = floorSurface + agentHalfH + roomHeight * 0.80;
              if (pos.y > maxBodyAlt) {
                console.warn(
                  `[SIM] Agent ${agent.id} ceiling-escape Y=${pos.y.toFixed(3)} ` +
                  `(max=${maxBodyAlt.toFixed(3)}) → reset to floor`
                );
                agent.setSafeTranslation({ x: pos.x, y: floorBodyY, z: pos.z });
                if (agent._vertVel !== undefined) agent._vertVel = 0;
                agent.fallState = null;
                agent.state = 'IDLE';
                if (agent.currentBehavior && ['climb_on','climb','climb_approach',
                    'climb_reach','climb_pull','climb_mount'].includes(agent.currentBehavior.action)) {
                  agent.currentBehavior.completed = true;
                  agent.currentBehavior = null;
                }
              }

              // (C) Floor tracking — [PERF-FIX-2] Cache getCurrentFloorY
              // Old: castRay mỗi frame (18,000 lần cho 10 agents × 1800 steps).
              // Mỗi castRay xuyên qua 25 trimesh = O(triangles) × 25 → bottleneck.
              // Agent đi trên sàn phẳng → floorY hầu như không thay đổi.
              // Fix: chỉ raycast khi (a) agent di chuyển >0.3m so với lần cast trước,
              //      hoặc (b) chưa có cache, hoặc (c) mỗi 60 frames (1s) như safety net.
              // Giảm số raycast từ 18,000 → ~500 (tiết kiệm ~95%).
              let currentFloorY;
              {
                const px = pos.x, pz = pos.z;
                const lastP  = agent._floorCachePos;
                const movedFar = !lastP || Math.hypot(px - lastP[0], pz - lastP[1]) > 0.3;
                const timedOut = !agent._floorCacheFrame || (step - agent._floorCacheFrame) >= 60;

                if (movedFar || timedOut) {
                  const rawFloorY = getCurrentFloorY(
                    world, pos.y, agentHalfH, px, pz, simFloorY, agent.body
                  );
                  const clampedFloorY = Math.min(
                    Math.max(rawFloorY, simFloorY - 0.05),
                    simFloorY + 0.30
                  );
                  agent._cachedFloorY   = clampedFloorY;
                  agent._floorCachePos  = [px, pz];
                  agent._floorCacheFrame = step;
                }
                currentFloorY = agent._cachedFloorY ?? simFloorY;
              }

              if (agent.state === 'MOVING' && Math.abs(currentFloorY - agent._knownFloorY) > 0.02) {
                agent._knownFloorY = currentFloorY;
              }

              // Climbing over-height guard (legitimate climb safety)
              const currentAction = agent.currentBehavior?.action || '';
              const isClimbing    = ['climb_on', 'climb', 'climb_approach', 'climb_reach',
                                     'climb_pull', 'climb_mount', 'step_up'].includes(currentAction);
              if (isClimbing && pos.y > floorSurface + agentHalfH + ageGroup.height + 1.5) {
                agent.setSafeTranslation({ x: pos.x, y: floorBodyY, z: pos.z });
                agent.fallState = null;
                agent.state = 'IDLE';
                if (agent.currentBehavior) agent.currentBehavior.completed = true;
              }
            }

            agent.update(deltaTime, colliders, [agent], sceneData.boundingBox);
            physicsEngine.step(world, deltaTime, eventQueue);

            // ── [TOPPLE PREDICTION COLLECTION] ──────────────────────────────
            // Sau mỗi agent.update(), kiểm tra xem agent có topple result mới không.
            // _lastToppleResult được set trong executeAction('push'/'pull') của agent.
            if (agent._lastToppleResult && agent._lastToppleResult.canTopple) {
              const tr = agent._lastToppleResult;
              if (!agent._reportedToppleIds) agent._reportedToppleIds = new Set();

              // Chỉ báo cáo mỗi object một lần để tránh spam
              if (!agent._reportedToppleIds.has(tr.objectId)) {
                agent._reportedToppleIds.add(tr.objectId);

                const evt = tr.asCollisionEvent;
                if (evt) {
                  collisionEvents.push({
                    time:            step * deltaTime,
                    agentId:         agent.id,
                    objectId:        evt.objectId,
                    objectName:      evt.objectName,
                    position:        evt.position || agent.getPosition(),
                    normal:          [0, 1, 0],
                    velocity:        0,
                    velocityVector:  [0, 0, 0],
                    impactSpeed:     0,
                    bodyPart:        tr.agentInjury?.bodyPart || 'torso',
                    agentFeetY:      agent.getPosition()[1],
                    agentPeakY:      null,
                    isFalling:       false,
                    isPrediction:    true,
                    objectMass:      evt.objectMass,
                    objectHeight:    evt.objectHeight,
                    dangerZone:      tr.fallZone?.dangerZone || null,
                    dangerZoneRadius: evt.dangerZoneRadius,
                    toppleRatio:     tr.toppleRatio,
                    objectDangerLevel: tr.objectDangerLevel,
                    recommendations: tr.recommendations || [],
                    injury:          tr.agentInjury || { injuryScore: 0, gForce: 0, riskTier: 'safe', gForceTier: 'Observe' },
                  });
                  validContacts++;
                }
              }
              agent._lastToppleResult = null; // reset sau khi đã collect
            }

            // [PERF-FIX-4] Debug log đã disabled — console.log trong tight loop
            // gây I/O blocking đáng kể. Uncomment để debug khi cần.
            // if (step < 10 && allAgents.length > 0 && agent.id === allAgents[0].id) {
            //   const pos = agent.body.translation();
            //   console.log(`[SPAWN JITTER DEBUG] Frame ${step}: Agent0 Y=${pos.y.toFixed(5)}, grounded=${physicsEngine.isGrounded(agent.controller)}`);
            // }

            // Warmup: bỏ qua 30 bước đầu
            if (step < 30) {
              eventQueue.drainCollisionEvents(() => {});
              if (typeof eventQueue.drainIntersectionEvents === 'function') {
                eventQueue.drainIntersectionEvents(() => {});
              }
              continue;
            }

            // Va chạm cứng
            eventQueue.drainCollisionEvents((handle1, handle2, started) => {
              try {
                if (!started) return;
                contactCandidates++;

                const agent1    = handleToAgent.get(handle1);
                const agent2    = handleToAgent.get(handle2);
                const collider1 = handleToCollider.get(handle1);
                const collider2 = handleToCollider.get(handle2);
                const hitAgent  = agent1 || agent2;
                const staticObj = collider1 || collider2;

                if (isFloor(collider1) || isFloor(collider2)) { dbg_isFloor++; return; }

                if (!hitAgent || !staticObj) {
                  dbg_noMatch++;
                  traceLog.push(`NO_MATCH h1=${handle1} h2=${handle2}`);
                  return;
                }

                if (staticObj.isSoft) {
                  hitAgent.handleIntersection(staticObj);
                  dbg_softIntersections++;
                  return;
                }

                const agentHandle = (hitAgent === agent1) ? handle1 : handle2;
                const hitBodyPart = handleToBodyPart.get(agentHandle) || 'unknown';

                const agentCollider = (() => {
                  if (!hitAgent.colliders) return null;
                  const h = (hitAgent === agent1) ? handle1 : handle2;
                  if (hitAgent.colliders.head?.handle  === h) return hitAgent.colliders.head;
                  if (hitAgent.colliders.torso?.handle === h) return hitAgent.colliders.torso;
                  if (hitAgent.colliders.legs?.handle  === h) return hitAgent.colliders.legs;
                  return null;
                })();

                if (!agentCollider) { dbg_noMatch++; return; }

                // [BUG-CONTACT FIX] staticObj.collider luôn là colliders[0] của compound OBB.
                // Nhưng event được fire với handle của sub-collider thực sự va chạm (có thể là colliders[1], [2]...).
                // world.contactPair(agentCollider, staticObj.collider) → miss nếu va chạm ở sub-collider khác.
                // Fix: dùng world.getCollider(staticHandle) để lấy đúng collider đang va chạm.
                const staticHandle = (hitAgent === agent1) ? handle2 : handle1;
                let actualStaticCollider = staticObj.collider;
                try {
                  const rawColl = world.getCollider(staticHandle);
                  if (rawColl) actualStaticCollider = rawColl;
                } catch (_) {}

                const contactPointData = physicsEngine.getContactPoint(world, agentCollider, actualStaticCollider);
                if (!contactPointData) { dbg_noContact++; return; }

                const { position: contactPoint, normal: contactNormal } = contactPointData;
                if (!validateContactPoint(contactPoint, sceneData.boundingBox)) { dbg_outOfBounds++; return; }

                let agentVelMagnitude = hitAgent.getVelocity();

                // [VEL-FIX] getVelocity() dùng EMA - có thể gần 0 ngay sau khi bắt đầu di chuyển.
                // Nếu agent đang MOVING nhưng velocity đo được thấp → dùng intended speed.
                // Cũng fallback nếu stuckCounter cao (agent đang cố thoát khỏi obstacle).
                if (agentVelMagnitude < 0.05 && hitAgent.state === 'MOVING') {
                  const intendedSpeed = hitAgent.getRealisticVelocity(
                    hitAgent.currentBehavior?.action || hitAgent.currentBehavior?.type || 'walk'
                  );
                  agentVelMagnitude = Math.max(agentVelMagnitude, intendedSpeed * 0.5);
                }

                if (contactNormal && agentVelMagnitude > 0) {
                  const { velocity: [vx, vy, vz] } = hitAgent;
                  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
                  const dot   = Math.abs(
                    (vx / speed) * contactNormal[0] +
                    (vy / speed) * contactNormal[1] +
                    (vz / speed) * contactNormal[2]
                  );
                  agentVelMagnitude *= (0.3 + 0.7 * dot);
                }

                const stateMultiplier = hitAgent.state === 'INTERACTING'
                  ? (1.0 + Math.random() * 0.5)
                  : 1.0;
                agentVelMagnitude *= stateMultiplier;

                if (hitAgent.state !== 'FALLING') {
                  const _ageProfile = hitAgent._ageProfile;
                  let topSpeed;
                  if (_ageProfile?.velocityProfile) {
                    const vp = _ageProfile.velocityProfile;
                    topSpeed = (vp.run ?? vp.walk ?? vp.crawl)?.mean ?? hitAgent.getRealisticVelocity('run');
                  } else {
                    topSpeed = hitAgent.getRealisticVelocity('run');
                  }
                  if (agentVelMagnitude > topSpeed * 1.2) {
                    agentVelMagnitude = topSpeed * 1.2;
                  }
                }

                // [THRESHOLD-FIX] Hạ từ 0.001 → 0.0001: đảm bảo ngay cả va chạm chậm
                // (crawl 0.15 m/s × dot 0.3 × stateMultiplier = 0.045) vẫn được ghi nhận.
                if (agentVelMagnitude < 0.0001) return;

                validContacts++;
                traceLog.push(`VALID agent=${hitAgent.id} obj=${staticObj.id} vel=${agentVelMagnitude.toFixed(3)}`);

                // [BUG-INJ-1 support] agentFeetY cho determineBodyPart chính xác
                const agentBodyCentreY = hitAgent.body ? hitAgent.body.translation().y : (hitAgent.spawnY + ageGroup.height / 2);
                const agentFeetY       = physicsEngine.getFeetY(agentBodyCentreY, ageGroup.height);
                const agentPeakY       = (hitAgent.fallState?.peakY != null) ? hitAgent.fallState.peakY : null;

                collisionEvents.push({
                  time:           step * deltaTime,
                  agentId:        hitAgent.id,
                  objectId:       staticObj.id,
                  objectName:     staticObj.name || staticObj.id,
                  position:       contactPoint,
                  normal:         contactNormal,
                  velocity:       agentVelMagnitude,
                  velocityVector: hitAgent.getVelocityVector(),
                  impactSpeed:    agentVelMagnitude,
                  bodyPart:       hitBodyPart,
                  agentFeetY,
                  agentPeakY,
                  // [BUG-INJ-7 FIX] isFalling: include all actual fall events
                  // hitAgent.state is IDLE/MOVING/INTERACTING — 'FALLING' is not valid.
                  // Check: fallState !== null (agent is physically falling via gravity)
                  //     OR current action is a fall-type action
                  isFalling: (hitAgent.fallState !== null) ||
                    ['falling', 'free_fall', 'fall_forward'].includes(
                      hitAgent.currentBehavior?.action ?? ''
                    ),
                });

                hitAgent.handleCollision(contactNormal, agentVelMagnitude * 15, staticObj.id);

              } catch (err) {
                traceLog.push(`COL_ERR h1=${handle1} h2=${handle2}: ${err.message}`);
              }
            });

            // Va chạm mềm / sensor
            if (typeof eventQueue.drainIntersectionEvents === 'function') {
              eventQueue.drainIntersectionEvents((handle1, handle2, intersecting) => {
                try {
                  if (!intersecting) return;

                  // Hand sensors first
                  const handSide = handSensorHandles?.get(handle1) || handSensorHandles?.get(handle2);
                  if (handSide) {
                    const hitAgent       = handleToAgent.get(handle1) || handleToAgent.get(handle2);
                    const sceneObjHandle = handSensorHandles?.has(handle1) ? handle2 : handle1;
                    const sceneObj       = handleToCollider.get(sceneObjHandle);
                    if (hitAgent && sceneObj) {
                      hitAgent.handleHandSensorIntersection(handSide, sceneObj);
                    }
                    return;
                  }

                  const agent1    = handleToAgent.get(handle1);
                  const agent2    = handleToAgent.get(handle2);
                  const collider1 = handleToCollider.get(handle1);
                  const collider2 = handleToCollider.get(handle2);
                  const hitAgent  = agent1 || agent2;
                  const staticObj = collider1 || collider2;

                  if (!hitAgent || !staticObj || !staticObj.isSoft) return;

                  hitAgent.handleIntersection(staticObj);
                  dbg_softIntersections++;

                  if (step % 30 === 0) {
                    const agentVelMagnitude = hitAgent.getVelocity();
                    if (agentVelMagnitude > 0.1) {
                      validContacts++;
                      const agentBodyCentreY2 = hitAgent.body
                        ? hitAgent.body.translation().y
                        : (hitAgent.spawnY + ageGroup.height / 2);
                      collisionEvents.push({
                        time:              step * deltaTime,
                        agentId:           hitAgent.id,
                        objectId:          staticObj.id,
                        objectName:        staticObj.name || staticObj.id,
                        position:          hitAgent.getPosition(),
                        normal:            [0, 1, 0],
                        velocity:          agentVelMagnitude,
                        velocityVector:    hitAgent.getVelocityVector(),
                        impactSpeed:       agentVelMagnitude,
                        bodyPart:          'torso',
                        agentFeetY:        physicsEngine.getFeetY(agentBodyCentreY2, ageGroup.height),
                        agentPeakY:        null,
                        isFalling:         false,
                        isSoftInteraction: true,
                        injury: { injuryScore: 0, gForce: 0, riskTier: 'safe', gForceTier: 'Observe' },
                      });
                    }
                  }
                } catch (err) {
                  traceLog.push(`INT_ERR h1=${handle1} h2=${handle2}: ${err.message}`);
                }
              });
            }
          } // end for simWorlds

          // [PERF-FIX-7] Giảm progress update từ mỗi 10 steps → mỗi 60 steps (1s sim-time).
          // Old: mỗi 10 steps tạo array positions mới cho 10 agents = 10,800 object allocations.
          // GC pressure từ allocations nhỏ lặp lại liên tục làm chậm Node.js đáng kể.
          if (step % 60 === 0) {
            const entry = activeSimulations.get(simulationId) || {};
            entry.progress = Math.round((step / totalSteps) * 100);
            entry.agentPositions = allAgents.map(a => {
              const pos = a.getPosition();
              let posArray = [0, 0, 0];
              if (Array.isArray(pos) && pos.length >= 3) {
                posArray = [pos[0], pos[1], pos[2]];
              } else if (pos && typeof pos === 'object') {
                posArray = [pos.x || 0, pos.y || 0, pos.z || 0];
              }
              return { agentId: a.id, ageGroupId: a.ageGroupId, position: posArray };
            });
            entry.collisionEventsCount = collisionEvents.length;
            entry.simTime = (step * deltaTime).toFixed(2);
            activeSimulations.set(simulationId, entry);
          }
        }

        const loopMs = Date.now() - loopStartTime;
        console.log(`[SIM]    ✅ Physics loop complete in ${loopMs}ms (${(loopMs/1000/duration).toFixed(1)}× realtime)`);
        console.log(`[SIM]    Contacts: ${contactCandidates} candidates → ${validContacts} valid`);
        console.log(`[SIM]    Filter breakdown: noMatch=${dbg_noMatch} isFloor=${dbg_isFloor} noContact=${dbg_noContact} outOfBounds=${dbg_outOfBounds}`);
        console.log(`[SIM]    Soft intersections: ${dbg_softIntersections}`);
        if (traceLog.length > 0) {
          console.log(`[SIM]    Trace (last 10): ${traceLog.slice(-10).join(' | ')}`);
        }

        const objectsMap = {};
        sceneData.objects.forEach(obj => { objectsMap[obj.id] = obj; });

        // Tách riêng: physics collisions vs topple predictions
        const physicsCollisions = collisionEvents.filter(e => !e.isSoftInteraction && !e.isPrediction);
        const topplePredictions = collisionEvents.filter(e => e.isPrediction);

        // Tính chấn thương cho physics collisions (velocity-based)
        const injuryAssessments = injuryCalculator.calculateBatchInjuries(
          physicsCollisions,
          ageGroupId,
          objectsMap
        );

        // Topple predictions đã có injury tính sẵn — chỉ cần merge
        // Đảm bảo format nhất quán với physicsCollisions
        const toppleAssessments = topplePredictions.map(e => ({
          ...e,
          injury: e.injury || { injuryScore: 0, gForce: 0, riskTier: 'safe', gForceTier: 'Observe' },
        }));

        const allAssessments = [...injuryAssessments, ...toppleAssessments];
        const summary = injuryCalculator.getInjurySummary(allAssessments);

        console.log(`[SIM]    Topple predictions: ${topplePredictions.length}`);
        console.log(`[SIM]    Physics contacts: ${physicsCollisions.length} events → ${injuryAssessments.length} assessed`);

        const trajectories = allAgents.map(agent => {
          const sampledTraj = agent.getSampledTrajectory(600);
          const agentEvents = allAssessments.filter(e => e.agentId === agent.id);
          const rawLog      = agent.actionLog || [];
          const logStep     = Math.max(1, Math.floor(rawLog.length / 60));
          const sampledLog  = rawLog.filter((_, idx) => idx % logStep === 0).slice(0, 60);
          return {
            agentId:    agent.id,
            ageGroupId: agent.ageGroupId,
            positions:  Array.isArray(sampledTraj) ? sampledTraj : [],
            actionLog:  sampledLog,
            collisions: agentEvents.map(e => e.position || [0, 0, 0]),
            finalState: agent.getStatus(),
          };
        });

        // Hazard events: physics collisions với score >= 15, CỘNG toàn bộ topple predictions
        const hazardEvents = [
          ...injuryAssessments.filter(e => (e.injury && e.injury.injuryScore >= 15) || e.velocity > 0.8),
          ...toppleAssessments,  // topple predictions luôn được báo cáo (đã lọc canTopple=true ở trên)
        ];

        const simulationData = {
          simulationId,
          sceneId,
          ageGroupId,
          config: {
            agentCount, duration,
            ageGroup: ageGroup.name, ageGroupId,
            scaleFactor: sceneData._scaleFactor || 1.0,
            fps: 60,
            floorHeight: confirmedFloorY,
          },
          trajectories,
          collisionEvents: hazardEvents,
          // [TOPPLE] Topple predictions tách riêng để frontend render overlay nguy hiểm
          topplePredictions: toppleAssessments.map(e => ({
            objectId:         e.objectId,
            objectName:       e.objectName,
            objectMass:       e.objectMass,
            objectHeight:     e.objectHeight,
            objectDangerLevel: e.objectDangerLevel,
            dangerZone:       e.dangerZone,
            dangerZoneRadius: e.dangerZoneRadius,
            toppleRatio:      e.toppleRatio,
            position:         e.position,
            injury:           e.injury,
            recommendations:  e.recommendations || [],
            agentId:          e.agentId,
            time:             e.time,
          })),
          summary,
          debugStats: {
            contactCandidates, validContacts, floorHeight,
            softIntersections: dbg_softIntersections,
            topplePredictionsCount: toppleAssessments.length,
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

        // Auto-report
        try {
          const rsi      = injuryCalculator.calculateRoomSafetyIndex(allAssessments);
          const tierDist = summary.tierDistribution || {};

          const objScores = {};
          allAssessments.forEach(evt => {
            const name = evt.objectName || 'Unknown';
            if (!objScores[name]) objScores[name] = { hits: 0, maxScore: 0, totalScore: 0, isPrediction: false };
            objScores[name].hits++;
            objScores[name].maxScore   = Math.max(objScores[name].maxScore, evt.injury?.injuryScore || 0);
            objScores[name].totalScore += (evt.injury?.injuryScore || 0);
            if (evt.isPrediction) objScores[name].isPrediction = true;
          });
          const topHazards = Object.entries(objScores)
            .sort((a, b) => b[1].maxScore - a[1].maxScore)
            .slice(0, 5)
            .map(([name, stats], idx) =>
              `  ${idx + 1}. ${name}${stats.isPrediction ? ' [TOPPLE RISK]' : ''} — ${stats.hits} hits, max score ${stats.maxScore}, avg ${Math.round(stats.totalScore / stats.hits)}`
            )
            .join('\n');

          // Topple summary
          const toppleLines = toppleAssessments.length > 0
            ? toppleAssessments.map(e =>
                `  ⚠️  ${e.objectName} (${e.objectMass}kg, H=${e.objectHeight}m) — ${e.objectDangerLevel?.toUpperCase()} danger, InjuryScore=${e.injury?.injuryScore}`
              ).join('\n')
            : '  (None detected)';

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
            `  Total collisions:   ${physicsCollisions.length}`,
            `  Topple predictions: ${toppleAssessments.length}`,
            `  Soft interactions:  ${dbg_softIntersections}`,
            '',
            '── TOPPLE / TIP-OVER PREDICTIONS ──',
            toppleLines,
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

        for (const sim of simWorlds) {
          await cleanupSimulation(sim.world, [sim.agent], sim.colliders);
        }

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
        restoreMathRandom();
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
          success:              true,
          status:               entry.status || 'running',
          progress:             typeof entry.progress === 'number' ? entry.progress : 0,
          startedAt:            entry.startedAt || null,
          error:                entry.error || null,
          agentPositions:       entry.agentPositions || null,
          collisionEventsCount: entry.collisionEventsCount || 0,
          simTime:              entry.simTime || null,
          scaleFactor:          entry.scaleFactor || 1.0,
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
      config:        simulationData.config || { fps: 60, duration: 30 },
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
      const sceneDataJ = JSON.parse(sceneRaw);
      (sceneDataJ.objects || []).forEach(obj => { sceneObjects[obj.id] = obj; });
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

      const intensity   = Math.max(0, Math.min(1.0, maxScore / 80));
      const heatColor   = scoreToRGB(maxScore) || [0, 1, 0];
      const sceneObj    = sceneObjects[objId];
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
      success:         true,
      simulationId,
      heatmap:         objectHeatmap,
      roomSafetyIndex: rsi,
      zoneAnalysis,
      stats: {
        totalEvents:      events.length,
        uniqueObjectsHit: objectMap.size,
        duration:         simulationData.config?.duration || 10,
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
    safe:     zones.filter(z => z.classification === 'safe').length,
    caution:  zones.filter(z => z.classification === 'caution').length,
    hazard:   zones.filter(z => z.classification === 'hazard').length,
    danger:   zones.filter(z => z.classification === 'danger').length,
    gridSize: GRID_SIZE,
  };

  return { zones, summary };
}

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