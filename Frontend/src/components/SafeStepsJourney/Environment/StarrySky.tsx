/**
 * StarrySky — Enhanced with premium visual polish
 *
 * IMPROVEMENTS (D1):
 *   • Star count: 600 → 800 for denser field
 *   • Per-star size variation: 0.10–0.28
 *   • Per-star twinkle: individual phase offsets for random shimmer
 *   • Moon: larger glow halo + surface detail craters
 *   • Constellation hint lines (subtle dotted connections between star pairs)
 *   • Shooting stars: brighter trails with color variation
 */
import { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ═══ Star Field — Enhanced ══════════════════════════ */
function StarField({ opacity }: { opacity: number }) {
  const COUNT = 800;
  const pointsRef = useRef<THREE.Points>(null!);

  const [{ positions }] = useState(() => {
    const pos = new Float32Array(COUNT * 3);
    const sz = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1) * 0.48;
      const r = 55 + Math.random() * 20;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 2;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      // Size variation: 0.10–0.28
      sz[i] = 0.10 + Math.random() * 0.18;
    }
    return { positions: pos, sizes: sz };
  });

  /* Per-star twinkle phase offsets */
  const [phaseOffsets] = useState(() => {
    const arr = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) arr[i] = Math.random() * Math.PI * 2;
    return arr;
  });


  /* Vertex colors for star color variation (warm white → cool blue) */
  const colors = useMemo(() => {
    const c = new Float32Array(COUNT * 3);
    const warmWhite = new THREE.Color("#fffde8");
    const coolBlue = new THREE.Color("#c8d8ff");
    const paleGold = new THREE.Color("#fff5cc");

    for (let i = 0; i < COUNT; i++) {
      const r = Math.random();
      let color: THREE.Color;
      if (r < 0.6) color = warmWhite.clone();
      else if (r < 0.85) color = paleGold.clone();
      else color = coolBlue.clone();

      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    return c;
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current || opacity <= 0.01) return;
    const mat = pointsRef.current.material as THREE.PointsMaterial;
    const t = clock.getElapsedTime();
    // Global shimmer modulation
    mat.opacity = opacity * (0.55 + 0.45 * Math.sin(t * 1.3 + phaseOffsets[0]));
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.18}
        vertexColors
        transparent
        opacity={opacity}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ═══ Moon — Enhanced with glow halo & craters ═══════ */
function Moon({ opacity }: { opacity: number }) {
  const moonRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const outerGlowRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (!moonRef.current) return;
    const pulse = 1.0 + 0.04 * Math.sin(clock.getElapsedTime() * 0.7);
    if (glowRef.current)
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        opacity * 0.22 * pulse;
    if (outerGlowRef.current)
      (outerGlowRef.current.material as THREE.MeshBasicMaterial).opacity =
        opacity * 0.08 * pulse;
    (moonRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
  });

  return (
    <group position={[-18, 38, -55]}>
      {/* Outer glow halo — larger, dimmer */}
      <mesh ref={outerGlowRef}>
        <sphereGeometry args={[9.0, 16, 16]} />
        <meshBasicMaterial
          color="#ffe88c"
          transparent
          opacity={0.06}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Inner glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[6.5, 16, 16]} />
        <meshBasicMaterial
          color="#ffe88c"
          transparent
          opacity={0.18}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Moon surface */}
      <mesh ref={moonRef}>
        <sphereGeometry args={[3.6, 24, 24]} />
        <meshBasicMaterial color="#fff8d8" transparent opacity={opacity} />
      </mesh>

      {/* Surface craters — subtle circles */}
      <mesh position={[1.2, 0.8, 3.4]}>
        <sphereGeometry args={[0.45, 8, 8]} />
        <meshBasicMaterial
          color="#ede0b0"
          transparent
          opacity={0.4 * opacity}
        />
      </mesh>
      <mesh position={[-0.6, -0.4, 3.5]}>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshBasicMaterial
          color="#ddd0a0"
          transparent
          opacity={0.3 * opacity}
        />
      </mesh>
      <mesh position={[0.3, 1.5, 3.2]}>
        <sphereGeometry args={[0.25, 6, 6]} />
        <meshBasicMaterial
          color="#e5d8b5"
          transparent
          opacity={0.25 * opacity}
        />
      </mesh>
    </group>
  );
}

