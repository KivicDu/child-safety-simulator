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

// Xóa các simulation đã hoàn thành hoặc bị treo sau 1 giờ để tránh memory leak
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
// Lấy Y mặt sàn tại vị trí XZ hiện tại của agent bằng raycast xuống.
// Dùng mỗi physics frame để cập nhật floor Y chính xác khi agent di chuyển.
//
// [FIX BOUNCE]: Ray PHẢI bắn từ đỉnh đầu agent (bodyCentreY + halfH + 0.5m).
// Bắn từ giữa người → ray xuất phát BÊN TRONG body → hit leg collider trước
// → hitY ≈ feetY → targetY sai vài cm → clamp push up/down → bounce.
function getCurrentFloorY(world, bodyCentreY, agentHalfH, xPos, zPos, sceneFloorHeight, agentBodyToIgnore = null) {
  const castFromY = bodyCentreY + agentHalfH + 0.5;    // đỉnh đầu + buffer
  const maxDist   = agentHalfH * 2 + 1.5;              // đủ reach sàn từ trên đầu
  return physicsEngine.getFloorHeightAt(
    world,
    xPos, castFromY, zPos,
    sceneFloorHeight,
    maxDist,
    agentBodyToIgnore
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPAWN HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Tạo danh sách bounding box 2D (XZ) của các đồ vật nổi trên sàn.
// Dùng để loại trừ vùng có đồ vật TRƯỚC KHI random XZ, tránh thử ngẫu nhiên
// vào giữa giường/bàn/ghế rồi mới bị reject bởi physics check.
function buildFurnitureExclusionZones(sceneObjects, floorHeight, padding) {
  if (!sceneObjects || !sceneObjects.length) return [];
  return sceneObjects
    .filter(obj => {
      if (!obj.boundingBox) return false;
      const { min, max } = obj.boundingBox;
      const objHeight = max[1] - min[1];
      // Chỉ loại trừ đồ vật CHẠM SÀN thật sự:
      //   - Chân đồ vật (min[1]) phải nằm trong vòng 40cm so với sàn
      //     → loại bỏ tranh treo tường, kệ cao, đèn trần không chạm sàn
      //   - Mặt trên (max[1]) phải cao hơn sàn ít nhất 10cm → có thể chặn agent
      //   - Độ dày tối thiểu 10cm → không phải mặt phẳng mỏng (rug/thảm)
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

// Kiểm tra một điểm XZ có nằm trong vùng đồ vật không.
function isInsideExclusionZone(x, z, zones) {
  return zones.some(zone => x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ);
}

// Sinh điểm XZ ngẫu nhiên trong phòng, tránh vùng đồ vật đã biết.
// Trả về null nếu không tìm được điểm hợp lệ sau maxTries lần thử.
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
  // Nếu tất cả lần thử đều rơi vào đồ vật, trả về null để fallback tiếp theo xử lý
  return null;
}

// Pre-compute lưới các ô XZ đi được (không bị che bởi đồ vật).
// Chạy 1 lần trước spawn loop. Mỗi ô được verify bằng downward raycast thật.
function buildWalkableGrid(world, bb, floorHeight, agentHeight, capsuleRadius,
                           handleToCollider, isFloor, rapier) {
  // [BUG-13 FIX] Old: hardcoded 0.35m step → for small rooms (~3m) this gave only
  // ~8 cells/dimension, missing narrow walkways. For large rooms (>20m) it was fine.
  // Fix: scale step to roomDiameter/60 (min 0.2m, max 0.5m).
  const _bbDiag = bb ? Math.hypot(bb.max[0]-bb.min[0], bb.max[2]-bb.min[2]) : 10;
  const GRID_STEP  = Math.max(0.2, Math.min(0.5, _bbDiag / 60));
  const margin     = capsuleRadius * 2;
  const castFromY  = floorHeight + agentHeight + 0.5;
  const walkable   = [];

  for (let x = bb.min[0] + margin; x <= bb.max[0] - margin; x += GRID_STEP) {
    for (let z = bb.min[2] + margin; z <= bb.max[2] - margin; z += GRID_STEP) {
      const ray = new rapier.Ray({ x, y: castFromY, z }, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(ray, agentHeight + 1.5, true);

      if (!hit) {
        // Không có gì cả → sàn trống, đi được
        walkable.push({ x, z });
        continue;
      }

      const meta = handleToCollider.get(hit.colliderHandle);
      const toi  = hit.toi ?? hit.timeOfImpact;
      const hitY = castFromY - toi;

      // [FIX CEILING BUG] Ceiling guard: chỉ accept hit nằm trong khoảng sàn hợp lệ.
      // [BUG-04 FIX] Old: MAX_VALID_FLOOR_Y = floorHeight + 1.0m hardcoded.
      // Rooms > 3m tall have multi-level furniture (bunk beds, lofts, climbing frames)
      // with legitimate surface heights 1.0–1.5m above floor → grid incorrectly
      // excluded them. Fix: scale threshold to 35% of room height (min 1.0m).
      const sceneRoomHeight = (world._bb?.max?.[1] ?? bb?.max?.[1] ?? floorHeight + 3.0) - floorHeight;
      const MAX_VALID_FLOOR_Y = floorHeight + Math.max(1.0, sceneRoomHeight * 0.35);
      if (hitY > MAX_VALID_FLOOR_Y) continue;

      // Chỉ thêm vào walkable nếu tia chạm sàn thật (không phải mặt trên đồ vật)
      if (isFloor(meta) || Math.abs(hitY - floorHeight) < 0.06) {
        walkable.push({ x, z });
      }
    }
  }

  console.log(`[SPAWN] Walkable grid built: ${walkable.length} cells (step=${GRID_STEP}m)`);
  return walkable;
}

// Thực hiện collision check đầy đủ tại một điểm XZ:
//   Bước 1: Downward raycast → xác nhận bề mặt bên dưới là sàn thật
//   Bước 2: Multi-part sweep → kiểm tra toàn thân agent không bị đồ vật xuyên qua
//   Bước 3: Ankle-level sphere → bắt đồ vật thấp bị bước 2 bỏ sót
// Trả về { valid: bool, actualFloorY: number }
function checkSpawnPoint(x, z, world, floorHeight, agentHeight, capsuleRadius,
                          ageGroup, handleToCollider, isFloor, rapier) {
  const castFromY = floorHeight + agentHeight + 0.5;

  // Bước 1: Raycast xuống kiểm tra bề mặt
  const ray = new rapier.Ray({ x, y: castFromY, z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, agentHeight + 1.5, true);
  let actualFloorY = floorHeight;

  if (hit) {
    const hitMeta = handleToCollider.get(hit.colliderHandle);
    const toi     = hit.toi ?? hit.timeOfImpact;
    const hitY    = castFromY - toi;

    // [FIX CEILING BUG] Ceiling guard: hitY không được vượt quá floorHeight + X m.
    // [BUG-04 FIX] Scale threshold to 35% of room height (min 1.0m) — same logic as
    // buildWalkableGrid, to avoid rejecting legitimate high-surface spawn points.
    const _spawnRoomH = (sceneData?.boundingBox?.max?.[1] ?? floorHeight + 3.0) - floorHeight;
    const MAX_VALID_FLOOR_Y = floorHeight + Math.max(1.0, _spawnRoomH * 0.35);
    if (hitY > MAX_VALID_FLOOR_Y) {
      // Hit là trần hoặc bề mặt cao bất thường → từ chối điểm này
      return { valid: false, actualFloorY: floorHeight };
    }

    if (isFloor(hitMeta) || Math.abs(hitY - floorHeight) < 0.06) {
      actualFloorY = hitY; // sàn thật → ghi nhận Y chính xác
    } else {
      return { valid: false, actualFloorY: floorHeight }; // đồ vật bên trên → từ chối
    }
  }

  // Bước 2: Multi-part body sweep
  const spawnBodyCenterY = actualFloorY + (agentHeight / 2);
  const spawnRot         = { w: 1.0, x: 0.0, y: 0.0, z: 0.0 };
  const spawnShapes      = physicsEngine.getAgentSpawnShapes(agentHeight, capsuleRadius, ageGroup.anthropometry || null);
  let isBlocked = false;

  for (const part of spawnShapes) {
    if (isBlocked) break;
    const partCenterY    = spawnBodyCenterY + part.centerOffsetY;
    const paddedParams   = [...part.params];
    paddedParams[paddedParams.length - 1] *= 1.15; // inflate radius 15% để có safety margin
    const checkPos = { x, y: partCenterY, z };
    const shape = part.shape === rapier.Ball
      ? new rapier.Ball(paddedParams[0])
      : new rapier.Capsule(paddedParams[0], paddedParams[1]);

    world.intersectionsWithShape(checkPos, spawnRot, shape, (handle) => {
      const meta = handleToCollider.get(handle);
      if (!meta || isFloor(meta) || meta.type === 'wall' || meta.id === 'boundary_wall') return true;
      isBlocked = true;
      return false;
    });
  }

  // Bước 3: Ankle sphere — bắt đồ vật ngắn bị bỏ sót ở bước 2
  if (!isBlocked) {
    const anklePos   = { x, y: actualFloorY + capsuleRadius + 0.05, z };
    const ankleShape = new rapier.Ball(capsuleRadius * 1.15);
    world.intersectionsWithShape(anklePos, spawnRot, ankleShape, (handle) => {
      const meta = handleToCollider.get(handle);
      if (!meta || isFloor(meta) || meta.type === 'wall' || meta.id === 'boundary_wall') return true;
      isBlocked = true;
      return false;
    });
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

    // Tự động đánh dấu lỗi nếu simulation chạy quá lâu
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

    // Chạy simulation bất đồng bộ để không block HTTP response
    (async () => {
      // ── [Phase 8] Deterministic Simulation Mode ──
      initDeterministicMath(simulationSeed);

      const startTime = Date.now();

      try {
        console.log(`[SIM] ──────────────────────────────────────────`);
        console.log(`[SIM] 🚀 Starting simulation ${simulationId}`);
        console.log(`[SIM]    Scene: ${sceneId}, Agents: ${agentCount}, Duration: ${duration}s, Age: ${ageGroupId}, Seed: ${simulationSeed}`);

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

        // Backward compatibility for old scenes
        let scaleFactor = sceneData._scaleFactor;
        if (!scaleFactor) {
          const scaleInfo = scaleAuthority.detectScale(sceneData);
          scaleFactor = scaleInfo.factor;
        }
        applyScaleToSceneData(sceneData, scaleFactor);
        const simEntry = activeSimulations.get(simulationId);
        if (simEntry) {
          simEntry.scaleFactor = sceneData._scaleFactor || 1.0;
          activeSimulations.set(simulationId, simEntry);
        }

        // Step 2: Physics engine
        console.log(`[SIM] Step 2/5: Initializing physics engine...`);
        await physicsEngine.init();
        console.log(`[SIM]    ✅ Physics engine ready`);

        const ageGroup    = getAgeGroup(ageGroupId);
        const floorHeight = (sceneData.floor && typeof sceneData.floor.height === 'number')
          ? sceneData.floor.height
          : (sceneData.boundingBox ? sceneData.boundingBox.min[1] : 0);

        console.log(`[SIM START] Floor Height: ${floorHeight.toFixed(4)}`);

        // Xác định một collider có phải là sàn/thảm/mặt phẳng đi được không.
        // Dùng kết hợp: type, tên object, và vị trí bounding box so với floorHeight.
        const isFloor = (c) => {
          if (!c) return false;
          if (c.type === 'floor') return true;
          // Explicit ceiling/roof/wall type → không bao giờ là sàn
          if (c.type === 'ceiling' || c.type === 'roof') return false;

          const n = (c.name || c.id || '').toLowerCase();

          // [FIX CEILING BUG] Loại trừ trần/tường TRƯỚC khi check pattern sàn.
          // Không làm bước này: "ceiling_plane", "ceiling_surface" khớp /plane|surface/
          // → isFloor() = true cho TRẦN → agent spawn lơ lửng ở trên trần nhà.
          if (/ceiling|plafond|decke|plafon|soffitto|techo|roof|dach/.test(n)) return false;
          if (/^wall|[_\s]wall|wallpaper|wand|muro|pared/.test(n)) return false;

          if (/rug|carpet|mat($|[_\s])/.test(n)) return true;
          if (/floor|vloer|ground|plane|grond|surface/.test(n)) {
            return !/lamp|desk|table|chair|stand|fan|mirror|shelf|cabinet|top|stool|bench|bed|sofa|couch|mattress/.test(n);
          }

          if (c.boundingBox) {
            const objHeight = c.boundingBox.max[1] - c.boundingBox.min[1];
            // Object có mặt trên nằm sát floorHeight → coi là sàn (kể cả sàn dày)
            if (c.boundingBox.max[1] <= floorHeight + 0.12) return true;
            // Thảm mỏng nằm ngay trên sàn → cũng coi là sàn
            if (objHeight <= 0.15 && c.boundingBox.max[1] <= floorHeight + 0.25) return true;

            // [BUG-07 FIX] Geometry-based fallback for non-English GLB mesh names
            // (e.g. Japanese/Chinese/Vietnamese room exports: 床, nền nhà, Boden, etc.)
            // An object is floor-like if:
            //   1. It is very flat  (height < 10cm) AND
            //   2. Its centroid is near floorHeight (within 20cm) AND
            //   3. Its horizontal footprint is large relative to the room
            const bb = sceneData.boundingBox;
            if (bb && objHeight < 0.10) {
              const centroidY = (c.boundingBox.min[1] + c.boundingBox.max[1]) / 2;
              const xSpan = c.boundingBox.max[0] - c.boundingBox.min[0];
              const zSpan = c.boundingBox.max[2] - c.boundingBox.min[2];
              const roomXSpan = bb.max[0] - bb.min[0];
              const roomZSpan = bb.max[2] - bb.min[2];
              const coverRatio = (xSpan / Math.max(roomXSpan, 0.01)) *
                                 (zSpan / Math.max(roomZSpan, 0.01));
              if (Math.abs(centroidY - floorHeight) < 0.20 && coverRatio > 0.25) return true;
            }
          }

          return false;
        };

        // Mỗi agent chạy trong một physics world riêng biệt để tránh tương tác lẫn nhau
        console.log(`[SIM] Step 3/5: Creating ${agentCount} independent worlds...`);
        const bb = sceneData.boundingBox;
        const simWorlds = [];
        const allAgents = [];

        for (let i = 0; i < agentCount; i++) {
          const world     = physicsEngine.createWorld();
          const colliders = colliderGenerator.generateCollidersFromScene(sceneData, world, physicsEngine);

          // [FIX BOUNCE A]: Explicit floor collider.
          // KCC enableSnapToGround cần collider ngay dưới agent để snap.
          // Nhiều GLB không export floor mesh thành physics collider → agent drift xuống → bounce.
          // [FIX CEILING BUG — Bug phụ 2]: Lưu handle vào handleToCollider với type='floor'.
          // Nếu không đăng ký: hitMeta = undefined → isFloor() = false → spawn check
          // bỏ qua sàn này → có thể dẫn đến last-resort bắn ray hit trần nhà.
          let explicitFloorHandle = null;
          {
            const fDesc = physicsEngine.rapier.RigidBodyDesc.fixed()
              .setTranslation(0, floorHeight - 0.05, 0);
            const fBody = world.createRigidBody(fDesc);
            const fColl = world.createCollider(
              physicsEngine.rapier.ColliderDesc.cuboid(100, 0.05, 100)
                .setFriction(0.9)
                .setRestitution(0.0)
                .setCollisionGroups(0x00010001),
              fBody
            );
            explicitFloorHandle = fColl.handle;
          }

          // Step physics 1 lần để ổn định handle trước khi build map.
          // deltaTime=0 gây NaN nên dùng default step.
          physicsEngine.step(world);

          const handleToCollider = new Map();
          colliders.forEach(c => {
            if (c.collidersArr) {
              c.collidersArr.forEach(coll => handleToCollider.set(coll.handle, c));
            } else if (c.collider) {
              handleToCollider.set(c.collider.handle, c);
            }
          });

          // Đăng ký explicit floor collider sau khi map đã được build
          if (explicitFloorHandle !== null) {
            handleToCollider.set(explicitFloorHandle, {
              type:        'floor',
              id:          'explicit_floor',
              name:        'floor',
              boundingBox: { min: [-100, floorHeight - 0.1, -100], max: [100, floorHeight, 100] },
              isSoft:      false,
            });
          }

          // Thêm tường vô hình bao quanh phòng để agent không đi ra ngoài
          if (bb) {
            const wallHeight    = 3.0;
            const wallThickness = 0.2;
            const cx  = (bb.min[0] + bb.max[0]) / 2;
            const cz  = (bb.min[2] + bb.max[2]) / 2;
            const sx  = (bb.max[0] - bb.min[0]) / 2;
            const sz  = (bb.max[2] - bb.min[2]) / 2;
            const wallY = floorHeight + wallHeight / 2;

            const walls = [
              { x: bb.max[0] + wallThickness, y: wallY, z: cz,  hx: wallThickness, hy: wallHeight/2, hz: sz + wallThickness },
              { x: bb.min[0] - wallThickness, y: wallY, z: cz,  hx: wallThickness, hy: wallHeight/2, hz: sz + wallThickness },
              { x: cx, y: wallY, z: bb.max[2] + wallThickness,  hx: sx + wallThickness, hy: wallHeight/2, hz: wallThickness },
              { x: cx, y: wallY, z: bb.min[2] - wallThickness,  hx: sx + wallThickness, hy: wallHeight/2, hz: wallThickness },
            ];
            for (const w of walls) {
              const desc = physicsEngine.rapier.RigidBodyDesc.fixed().setTranslation(w.x, w.y, w.z);
              const body = world.createRigidBody(desc);
              const wallCollider = world.createCollider(
                physicsEngine.rapier.ColliderDesc.cuboid(w.hx, w.hy, w.hz)
                  .setFriction(0.5)
                  .setCollisionGroups(0x00010001),
                body
              );
              // Đăng ký tường vào map để spawn check không nhầm tường là obstacle
              handleToCollider.set(wallCollider.handle, { type: 'wall', id: 'boundary_wall', name: 'wall', isSoft: false });
            }
          }

          const r = ageGroup.capsuleRadius || 0.15;

          // ── SPAWN STRATEGY ────────────────────────────────────────────────
          // Giai đoạn 1: Pre-filter dựa trên bounding box đồ vật → random XZ nhanh
          // Giai đoạn 2: Physics check đầy đủ tại XZ đã chọn
          // Giai đoạn 3 (fallback): Walkable grid đã pre-compute → đảm bảo tìm được
          // Giai đoạn 4 (last resort): Raycast tại tâm phòng → spawn trên bất kỳ bề mặt nào
          // ─────────────────────────────────────────────────────────────────

          const exclusionZones = buildFurnitureExclusionZones(
            sceneData.objects, floorHeight, r * 0.5  // padding nhỏ hơn — physics check xử lý phần còn lại
          );

          let actualFloorY = floorHeight;
          let spawnPos     = null;
          let validSpawn   = false;

          // Giai đoạn 1+2: 50 lần thử random với pre-filter
          let attempts = 0;
          while (!validSpawn && attempts < 50) {
            attempts++;
            const candidate = getRandomSpawnPosition(
              sceneData.boundingBox, floorHeight, ageGroup, exclusionZones
            );
            if (!candidate) continue; // pre-filter không tìm được điểm sạch, thử lại

            const { valid, actualFloorY: floorY } = checkSpawnPoint(
              candidate[0], candidate[2],
              world, floorHeight, ageGroup.height, r,
              ageGroup, handleToCollider, isFloor, physicsEngine.rapier
            );

            if (valid) {
              spawnPos     = candidate;
              actualFloorY = floorY;
              validSpawn   = true;
            }
          }

          // Giai đoạn 3: Walkable grid fallback — pre-compute toàn bộ ô đi được rồi shuffle
          if (!validSpawn && bb) {
            console.warn(`[SPAWN] ⚠️ Agent ${i}: 50 random attempts failed, trying walkable grid...`);

            const walkableGrid = buildWalkableGrid(
              world, bb, floorHeight, ageGroup.height, r,
              handleToCollider, isFloor, physicsEngine.rapier
            );

            // Shuffle để không phải lúc nào cũng spawn cùng một góc phòng
            walkableGrid.sort(() => Math.random() - 0.5);

            for (const cell of walkableGrid) {
              const { valid, actualFloorY: floorY } = checkSpawnPoint(
                cell.x, cell.z,
                world, floorHeight, ageGroup.height, r,
                ageGroup, handleToCollider, isFloor, physicsEngine.rapier
              );
              if (valid) {
                spawnPos     = [cell.x, floorY, cell.z];
                actualFloorY = floorY;
                validSpawn   = true;
                console.log(`[SPAWN] ✅ Agent ${i}: walkable grid found clear cell at [${cell.x.toFixed(2)}, ${cell.z.toFixed(2)}]`);
                break;
              }
            }
          }

          // Giai đoạn 4: Last resort — raycast tại tâm phòng, spawn trên bất kỳ bề mặt nào.
          // Tại đây ta không còn lựa chọn nào khác, chấp nhận spawn trên đồ vật nếu cần.
          if (!validSpawn) {
            console.warn(`[SPAWN] ⚠️ Agent ${i}: all strategies failed, using center raycast last resort`);
            const cx = bb ? (bb.min[0] + bb.max[0]) / 2 : 0;
            const cz = bb ? (bb.min[2] + bb.max[2]) / 2 : 0;

            // [FIX CEILING BUG — Bug chính]: Ray PHẢI bắn từ GẦN SÀN, KHÔNG từ trên cao.
            //
            // Code cũ: highCastY = floorHeight + 3.5 (thường = ~3.5m, trên cả trần nhà 2.4m)
            // → Ray đi xuống HIT TRẦN TRƯỚC khi đến sàn
            // → actualFloorY = chiều cao trần → agent spawn lơ lửng ở trần nhà
            //
            // Fix: bắn từ floorHeight + 0.5 (ngay trên sàn), maxDist ngắn 1.5m
            // → Ray chỉ có thể hit sàn hoặc đồ vật thấp (không bao giờ hit trần)
            // → Nếu có đồ vật ở giữa phòng, ta cũng chấp nhận mặt đồ vật đó
            const lowCastY  = floorHeight + 0.5;
            const centerRay = new physicsEngine.rapier.Ray(
              { x: cx, y: lowCastY, z: cz },
              { x: 0, y: -1, z: 0 }
            );
            const centerHit = world.castRay(centerRay, 1.5, true);

            if (centerHit) {
              const toi    = centerHit.toi ?? centerHit.timeOfImpact;
              const hitY   = lowCastY - toi;

              // Ceiling guard: hit phải nằm trong khoảng sàn thực tế (≤ floorHeight + 1m).
              // Nếu hitY > floorHeight + 1m → vẫn hit đồ vật cao hoặc tính toán sai → fallback về floorHeight.
              const MAX_SPAWN_SURFACE = floorHeight + 1.0;
              actualFloorY = hitY <= MAX_SPAWN_SURFACE ? hitY : floorHeight;
              console.warn(`[SPAWN] ⚠️ Agent ${i}: center ray hit surface at Y=${hitY.toFixed(4)} → using Y=${actualFloorY.toFixed(4)}`);
            } else {
              // Ray không trúng gì → sàn thật sự trống, dùng floorHeight
              actualFloorY = floorHeight;
              console.warn(`[SPAWN] ⚠️ Agent ${i}: center ray missed → using floorHeight=${actualFloorY.toFixed(4)}`);
            }
            spawnPos = [cx, actualFloorY, cz];
          }

          // [FIX P1] Clearance 0.05 → 0.15m.
          // Report formula: surfaceY + height/2 + 0.15 clearance.
          // 0.05m was insufficient for the 0.04m KCC offset + collision margins on Mesh Hulls.
          // 0.15m ensures a clear air-gap so the KCC `snapToGround` can cleanly attach
          // without triggering an infinite intersection lock on the first frame.
          spawnPos[1] = actualFloorY + 0.15;

          if (i < 3) {
            console.log(`[SPAWN DEBUG] Agent ${i}: floorHeight=${floorHeight.toFixed(4)}, actualFloorY=${actualFloorY.toFixed(4)}, finalY=${spawnPos[1].toFixed(4)}, XZ=[${spawnPos[0].toFixed(2)}, ${spawnPos[2].toFixed(2)}]`);
          }

          const agentBodyObj = physicsEngine.createAgentMultipartCollider(
            world, spawnPos, ageGroup.height, ageGroup.capsuleRadius,
            ageGroup.anthropometry || null
          );

          const agent     = new Agent(i, spawnPos, agentBodyObj.body, ageGroupId, world);
          agent.spawnY    = actualFloorY;
          agent.colliders = agentBodyObj.colliders;
          // agent.collider (singular) dùng bởi KCC — gán tường minh để không bao giờ null
          agent.collider  = agentBodyObj.colliders?.torso ?? agentBodyObj.colliders?.legs ?? null;
          allAgents.push(agent);

          const handleToAgent    = new Map();
          const handleToBodyPart = new Map();
          if (agent.colliders) {
            Object.values(agent.colliders).forEach(c => handleToAgent.set(c.handle, agent));
          }
          if (agentBodyObj.colliders.head)  handleToBodyPart.set(agentBodyObj.colliders.head.handle,  'head');
          if (agentBodyObj.colliders.torso) handleToBodyPart.set(agentBodyObj.colliders.torso.handle, 'torso');
          if (agentBodyObj.colliders.legs)  handleToBodyPart.set(agentBodyObj.colliders.legs.handle,  'legs');

          // [FIX P4] Create hand interaction sensors.
          // Two kinematic sensor spheres (left + right hand) are created here so
          // they share the same Rapier world as the agent. Their positions are
          // updated every frame by agent._updateHandSensors() (called inside
          // agent.update()) BEFORE physicsEngine.step(), so drainIntersectionEvents
          // fires with the hands already in their correct frame position.
          const handSensors = physicsEngine.createHandSensors(
            world,
            ageGroup.height,
            ageGroup.capsuleRadius,
            ageGroup.anthropometry || null
          );
          agent.handSensors = handSensors;

          // Map hand sensor handles → agent (for intersection event routing)
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

          simWorlds.push({ world, agent, colliders, handleToCollider, handleToAgent, handleToBodyPart, handSensorHandles, eventQueue });
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

        for (let step = 0; step < totalSteps; step++) {
          // Nhường event loop mỗi 60 bước để không block Node.js
          if (step > 0 && step % 60 === 0) {
            await new Promise(r => setImmediate(r));
          }

          for (const sim of simWorlds) {
            const { world, agent, colliders, handleToCollider, handleToAgent, handleToBodyPart, handSensorHandles, eventQueue } = sim;

            // [FIX BOUNCE B+C]: Clamp agent Y — CHỈ push UP (ngăn xuyên sàn).
            // KHÔNG push DOWN. KCC + gravity + snap-to-ground xử lý hướng xuống.
            // Push DOWN là nguyên nhân bounce: nếu targetY sai ±2cm,
            // frame A push UP → frame B push DOWN → oscillate vô tận.
            if (agent.body && !agent.fallState) {
              const pos        = agent.body.translation();
              const agentHalfH = ageGroup.height / 2;
              // Gọi với đúng signature mới: (world, bodyCentreY, halfH, x, z, floorHeight, body)
              const currentFloorY = getCurrentFloorY(
                world, pos.y, agentHalfH, pos.x, pos.z, floorHeight, agent.body
              );
              // targetY = body CENTRE khi đứng trên sàn
              const targetY = currentFloorY + agentHalfH + 0.02;

              // CHỈ push UP nếu agent xuyên dưới sàn (tolerance 3cm)
              if (pos.y < targetY - 0.03) {
                agent.setSafeTranslation({ x: pos.x, y: targetY, z: pos.z });
              }

              // Safety cap riêng cho climbing
              const currentAction = agent.currentBehavior?.action || '';
              const isClimbing = ['climb_on', 'climb', 'climb_approach', 'climb_reach',
                                   'climb_pull', 'climb_mount', 'step_up'].includes(currentAction);
              if (isClimbing && pos.y > currentFloorY + ageGroup.height + 1.5) {
                agent.setSafeTranslation({ x: pos.x, y: targetY, z: pos.z });
                agent.fallState = null;
                agent.state = 'IDLE';
                if (agent.currentBehavior) agent.currentBehavior.completed = true;
              }
            }

            agent.update(deltaTime, colliders, [agent], sceneData.boundingBox);
            physicsEngine.step(world, deltaTime, eventQueue);

            // Bỏ qua 30 bước đầu (warmup) để agent ổn định vị trí trước khi ghi nhận va chạm
            if (step < 30) {
              eventQueue.drainCollisionEvents(() => {});
              if (typeof eventQueue.drainIntersectionEvents === 'function') {
                eventQueue.drainIntersectionEvents(() => {});
              }
              continue;
            }

            // Xử lý va chạm cứng (rigid body collision)
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

                const contactPointData = physicsEngine.getContactPoint(world, agentCollider, staticObj.collider);
                if (!contactPointData) { dbg_noContact++; return; }

                const { position: contactPoint, normal: contactNormal } = contactPointData;
                if (!validateContactPoint(contactPoint, sceneData.boundingBox)) { dbg_outOfBounds++; return; }

                let agentVelMagnitude = hitAgent.getVelocity();

                // Nếu agent đang di chuyển nhưng velocity vật lý gần 0 (bị KCC block),
                // dùng intended speed để tính lực va chạm thực tế
                if (agentVelMagnitude < 0.01 && hitAgent.state === 'MOVING'
                    && (hitAgent.stuckCounter || 0) < 30) {
                  const intendedSpeed = hitAgent.getRealisticVelocity(
                    hitAgent.currentBehavior?.action || hitAgent.currentBehavior?.type || 'walk'
                  );
                  agentVelMagnitude = Math.max(agentVelMagnitude, intendedSpeed * 0.8);
                }

                // Scale velocity theo góc va chạm (impact perpendicular = full force, tangent = giảm)
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

                // [BUG-09 FIX] Cap velocity to age-appropriate top speed × 1.2.
                // Old: getRealisticVelocity('run') * 1.5 returns ~2m/s for all ages.
                // For infant (crawl max ~0.25m/s) this allowed cap = ~3m/s = 20× normal,
                // letting KCC jitter generate ghost injuries at infant-speed simulations.
                // Fix: use a per-age cap based on locomotion type.
                if (hitAgent.state !== 'FALLING') {
                  const _ageProfile = hitAgent._ageProfile;
                  let topSpeed;
                  if (_ageProfile?.velocityProfile) {
                    const vp = _ageProfile.velocityProfile;
                    topSpeed = (vp.run ?? vp.walk ?? vp.crawl)?.mean ?? hitAgent.getRealisticVelocity('run');
                  } else {
                    topSpeed = hitAgent.getRealisticVelocity('run');
                  }
                  const maxExpectedSpeed = topSpeed * 1.2;
                  if (agentVelMagnitude > maxExpectedSpeed) {
                    agentVelMagnitude = maxExpectedSpeed;
                  }
                }

                if (agentVelMagnitude < 0.001) return;

                validContacts++;
                traceLog.push(`VALID agent=${hitAgent.id} obj=${staticObj.id} vel=${agentVelMagnitude.toFixed(3)}`);

                collisionEvents.push({
                  time:        step * deltaTime,
                  agentId:     hitAgent.id,
                  objectId:    staticObj.id,
                  objectName:  staticObj.name || staticObj.id,
                  position:    contactPoint,
                  normal:      contactNormal,
                  velocity:    agentVelMagnitude,
                  impactSpeed: agentVelMagnitude,
                  bodyPart:    hitBodyPart,
                });

                hitAgent.handleCollision(contactNormal, agentVelMagnitude * 15, staticObj.id);

              } catch (err) {
                traceLog.push(`COL_ERR h1=${handle1} h2=${handle2}: ${err.message}`);
              }
            });

            // Xử lý va chạm mềm (sensor / soft-object intersection)
            if (typeof eventQueue.drainIntersectionEvents === 'function') {
              eventQueue.drainIntersectionEvents((handle1, handle2, intersecting) => {
                try {
                  if (!intersecting) return;

                  // [FIX P4] Check hand sensor intersections FIRST.
                  // Hand sensors are kinematic sensors — they appear in
                  // drainIntersectionEvents, not drainCollisionEvents.
                  // Route to agent.handleHandSensorIntersection() for
                  // affordance-based action selection (Priority 5).
                  const handSide = handSensorHandles?.get(handle1) || handSensorHandles?.get(handle2);
                  if (handSide) {
                    const hitAgent   = handleToAgent.get(handle1) || handleToAgent.get(handle2);
                    // The other handle must be a scene object (not agent body part)
                    const sceneObjHandle = handSensorHandles?.has(handle1) ? handle2 : handle1;
                    const sceneObj   = handleToCollider.get(sceneObjHandle);
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

                  // Ghi nhận soft collision mỗi 30 bước để tránh spam event
                  if (step % 30 === 0) {
                    const agentVelMagnitude = hitAgent.getVelocity();
                    if (agentVelMagnitude > 0.1) {
                      validContacts++;
                      collisionEvents.push({
                        time:              step * deltaTime,
                        agentId:           hitAgent.id,
                        objectId:          staticObj.id,
                        objectName:        staticObj.name || staticObj.id,
                        position:          hitAgent.getPosition(),
                        normal:            [0, 1, 0],
                        velocity:          agentVelMagnitude,
                        impactSpeed:       agentVelMagnitude,
                        bodyPart:          'torso',
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
          } // end for (const sim of simWorlds)

          // Cập nhật progress và vị trí agent để frontend hiển thị live
          if (step % 10 === 0) {
            const entry = activeSimulations.get(simulationId) || {};
            if (step % 30 === 0) {
              entry.progress = Math.round((step / totalSteps) * 100);
            }
            // position[1] = CENTER Y của capsule (body.translation().y từ Rapier).
            // Tức là: position[1] = floorHeight + agentHeight/2 + epsilon khi đứng trên sàn.
            // Canvas3D.tsx (LiveAgent type) đã ghi chú "CENTER of agent capsule".
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

        console.log(`[SIM]    ✅ Physics loop complete in ${Date.now() - loopStartTime}ms`);
        console.log(`[SIM]    Soft intersections: ${dbg_softIntersections}`);

        // Tính toán injury score và tổng hợp kết quả
        const objectsMap = {};
        sceneData.objects.forEach(obj => { objectsMap[obj.id] = obj; });
        const injuryAssessments = injuryCalculator.calculateBatchInjuries(
          collisionEvents.filter(e => !e.isSoftInteraction),
          ageGroupId,
          objectsMap
        );
        const summary = injuryCalculator.getInjurySummary(injuryAssessments);

        const trajectories = allAgents.map(agent => {
          const sampledTraj = agent.getSampledTrajectory(600);
          const agentEvents = injuryAssessments.filter(e => e.agentId === agent.id);
          const rawLog      = agent.actionLog || [];
          const logStep     = Math.max(1, Math.floor(rawLog.length / 60));
          const sampledLog  = rawLog.filter((_, i) => i % logStep === 0).slice(0, 60);
          return {
            agentId:    agent.id,
            ageGroupId: agent.ageGroupId,
            // positions[i] = [x, centerY, z] trong Rapier physics space.
            // centerY = body.translation().y = floorHeight + agentHeight/2 + epsilon (khi đứng sàn).
            // Canvas3D.tsx giải mã: footY_3js = (centerY - config.floorHeight) - agentHeight/2
            positions:  Array.isArray(sampledTraj) ? sampledTraj : [],
            actionLog:  sampledLog,
            collisions: agentEvents.map(e => e.position || [0, 0, 0]),
            finalState: agent.getStatus(),
          };
        });

        // Chỉ lưu hazard events (score >= 15 hoặc velocity cao) để giảm kích thước file
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
            // ─── Y-CONVENTION CONTRACT (phải nhất quán với Canvas3D.tsx) ───────
            // floorHeight: vị trí sàn trong physics space (Rapier world-space Y).
            // Frontend dùng giá trị này làm offsetXYZ.y để chuyển đổi toạ độ:
            //   worldY_threejs = physicsY - floorHeight
            // Kết quả: sàn luôn nằm tại Y=0 trong Three.js world space.
            //
            // positions[] trong trajectories lưu CENTER Y của physics body
            //   (= body.translation().y từ Rapier, KHÔNG phải foot Y).
            // Frontend giải mã:
            //   footY_threejs = (centerY - floorHeight) - agentHeight/2
            floorHeight,
          },
          trajectories,
          collisionEvents: hazardEvents,
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

        // Tự động tạo text report sau mỗi simulation
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
      success:          true,
      simulationId,
      heatmap:          objectHeatmap,
      roomSafetyIndex:  rsi,
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
// ZONE ANALYSIS — Chia phòng thành lưới 8x8, phân loại mức độ nguy hiểm từng ô
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

// Chuyển injury score (0-100) thành màu RGB: xanh → vàng → cam → đỏ
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

// Kiểm tra contact point có nằm trong phạm vi scene hợp lệ không (tránh NaN/infinity)
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

// Giải phóng toàn bộ physics resources sau khi simulation kết thúc
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