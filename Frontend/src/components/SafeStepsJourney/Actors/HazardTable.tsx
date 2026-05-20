/**
 * HazardTable — Góc nhọn phát sáng nguy hiểm
 */
import { useRef, useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const TABLE_SCALE = 0.233;

/* Endpoint baby đi đến — dùng để tìm góc bàn gần nhất */
const BABY_WALK_END = new THREE.Vector3(-0.45, 0.3, 0.13);

/* ── Enhanced Fresnel shader with emission ramp ─────── */
const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vWorldPos   = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal     = normalize(normalMatrix * normal);
    vViewDir    = normalize(cameraPosition - vWorldPos);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uDanger;
  uniform float uGuardian;
  uniform float uOpacity;
  uniform vec3  uBaseColor;
  uniform vec3  uCornerWorld;
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying vec3  vViewDir;

  void main() {
    float fresnel = pow(1.0 - max(dot(vViewDir, vNormal), 0.0), 3.5);

    float distToCorner = length(vWorldPos - uCornerWorld);
    float cornerFocus  = 1.0 - smoothstep(0.0, 0.22, distToCorner);
    float emissionRamp = cornerFocus * cornerFocus;

    float pulse     = 0.5 + 0.5 * sin(uTime * 4.0);
    float fastPulse = 0.6 + 0.4 * sin(uTime * 7.0);

    vec3 dangerColor   = vec3(1.0, 0.08, 0.08);
    vec3 guardianColor = vec3(0.47, 0.86, 0.82);

    float ripple  = smoothstep(0.0, 1.0, uGuardian)
                    * (0.5 + 0.5 * sin(uTime * 5.0 - distToCorner * 15.0));
    vec3 highlight = mix(dangerColor, guardianColor, uGuardian + ripple * 0.15);

    float intensity = max(uDanger, uGuardian) * emissionRamp * (fresnel + 0.3) * pulse;
    float emission  = max(uDanger, uGuardian) * cornerFocus * fastPulse * 0.15;

    vec3 color = mix(uBaseColor, highlight, intensity) + highlight * emission;
    gl_FragColor = vec4(color, (0.9 + fresnel * 0.1) * uOpacity);
  }
`;

interface Props {
  dangerIntensity: number;
  guardianIntensity: number;
  opacity?: number;
  position?: [number, number, number];

  dangerTarget?: [number, number, number];

  onCornerReady?: (worldPos: THREE.Vector3) => void;
}

/* ── Volumetric glow sphere at danger corner ─────────── */
function CornerGlow({
  intensity,
  color,
  position,
}: {
  intensity: number;
  color: string;
  position: [number, number, number];
}) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null!);

  useFrame(() => {
    if (matRef.current) matRef.current.opacity = intensity * 0.25;
  });

  if (intensity < 0.01) return null;

  return (
    <mesh position={position}>
      <sphereGeometry args={[0.08, 12, 12]} />
      <meshBasicMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={intensity * 0.25}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

export default function HazardTable({
  dangerIntensity,
  guardianIntensity,
  opacity = 1,
  position = [-0.05, 0.1317, 0.12],
  dangerTarget,
  onCornerReady,
}: Props) {
  const { scene } = useGLTF("/models/table_hazard.glb");
  const ref = useRef<THREE.Group>(null!);

  /* FIX T-15a — clone để không mutate shared cache */
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  const uniforms = useMemo(
    () => ({
      uTime:        { value: 0 },
      uDanger:      { value: 0 },
      uGuardian:    { value: 0 },
      uOpacity:     { value: opacity },
      uBaseColor:   { value: new THREE.Color("#6b4423") },
      uCornerWorld: { value: new THREE.Vector3() },
    }),
    [],
  );

  const [cornerLocal, setCornerLocal] = useState<[number, number, number]>(
    () =>
      dangerTarget
        ? [
            (dangerTarget[0] - position[0]) / TABLE_SCALE,
            (dangerTarget[1] - position[1]) / TABLE_SCALE,
            (dangerTarget[2] - position[2]) / TABLE_SCALE,
          ]
        : [0, 1, 0], // placeholder trước khi effect chạy
  );

  /* Ref world-space để cập nhật shader uniform mỗi frame */
  const cornerWorldRef = useRef(
    new THREE.Vector3(
      ...(dangerTarget ?? [position[0], position[1] + 0.3, position[2]]),
    ),
  );

  useEffect(() => {
    /* FIX T-15b — reset trước khi tính box */
    clonedScene.position.set(0, 0, 0);

    const box = new THREE.Box3().setFromObject(clonedScene);
    const center = box.getCenter(new THREE.Vector3());

    /* Center X/Z, đặt đáy model xuống y=0 trong local group */
    clonedScene.position.set(-center.x, -box.min.y, -center.z);

    /* ── FIX T-16: Tính 4 góc trên mặt bàn (max Y) trong world space ── */
    const hw = (box.max.x - box.min.x) * 0.5; // half width
    const hd = (box.max.z - box.min.z) * 0.5; // half depth
    const ht = box.max.y - box.min.y;          // full height = vị trí mặt bàn

    const topCorners: THREE.Vector3[] = [
      [-hw, ht, -hd],
      [-hw, ht,  hd],
      [ hw, ht, -hd],
      [ hw, ht,  hd],
    ].map(
      ([cx, cy, cz]) =>
        new THREE.Vector3(
          position[0] + cx * TABLE_SCALE,
          position[1] + cy * TABLE_SCALE,
          position[2] + cz * TABLE_SCALE,
        ),
    );

    /* Chọn góc gần baby nhất khi baby bước tới */
    topCorners.sort((a, b) => a.distanceTo(BABY_WALK_END) - b.distanceTo(BABY_WALK_END));
    const bestCorner = topCorners[0];

    /* Override bằng dangerTarget thủ công nếu được truyền vào */
    const finalCorner = dangerTarget
      ? new THREE.Vector3(...dangerTarget)
      : bestCorner;

    /* Cập nhật ref world + state local */
    cornerWorldRef.current.copy(finalCorner);
    setCornerLocal([
      (finalCorner.x - position[0]) / TABLE_SCALE,
      (finalCorner.y - position[1]) / TABLE_SCALE,
      (finalCorner.z - position[2]) / TABLE_SCALE,
    ]);

    /* Thông báo cho JourneyScene (để đồng bộ baby WALK_END nếu cần) */
    onCornerReady?.(finalCorner.clone());

    /* ── Apply shader materials ── */
    clonedScene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const originalMat = mesh.material as THREE.MeshStandardMaterial;
      const base = originalMat?.color?.clone() ?? new THREE.Color("#6b4423");

      mesh.material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime:        uniforms.uTime,
          uDanger:      uniforms.uDanger,
          uGuardian:    uniforms.uGuardian,
          uOpacity:     uniforms.uOpacity,
          uBaseColor:   { value: base },
          uCornerWorld: uniforms.uCornerWorld,
        },
        transparent: true,
        side: THREE.DoubleSide,
      });
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
    });
  }, [clonedScene, uniforms, position, dangerTarget, onCornerReady]);

  useFrame((_s, delta) => {
    uniforms.uTime.value    += delta;
    uniforms.uDanger.value  += (dangerIntensity    - uniforms.uDanger.value)   * 0.07;
    uniforms.uGuardian.value += (guardianIntensity - uniforms.uGuardian.value) * 0.07;
    uniforms.uOpacity.value  = opacity;

    /* Cập nhật vị trí góc world mỗi frame cho shader */
    uniforms.uCornerWorld.value.copy(cornerWorldRef.current);
  });

  const glowColor      = guardianIntensity > dangerIntensity ? "#78dcd2" : "#ff2200";
  const glowIntensity  = Math.max(dangerIntensity, guardianIntensity) * opacity;

  return (
    <group ref={ref} position={position} scale={TABLE_SCALE}>
      {/* FIX T-15c — render clonedScene */}
      <primitive object={clonedScene} />

      {/* Primary danger light */}
      <pointLight
        position={cornerLocal}
        intensity={dangerIntensity * 1.5 * opacity}
        color="#ff2200"
        distance={0.6}
        decay={2}
      />

      {/* Secondary spread */}
      <pointLight
        position={[cornerLocal[0], cornerLocal[1] + 0.3, cornerLocal[2]]}
        intensity={dangerIntensity * 0.6 * opacity}
        color="#ff4422"
        distance={1.2}
        decay={2}
      />

      {/* Guardian light */}
      <pointLight
        position={cornerLocal}
        intensity={guardianIntensity * 1.2 * opacity}
        color="#78dcd2"
        distance={0.65}
        decay={2}
      />

      {/* Volumetric glow sphere */}
      <CornerGlow
        intensity={glowIntensity}
        color={glowColor}
        position={cornerLocal}
      />
    </group>
  );
}

useGLTF.preload("/models/table_hazard.glb");