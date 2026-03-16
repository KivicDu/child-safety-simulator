import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ScaleApplicator } from "../utils/ScaleApplicator";
import { CharacterScaleValidator } from "../utils/CharacterScaleValidator";
import {
  createDriver,
  AGENT_PALETTE,
  type IFigureDriver,
  type ActionEntry,
} from "./Figuredriver";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TrajData {
  agentId: number;
  ageGroupId?: string;
  positions: number[][];
  actionLog?: ActionEntry[];
  collisions?: number[][];
}
interface SimPlayback {
  trajectories?: TrajData[];
  config?: {
    fps?: number;
    duration?: number;
    ageGroupId?: string;
    scaleFactor?: number;
    floorHeight?: number; // Physics floor Y (Rapier world-space) — Single Source of Truth từ backend
  };
  debugStats?: {
    rejectedSpawns?: number[][];
    [key: string]: any;
  };
}
interface HeatPt {
  position: number[];
  normal?: number[];
  score?: number;
  riskTier?: string;
}
interface HeatObj {
  objectId: string;
  objectName: string;
  boundingBox?: any;
  collisions?: HeatPt[];
  collisionPositions?: number[][];
  maxInjuryScore: number;
  heatColor: number[];
  intensity: number;
}
interface LiveAgent {
  agentId: number;
  position: number[]; // CENTER of agent capsule (physicsEngine convention)
  ageGroupId?: string;
}
interface Props {
  modelPath?: string;
  sceneData?: any;
  sceneUnitScale?: number;
  simulationPlayback?: SimPlayback | null;
  heatmapData?: HeatObj[] | null;
  showHeatmap?: boolean;
  liveAgentPositions?: LiveAgent[] | null;
  selectedAgentId?: number | null;
  onPlaybackUpdate?: (info: {
    progress: number;
    action: string;
    time: number;
  }) => void;
  playbackPaused?: boolean;
  playbackSeek?: number | null;
  enableFloorSnap?: boolean;
  showBoundingBoxes?: boolean;
  isBabyView?: boolean;
}

// ─── Figure handle ────────────────────────────────────────────────────────────
interface FigureHandle {
  driver: IFigureDriver;
  root: THREE.Group;
  agentId: number;
  ageId: string;
  color: number;
  trajectory?: number[][];
  actionLog?: ActionEntry[];
  lx?: number;
  lz?: number;
  walkCycle: number;
  currentlyWading: boolean;
  lastFloorY: number;
  // Trail vẽ động — chỉ hiện khi agent được chọn
  trailPoints: THREE.Vector3[];
  trailLine: THREE.Line | null;
  arrowHelper: THREE.ArrowHelper | null;
  capsuleHelper: THREE.Mesh | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// dampAngle helper for smooth shortest-path rotation
// ─────────────────────────────────────────────────────────────────────────────
function dampAngle(x: number, y: number, lambda: number, dt: number): number {
  const PI2 = Math.PI * 2;
  const delta = ((((y - x) % PI2) + PI2 * 1.5) % PI2) - Math.PI;
  return x + delta * (1 - Math.exp(-lambda * dt));
}

// ─────────────────────────────────────────────────────────────────────────────
// toWorldSpace
// ─────────────────────────────────────────────────────────────────────────────
function toWorldSpace(
  pos: number[] | THREE.Vector3,
  offsetXYZ: THREE.Vector3,
): THREE.Vector3 {
  const x = Array.isArray(pos) ? pos[0] : pos.x;
  const y = Array.isArray(pos) ? pos[1] : pos.y;
  const z = Array.isArray(pos) ? pos[2] : pos.z;

  // Guard: if offsetXYZ is not yet computed (model not loaded), use zero offset
  if (!offsetXYZ) {
    return new THREE.Vector3(x, y, z);
  }

  return new THREE.Vector3(x - offsetXYZ.x, y - offsetXYZ.y, z - offsetXYZ.z);
}

function getFloorY(c: any, worldPos: THREE.Vector3): number | null {
  const floorMeshes = c.floorMeshes as THREE.Mesh[];
  const allMeshes = c.sceneMeshes as THREE.Mesh[];
  if (!allMeshes.length) return null;

  const rc = c.raycaster as THREE.Raycaster;
  const origin = new THREE.Vector3(worldPos.x, worldPos.y + 5.0, worldPos.z);
  const down = new THREE.Vector3(0, -1, 0);
  rc.far = 10.0;

  // Pass 1: Raycast only against named floor meshes (Layer 2) — most accurate
  if (floorMeshes.length > 0) {
    rc.set(origin, down);
    const floorHits = rc.intersectObjects(floorMeshes, false);
    if (floorHits.length > 0) {
      return floorHits[0].point.y;
    }
  }

  // Pass 2: Raycast against ALL scene meshes.
  // FIX #14: Find the LOWEST hit point — this is the floor surface.
  // Previously we filtered by sceneFloorY + 0.3, which failed when sceneFloorY was wrong.
  // The lowest hit is almost always the floor (furniture/table surfaces are higher).
  // FIX #16: Find hit closest to known physics floor (within 0.5m tolerance).
  // Previously returned the lowest hit, which could be a geometry artefact.
  // Now we prefer actual floor-level hits to avoid snapping to furniture surfaces.
  rc.set(origin, down);
  const allHits = rc.intersectObjects(allMeshes, false);
  if (!allHits.length) {
    return c.physicsFloorY ?? null;
  }

  // Prioritize hits on floor-classified meshes (e.g. layers containing 2)
  const floorLayer = new THREE.Layers();
  floorLayer.set(2);
  const floorHits = allHits.filter((h) => h.object.layers.test(floorLayer));
  if (floorHits.length > 0) {
    return floorHits[0].point.y;
  }

  const physFloor = c.physicsFloorY ?? 0;
  let bestY: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < allHits.length; i++) {
    const hitY = allHits[i].point.y;
    const dist = Math.abs(hitY - physFloor);
    if (dist < 0.5 && dist < bestDist) {
      bestDist = dist;
      bestY = hitY;
    }
  }
  return bestY ?? c.physicsFloorY ?? null;
}

// ─── LOD ─────────────────────────────────────────────────────────────────────
type LOD = "near" | "mid" | "far";
function getLOD(root: THREE.Group, cam: THREE.Camera): LOD {
  const d = root.position.distanceTo(cam.position);
  return d < 5 ? "near" : d < 15 ? "mid" : "far";
}