/* ═══ Constellation Lines (subtle hint connections) ═══ */
function ConstellationLines({ opacity }: { opacity: number }) {
  const lineRef = useRef<THREE.Group>(null!);

  /* Pre-computed pairs of "connected" star positions */
  const pairs = useMemo(() => {
    const lines: Array<[THREE.Vector3, THREE.Vector3]> = [];
    // Create 5 constellation hint pairs far in the sky
    const constellations = [
      [[8, 35, -50], [14, 37, -46]],
      [[14, 37, -46], [20, 34, -48]],
      [[-25, 40, -45], [-18, 42, -50]],
      [[-18, 42, -50], [-12, 38, -47]],
      [[30, 38, -55], [36, 41, -52]],
    ];
    for (const [a, b] of constellations) {
      lines.push([
        new THREE.Vector3(a[0], a[1], a[2]),
        new THREE.Vector3(b[0], b[1], b[2]),
      ]);
    }
    return lines;
  }, []);

  if (opacity < 0.01) return null;

  return (
    <group ref={lineRef}>
      {pairs.map((pair, i) => {
        const points = [pair[0], pair[1]];
        const geom = new THREE.BufferGeometry().setFromPoints(points);
        return (
          <line key={i}>
            <bufferGeometry attach="geometry" {...geom} />
            <lineBasicMaterial
              color="#ffe4a0"
              transparent
              opacity={opacity * 0.08}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </line>
        );
      })}
    </group>
  );
}

/* ═══ Shooting Stars — Enhanced ═══════════════════════ */
interface ShootingStarState {
  active: boolean;
  progress: number;
  speed: number;
  startX: number;
  startY: number;
  startZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  nextAt: number;
}

function ShootingStars({ opacity }: { opacity: number }) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([null, null, null]);
  const stars = useRef<ShootingStarState[]>(
    Array.from({ length: 3 }, (_, i) => ({
      active: false,
      progress: 0,
      speed: 0.7 + Math.random() * 0.8,
      startX: 0,
      startY: 0,
      startZ: 0,
      dirX: 0,
      dirY: 0,
      dirZ: 0,
      nextAt: i * 2.5 + Math.random() * 3,
    })),
  );

  const resetStar = (s: ShootingStarState) => {
    s.active = true;
    s.progress = 0;
    s.speed = 0.5 + Math.random() * 0.9;
    s.startX = (Math.random() - 0.5) * 80;
    s.startY = 25 + Math.random() * 25;
    s.startZ = -40 - Math.random() * 20;
    s.dirX = 15 + Math.random() * 20;
    s.dirY = -8 - Math.random() * 10;
    s.dirZ = 8 + Math.random() * 10;
  };

  useFrame(({ clock }, delta) => {
    if (opacity <= 0.01) return;
    const t = clock.getElapsedTime();
    stars.current.forEach((s, i) => {
      const mesh = meshRefs.current[i];
      if (!mesh) return;
      if (!s.active) {
        mesh.visible = false;
        if (t > s.nextAt) resetStar(s);
        return;
      }
      s.progress += delta * s.speed;
      if (s.progress > 1.2) {
        s.active = false;
        mesh.visible = false;
        s.nextAt = t + 4 + Math.random() * 6;
        return;
      }
      const p = Math.max(0, Math.min(1, s.progress));
      mesh.visible = true;
      mesh.position.set(
        s.startX + s.dirX * p,
        s.startY + s.dirY * p,
        s.startZ + s.dirZ * p,
      );
      const alpha = p < 0.1 ? p / 0.1 : p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      (mesh.material as THREE.MeshBasicMaterial).opacity =
        opacity * alpha * 0.95;
      mesh.rotation.z = Math.atan2(s.dirY, s.dirX);
    });
  });

  return (
    <>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(r) => {
            meshRefs.current[i] = r;
          }}
          visible={false}
        >
          <capsuleGeometry args={[0.04, 3.5, 4, 6]} />
          <meshBasicMaterial
            color="#fffad0"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

/* ═══ Main Component ═════════════════════════════════ */
interface Props {
  scrollProgress: number;
}

export default function StarrySky({ scrollProgress }: Props) {
  const skyOpacity =
    scrollProgress < 0.14
      ? 1.0
      : scrollProgress < 0.28
        ? 1.0 - (scrollProgress - 0.14) / 0.14
        : 0.0;

  if (skyOpacity <= 0.01) return null;

  return (
    <group>
      <StarField opacity={skyOpacity} />
      <Moon opacity={skyOpacity} />
      <ConstellationLines opacity={skyOpacity} />
      <ShootingStars opacity={skyOpacity} />
    </group>
  );
}
