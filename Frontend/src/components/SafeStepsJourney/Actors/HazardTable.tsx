/**
 * HazardTable — Góc nhọn phát sáng nguy hiểm
 *
 * Scale: 0.3716 → top edge world Y = 0.275 = ngang torso/ngực baby
 * Danger effect: Fresnel CHỈ tập trung tại góc nhọn gần baby
 *   → Dùng pointLight màu đỏ đặt đúng tại góc nhọn
 *   → Intensity cao, distance nhỏ → ánh sáng chỉ chiếu cạnh góc
 *
 * IMPROVEMENTS (C1):
 *   • Volumetric glow sphere at corner for ambient danger spread
 *   • Improved Fresnel falloff with emission ramp
 *   • Smoother danger→guardian color transition via ripple
 *   • 2nd ambient point light for wider danger spread
 */
import { useRef, useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const TABLE_SCALE = 0.3716;

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
  uniform float uDanger;   // 0=safe, 1=red pulse
  uniform float uGuardian; // 0=none, 1=mint
  uniform float uOpacity;
  uniform vec3  uBaseColor;
  uniform vec3  uCornerWorld; // world position of sharp corner
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying vec3  vViewDir;

  void main() {
    /* Improved Fresnel with steeper falloff */
    float fresnel = pow(1.0 - max(dot(vViewDir, vNormal), 0.0), 3.5);

    /* Distance từ fragment đến góc nhọn — để chỉ highlight góc */
    float distToCorner = length(vWorldPos - uCornerWorld);
    float cornerFocus  = 1.0 - smoothstep(0.0, 0.22, distToCorner);

    /* Emission ramp: builds intensity closer to corner */
    float emissionRamp = cornerFocus * cornerFocus;

    float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
    float fastPulse = 0.6 + 0.4 * sin(uTime * 7.0);

    /* Danger: đỏ tập trung tại góc */
    vec3 dangerColor   = vec3(1.0, 0.08, 0.08);
    /* Guardian: mint */
    vec3 guardianColor = vec3(0.47, 0.86, 0.82);

    /* Ripple transition: danger→guardian blend with time-based ripple */
    float ripple = smoothstep(0.0, 1.0, uGuardian) * (0.5 + 0.5 * sin(uTime * 5.0 - distToCorner * 15.0));
    vec3 highlight = mix(dangerColor, guardianColor, uGuardian + ripple * 0.15);

    float intensity = max(uDanger, uGuardian) * emissionRamp * (fresnel + 0.3) * pulse;

    /* Add secondary glow for emission feel */
    float emission = max(uDanger, uGuardian) * cornerFocus * fastPulse * 0.15;

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
    if (matRef.current) {
      matRef.current.opacity = intensity * 0.25;
    }
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
  position = [-0.05, 0, 0.12],
  dangerTarget = [0.15, 0.32, 0.35],
}: Props) {
  const { scene } = useGLTF("/models/table_hazard.glb");
  const ref = useRef<THREE.Group>(null!);

  const uniforms = useMemo(() => ({
    uTime:        { value: 0 },
    uDanger:      { value: 0 },
    uGuardian:    { value: 0 },
    uOpacity:     { value: opacity },
    uBaseColor:   { value: new THREE.Color("#6b4423") },
    uCornerWorld: { value: new THREE.Vector3() },
  }), []);

  useEffect(() => {
    /* Auto-center scene */
    const box    = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    // Auto-center X, Z as usual, place on floor min.y
    scene.position.set(-center.x, -box.min.y, -center.z);

    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const base = (mesh.material as THREE.MeshStandardMaterial)?.color?.clone()
        ?? new THREE.Color("#6b4423");

      mesh.material = new THREE.ShaderMaterial({
        vertexShader, fragmentShader,
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
  }, [scene, uniforms]);

  useFrame((_s, delta) => {
    uniforms.uTime.value    += delta;
    uniforms.uDanger.value  += (dangerIntensity   - uniforms.uDanger.value)   * 0.07;
    uniforms.uGuardian.value+= (guardianIntensity - uniforms.uGuardian.value) * 0.07;
    uniforms.uOpacity.value  = opacity;

    /* Update corner world position every frame directly from dangerTarget prop */
    if (ref.current) {
      uniforms.uCornerWorld.value.set(...dangerTarget);
    }
  });

  /* Compute corner light position in local space */
  const cornerLocalPos: [number, number, number] = [
    (dangerTarget[0] - position[0]) / TABLE_SCALE,
    (dangerTarget[1] - position[1]) / TABLE_SCALE,
    (dangerTarget[2] - position[2]) / TABLE_SCALE,
  ];

  /* Active glow color based on which effect is dominant */
  const glowColor = guardianIntensity > dangerIntensity ? "#78dcd2" : "#ff2200";
  const glowIntensity = Math.max(dangerIntensity, guardianIntensity) * opacity;

  return (
    <group ref={ref} position={position} scale={TABLE_SCALE}>
      <primitive object={scene} />

      {/* Primary danger point light — concentrated at corner */}
      <pointLight
        position={cornerLocalPos}
        intensity={dangerIntensity * 1.5 * opacity}
        color="#ff2200"
        distance={0.6}
        decay={2}
      />

      {/* Secondary ambient danger spread — wider reach */}
      <pointLight
        position={[
          cornerLocalPos[0],
          cornerLocalPos[1] + 0.3,
          cornerLocalPos[2],
        ]}
        intensity={dangerIntensity * 0.6 * opacity}
        color="#ff4422"
        distance={1.2}
        decay={2}
      />

      {/* Guardian point light — cùng góc, màu mint */}
      <pointLight
        position={cornerLocalPos}
        intensity={guardianIntensity * 1.2 * opacity}
        color="#78dcd2"
        distance={0.65}
        decay={2}
      />

      {/* Volumetric glow sphere at corner */}
      <CornerGlow
        intensity={glowIntensity}
        color={glowColor}
        position={cornerLocalPos}
      />
    </group>
  );
}

useGLTF.preload("/models/table_hazard.glb");