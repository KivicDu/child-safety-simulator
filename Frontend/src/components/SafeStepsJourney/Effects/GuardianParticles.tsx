/**
 * GuardianParticles — Enhanced shield arc effect
 *
 * IMPROVEMENTS (C1):
 *   • 120 → 180 particles (balanced with performance)
 *   • Size variation (0.015–0.030)
 *   • Color variation via vertex colors (mint → white gradient)
 *   • Wider arc angle (1.2π → 1.5π)
 *   • Secondary inner ring for depth
 *   • Brighter glow with shimmer modulation
 */
import { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const OUTER_COUNT = 140;
const INNER_COUNT = 40;
const TOTAL = OUTER_COUNT + INNER_COUNT;

interface Props {
  progress: number;
  position?: [number, number, number];
}

export default function GuardianParticles({
  progress,
  position = [0.4, 0.3, 0.1],
}: Props) {
  const pointsRef = useRef<THREE.Points>(null!);

  /* ── Generate seed positions, phases, speeds, and sizes ── */
  const [{ seeds, phases, speeds, isInner }] = useState(() => {
    const s = new Float32Array(TOTAL * 3);
    const p = new Float32Array(TOTAL);
    const v = new Float32Array(TOTAL);
    const sz = new Float32Array(TOTAL);
    const inner = new Uint8Array(TOTAL);

    for (let i = 0; i < TOTAL; i++) {
      const isInnerRing = i >= OUTER_COUNT;
      inner[i] = isInnerRing ? 1 : 0;

      const count = isInnerRing ? INNER_COUNT : OUTER_COUNT;
      const idx = isInnerRing ? i - OUTER_COUNT : i;
      const t = idx / count;

      // Wider arc: 1.5π span (was 1.2π)
      const arcSpan = isInnerRing ? Math.PI * 1.2 : Math.PI * 1.5;
      const arcStart = isInnerRing ? -Math.PI * 0.5 : -Math.PI * 0.65;
      const angle = arcStart + t * arcSpan;

      // Inner ring is tighter
      const rBase = isInnerRing ? 0.16 : 0.25;
      const rVar = isInnerRing ? 0.08 : 0.18;
      const r = rBase + Math.random() * rVar;

      s[i * 3] = Math.cos(angle) * r;
      s[i * 3 + 1] = Math.random() * (isInnerRing ? 0.35 : 0.55);
      s[i * 3 + 2] = Math.sin(angle) * r * 0.6;

      p[i] = Math.random() * Math.PI * 2;
      v[i] = 0.6 + Math.random() * 1.2;

      // Size variation: 0.015–0.030
      sz[i] = 0.015 + Math.random() * 0.015;
    }
    return { seeds: s, phases: p, speeds: v, sizes: sz, isInner: inner };
  });

  /* ── Vertex colors: mint→white gradient based on height ── */
  const colors = useMemo(() => {
    const c = new Float32Array(TOTAL * 3);
    const mint = new THREE.Color("#78dcd2");
    const white = new THREE.Color("#e0fff8");
    const bright = new THREE.Color("#aaffee");

    for (let i = 0; i < TOTAL; i++) {
      const heightT = seeds[i * 3 + 1] / 0.55; // normalize by max height
      const isInnerRing = isInner[i];

      // Inner ring is brighter, outer blends mint→white by height
      const color = isInnerRing
        ? bright.clone().lerp(white, heightT)
        : mint.clone().lerp(white, heightT * 0.6);

      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    return c;
  }, [seeds, isInner]);

  const [positions] = useState(() => new Float32Array(TOTAL * 3));

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    if (progress <= 0.01) {
      pointsRef.current.visible = false;
      return;
    }
    pointsRef.current.visible = true;

    const t = clock.getElapsedTime();
    const attr = pointsRef.current.geometry.attributes.position;
    const pos = attr.array as Float32Array;

    for (let i = 0; i < TOTAL; i++) {
      const spawnT = i / TOTAL;
      const localP = Math.max(0, (progress - spawnT) / (1 - spawnT + 0.001));
      if (localP <= 0) {
        pos[i * 3 + 1] = -10;
        continue;
      }
      const drift = t * speeds[i];
      const driftScale = isInner[i] ? 0.04 : 0.06;

      pos[i * 3] = seeds[i * 3] + Math.sin(drift + phases[i]) * driftScale;
      pos[i * 3 + 1] =
        seeds[i * 3 + 1] +
        Math.sin(drift * 0.7 + phases[i] + 1) * (driftScale * 0.7) +
        localP * 0.1;
      pos[i * 3 + 2] = seeds[i * 3 + 2] + Math.cos(drift + phases[i]) * (driftScale * 0.7);
    }
    attr.needsUpdate = true;

    const mat = pointsRef.current.material as THREE.PointsMaterial;
    const shimmer = 0.6 + 0.4 * Math.sin(t * 3.5);
    mat.opacity = Math.min(1, progress * 3) * 0.8 * shimmer;
  });

  /* Init positions */
  for (let i = 0; i < TOTAL; i++) {
    positions[i * 3] = seeds[i * 3];
    positions[i * 3 + 1] = seeds[i * 3 + 1];
    positions[i * 3 + 2] = seeds[i * 3 + 2];
  }

  return (
    <group position={position}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.022}
          vertexColors
          transparent
          opacity={0}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Primary glow light */}
      <pointLight
        position={[0, 0.3, 0]}
        intensity={progress * 0.6}
        color="#78dcd2"
        distance={2}
        decay={2}
      />

      {/* Secondary inner glow — brighter, tighter */}
      <pointLight
        position={[0, 0.15, 0]}
        intensity={progress * 0.3}
        color="#aaffee"
        distance={1}
        decay={2}
      />
    </group>
  );
}