// ─── Action icons ─────────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  crawl: "🐛",
  walk: "🚶",
  walk_to: "🚶",
  walk_random: "🚶",
  run: "🏃",
  sprint: "💨",
  run_unstable: "🏃",
  climb_on: "🧗",
  climb: "🧗",
  climb_approach: "🧗",
  climb_reach: "🧗",
  climb_pull: "🧗",
  climb_mount: "🧗",
  climb_fail: "❌",
  step_up: "⬆️",
  step_down: "⬇️",
  stumble: "⚠️",
  trip: "⚠️",
  falling: "💥",
  free_fall: "💥",
  fall_forward: "💥",
  lose_balance: "🌀",
  hurt_light: "😣",
  hurt_medium: "😢",
  hurt_heavy: "😭",
  hurt_shock: "🤕",
  recoil: "😖",
  crying_stand: "😭",
  crying_sit: "😭",
  get_up_slow: "🧎",
  get_up_fast: "🧎",
  idle: "💤",
  pause: "💤",
  wade: "🌊",
  grab: "✊",
  grab_mouth: "👄",
  reach_up: "🙆",
  pull: "🤏",
  lunge: "💨",
  investigate: "👀",
  look_around: "👀",
};

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND_HALF_H — offset để convert positions[i][1] sang feetY trong Three.js
//
// [BUG-M11 FIX đã áp dụng trong agent.js]:
//   getPosition() trả về: [x, t.y − _agentHalfH, z]
//     = [x, (feetY + halfH) − halfH, z]
//     = [x, feetY_physics, z]   ← đã là feetY rồi
//
// Vì vậy:
//   worldPos.y = positions[i][1] − offsetXYZ.y
//              = feetY_physics − box3.min.y
//              = feetY_3js   (KHÔNG cần trừ thêm)
//
// Ví dụ số (early_toddler, floorH=0.143m, box3.min.y=−0.155m):
//   feetY_physics = 0.143 + 0.05 (clearance) = 0.193m
//   positions[i][1] = 0.193m  (feetY — sau BUG-M11 fix)
//   worldPos.y      = 0.193 − (−0.155) = 0.348m  = feetY_3js
//   floor mesh 3js  = 0.143 − (−0.155) = 0.298m
//   → feet 0.348 − 0.298 = 0.05m trên sàn ✓
//
// BACKEND_HALF_H removed — no longer needed.
// agent.js BUG-M11 fix: getPosition() now returns feetY directly.
// resolveAgentY uses worldPos.y as-is (= feetY_3js). No halfH subtraction needed.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const Canvas3D: React.FC<Props> = ({
  modelPath,
  sceneData,
  sceneUnitScale = 1.0,
  simulationPlayback,
  heatmapData,
  showHeatmap = false,
  liveAgentPositions,
  selectedAgentId = null,
  onPlaybackUpdate,
  playbackPaused = false,
  playbackSeek = null,
  enableFloorSnap = true,
  showBoundingBoxes = false,
  isBabyView = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctx = useRef<any>(null);
  const propsRef = useRef({
    simulationPlayback,
    playbackPaused,
    selectedAgentId,
    onPlaybackUpdate,
    playbackSeek,
    enableFloorSnap,
    sceneData,
    showBoundingBoxes,
  });
  propsRef.current = {
    simulationPlayback,
    playbackPaused,
    selectedAgentId,
    onPlaybackUpdate,
    playbackSeek,
    enableFloorSnap,
    sceneData,
    showBoundingBoxes,
  };
  const [loadStatus, setLoadStatus] = useState("");
  const [loadPct, setLoadPct] = useState<number | null>(null);

  // ── Mount renderer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111520);
    scene.fog = new THREE.Fog(0x111520, 40, 130);

    const w = el.clientWidth || 800,
      h = el.clientHeight || 400;
    const camera = new THREE.PerspectiveCamera(55, w / h, 0.01, 2500);
    camera.position.set(4, 4, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.3;
    controls.maxDistance = 200;

    scene.add(new THREE.AmbientLight(0xd0e8ff, 0.65));
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.1);
    sun.position.set(8, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xb0d0ff, 0x806040, 0.38));
    // scene.add(new THREE.GridHelper(30, 30, 0x334455, 0x1a2535));
    // scene.add(new THREE.AxesHelper(2));

    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);

    ctx.current = {
      scene,
      camera,
      renderer,
      controls,
      raycaster,
      frameId: 0,
      lastTime: Date.now(),
      figures: [] as FigureHandle[],
      liveFigures: [] as FigureHandle[],
      heatMeshes: [] as THREE.Mesh[],
      trails: [] as THREE.Line[],
      labels: [] as THREE.Sprite[],
      hitSpheres: [] as THREE.Mesh[],
      rejectedSpheres: [] as THREE.Mesh[],
      model: null,
      offsetXZ: new THREE.Vector2(),
      offsetXYZ: new THREE.Vector3(),
      physicsFloorY: 0,
      floorBias: 0,
      sceneMeshes: [] as THREE.Mesh[],
      floorMeshes: [] as THREE.Mesh[],
      bbHelpers: [] as THREE.Object3D[],
      isPlaying: false,
      playStart: 0,
      currentFrame: 0,
      pausedAt: 0,
    };

    const loop = () => {
      const c = ctx.current;
      if (!c) return;
      c.frameId = requestAnimationFrame(loop);
      try {
        const now = Date.now();
        const dt = Math.min((now - c.lastTime) / 1000, 0.05);
        c.lastTime = now;
        c.controls.update();
        const p = propsRef.current;
        if (p.simulationPlayback?.trajectories) tick(c, p, dt);
        c.renderer.render(c.scene, c.camera);
      } catch (e) {
        console.error("[Canvas3D]", e);
      }
    };
    loop();

    const resize = () => {
      if (!ctx.current) return;
      ctx.current.camera.aspect = el.clientWidth / el.clientHeight;
      ctx.current.camera.updateProjectionMatrix();
      ctx.current.renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (ctx.current) {
        cancelAnimationFrame(ctx.current.frameId);
        ctx.current.controls.dispose();
        if (el.contains(ctx.current.renderer.domElement))
          el.removeChild(ctx.current.renderer.domElement);
        ctx.current.renderer.dispose();
        ctx.current = null;
      }
    };
  }, []);

  // ── Playback controls ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!ctx.current) return;
    const c = ctx.current;
    if (playbackPaused) {
      c.isPlaying = false;
      c.pausedAt = c.currentFrame;
    } else if (c.figures.length > 0) {
      c.isPlaying = true;
      c.playStart =
        Date.now() -
        (c.pausedAt / (simulationPlayback?.config?.fps ?? 60)) * 1000;
    }
  }, [playbackPaused]);

  useEffect(() => {
    if (!ctx.current || playbackSeek === null) return;
    const fps = simulationPlayback?.config?.fps ?? 60;
    const dur = simulationPlayback?.config?.duration ?? 30;
    ctx.current.currentFrame = Math.floor(playbackSeek * fps * dur);
    ctx.current.playStart =
      Date.now() - (ctx.current.currentFrame / fps) * 1000;
  }, [playbackSeek]);

  // ── Load scene model ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!ctx.current || !modelPath?.trim()) return;
    const c = ctx.current;
    if (c.model) {
      c.scene.remove(c.model);
      c.model = null;
    }
    c.bbHelpers.forEach((h: THREE.Object3D) => c.scene.remove(h));
    c.bbHelpers = [];
    c.sceneMeshes = [];

    const url = modelPath.startsWith("/")
      ? `${window.location.origin}${modelPath}`
      : modelPath;
    setLoadStatus("⏳ Loading...");
    setLoadPct(0);

    new GLTFLoader().load(
      url,
      async (gltf) => {
        const model = gltf.scene;

        // 🚨 Fetch the exact scalar from the Backend Single Source of Truth (.meta file)
        await ScaleApplicator.applyMetadataScale(
          model,
          url,
          propsRef.current.sceneData?._scaleFactor,
        );

        // 🚨 Validate physical structural integrity for a 5yo agent (~1.10m)
        CharacterScaleValidator.validate(model, 1.1);

        c.scene.add(model);
        model.updateMatrixWorld(true);

        const box3 = new THREE.Box3().setFromObject(model);
        const ctr = box3.getCenter(new THREE.Vector3());

        model.position.set(-ctr.x, -box3.min.y, -ctr.z);
        model.updateMatrixWorld(true);

        c.model = model;

        c.offsetXZ = new THREE.Vector2(ctr.x, ctr.z);

        // rawFloorY = floor Y in Rapier physics space (used to compute physicsFloorY).
        // [SPAWN-ROOT FIX] Validate sceneData.floor.height before using it.
        // glbParser may set floor.height = ceiling Y (bb.max[1]) instead of floor Y.
        // Validation: floor must be in the bottom portion of the room.
        const rawFloorY: number = (() => {
          const sceneFloorH = propsRef.current.sceneData?.floor?.height;
          if (sceneFloorH == null) return box3.min.y;
          const sfh     = sceneFloorH as number;
          const roomH   = box3.max.y - box3.min.y;
          const distBot = Math.abs(sfh - box3.min.y);
          const distTop = Math.abs(sfh - box3.max.y);
          // If floor.height is closer to ceiling than to floor → misidentified, use min
          if (roomH > 0.5 && distTop < distBot) {
            console.warn(
              `[Canvas3D] sceneData.floor.height=${sfh.toFixed(3)} looks like ceiling ` +
              `(box3 Y=[${box3.min.y.toFixed(3)}, ${box3.max.y.toFixed(3)}]). Using box3.min.y.`
            );
            return box3.min.y;
          }
          return sfh;
        })();

        // ─── Y-CONVENTION FIX v2 (Root Cause E / RC#6) ───────────────────────
        // model.position.y = -box3.min.y, nên Three.js world Y của bất kỳ điểm
        // physics nào được tính:
        //
        //   world_y = physicsY + model.position.y = physicsY - box3.min.y
        //
        // toWorldSpace() trả về: pos - offsetXYZ, vì vậy:
        //   world_y = physicsY - offsetXYZ.y
        //
        // → offsetXYZ.y PHẢI = box3.min.y (giá trị ÂM, ví dụ −0.155m)
        //
        // Lỗi cũ: offsetXYZ.y = rawFloorY = +0.143m → transform sai:
        //   world_y = physicsY − 0.143  (thiếu 0.155m từ model repositioning)
        //   feet = worldPos.y − halfH = clearance = 0.05m
        //   floor mesh Three.js Y = −box3.min.y = +0.155m
        //   → agent feet (0.05m) DƯỚI floor mesh (0.155m) → ngập sàn 10.5cm!
        //
        // Fix: offsetXYZ.y = box3.min.y (−0.155m):
        //   world_y = physicsY − (−0.155) = physicsY + 0.155  ✓
        //   feet = backendBaseY = worldPos.y − halfH = clearance = 0.05m (above bbox)
        //   floor mesh Three.js Y = rawFloorY − box3.min.y = 0.143 + 0.155 = 0.298m
        //   → agent feet (0.298 + 0.05 = 0.348m) TRÊN floor mesh (0.298m) ✓
        c.offsetXYZ = new THREE.Vector3(ctr.x, box3.min.y, ctr.z);

        // physicsFloorY = vị trí mesh sàn thực trong Three.js world space.
        // Dùng bởi resolveAgentY (clamp không bao giờ đặt agent dưới sàn)
        // và getFloorY (ray-matching tolerance).
        c.physicsFloorY = rawFloorY - box3.min.y;

        model.traverse((o: THREE.Object3D) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            if ((mesh.name || "").startsWith("COL_")) {
              mesh.visible = false;
              mesh.castShadow = false;
              mesh.receiveShadow = false;
            } else {
              mesh.layers.enable(1);
              mesh.receiveShadow = true;
              mesh.castShadow = true;
            }

            if (mesh.material) {
              const mat = mesh.material as THREE.Material | THREE.Material[];
              const mats = Array.isArray(mat) ? mat : [mat];
              mats.forEach((m) => {
                m.side = THREE.DoubleSide;
                if (m.transparent && (m as any).opacity < 0.01) {
                  (m as any).opacity = 1.0;
                  m.transparent = false;
                }
              });
            }
            c.sceneMeshes.push(mesh);

            // Classify floor meshes by name for layer-based raycasting
            const name = (mesh.name || "").toLowerCase();
            if (/floor|ground|plane|surface|vloer|grond/.test(name)) {
              mesh.layers.enable(2);
              c.floorMeshes.push(mesh);
            }
          }
        });

        // ── Build bounding box wireframe helpers for debug visualization ──
        c.bbHelpers.forEach((h: THREE.Object3D) => c.scene.remove(h));
        c.bbHelpers = [];
        model.traverse((o: THREE.Object3D) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && (!mesh.name || !mesh.name.startsWith("COL_"))) {
            const helper = new THREE.BoxHelper(mesh, 0xffff00);
            (helper.material as THREE.LineBasicMaterial).transparent = true;
            (helper.material as THREE.LineBasicMaterial).opacity = 0.3;
            helper.visible = false; // hidden by default, toggle via showBoundingBoxes
            helper.renderOrder = 998;
            c.scene.add(helper);
            c.bbHelpers.push(helper);
          }
        });

        // Fit camera
        const sz = box3.getSize(new THREE.Vector3());
        const md = Math.max(sz.x, sz.y, sz.z);
        const cd =
          Math.abs(md / 2 / Math.tan((c.camera.fov * Math.PI) / 360)) * 1.6;
        c.camera.position.set(cd * 0.7, cd * 0.6, cd * 0.7);
        c.camera.lookAt(0, 0, 0);
        c.controls.target.set(0, 0, 0);
        c.controls.update();

        setLoadPct(null);
        setLoadStatus("✅ Loaded");
        setTimeout(() => setLoadStatus(""), 3000);

        console.info(
          `[Canvas3D v8] Scene loaded.` +
            ` Size after scale: ${sz.x.toFixed(2)}m × ${sz.y.toFixed(2)}m × ${sz.z.toFixed(2)}m.` +
            ` box3.min.y=${box3.min.y.toFixed(3)}  rawFloorY=${rawFloorY.toFixed(3)}` +
            ` offsetXYZ.y=${box3.min.y.toFixed(3)} physicsFloorY(3js)=${c.physicsFloorY.toFixed(3)}` +
            ` sceneUnitScale=${sceneUnitScale}.`,
        );
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          const p = Math.round((xhr.loaded / xhr.total) * 100);
          setLoadPct(p);
          setLoadStatus(`⏳ ${p}%`);
        }
      },
      (err) => {
        console.error(err);
        setLoadStatus("❌ Failed");
        setLoadPct(null);
      },
    );
  }, [modelPath, sceneUnitScale]);

  function resolveAgentY(
    c: any,
    worldPos: THREE.Vector3,
    action: string,
    doSnap: boolean,
    _ageId: string = 'early_toddler',  // kept for call-site compat; unused after BUG-M11
  ): number {
    // ── Y-CONVENTION (sau BUG-M11 fix trong agent.js) ───────────────────────
    //
    // agent.getPosition() = [x, t.y − _agentHalfH, z] = [x, feetY_physics, z]
    // positions[i][1]     = feetY_physics   (bàn chân trong Rapier world)
    // worldPos.y          = positions[i][1] − offsetXYZ.y
    //                     = feetY_physics − box3.min.y
    //                     = feetY_3js       ← ĐÃ là foot level rồi
    //
    // backendBaseY = worldPos.y   (KHÔNG trừ thêm halfH nào)
    //
    // Công thức đúng:
    //   backendBaseY = feetY_3js = worldPos.y  (BACKEND_HALF_H = 0 cho mọi age)
    //
    // Ví dụ (early_toddler, floorH=0.143, box3.min.y=−0.155):
    //   feetY_physics = 0.143 + 0.05 = 0.193m
    //   worldPos.y    = 0.193 − (−0.155) = 0.348m
    //   floor_3js     = 0.143 − (−0.155) = 0.298m
    //   finalY        = max(0.348, 0.298+0.02) = 0.348m → 5cm trên sàn ✓
    //
    //   Agent leo thang 0.5m:
    //   feetY_physics = 0.643m → worldPos.y = 0.798m → finalY = 0.798m ✓
    //   (trước kia với halfH=0.275: finalY=0.523m = 0.275m quá thấp ✗)
    // ─────────────────────────────────────────────────────────────────────────

    const FLOOR_CLEARANCE = 0.02; // 2cm clearance

    // BUG-M11 FIX: BACKEND_HALF_H = 0 — worldPos.y đã là feetY_3js
    const backendBaseY = worldPos.y;  // feetY trong Three.js world space
    const sceneFloorY  = c.physicsFloorY ?? 0;

    // Scene bounds for sanity checks (room height in Three.js world)
    const sceneBbox      = propsRef.current.sceneData?.boundingBox;
    const sceneRoomH     = sceneBbox ? (sceneBbox.max[1] - sceneBbox.min[1]) : 4.0;
    const sceneBottomY   = sceneFloorY;                      // floor in Three.js world
    const sceneCeilingY  = sceneFloorY + sceneRoomH;         // ceiling in Three.js world

    const SNAP_ACTIONS = new Set([
      "falling", "free_fall", "fall_forward",
      "walk", "walk_to", "walk_random",
      "run", "run_unstable", "sprint",
      "crawl", "lunge", "investigate", "wade",
    ]);

    if (doSnap && SNAP_ACTIONS.has(action)) {
      const rayY = getFloorY(c, worldPos);
      if (rayY !== null) {
        const rayAboveBackend = rayY - backendBaseY;

        // ── Rule 4 (NEW — SPAWN-ROOT FIX) ─────────────────────────────────
        // If backendBaseY is suspiciously high (near or above ceiling) AND
        // raycast found a valid floor surface within scene bounds:
        // → backend position is contaminated by ceiling-spawn bug → trust raycast.
        //
        // Trigger: backendBaseY > physicsFloorY + 40% of room height
        //          (floor spawning correctly would be physicsFloorY + ~5cm)
        // Example: physicsFloorY=0, roomH=2.5 → threshold=1.0m
        //   backendBaseY=2.55m > 1.0m AND rayY=0m → use rayY ✓
        const floorThreshold = sceneFloorY + sceneRoomH * 0.40;
        const rayWithinRoom  = rayY >= sceneBottomY - 0.5 && rayY <= sceneCeilingY + 0.5;
        if (backendBaseY > floorThreshold && rayWithinRoom && rayY < backendBaseY - 0.5) {
          console.warn(
            `[Canvas3D] Rule4 snap: backendBaseY=${backendBaseY.toFixed(3)} near ceiling ` +
            `(threshold=${floorThreshold.toFixed(3)}). Trusting raycast Y=${rayY.toFixed(3)}.`
          );
          return rayY + FLOOR_CLEARANCE;
        }

        // ── Rule 1 ─────────────────────────────────────────────────────────
        // Raycast is BELOW backend foot by up to the full room height.
        // Old limit was 2.0m — too small for rooms > 2.0m tall.
        // New: use full room height as the snap tolerance.
        if (rayY < backendBaseY - 0.02 && rayY > backendBaseY - (sceneRoomH + 0.5)) {
          // Only snap if the raycast surface is near the expected floor
          if (Math.abs(rayY - sceneFloorY) < 0.30) {
            return rayY + FLOOR_CLEARANCE;
          }
        }

        // ── Rule 2 ─────────────────────────────────────────────────────────
        // Raycast is within ±15cm of backend foot → use for jitter reduction
        if (Math.abs(rayAboveBackend) < 0.15) {
          return rayY + FLOOR_CLEARANCE;
        }

        // ── Rule 3 ─────────────────────────────────────────────────────────
        // Raycast is much higher than foot (furniture surface) → ignore, trust backend
      }
    }

    // Default: use backend position, but clamp to floor if near it.
    // If backendBaseY is above ceiling, this fallback also catches ceiling-spawn:
    // physicsFloorY = 0 (validated), backendBaseY = 2.55 → max(2.55, 0.02) = 2.55
    // To fix this remaining case, clamp backendBaseY to [sceneBottomY, sceneCeilingY]
    const clampedBaseY = Math.min(backendBaseY, sceneCeilingY + 0.1);
    return Math.max(clampedBaseY, sceneFloorY + FLOOR_CLEARANCE);
  }

  // ── Spawn playback agents ─────────────────────────────────────────────────
  // [FIX CANVAS RESET]:
  // Mỗi lần poll xong, Simulator.tsx gọi setSimulationPlayback(newObj) với object MỚI
  // → simulationPlayback reference thay đổi → useEffect này chạy → xóa figures → màn hình flash.
  // Fix: Dùng fingerprint ref để chỉ rebuild khi trajectory data THỰC SỰ thay đổi.
  const trajFingerprintRef = React.useRef<string>("");
  useEffect(() => {
    if (!ctx.current) return;
    const c = ctx.current;

    const trajs = simulationPlayback?.trajectories;
    const newFingerprint = trajs
      ? trajs
          .map((t: any) => `${t.agentId ?? "?"}_${t.positions?.length ?? 0}`)
          .join("|")
      : "";

    // Nếu fingerprint giống nhau → data không đổi, KHÔNG rebuild
    if (newFingerprint === trajFingerprintRef.current) return;
    trajFingerprintRef.current = newFingerprint;

    c.figures.forEach((fh: FigureHandle) => {
      c.scene.remove(fh.root);
      fh.driver.dispose();
    });
    c.figures = [];
    c.trails.forEach((l: THREE.Line) => c.scene.remove(l));
    c.trails = [];
    c.labels.forEach((s: THREE.Sprite) => c.scene.remove(s));
    c.labels = [];
    c.isPlaying = false;

    // Clear old rejected spheres
    if (c.rejectedSpheres) {
      c.rejectedSpheres.forEach((m: THREE.Mesh) => {
        c.scene.remove(m);
        m.geometry?.dispose();
        (m.material as THREE.Material)?.dispose();
      });
    }
    c.rejectedSpheres = [];

    // Add new rejected spheres if any
    if (simulationPlayback?.debugStats?.rejectedSpawns) {
      const off = c.offsetXYZ as THREE.Vector3;
      const geo = new THREE.SphereGeometry(0.12, 8, 8);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.6,
        wireframe: true,
      });
      simulationPlayback.debugStats.rejectedSpawns.forEach((pos: number[]) => {
        if (!Array.isArray(pos) || pos.length < 3) return;
        const sph = new THREE.Mesh(geo, mat);
        sph.position.copy(toWorldSpace(pos, off));
        sph.visible = !!propsRef.current.showBoundingBoxes;
        c.scene.add(sph);
        c.rejectedSpheres.push(sph);
      });
    }

    if (!trajs) return;

    const defAge = simulationPlayback.config?.ageGroupId ?? "early_toddler";

    trajs.forEach((tr: any, i: number) => {
      if (!tr?.positions?.length) return;
      const ageId = tr.ageGroupId ?? defAge;
      const color = AGENT_PALETTE[i % AGENT_PALETTE.length];
      const driver = createDriver(ageId, i, color);
      const handle: FigureHandle = {
        driver,
        root: driver.root,
        agentId: tr.agentId ?? i,
        ageId,
        color,
        trajectory: tr.positions,
        actionLog: tr.actionLog ?? [],
        lx: tr.positions?.[0]?.[0],
        lz: tr.positions?.[0]?.[2],
        walkCycle: Math.random() * Math.PI * 2,
        currentlyWading: false,
        lastFloorY: c.physicsFloorY ?? 0,
        trailPoints: [],
        trailLine: null,
        arrowHelper: null,
        capsuleHelper: null,
      };
      driver.root.traverse((o: THREE.Object3D) => o.layers.set(0));
      driver.root.visible = false;
      c.scene.add(driver.root);
      c.figures.push(handle);
    });

    c.isPlaying = !playbackPaused;
    c.playStart = Date.now();
    c.currentFrame = 0;
    c.figures.forEach((fh: FigureHandle) => (fh.root.visible = true));

    // ─── Y-CONVENTION SYNC (guard khi model load sau playback data) ──────────
    // [SPAWN-ROOT FIX] Validate config.floorHeight before using it.
    // If backend sent ceiling Y as floor, physicsFloorY would be near room height
    // → characters snap to ceiling in resolveAgentY → ceiling-spawn bug persists.
    if (simulationPlayback?.config?.floorHeight != null && c.offsetXYZ) {
      const cfgFloor = simulationPlayback.config.floorHeight as number;
      const offsetY  = (c.offsetXYZ as THREE.Vector3).y;

      // Compute candidate physicsFloorY
      let candidateFloorY = cfgFloor - offsetY;

      // Validate: if model is loaded, we know the Three.js scene bounds.
      // physicsFloorY should be near the model's floor, not ceiling.
      if (c.model) {
        const box3model  = new THREE.Box3().setFromObject(c.model);
        const roomHeight = box3model.max.y - box3model.min.y;
        const floorApprox = box3model.min.y;   // floor ≈ bottom of scene in Three.js
        const ceilApprox  = box3model.max.y;   // ceiling ≈ top of scene in Three.js

        const distFloor   = Math.abs(candidateFloorY - floorApprox);
        const distCeiling = Math.abs(candidateFloorY - ceilApprox);

        if (roomHeight > 0.5 && distCeiling < distFloor) {
          console.warn(
            `[Canvas3D] config.floorHeight=${cfgFloor.toFixed(3)} → ` +
            `physicsFloorY=${candidateFloorY.toFixed(3)} looks like ceiling ` +
            `(room=[${floorApprox.toFixed(2)}, ${ceilApprox.toFixed(2)}]). ` +
            `Clamping to floor.`
          );
          candidateFloorY = floorApprox + 0.02;  // 2cm clearance
        }
      }

      c.physicsFloorY = candidateFloorY;
    }
  }, [simulationPlayback, modelPath, sceneUnitScale]);

  // ── Selection / highlights ────────────────────────────────────────────────
  useEffect(() => {
    if (!ctx.current) return;
    const c = ctx.current;
    // Fade out non-selected agents
    c.figures.forEach((fh: FigureHandle) => {
      const sel = selectedAgentId === null || fh.agentId === selectedAgentId;
      fh.root.traverse((ch: any) => {
        if (ch.isMesh && ch.material) {
          ch.material.opacity = sel ? 1 : 0.1;
          ch.material.transparent = true;
        }
      });
    });

    // Xóa trail của tất cả figures khi selection thay đổi.
    // tick() sẽ tự build lại trail cho agent được chọn từ vị trí hiện tại.
    c.figures.forEach((fh: FigureHandle) => {
      if (fh.trailLine) {
        c.scene.remove(fh.trailLine);
        fh.trailLine.geometry.dispose();
        (fh.trailLine.material as THREE.Material).dispose();
        fh.trailLine = null;
      }
      fh.trailPoints = [];
    });

    c.hitSpheres.forEach((m: THREE.Mesh) => {
      c.scene.remove(m);
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose();
    });
    c.hitSpheres = [];
    if (selectedAgentId !== null && simulationPlayback?.trajectories) {
      const tr = simulationPlayback.trajectories.find(
        (t) => (t.agentId ?? 0) === selectedAgentId,
      );
      const off = c.offsetXYZ as THREE.Vector3;
      const geo = new THREE.SphereGeometry(0.08, 10, 10);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff3333,
        transparent: true,
        opacity: 0.85,
      });
      (tr?.collisions ?? []).forEach((pos: number[]) => {
        if (!Array.isArray(pos) || pos.length < 3) return;
        const sph = new THREE.Mesh(geo, mat.clone());
        const wp = toWorldSpace(pos, off);
        // Collision points are physics contact positions (world-space, not foot or center)
        sph.position.copy(wp);
        c.scene.add(sph);
        c.hitSpheres.push(sph);
      });
    }
  }, [selectedAgentId, simulationPlayback]);

  // ── Bounding Box Debug Toggle ─────────────────────────────────────────────
  useEffect(() => {
    // Toggle helpers visibility based on props
    if (ctx.current) {
      ctx.current.bbHelpers.forEach((h: THREE.Object3D) => {
        h.visible = !!showBoundingBoxes;
      });
      ctx.current.figures.forEach((fh: FigureHandle) => {
        if (fh.arrowHelper)
          fh.arrowHelper.visible =
            !!showBoundingBoxes && fh.agentId === selectedAgentId;
        if (fh.capsuleHelper)
          fh.capsuleHelper.visible =
            !!showBoundingBoxes && fh.agentId === selectedAgentId;
      });
      ctx.current.rejectedSpheres.forEach((m: THREE.Mesh) => {
        m.visible = !!showBoundingBoxes;
      });
    }
  }, [showBoundingBoxes, selectedAgentId]);

  // ── Baby View ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ctx.current) return;
    const c = ctx.current;
    if (isBabyView) {
      // Store current camera position for restoration
      c._savedCamPos = c.camera.position.clone();
      c._savedTarget = c.controls.target.clone();
      // Set camera to child eye level (~0.6m) looking forward
      const lookDir = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(c.camera.quaternion)
        .normalize();
      c.camera.position.set(
        c.controls.target.x - lookDir.x * 2,
        0.6,
        c.controls.target.z - lookDir.z * 2,
      );
      c.controls.target.set(c.controls.target.x, 0.6, c.controls.target.z);
      c.controls.maxPolarAngle = Math.PI * 0.55;
      c.controls.minPolarAngle = Math.PI * 0.35;
      c.controls.update();
    } else if (c._savedCamPos) {
      // Restore saved camera position
      c.camera.position.copy(c._savedCamPos);
      c.controls.target.copy(c._savedTarget);
      c.controls.maxPolarAngle = Math.PI;
      c.controls.minPolarAngle = 0;
      c.controls.update();
    }
  }, [isBabyView]);

  // ── Heatmap ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ctx.current) return;
    const c = ctx.current;
    c.heatMeshes.forEach((m: THREE.Mesh) => {
      c.scene.remove(m);
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose();
    });
    c.heatMeshes = [];
    if (!showHeatmap || !heatmapData?.length || !c.model) return;
    const off = c.offsetXYZ as THREE.Vector3;

    heatmapData.forEach((obj) => {
      if (!obj) return;
      const hc = new THREE.Color(
        obj.heatColor?.[0] ?? 1,
        obj.heatColor?.[1] ?? 0,
        obj.heatColor?.[2] ?? 0,
      );
      if (obj.boundingBox) {
        const bb = obj.boundingBox;
        const mn = toWorldSpace([bb.min[0], bb.min[1], bb.min[2]], off);
        const mx = toWorldSpace([bb.max[0], bb.max[1], bb.max[2]], off);
        const ctr = new THREE.Vector3().addVectors(mn, mx).multiplyScalar(0.5);
        const sz = new THREE.Vector3().subVectors(mx, mn);

        // FIX #9: Add heatbox to SCENE (not model) to avoid double-transformation
        // The world-space coordinates from toWorldSpace already account for offset.
        // Adding to model.worldToLocal + scale(1/unitScale) caused double-scaling.
        const heatBox = new THREE.Mesh(
          new THREE.BoxGeometry(sz.x, sz.y, sz.z),
          new THREE.MeshBasicMaterial({
            color: hc,
            transparent: true,
            opacity: Math.min(0.25, 0.05 + obj.intensity * 0.1),
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
        );
        heatBox.renderOrder = 999;
        heatBox.position.copy(ctr);
        c.scene.add(heatBox);
        c.heatMeshes.push(heatBox);

        // Debug: log heatmap alignment info
        console.log(
          `[Heatmap] "${obj.objectName}" center=(${ctr.x.toFixed(2)}, ${ctr.y.toFixed(2)}, ${ctr.z.toFixed(2)})`,
          `size=(${sz.x.toFixed(2)}, ${sz.y.toFixed(2)}, ${sz.z.toFixed(2)})`,
          `intensity=${obj.intensity.toFixed(2)}`,
        );
      }
      const pts = [
        ...(obj.collisions ?? []).map((x: any) => ({
          pos: x.position,
          score: x.score ?? 0,
          tier: x.riskTier,
        })),
        ...(obj.collisionPositions ?? []).map((p: any) => ({
          pos: p,
          score: 0,
          tier: "safe",
        })),
      ];
      pts.forEach(({ pos, score, tier }) => {
        if (!Array.isArray(pos) || pos.length < 3) return;
        const sev = score >= 50 || tier === "critical" || tier === "dangerous";
        const col = sev
          ? new THREE.Color(1, 0.1, 0.1)
          : new THREE.Color(1, 0.6, 0);
        const sph = new THREE.Mesh(
          new THREE.SphereGeometry(sev ? 0.16 : 0.11, 12, 12),
          new THREE.MeshStandardMaterial({
            color: col,
            emissive: col,
            emissiveIntensity: 1.6,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
          }),
        );
        sph.renderOrder = 999;
        const wPos = toWorldSpace(pos, off);
        // FIX #9: Add to scene directly (not model) — same fix as heatbox
        sph.position.copy(wPos);
        sph.userData.severe = sev;
        sph.userData.base = 0.9;
        c.scene.add(sph);
        c.heatMeshes.push(sph);
      });
    });
  }, [heatmapData, showHeatmap]);

  useEffect(() => {
    if (!showHeatmap || !ctx.current) return;
    const c = ctx.current;
    let id: number;
    const pulse = () => {
      id = requestAnimationFrame(pulse);
      const t = Date.now() * 0.004;
      c.heatMeshes.forEach((m: THREE.Mesh) => {
        if (!m.userData.severe) return;
        const b = 0.5 + Math.sin(t) * 0.5;
        const pulseMat = m.material as THREE.MeshStandardMaterial;
        pulseMat.opacity = m.userData.base * b;
        pulseMat.emissiveIntensity = 1 + b * 1.5;
      });
    };
    pulse();
    return () => cancelAnimationFrame(id);
  }, [showHeatmap, heatmapData]);

  // ── Live positions ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ctx.current) return;
    const c = ctx.current;
    let offXYZ = c.offsetXYZ as THREE.Vector3;
    const frameDt = 1 / 60;

    // [RC#6 FIX] Live bootstrap khi model chưa load.
    // Cần offsetXYZ.y = box3.min.y (âm), KHÔNG phải cfgFloor (dương).
    // Dùng sceneData.boundingBox.min[1] làm xấp xỉ tốt nhất của box3.min.y
    // trước khi model GLTF load xong.
    //
    // Transform đúng: world_y = physicsY - offsetXYZ.y = physicsY - box3.min.y
    // physicsFloorY = rawFloorY - box3.min.y ≈ cfgFloor - sceneBBminY
    const cfgFloor = propsRef.current.simulationPlayback?.config?.floorHeight;
    if (offXYZ.y === 0 && cfgFloor != null) {
      const sceneBBminY = propsRef.current.sceneData?.boundingBox?.min?.[1] as number | undefined;
      const bootstrapOffsetY = (sceneBBminY != null) ? sceneBBminY : cfgFloor;
      offXYZ = new THREE.Vector3(offXYZ.x, bootstrapOffsetY, offXYZ.z);
      c.offsetXYZ = offXYZ;
      c.physicsFloorY = cfgFloor - bootstrapOffsetY;
      console.log(`[Canvas3D LIVE] offsetXYZ.y bootstrapped=${bootstrapOffsetY.toFixed(4)} (sceneBBminY=${sceneBBminY?.toFixed(4)}) physicsFloorY=${c.physicsFloorY.toFixed(4)}`);
    }

    // Debug: log offset once when live positions first arrive
    if (liveAgentPositions?.length && !c._liveOffsetLogged) {
      c._liveOffsetLogged = true;
      console.log(
        `[Canvas3D LIVE] offsetXYZ=${offXYZ ? `(${offXYZ.x.toFixed(3)}, ${offXYZ.y.toFixed(3)}, ${offXYZ.z.toFixed(3)})` : "UNDEFINED"}`,
        `| first agent pos=[${liveAgentPositions[0]?.position}]`,
        `| world=${offXYZ ? `(${(liveAgentPositions[0]?.position?.[0] - offXYZ.x).toFixed(3)}, ${(liveAgentPositions[0]?.position?.[2] - offXYZ.z).toFixed(3)})` : "N/A"}`,
      );
    }

    if (!liveAgentPositions?.length) {
      c.liveFigures.forEach((fh: FigureHandle) => {
        c.scene.remove(fh.root);
        fh.driver.dispose();
      });
      c.liveFigures = [];
      return;
    }
    if (c.liveFigures.length === 0) {
      liveAgentPositions.forEach((a, i) => {
        if (!a?.position || a.position.some(isNaN)) return;
        const color = AGENT_PALETTE[i % AGENT_PALETTE.length];
        const driver = createDriver(a.ageGroupId ?? "early_toddler", i, color);
        const handle: FigureHandle = {
          driver,
          root: driver.root,
          agentId: a.agentId,
          ageId: a.ageGroupId ?? "early_toddler",
          color,
          walkCycle: 0,
          currentlyWading: false,
          lastFloorY: 0,
          trailPoints: [],
          trailLine: null,
          arrowHelper: null,
          capsuleHelper: null,
        };
        driver.root.traverse((o: THREE.Object3D) => o.layers.set(0));
        const wp = toWorldSpace(a.position, offXYZ);
        const finalY = resolveAgentY(
          c,
          wp,
          "idle",
          enableFloorSnap,
          a.ageGroupId ?? "early_toddler",
        );
        handle.lastFloorY = finalY;
        driver.root.position.set(wp.x, finalY, wp.z);
        c.scene.add(driver.root);
        c.liveFigures.push(handle);
      });
      return;
    }
    liveAgentPositions.forEach((a, i) => {
      if (!a?.position || i >= c.liveFigures.length) return;
      const fh = c.liveFigures[i] as FigureHandle;
      const tgt = toWorldSpace(a.position, offXYZ);

      const dx = tgt.x - fh.root.position.x;
      const dz = tgt.z - fh.root.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Infer action from movement speed and age group
      // [LIVE-FIX] dist is displacement per-frame (1/60s):
      //   0.05m/frame = 3.0 m/s → run
      //   0.012m/frame = 0.72 m/s → walk
      //   <0.001m/frame → idle
      // Infant (ageId='infant') can't walk — crawl at any speed
      const isInfant = fh.ageId === 'infant';
      const liveAction = isInfant
        ? (dist > 0.001 ? "crawl" : "idle")
        : dist > 0.033 ? "run" : dist > 0.005 ? "walk" : "idle";
      const actual_spd = dist / frameDt;

      const rawY = resolveAgentY(
        c,
        tgt,
        liveAction,
        enableFloorSnap,
        fh.ageId,
      );
      // Smooth transitions for live positions (interpolate Y only slightly)
      const finalY = fh.root.position.y + (rawY - fh.root.position.y) * 0.2;
      fh.lastFloorY = rawY;

      fh.root.position.set(tgt.x, finalY, tgt.z);

      if (dist > 0.001) {
        const targetRotation = Math.atan2(dx, dz);
        // System C: Rotation Smoothing (Frontend)
        fh.root.rotation.y = dampAngle(
          fh.root.rotation.y,
          targetRotation,
          10,
          frameDt,
        );
      }
      const lodLevel = getLOD(fh.root, c.camera);
      if (lodLevel !== "far") {
        fh.driver.update(frameDt, { a: liveAction, v: actual_spd });
      }
    });
  }, [liveAgentPositions]);

  // ─── Playback tick ────────────────────────────────────────────────────────
  function tick(c: any, p: typeof propsRef.current, dt: number) {
    const {
      simulationPlayback: sp,
      playbackPaused: paused,
      selectedAgentId: selId,
      onPlaybackUpdate: onU,
      enableFloorSnap,
    } = p;
    if (!sp?.trajectories?.length) return;

    const fps = sp.config?.fps ?? 60;
    const dur = sp.config?.duration ?? 30;
    const total = fps * dur;

    if (!paused) {
      c.currentFrame = Math.floor(((Date.now() - c.playStart) / 1000) * fps);
      if (c.currentFrame >= total) {
        c.currentFrame = 0;
        c.playStart = Date.now();
      }
    } else {
      c.currentFrame = c.pausedAt;
    }

    const prog = total > 0 ? c.currentFrame / total : 0;
    let curAction = "idle";
    let selPos: THREE.Vector3 | null = null;

    c.figures.forEach((fh: FigureHandle) => {
      const traj = fh.trajectory;
      const aLog = fh.actionLog;
      if (!traj?.length) return;

      const exact = prog * (traj.length - 1);
      const i0 = Math.floor(exact);
      const i1 = Math.min(i0 + 1, traj.length - 1);
      const f = exact - i0;
      const p0 = traj[i0],
        p1 = traj[i1];
      if (!p0 || !p1) return;

      // Interpolate position (CENTER coordinates from physics engine)
      const simPos = [
        p0[0] + (p1[0] - p0[0]) * f,
        p0[1] + (p1[1] - p0[1]) * f,
        p0[2] + (p1[2] - p0[2]) * f,
      ];

      // Facing direction
      const dx = simPos[0] - (fh.lx ?? simPos[0]);
      const dz = simPos[2] - (fh.lz ?? simPos[2]);
      const spd = Math.sqrt(dx * dx + dz * dz);
      if (spd > 0.001) {
        const targetRotation = Math.atan2(dx, dz);
        // System C: Rotation Smoothing (Frontend)
        fh.root.rotation.y = dampAngle(
          fh.root.rotation.y,
          targetRotation,
          10,
          dt,
        );
      }
      fh.lx = simPos[0];
      fh.lz = simPos[2];

      // Action entry — binary search for the action that is current at this frame
      // [BUG-ALOG FIX] Old: linear mapping of aLog index to progress fraction.
      //   Problem: aLog.length << traj.length (log only on state changes, not every frame)
      //   → each aLog entry "stretches" over many trajectory frames incorrectly.
      // New: ActionEntry has optional field `t` (trajectory frame index at which this
      //   action started). Binary search for the last entry with t ≤ currentFrame.
      //   Fallback: if no `t` field, use linear mapping (backward-compat).
      let entry: ActionEntry | null = null;
      if (aLog?.length) {
        const frame = Math.floor(prog * ((traj?.length ?? 1) - 1));
        // Check if entries have time/frame indices
        const hasFrameIdx = typeof (aLog[0] as any)?.t === 'number';
        if (hasFrameIdx) {
          // Binary search: find last entry where entry.t <= frame
          let lo = 0, hi = aLog.length - 1, best = 0;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if ((aLog[mid] as any).t <= frame) { best = mid; lo = mid + 1; }
            else hi = mid - 1;
          }
          entry = aLog[best] ?? null;
        } else {
          // Fallback: linear mapping (aLog sparsely covers timeline)
          const li = Math.min(Math.floor(prog * (aLog.length - 1)), aLog.length - 1);
          entry = aLog[li] ?? null;
        }
      }
      const action = entry?.a ?? (spd > 0.003 ? "walk" : "idle");
      fh.currentlyWading = !!entry?.wadingIn;

      // FIX-BUG01B: Convert physics center → Three.js world, then decode foot Y
      const offXYZ = c.offsetXYZ as THREE.Vector3;
      const worldPos = toWorldSpace(simPos, offXYZ); // worldPos.y = centerY - offsetXYZ.y

      const finalY = resolveAgentY(
        c,
        worldPos,
        action,
        enableFloorSnap,
        fh.ageId,
      );
      fh.lastFloorY = finalY;

      // Debug logging for infant (only 2% of frames to avoid spam)
      if (fh.ageId === "infant" && Math.random() < 0.02) {
        console.log(
          `[Infant] h=${fh.driver.currentHeight.toFixed(3)} ` +
            `footY_3js=${worldPos.y.toFixed(3)} ` +
            `finalY=${finalY.toFixed(3)} action=${action}`,
        );
      }

      // FIX #3: Smooth Y lerp for all actions to prevent 1-frame floor snap jitter
      // (The user reported characters jumping up and down erratically)
      const climbActions = [
        "climb_on",
        "climb",
        "climb_approach",
        "climb_reach",
        "climb_pull",
        "climb_mount",
        "step_up",
        "step_down",
      ];
      const isClimbing = climbActions.includes(action);
      const isFalling = ["falling", "free_fall", "fall_forward"].includes(
        action,
      );

      // Use slower lerp for climbing, faster lerp for normal movement to hide jitter, no lerp for falling
      const lerpFactor = isFalling ? 1.0 : isClimbing ? 0.25 : 0.4;

      const smoothY =
        fh.root.position.y + (finalY - fh.root.position.y) * lerpFactor;
      fh.root.position.set(worldPos.x, smoothY, worldPos.z);

      const actual_spd = dt > 0 ? spd / dt : 0;

      const lodLevel = getLOD(fh.root, c.camera);
      if (lodLevel !== "far") {
        fh.driver.update(dt, entry ?? { a: action, e: "neutral", v: actual_spd });
      }

      if (selId !== null && fh.agentId === selId) {
        curAction = action;
        selPos = fh.root.position.clone();
        drawLabel(
          c,
          selId,
          action,
          entry?.wadingIn ? "wading" : (entry?.e ?? "neutral"),
          fh,
        );

        // Vẽ trail từ đỉnh đầu agent, mỗi 3 frame thêm 1 điểm
        if (c.currentFrame % 3 === 0) {
          const headY =
            fh.root.position.y + (fh.driver.currentHeight ?? fh.driver.registryEntry?.realHeight ?? 0.8);
          const headPt = new THREE.Vector3(
            fh.root.position.x,
            headY,
            fh.root.position.z,
          );

          // Chỉ thêm nếu agent đã di chuyển đủ xa (tránh duplicate points khi đứng yên)
          const last = fh.trailPoints[fh.trailPoints.length - 1];
          if (!last || last.distanceTo(headPt) > 0.02) {
            fh.trailPoints.push(headPt.clone());
            if (fh.trailPoints.length > 600) fh.trailPoints.shift(); // giới hạn độ dài trail
          }

          if (fh.trailPoints.length >= 2) {
            if (!fh.trailLine) {
              // Tạo line lần đầu khi có đủ 2 điểm
              fh.trailLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(fh.trailPoints),
                new THREE.LineBasicMaterial({
                  color: fh.color,
                  transparent: true,
                  opacity: 0.85,
                  depthTest: false, // Trail luôn hiện, không bị che bởi đồ vật
                }),
              );
              fh.trailLine.renderOrder = 999;
              c.scene.add(fh.trailLine);
            } else {
              // Cập nhật geometry với điểm mới
              (fh.trailLine.geometry as THREE.BufferGeometry).setFromPoints(
                fh.trailPoints,
              );
              (
                fh.trailLine.geometry.attributes
                  .position as THREE.BufferAttribute
              ).needsUpdate = true;
            }
          }
        }

        // System F: Debug Target Direction Arrow
        if (!fh.arrowHelper) {
          fh.arrowHelper = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1),
            fh.root.position,
            1.2,
            fh.color,
            0.3,
            0.3,
          );
          fh.arrowHelper.renderOrder = 1000;
          c.scene.add(fh.arrowHelper);
        }
        // Always point Arrow towards movement or targetRotation
        const lookDir = new THREE.Vector3(dx, 0, dz);
        if (lookDir.lengthSq() > 0.0001) {
          fh.arrowHelper.setDirection(lookDir.normalize());
        } else {
          // If no movement, fallback to current facing rot
          fh.arrowHelper.setDirection(
            new THREE.Vector3(
              Math.sin(fh.root.rotation.y),
              0,
              Math.cos(fh.root.rotation.y),
            ),
          );
        }
        fh.arrowHelper.position.copy(fh.root.position);
        fh.arrowHelper.position.y += 0.1; // Float slightly above foot level
        fh.arrowHelper.visible = !!showBoundingBoxes;

        // System G: Debug Capsule Collider
        if (!fh.capsuleHelper) {
          const capHeight = fh.driver.registryEntry?.realHeight ?? 1.1;
          const capRad =
            (fh.driver.registryEntry as any)?.capsuleRadius ?? 0.15;

          const geometry = new THREE.CapsuleGeometry(capRad, capHeight, 4, 8);
          const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            wireframe: true,
          });
          fh.capsuleHelper = new THREE.Mesh(geometry, material);
          fh.capsuleHelper.renderOrder = 999;
          c.scene.add(fh.capsuleHelper);
        }
        fh.capsuleHelper.position.copy(fh.root.position);
        fh.capsuleHelper.position.y +=
          (fh.driver.registryEntry?.realHeight ?? 1.1) / 2;
        fh.capsuleHelper.visible = !!showBoundingBoxes;
      } else {
        if (fh.arrowHelper) fh.arrowHelper.visible = false;
        if (fh.capsuleHelper) fh.capsuleHelper.visible = false;
      }
    });

    if (selPos) c.controls.target.lerp(selPos, 0.06);
    if (onU) onU({ progress: prog, action: curAction, time: prog * dur });
  }

  // ─── Label drawing ────────────────────────────────────────────────────────
  function drawLabel(
    c: any,
    selId: number,
    action: string,
    extra: string,
    fh: FigureHandle,
  ) {
    let spr = c.labels.find(
      (s: any) => s.userData?.forAgent === selId,
    ) as THREE.Sprite | null;
    if (!spr) {
      const cv = document.createElement("canvas");
      cv.width = 280;
      cv.height = 70;
      const tx = new THREE.CanvasTexture(cv);
      tx.minFilter = THREE.LinearFilter;
      spr = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tx,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      );
      spr!.renderOrder = 1000;
      spr!.scale.set(1.4, 0.35, 1);
      spr!.userData = { forAgent: selId, canvas: cv, tex: tx };
      c.scene.add(spr);
      c.labels.push(spr);
    }
    const cv2 = spr!.userData.canvas as HTMLCanvasElement;
    const c2 = cv2.getContext("2d")!;
    c2.clearRect(0, 0, 280, 70);
    c2.fillStyle =
      extra === "wading" ? "rgba(10,40,180,0.82)" : "rgba(10,10,30,0.78)";
    c2.beginPath();
    (c2 as any).roundRect?.(8, 6, 264, 58, 14) ?? c2.rect(8, 6, 264, 58);
    c2.fill();
    c2.font = "bold 24px system-ui, sans-serif";
    c2.fillStyle = "#fff";
    c2.textAlign = "center";
    c2.textBaseline = "middle";
    c2.fillText(
      extra === "wading" ? "🌊 wading" : `${ICONS[action] ?? "🔹"} ${action}`,
      140,
      35,
      256,
    );
    (spr!.userData.tex as THREE.CanvasTexture).needsUpdate = true;
    const labelY = fh.root.position.y + fh.driver.currentHeight + 0.15;
    spr!.position.set(fh.root.position.x, labelY, fh.root.position.z);
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      style={{ minHeight: 400, background: "#111520" }}
    >
      {loadStatus && (
        <div className="absolute top-4 left-4 z-10 bg-black/70 text-white px-4 py-2 rounded-xl text-sm font-bold backdrop-blur-sm">
          {loadStatus}
          {loadPct !== null && (
            <div className="mt-1 w-40 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all"
                style={{ width: `${loadPct}%` }}
              />
            </div>
          )}
        </div>
      )}
      <div className="absolute bottom-3 right-3 z-10 text-[10px] text-white/25 font-mono select-none">
        LMB Orbit · RMB Pan · Scroll Zoom
      </div>
    </div>
  );
};
export default Canvas3D;