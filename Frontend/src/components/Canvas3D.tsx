import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
}

// ─── Figure handle ────────────────────────────────────────────────────────────
interface FigureHandle {
  driver: IFigureDriver;
  root: THREE.Group;
  agentId: number;
  ageId: string;
  trajectory?: number[][];
  actionLog?: ActionEntry[];
  lx?: number;
  lz?: number;
  walkCycle: number;
  currentlyWading: boolean;
  lastFloorY: number;
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

  return new THREE.Vector3(x - offsetXYZ.x, y - offsetXYZ.y, z - offsetXYZ.z);
}

function getFloorY(c: any, worldPos: THREE.Vector3): number | null {
  const meshes = c.sceneMeshes as THREE.Mesh[];
  if (!meshes.length) return null;

  const rc = c.raycaster as THREE.Raycaster;
  // Cast from well above the agent position downward to catch any floor
  rc.set(
    new THREE.Vector3(worldPos.x, worldPos.y + 2.0, worldPos.z),
    new THREE.Vector3(0, -1, 0),
  );
  rc.far = 10.0; // detect surfaces within 10m below (handles multi-story)

  const hits = rc.intersectObjects(meshes, false);
  if (!hits.length) {
    // Fallback: use the scene's known floor height
    return c.physicsFloorY ?? null;
  }

  // Take the highest hit surface (closest from above)
  return hits[0].point.y;
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
  run: "🏃",
  sprint: "💨",
  climb_on: "🧗",
  climb: "🧗",
  stumble: "⚠️",
  falling: "💥",
  free_fall: "💥",
  idle: "💤",
  wade: "🌊",
  grab_mouth: "👄",
  investigate: "👀",
};

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
  });
  propsRef.current = {
    simulationPlayback,
    playbackPaused,
    selectedAgentId,
    onPlaybackUpdate,
    playbackSeek,
    enableFloorSnap,
    sceneData,
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
    scene.add(new THREE.GridHelper(30, 30, 0x334455, 0x1a2535));
    scene.add(new THREE.AxesHelper(2));

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
      model: null,
      offsetXZ: new THREE.Vector2(),
      offsetXYZ: new THREE.Vector3(),
      physicsFloorY: 0,
      floorBias: 0,
      sceneMeshes: [] as THREE.Mesh[],
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
    const dur = simulationPlayback?.config?.duration ?? 10;
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
      (gltf) => {
        const model = gltf.scene;

        model.scale.setScalar(sceneUnitScale);
        c.scene.add(model);
        model.updateMatrixWorld(true);

        const box3 = new THREE.Box3().setFromObject(model);
        const ctr = box3.getCenter(new THREE.Vector3());

        model.position.set(-ctr.x, -box3.min.y, -ctr.z);
        model.updateMatrixWorld(true);

        c.model = model;

        c.offsetXZ = new THREE.Vector2(ctr.x, ctr.z);

        c.offsetXYZ = new THREE.Vector3(ctr.x, box3.min.y, ctr.z);

        // physicsFloorY in world space (after model position offset)
        // model.position.y = -box3.min.y, so floor = box3.min.y + (-box3.min.y) = 0
        // Unless sceneData has explicit floor height (which is also in physics space)
        const rawFloorY =
          propsRef.current.sceneData?.floor?.height != null
            ? (propsRef.current.sceneData.floor.height as number) *
              sceneUnitScale
            : box3.min.y;
        // Convert to world space: rawFloorY - offsetXYZ.y = rawFloorY - box3.min.y
        c.physicsFloorY = rawFloorY - box3.min.y;

        c.floorBias = rawFloorY - box3.min.y;

        model.traverse((o: THREE.Object3D) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.layers.enable(1);
            mesh.receiveShadow = true;
            mesh.castShadow = true;

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
          `[Canvas3D v6] Scene loaded.` +
            ` Size after scale: ${sz.x.toFixed(2)}m × ${sz.y.toFixed(2)}m × ${sz.z.toFixed(2)}m.` +
            ` box3.min.y=${box3.min.y.toFixed(3)}  physicsFloorY=${c.physicsFloorY.toFixed(3)}` +
            ` floorBias=${c.floorBias.toFixed(3)}m.` +
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
    realHeight: number,
    action: string,
    doSnap: boolean,
  ): number {
    // Decode foot position from physics center
    const backendBaseY = worldPos.y - realHeight / 2;

    // The absolute floor of the scene (from the loaded GLB model)
    const sceneFloorY = c.physicsFloorY ?? 0;

    // Always try floor snap — even for falling, to prevent infinite sinking
    if (doSnap) {
      const rayY = getFloorY(c, worldPos);
      if (rayY !== null) {
        // For falling states allow larger snap distance (agent may be high Up)
        const threshold = ["falling", "free_fall"].includes(action) ? 5.0 : 1.5;
        if (Math.abs(rayY - backendBaseY) < threshold) {
          return rayY;
        }
      }
    }

    // Absolute floor guard — agent can NEVER render below the scene floor
    return Math.max(backendBaseY, sceneFloorY);
  }

  // ── Spawn playback agents ─────────────────────────────────────────────────
  useEffect(() => {
    if (!ctx.current) return;
    const c = ctx.current;
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
    if (!simulationPlayback?.trajectories) return;

    const defAge = simulationPlayback.config?.ageGroupId ?? "toddler";
    const offXYZ = c.offsetXYZ as THREE.Vector3;

    simulationPlayback.trajectories.forEach((tr, i) => {
      if (!tr?.positions?.length) return;
      const ageId = tr.ageGroupId ?? defAge;
      const color = AGENT_PALETTE[i % AGENT_PALETTE.length];
      const driver = createDriver(ageId, i, color);
      const handle: FigureHandle = {
        driver,
        root: driver.root,
        agentId: tr.agentId ?? i,
        ageId,
        trajectory: tr.positions,
        actionLog: tr.actionLog ?? [],
        walkCycle: 0,
        currentlyWading: false,
        lastFloorY: 0,
      };
      driver.root.traverse((o: THREE.Object3D) => o.layers.set(0));
      driver.root.visible = false;
      c.scene.add(driver.root);
      c.figures.push(handle);

      // Trail (uses same toWorldSpace so it correctly maps to the scene)
      const raw = tr.positions.filter(
        (p: any) => Array.isArray(p) && p.length >= 3,
      );
      if (raw.length >= 2) {
        const step = Math.max(1, Math.floor(raw.length / 300));
        const pts = raw
          .filter((_: any, j: number) => j % step === 0)
          .map((p: number[]) => {
            const wp = toWorldSpace(p, offXYZ);
            const rh = driver.registryEntry?.realHeight ?? 0.8;
            // Place trail at foot level
            return new THREE.Vector3(wp.x, wp.y - rh / 2, wp.z);
          });
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: 0.4,
          }),
        );
        c.scene.add(line);
        c.trails.push(line);
      }
    });

    c.isPlaying = !playbackPaused;
    c.playStart = Date.now();
    c.currentFrame = 0;
    c.figures.forEach((fh: FigureHandle) => (fh.root.visible = true));
  }, [simulationPlayback]);

  // ── Selection / highlights ────────────────────────────────────────────────
  useEffect(() => {
    if (!ctx.current) return;
    const c = ctx.current;
    c.figures.forEach((fh: FigureHandle) => {
      const sel = selectedAgentId === null || fh.agentId === selectedAgentId;
      fh.root.traverse((ch: any) => {
        if (ch.isMesh && ch.material) {
          ch.material.opacity = sel ? 1 : 0.1;
          ch.material.transparent = true;
        }
      });
    });
    c.trails.forEach((l: THREE.Line, i: number) => {
      const mat2 = l.material as THREE.LineBasicMaterial;
      mat2.opacity =
        selectedAgentId === null
          ? 0.4
          : c.figures[i]?.agentId === selectedAgentId
            ? 0.85
            : 0.04;
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
        // Collision points are foot-level positions (not center)
        sph.position.copy(wp);
        c.scene.add(sph);
        c.hitSpheres.push(sph);
      });
    }
  }, [selectedAgentId, simulationPlayback]);

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
    c.bbHelpers.forEach((h: THREE.Object3D) => {
      h.visible = !showHeatmap;
    });
    if (!showHeatmap || !heatmapData?.length || !c.model) return;
    const off = c.offsetXYZ as THREE.Vector3;
    const unitScale = sceneUnitScale || 1.0;

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
        const heatBox = new THREE.Mesh(
          new THREE.BoxGeometry(sz.x, sz.y, sz.z),
          new THREE.MeshBasicMaterial({
            color: hc,
            transparent: true,
            opacity: 0.1 + obj.intensity * 0.18,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        heatBox.position.copy(c.model.worldToLocal(ctr.clone()));
        heatBox.scale.setScalar(1 / unitScale);
        c.model.add(heatBox);
        c.heatMeshes.push(heatBox);
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
        const wPos = toWorldSpace(pos, off);
        sph.position.copy(c.model.worldToLocal(wPos.clone()));
        sph.scale.setScalar(1 / unitScale);
        sph.userData.severe = sev;
        sph.userData.base = 0.9;
        c.model.add(sph);
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
    const offXYZ = c.offsetXYZ as THREE.Vector3;
    const frameDt = 1 / 60;

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
        const driver = createDriver(a.ageGroupId ?? "toddler", i, color);
        const handle: FigureHandle = {
          driver,
          root: driver.root,
          agentId: a.agentId,
          ageId: a.ageGroupId ?? "toddler",
          walkCycle: 0,
          currentlyWading: false,
          lastFloorY: 0,
        };
        driver.root.traverse((o: THREE.Object3D) => o.layers.set(0));
        const wp = toWorldSpace(a.position, offXYZ);
        const realHeight = driver.registryEntry?.realHeight ?? 0.8;
        const finalY = resolveAgentY(
          c,
          wp,
          realHeight,
          "idle",
          enableFloorSnap,
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
      const realHeight = fh.driver.registryEntry?.realHeight ?? 0.8;

      const dx = tgt.x - fh.root.position.x;
      const dz = tgt.z - fh.root.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // FIX-M3: Infer action from movement speed instead of hardcoding "walk"
      const liveAction = dist > 0.02 ? "run" : dist > 0.005 ? "walk" : "idle";

      const rawY = resolveAgentY(c, tgt, realHeight, liveAction, enableFloorSnap);
      // Smooth transitions for live positions (interpolate Y only slightly)
      const finalY = fh.root.position.y + (rawY - fh.root.position.y) * 0.2;
      fh.lastFloorY = rawY;

      fh.root.position.set(tgt.x, finalY, tgt.z);

      if (dist > 0.001) fh.root.rotation.y = Math.atan2(dx, dz);
      const lodLevel = getLOD(fh.root, c.camera);
      if (lodLevel !== "far") {
        fh.driver.update(frameDt, { a: liveAction, v: 0 });
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
    const dur = sp.config?.duration ?? 10;
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
      if (spd > 0.001) fh.root.rotation.y = Math.atan2(dx, dz);
      fh.lx = simPos[0];
      fh.lz = simPos[2];

      // Action entry
      let entry: ActionEntry | null = null;
      if (aLog?.length) {
        const li = Math.min(
          Math.floor(prog * (aLog.length - 1)),
          aLog.length - 1,
        );
        entry = aLog[li] ?? null;
      }
      const action = entry?.a ?? (spd > 0.003 ? "walk" : "idle");
      fh.currentlyWading = !!entry?.wadingIn;

      // FIX-BUG01B: Convert physics center → Three.js world, then decode foot Y
      const offXYZ = c.offsetXYZ as THREE.Vector3;
      const worldPos = toWorldSpace(simPos, offXYZ); // worldPos.y = centerY - box3.min.y
      const realHeight = fh.driver.registryEntry?.realHeight ?? 0.8;

      const finalY = resolveAgentY(
        c,
        worldPos,
        realHeight,
        action,
        enableFloorSnap,
      );
      fh.lastFloorY = finalY;

      // Debug logging for infant (only 2% of frames to avoid spam)
      if (fh.ageId === "infant" && Math.random() < 0.02) {
        const backendBaseY = worldPos.y - realHeight / 2;
        console.log(
          `[Infant] h=${fh.driver.currentHeight.toFixed(3)} ` +
            `centerY_3js=${worldPos.y.toFixed(3)} backendFoot=${backendBaseY.toFixed(3)} ` +
            `finalY=${finalY.toFixed(3)} action=${action}`,
        );
      }

      fh.root.position.set(worldPos.x, finalY, worldPos.z);

      const lodLevel = getLOD(fh.root, c.camera);
      if (lodLevel !== "far") {
        fh.driver.update(dt, entry ?? { a: action, e: "neutral", v: 0 });
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
        }),
      );
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
