import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/* ── Types ───────────────────────────────────────────────── */
interface SceneObject {
  id: string;
  name?: string;
  boundingBox: { min: number[]; max: number[] };
  classification?: { dangerScore?: number };
}

interface SceneData {
  objects?: SceneObject[];
  floor?: { objectId?: string; height?: number };
  boundingBox?: { min: number[]; max: number[] };
}

interface TrajectoryData {
  agentId: number;
  positions: number[][];
}

interface SimulationPlayback {
  trajectories?: TrajectoryData[];
  config?: { fps?: number; duration?: number };
}

interface HeatmapObject {
  objectId: string;
  objectName: string;
  boundingBox?: { min: number[]; max: number[] };
  totalHits: number;
  collisionPositions: number[][];
  maxInjuryScore: number;
  avgInjuryScore: number;
  maxGForce: number;
  avgGForce: number;
  worstGForceTier: string;
  primaryBodyPart: string;
  heatColor: number[];
  intensity: number;
  recommendations: any[];
}

interface LiveAgentPosition {
  agentId: number;
  position: number[];
}

interface Canvas3DProps {
  modelPath?: string;
  fileName?: string;
  sceneData?: SceneData | null;
  simulationPlayback?: SimulationPlayback | null;
  heatmapData?: HeatmapObject[] | null;
  showHeatmap?: boolean;
  liveAgentPositions?: LiveAgentPosition[] | null;
}

