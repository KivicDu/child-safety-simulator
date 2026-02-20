import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/Addons.js';
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
  ageGroupId?: string;
  positions: number[][];
  actionLog?: { s: string; a: string; v: number }[];
  collisions?: number[][];
  finalState?: any;
}

interface SimulationPlayback {
  trajectories?: TrajectoryData[];
  config?: { fps?: number; duration?: number; ageGroupId?: string };
}

interface HeatmapCollision {
  position: number[];
  normal: number[];
  score?: number;
  gForceTier?: string;
  riskTier?: string;
}

interface HeatmapObject {
  objectId: string;
  objectName: string;
  boundingBox?: any;
  collisions?: HeatmapCollision[]; // New format
  collisionPositions?: number[][]; // Legacy fallback
  maxInjuryScore: number;
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
  selectedAgentId?: number | null;
}

/* ── Component ───────────────────────────────────────────── */
const Canvas3D: React.FC<Canvas3DProps> = ({
  modelPath,
  sceneData,
  simulationPlayback,
  heatmapData,
  showHeatmap = false,
  liveAgentPositions,
  selectedAgentId = null,
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
    trailLines: THREE.Object3D[];
    actionLabelSprites: THREE.Sprite[];
    collisionHighlights: THREE.Mesh[];
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
      trailLines: [],
      actionLabelSprites: [],
      collisionHighlights: [],
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
      try {
        ctx.controls.update();

        // Agent playback
        if (ctx.isPlaying && simulationPlayback?.trajectories) {
          updateAgentPositions(ctx);
        }

        ctx.renderer.render(ctx.scene, ctx.camera);
      } catch (e) {
        console.error('[Canvas3D] Animation loop error:', e);
        if (e instanceof Error) {
          console.error('[Canvas3D] Stack:', e.stack);
        }
      }
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
        if (!model) {
          console.error('[Canvas3D] ❌ GLTF has no scene!');
          setLoadStatus('❌ Invalid Model File');
          setLoadingPct(null);
          return;
        }

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
        if (model.position) {
          model.position.set(
            -center.x,                // center on X
            -worldBox.min.y,          // align bottom (floor) to Y=0
            -center.z,                // center on Z
          );
        }
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

    // Remove old agents + trails + labels
    ctx.agentMeshes.forEach((m) => ctx.scene.remove(m));
    ctx.agentMeshes = [];
    ctx.trailLines.forEach((l) => ctx.scene.remove(l));
    ctx.trailLines = [];
    (ctx.actionLabelSprites || []).forEach((s) => ctx.scene.remove(s));
    ctx.actionLabelSprites = [];
    ctx.isPlaying = false;

    if (!simulationPlayback?.trajectories) return;

    // Age-group-specific capsule dimensions (radius, bodyLength)
    const ageSizes: Record<string, [number, number]> = {
      infant:     [0.10, 0.25],
      toddler:   [0.15, 0.45],
      preschool: [0.17, 0.55],
      school_age:[0.19, 0.65],
      preteen:   [0.22, 0.80],
    };
    const defaultAgeId = simulationPlayback.config?.ageGroupId || 'toddler';

    const agentColors = [
      0x00bcd4, 0x4caf50, 0xff9800, 0xe91e63, 0x9c27b0,
      0x2196f3, 0xcddc39, 0xff5722, 0x00e676, 0xf44336,
    ];
    const offset = ctx.modelOffset || new THREE.Vector3(0, 0, 0);
    const ox = typeof offset.x === 'number' ? offset.x : 0;
    const oy = typeof offset.y === 'number' ? offset.y : 0;
    const oz = typeof offset.z === 'number' ? offset.z : 0;

    simulationPlayback.trajectories.forEach((traj, i) => {
      if (!traj || !Array.isArray(traj.positions) || traj.positions.length === 0) {
        console.warn('[Canvas3D] Skipping invalid trajectory:', traj);
        return;
      }

      // Per-agent capsule size based on age group
      const ageId = (traj as any).ageGroupId || defaultAgeId;
      const [capRadius, capHeight] = ageSizes[ageId] || ageSizes.toddler;
      const agentGeo = new THREE.CapsuleGeometry(capRadius, capHeight, 4, 8);

      // Distinct color per agent
      const color = agentColors[i % agentColors.length];
      const mat = new THREE.MeshPhongMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        emissive: color,
        emissiveIntensity: 0.35,
      });
      const mesh = new THREE.Mesh(agentGeo, mat);
      mesh.userData.trajectory = traj.positions;
      mesh.userData.agentId = traj.agentId ?? i;
      mesh.userData.actionLog = (traj as any).actionLog || [];
      mesh.userData.ageGroupId = ageId;
      mesh.castShadow = true;
      mesh.visible = false;
      ctx.scene.add(mesh);
      ctx.agentMeshes.push(mesh);

      // Trajectory trail line (full path visualization)
      const validPts = traj.positions.filter(
        (p: any) => Array.isArray(p) && p.length >= 3 &&
          typeof p[0] === 'number' && typeof p[1] === 'number' && typeof p[2] === 'number'
      );
      if (validPts.length >= 2) {
        // Sample evenly to avoid too many points (max ~300)
        const step = Math.max(1, Math.floor(validPts.length / 300));
        const sampled = validPts.filter((_: any, idx: number) => idx % step === 0);
        const points = sampled.map(
          (p: number[]) => new THREE.Vector3(p[0] - ox, p[1] - oy + 0.05, p[2] - oz)
        );
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({
          color, transparent: true, opacity: 0.5, linewidth: 2,
        });
        const line = new THREE.Line(lineGeo, lineMat);
        ctx.scene.add(line);
        ctx.trailLines.push(line);
      }
    });

    console.log(`[Canvas3D] Created ${ctx.agentMeshes.length} agent capsules + ${ctx.trailLines.length} trails`);

    // Auto-play
    ctx.isPlaying = true;
    ctx.playStart = Date.now();
    ctx.currentFrame = 0;
    ctx.agentMeshes.forEach((m) => (m.visible = true));
  }, [simulationPlayback]);

  /* ── AGENT SELECTION (highlight one agent + trail) ───────── */
  useEffect(() => {
    if (!internals.current) return;
    const ctx = internals.current;

    ctx.agentMeshes.forEach((m) => {
      const mat = m.material as THREE.MeshPhongMaterial;
      if (selectedAgentId === null) {
        // No selection: show all agents at full opacity
        mat.opacity = 0.9;
        m.visible = true;
      } else {
        // Dim non-selected agents, highlight selected
        const isSelected = m.userData.agentId === selectedAgentId;
        mat.opacity = isSelected ? 1.0 : 0.15;
        m.visible = true;
      }
    });

    ctx.trailLines.forEach((line, i) => {
      const mat = (line as THREE.Line).material as THREE.LineBasicMaterial;
      const agentMesh = ctx.agentMeshes[i];
      if (selectedAgentId === null) {
        mat.opacity = 0.5;
        line.visible = true;
      } else {
        const isSelected = agentMesh?.userData.agentId === selectedAgentId;
        mat.opacity = isSelected ? 0.9 : 0.08;
        line.visible = true;
      }
    });

    // Clean up action label sprites for non-selected/deselected agents
    ctx.actionLabelSprites = (ctx.actionLabelSprites || []).filter((s) => {
      if (selectedAgentId === null || s.userData?.forAgent !== selectedAgentId) {
        ctx.scene.remove(s);
        return false;
      }
      return true;
    });

    // Clean up old collision highlights
    (ctx.collisionHighlights || []).forEach((m) => {
      ctx.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
    ctx.collisionHighlights = [];

    // Render collision highlights for the selected agent
    if (selectedAgentId !== null && simulationPlayback?.trajectories) {
      const traj = simulationPlayback.trajectories.find(
        (t) => (t.agentId ?? 0) === selectedAgentId
      );
      const collisionPositions = traj?.collisions;
      if (Array.isArray(collisionPositions) && collisionPositions.length > 0) {
        const offset = ctx.modelOffset || new THREE.Vector3(0, 0, 0);
        const ox = typeof offset.x === 'number' ? offset.x : 0;
        const oy = typeof offset.y === 'number' ? offset.y : 0;
        const oz = typeof offset.z === 'number' ? offset.z : 0;

        const sphereGeo = new THREE.SphereGeometry(0.12, 12, 12);
        const sphereMat = new THREE.MeshBasicMaterial({
          color: 0xff2222,
          transparent: true,
          opacity: 0.8,
        });

        collisionPositions.forEach((pos) => {
          if (!Array.isArray(pos) || pos.length < 3) return;
          const sphere = new THREE.Mesh(sphereGeo, sphereMat.clone());
          sphere.position.set(pos[0] - ox, pos[1] - oy, pos[2] - oz);
          ctx.scene.add(sphere);
          ctx.collisionHighlights.push(sphere);
        });
      }
    }
  }, [selectedAgentId, simulationPlayback]);
  useEffect(() => {
    if (!internals.current) return;
    const ctx = internals.current;

    // Remove old heatmap meshes
    ctx.heatmapMeshes.forEach((m) => {
      ctx.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
        else (m.material as THREE.Material).dispose();
      }
    });
    ctx.heatmapMeshes = [];
    if ((ctx as any).heatmapDecals) {
      (ctx as any).heatmapDecals.forEach((d: THREE.Mesh) => {
        ctx.scene.remove(d);
        if (d.geometry) d.geometry.dispose();
        if (d.material) (d.material as THREE.Material).dispose();
      });
      (ctx as any).heatmapDecals = [];
    }

    // Toggle model bounding boxes: hide when heatmap is active for clarity
    ctx.bbHelpers.forEach((h) => { h.visible = !showHeatmap; });

    if (!showHeatmap || !heatmapData || heatmapData.length === 0) return;
    if (!ctx.currentModel && ctx.scene.children.length === 0) return;

    const off = ctx.modelOffset || new THREE.Vector3(0, 0, 0);
    const offX = typeof off.x === 'number' ? off.x : 0;
    const offY = typeof off.y === 'number' ? off.y : 0;
    const offZ = typeof off.z === 'number' ? off.z : 0;

    console.log(`[Canvas3D] Generating heatmap for ${heatmapData.length} objects...`);

    heatmapData.forEach((obj) => {
      if (!obj) return;

      // Parse heat color (backend sends [r,g,b] as 0-1 floats)
      const r = obj.heatColor?.[0] ?? 1;
      const g = obj.heatColor?.[1] ?? 0;
      const b = obj.heatColor?.[2] ?? 0;
      const heatColor = new THREE.Color(r, g, b);

      // ── Object Bounding-Box Highlight ──
      if (obj.boundingBox) {
        const bb = obj.boundingBox;
        const min = bb.min || [0, 0, 0];
        const max = bb.max || [0, 0, 0];
        const boxMin = new THREE.Vector3(min[0] - offX, min[1] - offY, min[2] - offZ);
        const boxMax = new THREE.Vector3(max[0] - offX, max[1] - offY, max[2] - offZ);
        const box3 = new THREE.Box3(boxMin, boxMax);
        const boxCenter = box3.getCenter(new THREE.Vector3());
        const boxSize = box3.getSize(new THREE.Vector3());

        // Translucent filled box
        const boxGeo = new THREE.BoxGeometry(boxSize.x, boxSize.y, boxSize.z);
        const boxMat = new THREE.MeshBasicMaterial({
          color: heatColor, transparent: true,
          opacity: 0.12 + obj.intensity * 0.18,
          depthWrite: false, side: THREE.DoubleSide,
        });
        const boxMesh = new THREE.Mesh(boxGeo, boxMat);
        boxMesh.position.copy(boxCenter);
        boxMesh.userData.intensity = obj.intensity;
        boxMesh.userData.baseOpacity = boxMat.opacity;
        ctx.scene.add(boxMesh);
        ctx.heatmapMeshes.push(boxMesh);
      }

      // ── Collision Point Spheres (Severity-Based Coloring) ──
      const collisions = obj.collisions || [];
      const legacyPositions = obj.collisionPositions || [];

      // Determine color and blinking from per-collision severity
      const getSeverityStyle = (score: number, riskTier?: string) => {
        const isSevere = score >= 50 || riskTier === 'critical' || riskTier === 'dangerous';
        const isWarning = score >= 25 || riskTier === 'warning';
        const isCaution = score >= 1 || riskTier === 'watch';

        if (isSevere) return { color: new THREE.Color(1, 0.1, 0.1), blink: true, label: 'severe' };
        if (isWarning) return { color: new THREE.Color(1, 0.5, 0), blink: false, label: 'warning' };
        if (isCaution) return { color: new THREE.Color(1, 0.85, 0), blink: false, label: 'caution' };
        return { color: new THREE.Color(0.2, 0.9, 0.2), blink: false, label: 'safe' };
      };

      const createHeatSphere = (pos: number[], score = 0, riskTier?: string) => {
        if (!pos || pos.length < 3) return;
        let px = pos[0] - offX, py = pos[1] - offY, pz = pos[2] - offZ;

        // Snap to object bounding box surface (so markers sit ON the object)
        if (obj.boundingBox) {
          const bMin = obj.boundingBox.min || [0,0,0];
          const bMax = obj.boundingBox.max || [0,0,0];
          const mnX = bMin[0] - offX, mnY = bMin[1] - offY, mnZ = bMin[2] - offZ;
          const mxX = bMax[0] - offX, mxY = bMax[1] - offY, mxZ = bMax[2] - offZ;

          // Clamp inside the box first
          const cx = Math.max(mnX, Math.min(mxX, px));
          const cy = Math.max(mnY, Math.min(mxY, py));
          const cz = Math.max(mnZ, Math.min(mxZ, pz));

          // Push to nearest face of the bounding box (surface projection)
          const dists = [
            { axis: 'x', val: mnX, d: Math.abs(cx - mnX) },
            { axis: 'x', val: mxX, d: Math.abs(cx - mxX) },
            { axis: 'y', val: mnY, d: Math.abs(cy - mnY) },
            { axis: 'y', val: mxY, d: Math.abs(cy - mxY) },
            { axis: 'z', val: mnZ, d: Math.abs(cz - mnZ) },
            { axis: 'z', val: mxZ, d: Math.abs(cz - mxZ) },
          ];
          dists.sort((a, b) => a.d - b.d);
          const nearest = dists[0];
          px = cx; py = cy; pz = cz;
          if (nearest.axis === 'x') px = nearest.val;
          else if (nearest.axis === 'y') py = nearest.val;
          else pz = nearest.val;
        }

        const position = new THREE.Vector3(px, py, pz);
        const sev = getSeverityStyle(score, riskTier);

        // Outer glow (large, transparent, backside-rendered for bloom effect)
        const glowR = sev.blink ? 0.5 : 0.35;
        const glowGeo = new THREE.SphereGeometry(glowR, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
          color: sev.color, transparent: true,
          opacity: sev.blink ? 0.3 : 0.2,
          depthWrite: false, side: THREE.BackSide,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.copy(position);
        glow.userData.intensity = obj.intensity;
        glow.userData.baseOpacity = glowMat.opacity;
        glow.userData.severe = sev.blink;
        glow.userData.severityLabel = sev.label;
        ctx.scene.add(glow);
        ctx.heatmapMeshes.push(glow);

        // Inner core (smaller, solid, emissive)
        const coreR = sev.blink ? 0.2 : 0.14;
        const coreGeo = new THREE.SphereGeometry(coreR, 12, 12);
        const coreMat = new THREE.MeshStandardMaterial({
          color: sev.color, emissive: sev.color,
          emissiveIntensity: sev.blink ? 2.0 : 1.2,
          transparent: true, opacity: 0.9, depthWrite: false,
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.copy(position);
        core.userData.intensity = obj.intensity;
        core.userData.baseOpacity = 0.9;
        core.userData.severe = sev.blink;
        core.userData.severityLabel = sev.label;
        ctx.scene.add(core);
        ctx.heatmapMeshes.push(core);
      };

      collisions.forEach((c: any) => createHeatSphere(c.position, c.score ?? 0, c.riskTier));
      legacyPositions.forEach((p: any) => createHeatSphere(p, 0));

      // ── Decal bonus layer (silent skip if mesh not found) ──
      let targetMesh: THREE.Mesh | null = null;
      if (ctx.currentModel) {
        ctx.currentModel.traverse((child) => {
          if (child instanceof THREE.Mesh &&
              (child.name === obj.objectName ||
               child.userData.name === obj.objectName ||
               (obj.objectId && child.name.includes(obj.objectId)))) {
            targetMesh = child;
          }
        });
      }
      if (targetMesh) {
        const cv = document.createElement('canvas');
        cv.width = 64; cv.height = 64;
        const cx = cv.getContext('2d');
        if (cx) {
          const grd = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
          grd.addColorStop(0, 'rgba(255,255,255,1)');
          grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          cx.fillStyle = grd;
          cx.fillRect(0, 0, 64, 64);
        }
        const splatTex = new THREE.CanvasTexture(cv);
        collisions.forEach((c: any) => {
          if (!c.position || c.position.length < 3) return;
          const p = new THREE.Vector3(c.position[0] - offX, c.position[1] - offY, c.position[2] - offZ);
          const ori = new THREE.Euler();
          if (c.normal?.length === 3) {
            const n = new THREE.Vector3(c.normal[0], c.normal[1], c.normal[2]);
            const rm = new THREE.Matrix4();
            rm.lookAt(n, new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0));
            ori.setFromRotationMatrix(rm);
          }
          try {
            const dg = new DecalGeometry(targetMesh!, p, ori, new THREE.Vector3(0.5,0.5,0.5));
            const dm = new THREE.MeshBasicMaterial({
              map: splatTex, color: heatColor,
              transparent: true, opacity: 0.75,
              depthTest: true, depthWrite: false,
              polygonOffset: true, polygonOffsetFactor: -4,
            });
            const decal = new THREE.Mesh(dg, dm);
            ctx.scene.add(decal);
            ctx.heatmapMeshes.push(decal);
          } catch { /* skip failed decal */ }
        });
      }
    });

    console.log(`[Canvas3D] Created ${ctx.heatmapMeshes.length} heatmap elements`);
  }, [heatmapData, showHeatmap]);

  /* ── Heatmap pulse animation (severity-aware) ──────────── */
  useEffect(() => {
    if (!showHeatmap || !internals.current) return;
    const ctx = internals.current;
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = Date.now() * 0.004; // ~4Hz blink rate
      ctx.heatmapMeshes.forEach((m) => {
        if (m.userData.severe) {
          // Severe: strong blink between 0.3 and 1.0 opacity
          const blink = 0.5 + Math.sin(t) * 0.5;
          const mat = m.material as any;
          mat.opacity = m.userData.baseOpacity * blink;
          if (mat.emissiveIntensity !== undefined) {
            mat.emissiveIntensity = 1.0 + blink * 1.5;
          }
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
    const off = ctx.modelOffset || new THREE.Vector3(0, 0, 0);
    const offX = typeof off.x === 'number' ? off.x : 0;
    const offY = typeof off.y === 'number' ? off.y : 0;
    const offZ = typeof off.z === 'number' ? off.z : 0;

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
        // Safety check: skip if agent or position is undefined
        if (!agent || !agent.position || !Array.isArray(agent.position) || agent.position.length < 3) {
          console.warn(`[Canvas3D] Skipping agent ${i}: undefined or invalid position`, agent);
          return;
        }
        // Extra validation: ensure all position values are numbers
        if (typeof agent.position[0] !== 'number' || typeof agent.position[1] !== 'number' || typeof agent.position[2] !== 'number') {
          console.warn(`[Canvas3D] Skipping agent ${i}: position contains non-numeric values`, agent.position);
          return;
        }

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
          agent.position[0] - offX,
          agent.position[1] - offY + 0.3,
          agent.position[2] - offZ,
        );
        mesh.castShadow = true;
        ctx.scene.add(mesh);
        ctx.liveAgentMeshes.push(mesh);
      });
      console.log(`[Canvas3D] Created ${ctx.liveAgentMeshes.length} live agent meshes`);
    } else {
      // Update existing agent positions with smooth interpolation
      try {
        liveAgentPositions.forEach((agent, i) => {
          if (!agent || !agent.position || !Array.isArray(agent.position) || agent.position.length < 3) {
            return; // Skip invalid agents
          }
          // Extra validation: ensure all position values are numbers
          if (typeof agent.position[0] !== 'number' || typeof agent.position[1] !== 'number' || typeof agent.position[2] !== 'number') {
            return; // Skip agents with non-numeric positions
          }

          if (i < ctx.liveAgentMeshes.length) {
            const mesh = ctx.liveAgentMeshes[i];
            if (!mesh) return; // Extra safety

            const targetX = agent.position[0] - offX;
            const targetY = agent.position[1] - offY + 0.3;
            const targetZ = agent.position[2] - offZ;
            
            // Smooth interpolation
            mesh.position.x += (targetX - mesh.position.x) * 0.3;
            mesh.position.y += (targetY - mesh.position.y) * 0.3;
            mesh.position.z += (targetZ - mesh.position.z) * 0.3;
          }
        });
      } catch (e) {
        console.warn('[Canvas3D] Error updating live agents:', e);
      }
    }
  }, [liveAgentPositions]);

  /* ── Agent position update ─────────────────────────────── */
  function updateAgentPositions(ctx: NonNullable<typeof internals.current>) {
    if (!simulationPlayback) return;
    if (!simulationPlayback.trajectories || simulationPlayback.trajectories.length === 0) return;
    
    const fps = simulationPlayback.config?.fps ?? 60;
    const dur = simulationPlayback.config?.duration ?? 10;
    const totalFrames = fps * dur;

    try {
      const elapsed = (Date.now() - ctx.playStart) / 1000;
      ctx.currentFrame = Math.floor(elapsed * fps);

      if (ctx.currentFrame >= totalFrames) {
        ctx.currentFrame = 0;
        ctx.playStart = Date.now();
      }

      // The model was shifted by -modelOffset, so shift agent coords the same way
      const offset = ctx.modelOffset || new THREE.Vector3(0, 0, 0);
      const offsetX = typeof offset.x === 'number' ? offset.x : 0;
      const offsetY = typeof offset.y === 'number' ? offset.y : 0;
      const offsetZ = typeof offset.z === 'number' ? offset.z : 0;

      // Defensive: ensure agentMeshes is an array
      if (!Array.isArray(ctx.agentMeshes)) {
        console.warn('[Canvas3D] agentMeshes is not an array:', ctx.agentMeshes);
        return;
      }

      ctx.agentMeshes.forEach((mesh) => {
        if (!mesh || !(mesh instanceof THREE.Mesh)) {
          console.warn('[Canvas3D] Invalid mesh object:', mesh);
          return;
        }
        
        const traj = mesh.userData?.trajectory;
        
        // Safety check: ensure trajectory exists and has data
        if (!Array.isArray(traj) || traj.length === 0) {
          return;
        }
        
        try {
          // Map current progress (0..1) to trajectory index
          const progress = totalFrames > 0 ? ctx.currentFrame / totalFrames : 0;
          const rawIdx = Math.floor(progress * traj.length);
          const idx = Math.max(0, Math.min(rawIdx, traj.length - 1));
          
          const pos = traj[idx];
          
          // Extra validation: ensure pos is valid array of numbers
          if (!Array.isArray(pos) || pos.length < 3) {
            return;
          }
          
          if (typeof pos[0] !== 'number' || typeof pos[1] !== 'number' || typeof pos[2] !== 'number') {
            return;
          }
          
          // Ensure mesh.position is valid before setting
          if (!mesh.position || typeof mesh.position.set !== 'function') {
            console.warn('[Canvas3D] mesh.position is invalid:', mesh.position);
            return;
          }
          
          mesh.position.set(
            pos[0] - offsetX,
            pos[1] - offsetY,
            pos[2] - offsetZ,
          );

          // ── Action label for selected agent ──
          if (selectedAgentId !== null && mesh.userData.agentId === selectedAgentId) {
            const actionLog = mesh.userData.actionLog;
            if (Array.isArray(actionLog) && actionLog.length > 0) {
              const logIdx = Math.min(Math.floor(progress * actionLog.length), actionLog.length - 1);
              const entry = actionLog[logIdx];
              if (entry) {
                const actionIcons: Record<string, string> = {
                  crawl: '🐛', walk: '🚶', run: '🏃', sprint: '💨', climb: '🧗',
                  stumble: '⚠️', fall: '💥', idle: '😴', reach: '🤚', explore: '👀',
                  interact: '🖐️', pull: '🔧', push: '💪', roll: '🔄',
                };
                const icon = actionIcons[entry.a] || '🔹';
                const label = `${icon} ${entry.a}`;

                // Create or update the label sprite
                let sprite = ctx.actionLabelSprites.find(
                  (s: any) => s.userData?.forAgent === selectedAgentId
                );
                if (!sprite) {
                  // Create a canvas-based text sprite
                  const cv = document.createElement('canvas');
                  cv.width = 256; cv.height = 64;
                  const c2 = cv.getContext('2d')!;
                  c2.font = 'bold 28px Arial, sans-serif';
                  c2.textAlign = 'center';
                  c2.textBaseline = 'middle';
                  const tex = new THREE.CanvasTexture(cv);
                  tex.minFilter = THREE.LinearFilter;
                  const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
                  sprite = new THREE.Sprite(spriteMat);
                  sprite.scale.set(1.2, 0.3, 1);
                  sprite.userData.forAgent = selectedAgentId;
                  sprite.userData.canvas = cv;
                  sprite.userData.texture = tex;
                  ctx.scene.add(sprite);
                  ctx.actionLabelSprites.push(sprite);
                }

                // Redraw the label text
                const cv2 = sprite.userData.canvas as HTMLCanvasElement;
                const c2 = cv2.getContext('2d')!;
                c2.clearRect(0, 0, 256, 64);
                c2.fillStyle = 'rgba(0,0,0,0.7)';
                c2.roundRect(10, 8, 236, 48, 12);
                c2.fill();
                c2.fillStyle = '#ffffff';
                c2.font = 'bold 26px Arial, sans-serif';
                c2.textAlign = 'center';
                c2.textBaseline = 'middle';
                c2.fillText(label, 128, 32);
                (sprite.userData.texture as THREE.CanvasTexture).needsUpdate = true;

                sprite.position.set(
                  mesh.position.x,
                  mesh.position.y + 1.0,
                  mesh.position.z,
                );
                sprite.visible = true;
              }
            }
          }
        } catch (e) {
          console.warn('[Canvas3D] Error updating agent position:', e);
        }
      });
    } catch (e) {
      console.error('[Canvas3D] updateAgentPositions error:', e);
    }
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
