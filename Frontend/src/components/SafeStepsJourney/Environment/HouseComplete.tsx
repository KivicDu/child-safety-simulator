/**
 * HouseComplete — 4 Frame timeline with enhanced entrance polish:
 *
 *   exterior_wall: staggered fade out scroll 0.26→0.35
 *                  (roof first → walls → chimney last)
 *   window_glass:  pulsating warm glow (emissiveIntensity 1.4→2.2)
 *   light leak:    golden particles through window (0.20→0.35)
 *   whole house:   fade OUT 0.50→0.56  (Frame 2 bắt đầu)
 *                  fade IN  0.82→0.86  (Frame 4)
 *
 * Ẩn Table_14 (bàn nội thất sẵn có) để tránh duplicate
 *
 * IMPROVEMENTS (B1):
 *   • Window glow pulsates 1.4→2.2 intensity cycle
 *   • Staggered exterior mesh fade (roof→wall→chimney)
 *   • Light leak particle effect through window
 *   • Warmth overlay when entering house
 */
import { useEffect, useRef, useMemo } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const HOUSE_SCALE = 0.015137;
const HOUSE_FLOOR_Y = 0.1317;
const HIDE_NODES = ["Table_14"];

/* ── Stagger offsets for exterior meshes ──────────────── */
const EXTERIOR_STAGGER: Record<string, number> = {
  exterior_roof: 0.0,    // roof fades first
  exterior_wall: 0.03,   // walls follow
  chimney: 0.06,         // chimney last
};

interface Props {
  scrollProgress: number;
}

/* ── Light Leak Particles ─────────────────────────────── */
function LightLeakParticles({ visible, intensity }: { visible: boolean; intensity: number }) {
  const PARTICLE_COUNT = 24;
  const pointsRef = useRef<THREE.Points>(null!);
  const matRef = useRef<THREE.PointsMaterial>(null!);
  const timeRef = useRef(0);

  const positions = useMemo(() => {
    const p = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Particles emanate from window area
      p[i * 3]     = (Math.random() - 0.5) * 0.4;      // x spread
      p[i * 3 + 1] = 1.2 + Math.random() * 0.3;         // y around window
      p[i * 3 + 2] = 1.5 - Math.random() * 0.8;         // z drifting inward
    }
    return p;
  }, []);

  const velocities = useMemo(() => {
    const v = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      v[i * 3]     = (Math.random() - 0.5) * 0.003;   // slight x drift
      v[i * 3 + 1] = -(Math.random() * 0.002 + 0.001); // drift down slightly
      v[i * 3 + 2] = -(Math.random() * 0.005 + 0.002); // drift inward (negative z)
    }
    return v;
  }, []);

  useFrame((_, delta) => {
    if (!visible || !pointsRef.current) return;
    timeRef.current += delta;

    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3]     += velocities[i * 3];
      arr[i * 3 + 1] += velocities[i * 3 + 1];
      arr[i * 3 + 2] += velocities[i * 3 + 2];

      // Reset particles that drift too far
      if (arr[i * 3 + 2] < 0.6 || arr[i * 3 + 1] < 0.5) {
        arr[i * 3]     = (Math.random() - 0.5) * 0.4;
        arr[i * 3 + 1] = 1.2 + Math.random() * 0.3;
        arr[i * 3 + 2] = 1.5 - Math.random() * 0.3;
      }
    }
    posAttr.needsUpdate = true;

    if (matRef.current) {
      matRef.current.opacity = intensity * 0.5;
    }
  });

  if (!visible) return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.025}
        color="#ffe4a0"
        transparent
        opacity={intensity * 0.5}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ── Warmth Light (color grading via additional warm light) ── */
function WarmthLight({ intensity }: { intensity: number }) {
  if (intensity < 0.01) return null;
  return (
    <pointLight
      position={[0.1, 1.3, 1.5]}
      color="#ffe4a0"
      intensity={intensity * 1.2}
      distance={3}
      decay={2}
    />
  );
}