/* ── Component ───────────────────────────────────────────── */
const Canvas3D: React.FC<Canvas3DProps> = ({
  modelPath,
  sceneData,
  simulationPlayback,
  heatmapData,
  showHeatmap = false,
  liveAgentPositions,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const internals = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    frameId: number;
    agentMeshes: THREE.Mesh[];
    heatmapMeshes: THREE.Mesh[];
    liveAgentMeshes: THREE.Mesh[];
    currentModel: THREE.Object3D | null;
    modelOffset: THREE.Vector3;
    bbHelpers: THREE.Object3D[];
    isPlaying: boolean;
    playStart: number;
    currentFrame: number;
  } | null>(null);

  const [loadingPct, setLoadingPct] = useState<number | null>(null);
  const [loadStatus, setLoadStatus] = useState<string>('');

  /* ── INIT scene (runs once) ─────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 400;
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    camera.position.set(5, 5, 5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.5;
    controls.maxDistance = 200;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0xb1e1ff, 0xb97a20, 0.4);
    scene.add(hemiLight);

    // Grid & Axes (at origin as reference)
    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    scene.add(grid);
    const axes = new THREE.AxesHelper(3);
    scene.add(axes);

    // Store internals
    internals.current = {
      scene,
      camera,
      renderer,
      controls,
      frameId: 0,
      agentMeshes: [],
      heatmapMeshes: [],
      liveAgentMeshes: [],
      currentModel: null,
      modelOffset: new THREE.Vector3(),
      bbHelpers: [],
      isPlaying: false,
      playStart: 0,
      currentFrame: 0,
    };

    // Animation loop
    const animate = () => {
      const ctx = internals.current;
      if (!ctx) return;
      ctx.frameId = requestAnimationFrame(animate);
      ctx.controls.update();

      // Agent playback
      if (ctx.isPlaying && simulationPlayback?.trajectories) {
        updateAgentPositions(ctx);
      }

      ctx.renderer.render(ctx.scene, ctx.camera);
    };
    animate();

    // Resize
    const onResize = () => {
      if (!container || !internals.current) return;
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      internals.current.camera.aspect = nw / nh;
      internals.current.camera.updateProjectionMatrix();
      internals.current.renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (internals.current) {
        cancelAnimationFrame(internals.current.frameId);
        internals.current.controls.dispose();
        if (container.contains(internals.current.renderer.domElement)) {
          container.removeChild(internals.current.renderer.domElement);
        }
        internals.current.renderer.dispose();
        internals.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── LOAD MODEL when modelPath changes ─────────────────── */
  useEffect(() => {
    if (!internals.current || !modelPath?.trim()) return;
    const ctx = internals.current;

    // Remove previous model + helpers
    if (ctx.currentModel) {
      ctx.scene.remove(ctx.currentModel);
      ctx.currentModel = null;
    }
    ctx.bbHelpers.forEach((h) => ctx.scene.remove(h));
    ctx.bbHelpers = [];

    const url = modelPath.startsWith('/')
      ? `${window.location.origin}${modelPath}`
      : modelPath;

    console.log('[Canvas3D] Loading model:', url);
    setLoadStatus('⏳ Downloading model...');
    setLoadingPct(0);

    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;

        // ──────────────────────────────────────────────────────
        // STEP 1: Add model to scene FIRST
        // ──────────────────────────────────────────────────────
        ctx.scene.add(model);

        // ──────────────────────────────────────────────────────
        // STEP 2: Compute the original bounding box, then center
        // ──────────────────────────────────────────────────────
        model.updateMatrixWorld(true); // ensure matrices are current
        const worldBox = new THREE.Box3().setFromObject(model);
        const center = worldBox.getCenter(new THREE.Vector3());
        const size = worldBox.getSize(new THREE.Vector3());

        // Shift model: center horizontally (X,Z), align floor to Y=0 (grid)
        model.position.set(
          -center.x,                // center on X
          -worldBox.min.y,          // align bottom (floor) to Y=0
          -center.z,                // center on Z
        );
        ctx.currentModel = model;
        // Save the model offset for coordinate transformation
        ctx.modelOffset = new THREE.Vector3(center.x, worldBox.min.y, center.z);

        // ──────────────────────────────────────────────────────
        // STEP 3: FORCE full world-matrix recalculation
        //   This is critical — without it, child mesh world
        //   matrices are stale and bounding boxes won't match.
        // ──────────────────────────────────────────────────────
        model.updateMatrixWorld(true);

        // ──────────────────────────────────────────────────────
        // STEP 4: Compute bounding boxes CLIENT-SIDE from the
        //   now-correctly-transformed Three.js meshes.
        // ──────────────────────────────────────────────────────
        const meshNames: string[] = [];
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;

            // Force this mesh's world matrix to be up-to-date
            mesh.updateWorldMatrix(true, false);

            const meshBox = new THREE.Box3().setFromObject(mesh);
            const meshName = mesh.name || mesh.parent?.name || `mesh_${meshNames.length}`;
            meshNames.push(meshName);

            // Determine color from sceneData danger score (if available)
            let color = 0x00ff00; // green default
            if (sceneData?.objects) {
              const matchObj = sceneData.objects.find(
                (o) => o.name === meshName || o.name === mesh.parent?.name
              );
              const danger = matchObj?.classification?.dangerScore ?? 0;
              if (danger > 7) color = 0xff0000;
              else if (danger > 4) color = 0xff8800;
            }

            const helper = new THREE.Box3Helper(meshBox, new THREE.Color(color));
            ctx.scene.add(helper);
            ctx.bbHelpers.push(helper);
          }
        });

        console.log(`[Canvas3D] Created ${ctx.bbHelpers.length} bounding boxes for meshes:`, meshNames);

        // ──────────────────────────────────────────────────────
        // STEP 4: Frame camera to see the centered model
        // ──────────────────────────────────────────────────────
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = ctx.camera.fov * (Math.PI / 180);
        let camDist = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        camDist *= 1.6;

        ctx.camera.position.set(camDist * 0.7, camDist * 0.6, camDist * 0.7);
        ctx.camera.lookAt(0, 0, 0);
        ctx.controls.target.set(0, 0, 0);
        ctx.controls.update();

        // Store the offset so agents can be shifted the same way
        (ctx as any).modelOffset = new THREE.Vector3(center.x, worldBox.min.y, center.z);

        setLoadingPct(null);
        setLoadStatus('✅ Model loaded!');
        console.log('[Canvas3D] ✅ Model centered at origin. Offset:', center.toArray());

        setTimeout(() => setLoadStatus(''), 3000);
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          setLoadingPct(pct);
          setLoadStatus(`⏳ Downloading... ${pct}%`);
        } else {
          const mb = (xhr.loaded / 1024 / 1024).toFixed(1);
          setLoadStatus(`⏳ Downloading... ${mb} MB`);
        }
      },
      (err) => {
        console.error('[Canvas3D] ❌ GLTF load error:', err);
        setLoadStatus('❌ Failed to load model');
        setLoadingPct(null);
      },
    );
  }, [modelPath, sceneData]);

  /* ── AGENT MESHES when simulationPlayback changes ──────── */
  useEffect(() => {
    if (!internals.current) return;
    const ctx = internals.current;

    // Remove old agents
    ctx.agentMeshes.forEach((m) => ctx.scene.remove(m));
    ctx.agentMeshes = [];
    ctx.isPlaying = false;

    if (!simulationPlayback?.trajectories) return;

    const agentGeo = new THREE.CapsuleGeometry(0.15, 0.6, 4, 8);
    const baseMat = new THREE.MeshPhongMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.85,
      emissive: 0x003311,
    });

    simulationPlayback.trajectories.forEach((traj) => {
      const mesh = new THREE.Mesh(agentGeo, baseMat.clone());
      mesh.userData.trajectory = traj.positions;
      mesh.userData.agentId = traj.agentId;
      mesh.visible = false;
      ctx.scene.add(mesh);
      ctx.agentMeshes.push(mesh);
    });

    console.log(`[Canvas3D] Created ${ctx.agentMeshes.length} agent capsules`);

    // Auto-play
    ctx.isPlaying = true;
    ctx.playStart = Date.now();
    ctx.currentFrame = 0;
    ctx.agentMeshes.forEach((m) => (m.visible = true));
  }, [simulationPlayback]);

  /* ── HEATMAP OVERLAYS ──────────────────────────────────── */
  useEffect(() => {
    if (!internals.current) return;
    const ctx = internals.current;

    // Remove old heatmap meshes
    ctx.heatmapMeshes.forEach((m) => {
      ctx.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    ctx.heatmapMeshes = [];

    if (!showHeatmap || !heatmapData || heatmapData.length === 0) return;
    if (!ctx.currentModel) return;

    const off = ctx.modelOffset;

    // 🔥 NEW: Render ALL heatmap objects as collision-point spheres
    // This is clearer than bounding boxes — shows EXACTLY where danger is
    heatmapData.forEach((obj) => {
      if (!obj.collisionPositions || obj.collisionPositions.length === 0) return;

      obj.collisionPositions.forEach((pos) => {
        // Sphere size scales with intensity — high danger = larger sphere
        const radius = 0.15 + obj.intensity * 0.35;
        const sphereGeo = new THREE.SphereGeometry(radius, 16, 16);
        const sphereMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(obj.heatColor[0], obj.heatColor[1], obj.heatColor[2]),
          transparent: true,
          opacity: 0.4 + obj.intensity * 0.5,
          depthWrite: false,
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.set(pos[0] - off.x, pos[1] - off.y, pos[2] - off.z);
        sphere.userData.baseOpacity = 0.4 + obj.intensity * 0.5;
        sphere.userData.intensity = obj.intensity;
        ctx.scene.add(sphere);
        ctx.heatmapMeshes.push(sphere);

        // Add a ring/disc around each sphere for ground-level visibility
        if (obj.intensity >= 0.5) {
          const ringGeo = new THREE.RingGeometry(radius * 0.5, radius * 2, 24);
          const ringMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(obj.heatColor[0], obj.heatColor[1], obj.heatColor[2]),
            transparent: true,
            opacity: 0.2 + obj.intensity * 0.2,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.set(pos[0] - off.x, pos[1] - off.y, pos[2] - off.z);
          ring.rotation.x = -Math.PI / 2; // Lay flat
          ring.userData.baseOpacity = 0.2 + obj.intensity * 0.2;
          ring.userData.intensity = obj.intensity;
          ctx.scene.add(ring);
          ctx.heatmapMeshes.push(ring);
        }
      });
    });

    console.log(`[Canvas3D] Created ${ctx.heatmapMeshes.length} heatmap overlays (spheres at collision points)`);
  }, [heatmapData, showHeatmap]);

  /* ── Heatmap pulse animation ─────────────────────────── */
  useEffect(() => {
    if (!showHeatmap || !internals.current) return;
    const ctx = internals.current;
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = Date.now() * 0.003;
      ctx.heatmapMeshes.forEach((m) => {
        if (m.userData.intensity >= 0.5) {
          const pulse = 1 + Math.sin(t) * 0.15;
          (m.material as THREE.MeshBasicMaterial).opacity = m.userData.baseOpacity * pulse;
        }
      });
    };
    animate();
    return () => cancelAnimationFrame(animId);
  }, [showHeatmap, heatmapData]);

  /* ── LIVE AGENT POSITIONS (during simulation) ──────────── */
  useEffect(() => {
    if (!internals.current) return;
    const ctx = internals.current;
    const off = ctx.modelOffset;

    if (!liveAgentPositions || liveAgentPositions.length === 0) {
      // Clean up live agents when simulation finishes
      ctx.liveAgentMeshes.forEach((m) => {
        ctx.scene.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      ctx.liveAgentMeshes = [];
      return;
    }

    // Create agent meshes if needed
    if (ctx.liveAgentMeshes.length === 0) {
      const agentColors = [
        0x00bcd4, 0x4caf50, 0xff9800, 0xe91e63, 0x9c27b0,
        0x2196f3, 0xcddc39, 0xff5722, 0x607d8b, 0x795548,
      ];
      liveAgentPositions.forEach((agent, i) => {
        const capsuleGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.6, 8);
        const capsuleMat = new THREE.MeshPhongMaterial({
          color: agentColors[i % agentColors.length],
          transparent: true,
          opacity: 0.85,
          emissive: agentColors[i % agentColors.length],
          emissiveIntensity: 0.3,
        });
        const mesh = new THREE.Mesh(capsuleGeo, capsuleMat);
        mesh.position.set(
          agent.position[0] - off.x,
          agent.position[1] - off.y + 0.3,
          agent.position[2] - off.z,
        );
        mesh.castShadow = true;
        ctx.scene.add(mesh);
        ctx.liveAgentMeshes.push(mesh);
      });
      console.log(`[Canvas3D] Created ${ctx.liveAgentMeshes.length} live agent meshes`);
    } else {
      // Update existing agent positions with smooth interpolation
      liveAgentPositions.forEach((agent, i) => {
        if (i < ctx.liveAgentMeshes.length) {
          const mesh = ctx.liveAgentMeshes[i];
          const targetX = agent.position[0] - off.x;
          const targetY = agent.position[1] - off.y + 0.3;
          const targetZ = agent.position[2] - off.z;
          // Smooth interpolation
          mesh.position.x += (targetX - mesh.position.x) * 0.3;
          mesh.position.y += (targetY - mesh.position.y) * 0.3;
          mesh.position.z += (targetZ - mesh.position.z) * 0.3;
        }
      });
    }
  }, [liveAgentPositions]);

  /* ── Agent position update ─────────────────────────────── */
  function updateAgentPositions(ctx: NonNullable<typeof internals.current>) {
    if (!simulationPlayback) return;
    const fps = simulationPlayback.config?.fps ?? 60;
    const dur = simulationPlayback.config?.duration ?? 10;
    const totalFrames = fps * dur;

    const elapsed = (Date.now() - ctx.playStart) / 1000;
    ctx.currentFrame = Math.floor(elapsed * fps);

    if (ctx.currentFrame >= totalFrames) {
      ctx.currentFrame = 0;
      ctx.playStart = Date.now();
    }

    // The model was shifted by -modelOffset, so shift agent coords the same way
    const offset: THREE.Vector3 = (ctx as any).modelOffset || new THREE.Vector3();

    ctx.agentMeshes.forEach((mesh) => {
      const traj = mesh.userData.trajectory as number[][] | undefined;
      if (traj && traj[ctx.currentFrame]) {
        const pos = traj[ctx.currentFrame];
        mesh.position.set(
          pos[0] - offset.x,
          pos[1] - offset.y,
          pos[2] - offset.z,
        );
      }
    });
  }

  /* ── RENDER ─────────────────────────────────────────────── */
  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ minHeight: '400px' }}>
      {/* Loading overlay */}
      {loadStatus && (
        <div className="absolute top-4 left-4 z-10 bg-black/70 text-white px-4 py-2 rounded-xl text-sm font-bold backdrop-blur-sm">
          {loadStatus}
          {loadingPct !== null && (
            <div className="mt-1 w-40 h-1.5 bg-gray-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-400 transition-all duration-200"
                style={{ width: `${loadingPct}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-3 right-3 z-10 text-[11px] text-white/40 font-mono select-none">
        LMB: Orbit &nbsp;|&nbsp; RMB: Pan &nbsp;|&nbsp; Scroll: Zoom
      </div>
    </div>
  );
};

export default Canvas3D;