/* ═══ Main Component ═════════════════════════════════════ */
export default function HouseComplete({ scrollProgress }: Props) {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF("/models/house_complete.glb");
  const { actions } = useAnimations(animations, groupRef);

  const exteriorMeshes = useRef<THREE.Mesh[]>([]);
  const interiorMeshes = useRef<THREE.Mesh[]>([]);
  const windowMeshes = useRef<THREE.Mesh[]>([]);
  const timeRef = useRef(0);

  useEffect(() => {
    if (!scene) return;
    const ext: THREE.Mesh[] = [];
    const int: THREE.Mesh[] = [];
    const win: THREE.Mesh[] = [];

    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;

      if (HIDE_NODES.includes(child.name)) {
        mesh.visible = false;
        return;
      }

      mesh.castShadow = mesh.receiveShadow = true;

      const isExt = Object.keys(EXTERIOR_STAGGER).includes(child.name);
      const isWindow = child.name === "window_glass";

      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.forEach((m) => {
        if (m instanceof THREE.Material) {
          m.transparent = true;
          m.needsUpdate = true;
        }
        if (isWindow && m instanceof THREE.MeshStandardMaterial) {
          m.emissive = new THREE.Color("#ffe4a0");
          m.emissiveIntensity = 1.8;
          m.opacity = 0.6;
        }
      });

      if (isWindow) {
        win.push(mesh);
      } else if (isExt) {
        mesh.userData.isExterior = true;
        mesh.userData.staggerOffset = EXTERIOR_STAGGER[child.name] ?? 0;
        ext.push(mesh);
      } else {
        mesh.userData.isExterior = false;
        int.push(mesh);
      }
    });

    exteriorMeshes.current = ext;
    interiorMeshes.current = int;
    windowMeshes.current = win;
  }, [scene]);

  /* ── Exterior wall animation trigger ────────────── */
  const wallRevealDone = useRef(false);
  useEffect(() => {
    if (scrollProgress > 0.26 && !wallRevealDone.current) {
      wallRevealDone.current = true;
      const action = actions["exterior_wallAction"];
      if (action) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.reset().play();
      }
    }
  }, [scrollProgress, actions]);

  useFrame((_, delta) => {
    if (!scene) return;
    timeRef.current += delta;

    /* ── Staggered exterior fade ──────────────────── */
    exteriorMeshes.current.forEach((mesh) => {
      const offset = mesh.userData.staggerOffset || 0;
      const fadeStart = 0.26 + offset;
      const fadeEnd = fadeStart + 0.07; // each mesh fades over 7% scroll

      const extAlpha =
        scrollProgress < fadeStart
          ? 1
          : scrollProgress > fadeEnd
            ? 0
            : 1 - (scrollProgress - fadeStart) / (fadeEnd - fadeStart);

      mesh.visible = extAlpha > 0.01;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.forEach((m) => {
        if (m instanceof THREE.Material) {
          m.opacity = extAlpha;
          m.depthWrite = extAlpha > 0.5;
        }
      });
    });

    /* ── Window glow pulsation ───────────────────── */
    windowMeshes.current.forEach((mesh) => {
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.forEach((m) => {
        if (m instanceof THREE.MeshStandardMaterial) {
          // Pulsate between 1.4→2.2
          const pulse = 1.8 + Math.sin(timeRef.current * 2.5) * 0.4;
          m.emissiveIntensity = pulse;
        }
      });
    });

    /* ── Whole-house fade ────────────────────────── */
    let alpha =
      scrollProgress < 0.5
        ? 1
        : scrollProgress < 0.52
          ? 1 - (scrollProgress - 0.5) / 0.02
          : scrollProgress < 0.82
            ? 0
            : scrollProgress < 0.86
              ? (scrollProgress - 0.82) / 0.04
              : 1;
    alpha = Math.max(0, Math.min(1, alpha));

    interiorMeshes.current.forEach((mesh) => {
      mesh.visible = alpha > 0.01;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.forEach((m) => {
        if (m instanceof THREE.Material) {
          m.opacity = alpha;
          m.depthWrite = alpha > 0.5;
        }
      });
    });
  });

  /* ── Derived values for sub-effects ──────────── */
  // Light leak: visible during camera approach (0.20→0.35)
  const lightLeakVisible = scrollProgress >= 0.18 && scrollProgress <= 0.38;
  const lightLeakIntensity =
    scrollProgress < 0.20
      ? 0
      : scrollProgress < 0.26
        ? (scrollProgress - 0.20) / 0.06
        : scrollProgress < 0.33
          ? 1
          : scrollProgress < 0.38
            ? 1 - (scrollProgress - 0.33) / 0.05
            : 0;

  // Warmth: builds during window penetration (0.28→0.38)
  const warmthIntensity =
    scrollProgress < 0.28
      ? 0
      : scrollProgress < 0.35
        ? (scrollProgress - 0.28) / 0.07
        : scrollProgress < 0.45
          ? 1
          : scrollProgress < 0.50
            ? 1 - (scrollProgress - 0.45) / 0.05
            : 0;

  return (
    <group ref={groupRef} position={[0, HOUSE_FLOOR_Y, 0]} scale={HOUSE_SCALE}>
      <primitive object={scene} />
      {/* Light leak particles through window */}
      <group scale={[1 / HOUSE_SCALE, 1 / HOUSE_SCALE, 1 / HOUSE_SCALE]} position={[0, -HOUSE_FLOOR_Y / HOUSE_SCALE, 0]}>
        <LightLeakParticles
          visible={lightLeakVisible}
          intensity={lightLeakIntensity}
        />
        <WarmthLight intensity={warmthIntensity} />
      </group>
    </group>
  );
}

useGLTF.preload("/models/house_complete.glb");
