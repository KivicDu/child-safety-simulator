import { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { RoundedBox } from "@react-three/drei/core/RoundedBox";
import { Float } from "@react-three/drei/core/Float";
import { ContactShadows } from "@react-three/drei/core/ContactShadows";
import * as THREE from "three";

/* ─── Pastel Material Helpers ─────────────────────────────────────────────── */
const pastel = {
  floor: "#fce4ec",
  wall1: "#fff3e0",
  wall2: "#e8f5e9",
  wall3: "#e3f2fd",
  table: "#ffe0b2",
  tableLeg: "#d7ccc8",
  chair: "#b3e5fc",
  chairLeg: "#90caf9",
  bed: "#f8bbd0",
  bedFrame: "#e1bee7",
  bedBlanket: "#ffffff",
  shelf: "#c8e6c9",
  rug: "#ffe082",
  lamp: "#fff9c4",
  lampPost: "#bcaaa4",
  toy1: "#ef9a9a",
  toy2: "#80cbc4",
  toy3: "#ce93d8",
  toy4: "#ffb74d",
  baby: "#ffccbc",
  babyBody: "#ffab91",
  babyHair: "#8d6e63",
  babyDiaper: "#ffffff",
  wood: "#d7ccc8",
  baseboard: "#ffffff",
  windowFrame: "#ffffff",
  glass: "#e0f7fa",
};

const PM = (color: string, metallic = false, emissive = false) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: metallic ? 0.3 : 0.85,
    metalness: metallic ? 0.6 : 0.05,
    emissive: emissive ? color : "#000000",
    emissiveIntensity: emissive ? 0.4 : 0,
  });

/* ─── Room Component ──────────────────────────────────────────────────────── */
const Room = () => {
  const materials = useMemo(
    () => ({
      floor: PM(pastel.floor),
      wall1: PM(pastel.wall1),
      wall2: PM(pastel.wall2),
      wall3: PM(pastel.wall3),
      baseboard: PM(pastel.baseboard),
      windowFrame: PM(pastel.windowFrame),
      glass: new THREE.MeshStandardMaterial({
        color: pastel.glass,
        transparent: true,
        opacity: 0.4,
        roughness: 0.1,
        metalness: 0.1,
      }),
    }),
    [],
  );

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <primitive object={materials.floor} attach="material" />
      </mesh>

      {/* Baseboards */}
      <mesh position={[0, 0.05, -3]} receiveShadow castShadow>
        <boxGeometry args={[6, 0.1, 0.05]} />
        <primitive object={materials.baseboard} attach="material" />
      </mesh>
      <mesh
        position={[-3, 0.05, 0]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[6, 0.1, 0.05]} />
        <primitive object={materials.baseboard} attach="material" />
      </mesh>
      <mesh
        position={[3, 0.05, 0]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[6, 0.1, 0.05]} />
        <primitive object={materials.baseboard} attach="material" />
      </mesh>

      {/* Back Wall */}
      <mesh position={[0, 2, -3]} receiveShadow>
        <planeGeometry args={[6, 4]} />
        <primitive object={materials.wall1} attach="material" />
      </mesh>

      {/* Left Wall with Window Hole */}
      <group position={[-3, 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh receiveShadow position={[0, -1, 0]}>
          <planeGeometry args={[6, 2]} />
          <primitive object={materials.wall2} attach="material" />
        </mesh>
        <mesh receiveShadow position={[0, 1.5, 0]}>
          <planeGeometry args={[6, 1]} />
          <primitive object={materials.wall2} attach="material" />
        </mesh>
        <mesh receiveShadow position={[-2, 0.5, 0]}>
          <planeGeometry args={[2, 1]} />
          <primitive object={materials.wall2} attach="material" />
        </mesh>
        <mesh receiveShadow position={[2, 0.5, 0]}>
          <planeGeometry args={[2, 1]} />
          <primitive object={materials.wall2} attach="material" />
        </mesh>

        {/* Window Asset */}
        <group position={[0, 0.5, 0]}>
          {/* Frame */}
          <mesh castShadow receiveShadow position={[0, 0, 0.05]}>
            <boxGeometry args={[2.1, 1.1, 0.1]} />
            <primitive object={materials.windowFrame} attach="material" />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0, 0.05]}>
            <boxGeometry args={[0.1, 1.1, 0.15]} />
            <primitive object={materials.windowFrame} attach="material" />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0, 0.05]}>
            <boxGeometry args={[2.1, 0.1, 0.15]} />
            <primitive object={materials.windowFrame} attach="material" />
          </mesh>
          {/* Glass panes */}
          <mesh position={[-0.5, 0, 0.05]}>
            <planeGeometry args={[0.9, 0.9]} />
            <primitive object={materials.glass} attach="material" />
          </mesh>
          <mesh position={[0.5, 0, 0.05]}>
            <planeGeometry args={[0.9, 0.9]} />
            <primitive object={materials.glass} attach="material" />
          </mesh>
        </group>
      </group>

      {/* Right Wall */}
      <mesh position={[3, 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[6, 4]} />
        <primitive object={materials.wall3} attach="material" />
      </mesh>
    </group>
  );
};

/* ─── Furniture ───────────────────────────────────────────────────────────── */
const Table = () => (
  <group position={[0.5, 0, -1]}>
    {/* Tabletop */}
    <RoundedBox
      args={[1.4, 0.08, 0.8]}
      radius={0.03}
      position={[0, 0.55, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={pastel.table} roughness={0.6} />
    </RoundedBox>
    {/* Legs */}
    {[
      [-0.55, 0.275, -0.3],
      [0.55, 0.275, -0.3],
      [-0.55, 0.275, 0.3],
      [0.55, 0.275, 0.3],
    ].map((pos, i) => (
      <RoundedBox
        key={i}
        args={[0.06, 0.55, 0.06]}
        radius={0.02}
        position={pos as [number, number, number]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={pastel.wood} roughness={0.8} />
      </RoundedBox>
    ))}
    {/* Laptop */}
    <group position={[-0.3, 0.6, 0]} rotation={[0, Math.PI / 6, 0]}>
      {/* Base */}
      <RoundedBox
        args={[0.4, 0.02, 0.3]}
        radius={0.005}
        position={[0, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#b0bec5" metalness={0.4} roughness={0.4} />
      </RoundedBox>
      {/* Screen */}
      <RoundedBox
        args={[0.4, 0.3, 0.02]}
        radius={0.005}
        position={[0, 0.15, -0.14]}
        rotation={[-Math.PI / 12, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#90a4ae" metalness={0.4} roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 0.15, -0.12]} rotation={[-Math.PI / 12, 0, 0]}>
        <planeGeometry args={[0.36, 0.26]} />
        <meshStandardMaterial
          color="#263238"
          emissive="#1abc9c"
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
    {/* Coffee Mug */}
    <group position={[0.4, 0.63, 0.1]} rotation={[0, -Math.PI / 4, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.1, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>
      <mesh position={[0.05, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <torusGeometry args={[0.03, 0.01, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>
    </group>
  </group>
);

const Chair = () => (
  <group position={[0.5, 0, -0.2]} rotation={[0, Math.PI, 0]}>
    {/* Seat */}
    <RoundedBox
      args={[0.5, 0.06, 0.5]}
      radius={0.02}
      position={[0, 0.35, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={pastel.wood} roughness={0.7} />
    </RoundedBox>
    {/* Cushion */}
    <RoundedBox
      args={[0.46, 0.04, 0.46]}
      radius={0.01}
      position={[0, 0.39, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={pastel.chair} roughness={0.9} />
    </RoundedBox>
    {/* Back */}
    <RoundedBox
      args={[0.5, 0.45, 0.06]}
      radius={0.02}
      position={[0, 0.6, -0.22]}
      castShadow
    >
      <meshStandardMaterial color={pastel.wood} roughness={0.7} />
    </RoundedBox>
    {/* Legs */}
    {[
      [-0.2, 0.175, -0.2],
      [0.2, 0.175, -0.2],
      [-0.2, 0.175, 0.2],
      [0.2, 0.175, 0.2],
    ].map((pos, i) => (
      <mesh key={i} position={pos as [number, number, number]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.35, 8]} />
        <meshStandardMaterial color={pastel.wood} roughness={0.8} />
      </mesh>
    ))}
  </group>
);

const Bed = () => (
  <group position={[-1.7, 0, -1.8]}>
    {/* Headboard */}
    <RoundedBox
      args={[1.6, 0.8, 0.1]}
      radius={0.03}
      position={[0, 0.4, -0.95]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={pastel.bedFrame} roughness={0.8} />
    </RoundedBox>
    {/* Frame */}
    <RoundedBox
      args={[1.5, 0.35, 2]}
      radius={0.05}
      position={[0, 0.175, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={pastel.wood} roughness={0.8} />
    </RoundedBox>
    {/* Mattress */}
    <RoundedBox
      args={[1.3, 0.15, 1.8]}
      radius={0.06}
      position={[0, 0.425, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={pastel.bed} roughness={0.9} />
    </RoundedBox>
    {/* Blanket */}
    <RoundedBox
      args={[1.34, 0.16, 1.2]}
      radius={0.06}
      position={[0, 0.43, 0.3]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={pastel.bedBlanket} roughness={0.9} />
    </RoundedBox>
    {/* Pillow 1 */}
    <RoundedBox
      args={[0.5, 0.12, 0.3]}
      radius={0.05}
      position={[-0.3, 0.55, -0.65]}
      rotation={[0.1, 0, 0]}
      castShadow
    >
      <meshStandardMaterial color="#ffffff" roughness={0.95} />
    </RoundedBox>
    {/* Pillow 2 */}
    <RoundedBox
      args={[0.5, 0.12, 0.3]}
      radius={0.05}
      position={[0.3, 0.53, -0.6]}
      rotation={[0.05, 0.1, -0.05]}
      castShadow
    >
      <meshStandardMaterial color={pastel.chair} roughness={0.95} />
    </RoundedBox>

    {/* Nightstand */}
    <group position={[-1.1, 0, -0.7]}>
      <RoundedBox
        args={[0.5, 0.4, 0.4]}
        radius={0.02}
        position={[0, 0.2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={pastel.wood} roughness={0.8} />
      </RoundedBox>
      <RoundedBox
        args={[0.4, 0.15, 0.05]}
        radius={0.01}
        position={[0, 0.25, 0.2]}
        castShadow
      >
        <meshStandardMaterial color={pastel.bedFrame} roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, 0.25, 0.23]} castShadow>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color="#90a4ae" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Clock */}
      <group position={[0, 0.45, 0]} rotation={[0, Math.PI / 4, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.15, 0.1, 0.05]} />
          <meshStandardMaterial color="#ef5350" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.026]}>
          <planeGeometry args={[0.12, 0.07]} />
          <meshStandardMaterial color="#212121" />
        </mesh>
      </group>
    </group>
  </group>
);

const Shelf = () => (
  <group position={[-2.8, 0.8, 1.5]}>
    {/* Shelves */}
    {[0, 0.5, 1.0].map((y, i) => (
      <RoundedBox
        key={i}
        args={[0.3, 0.04, 0.8]}
        radius={0.01}
        position={[0, y, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={pastel.shelf} roughness={0.7} />
      </RoundedBox>
    ))}
    {/* Side panels */}
    {[-0.38, 0.38].map((z, i) => (
      <RoundedBox
        key={i}
        args={[0.3, 1.04, 0.04]}
        radius={0.01}
        position={[0, 0.5, z]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={pastel.shelf} roughness={0.7} />
      </RoundedBox>
    ))}

    {/* Books */}
    <group position={[0, 0.15, -0.2]}>
      <mesh position={[0, 0, 0]} castShadow rotation={[0, 0, 0]}>
        <boxGeometry args={[0.15, 0.25, 0.05]} />
        <meshStandardMaterial color={pastel.toy1} />
      </mesh>
      <mesh position={[0, 0, 0.06]} castShadow rotation={[0, 0, 0]}>
        <boxGeometry args={[0.15, 0.2, 0.04]} />
        <meshStandardMaterial color={pastel.toy2} />
      </mesh>
      <mesh position={[0, -0.01, 0.15]} castShadow rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[0.15, 0.22, 0.06]} />
        <meshStandardMaterial color={pastel.toy3} />
      </mesh>
    </group>

    {/* Small Plant */}
    <group position={[0, 1.08, 0.2]}>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.04, 0.08, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.06, 0]} castShadow>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#81c784" roughness={0.9} />
      </mesh>
    </group>
  </group>
);

const FloorLamp = () => (
  <group position={[2.4, 0, -2.4]}>
    {/* Base */}
    <mesh position={[0, 0.03, 0]} castShadow>
      <cylinderGeometry args={[0.2, 0.2, 0.06, 16]} />
      <meshStandardMaterial color={pastel.lampPost} roughness={0.8} />
    </mesh>
    {/* Post */}
    <mesh position={[0, 0.8, 0]} castShadow>
      <cylinderGeometry args={[0.025, 0.025, 1.6, 8]} />
      <meshStandardMaterial color={pastel.lampPost} roughness={0.8} />
    </mesh>
    {/* Shade */}
    <mesh position={[0, 1.6, 0]} castShadow>
      <coneGeometry args={[0.25, 0.3, 16, 1, true]} />
      <meshStandardMaterial
        color={pastel.lamp}
        roughness={0.6}
        side={THREE.DoubleSide}
      />
    </mesh>
    {/* Bulb */}
    <mesh position={[0, 1.5, 0]}>
      <sphereGeometry args={[0.08, 16, 16]} />
      <meshStandardMaterial
        color="#ffffff"
        emissive="#fff9c4"
        emissiveIntensity={1}
      />
    </mesh>
    {/* Light glow */}
    <pointLight
      position={[0, 1.5, 0]}
      intensity={1}
      distance={5}
      color="#fff3e0"
      castShadow
      shadow-bias={-0.001}
      shadow-mapSize={[1024, 1024]}
    />
  </group>
);

const DecorativeElements = () => (
  <group>
    {/* Rug */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 1]} receiveShadow>
      <circleGeometry args={[1.5, 32]} />
      <meshStandardMaterial
        color={pastel.rug}
        roughness={0.95}
        transparent
        opacity={0.8}
      />
    </mesh>

    {/* Picture Frame */}
    <group position={[0, 2.2, -2.95]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.8, 0.05]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[1.0, 0.6]} />
        <meshStandardMaterial color={pastel.toy2} />
      </mesh>
      {/* Abstract shapes inside frame */}
      <mesh position={[-0.2, 0.1, 0.031]}>
        <circleGeometry args={[0.15, 32]} />
        <meshStandardMaterial color={pastel.toy1} />
      </mesh>
      <mesh position={[0.2, -0.1, 0.031]}>
        <planeGeometry args={[0.3, 0.3]} />
        <meshStandardMaterial color={pastel.toy4} />
      </mesh>
    </group>

    {/* Hanging Mobile */}
    <Float speed={1} rotationIntensity={0.5} floatIntensity={0}>
      <group position={[0, 2.5, 1]}>
        {/* String to ceiling */}
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.005, 0.005, 1.2]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        {/* Crossbar */}
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.01, 0.01, 0.6]} />
          <meshStandardMaterial color={pastel.wood} />
        </mesh>
        <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.01, 0.01, 0.6]} />
          <meshStandardMaterial color={pastel.wood} />
        </mesh>
        {/* Dangling Stars */}
        {[
          [0.3, 0, 0, pastel.toy1],
          [-0.3, 0, 0, pastel.toy2],
          [0, 0, 0.3, pastel.toy3],
          [0, 0, -0.3, pastel.toy4],
        ].map((item, i) => (
          <group key={i} position={[item[0] as number, 0, item[2] as number]}>
            <mesh position={[0, -0.2, 0]}>
              <cylinderGeometry args={[0.003, 0.003, 0.4]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0, -0.4, 0]}>
              <octahedronGeometry args={[0.05]} />
              <meshStandardMaterial
                color={item[3] as string}
                roughness={0.3}
                metalness={0.2}
              />
            </mesh>
          </group>
        ))}
      </group>
    </Float>
  </group>
);

/* ─── Toys ────────────────────────────────────────────────────────────────── */
const Toys = () => (
  <group>
    {/* Ball */}
    <mesh position={[1.2, 0.15, 1.8]} castShadow>
      <sphereGeometry args={[0.15, 32, 32]} />
      <meshStandardMaterial
        color={pastel.toy1}
        roughness={0.4}
        metalness={0.1}
      />
    </mesh>

    {/* Stacking Rings */}
    <group position={[-1, 0, 1.2]}>
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.06, 0.2, 16]} />
        <meshStandardMaterial color={pastel.wood} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.1, 0.04, 16, 32]} />
        <meshStandardMaterial color={pastel.toy3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.08, 0.035, 16, 32]} />
        <meshStandardMaterial color={pastel.toy4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.06, 0.03, 16, 32]} />
        <meshStandardMaterial color={pastel.toy2} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.23, 0]} castShadow>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color={pastel.toy1} roughness={0.6} />
      </mesh>
    </group>

    {/* Teddy Bear */}
    <group position={[0.5, 0.15, 0.4]} rotation={[0, -Math.PI / 4, 0]}>
      {/* Body */}
      <mesh castShadow position={[0, 0, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#a1887f" roughness={1} />
      </mesh>
      {/* Head */}
      <mesh castShadow position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#a1887f" roughness={1} />
      </mesh>
      {/* Snout */}
      <mesh position={[0, 0.18, 0.11]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color="#d7ccc8" />
      </mesh>
      {/* Nose */}
      <mesh position={[0, 0.2, 0.15]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      {/* Ears */}
      <mesh position={[-0.08, 0.28, 0]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#a1887f" />
      </mesh>
      <mesh position={[0.08, 0.28, 0]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#a1887f" />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.14, 0.08, 0.08]} rotation={[0, 0, -Math.PI / 4]}>
        <capsuleGeometry args={[0.03, 0.08, 8, 8]} />
        <meshStandardMaterial color="#a1887f" />
      </mesh>
      <mesh position={[0.14, 0.08, 0.08]} rotation={[0, 0, Math.PI / 4]}>
        <capsuleGeometry args={[0.03, 0.08, 8, 8]} />
        <meshStandardMaterial color="#a1887f" />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.08, -0.1, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.04, 0.08, 8, 8]} />
        <meshStandardMaterial color="#a1887f" />
      </mesh>
      <mesh position={[0.08, -0.1, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.04, 0.08, 8, 8]} />
        <meshStandardMaterial color="#a1887f" />
      </mesh>
    </group>

    {/* Scattered Blocks */}
    {[
      [-0.5, 0.08, 1.8, pastel.toy2, [Math.PI / 4, Math.PI / 6, 0]],
      [-0.2, 0.08, 1.9, pastel.toy1, [0, -Math.PI / 3, 0]],
      [0.6, 0.08, 1.7, pastel.toy3, [Math.PI / 2, 0, Math.PI / 4]],
    ].map((props, i) => (
      <RoundedBox
        key={i}
        args={[0.16, 0.16, 0.16]}
        radius={0.02}
        position={[props[0] as number, props[1] as number, props[2] as number]}
        rotation={props[4] as [number, number, number]}
        castShadow
      >
        <meshStandardMaterial color={props[3] as string} roughness={0.6} />
      </RoundedBox>
    ))}
  </group>
);

/* ─── Baby Character (Enhanced) ───────────────────────────────────────────── */
const Baby = () => {
  const ref = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (
      !ref.current ||
      !headRef.current ||
      !leftArmRef.current ||
      !rightArmRef.current
    )
      return;
    const t = state.clock.elapsedTime;

    // Gentle bobbing and looking around
    ref.current.position.y = 0.25 + Math.sin(t * 1.5) * 0.015;
    headRef.current.rotation.y = Math.sin(t * 0.8) * 0.3;
    headRef.current.rotation.x = Math.sin(t * 1.2) * 0.1;

    // Arm movement (excited)
    leftArmRef.current.rotation.z = Math.PI / 4 + Math.sin(t * 3) * 0.2;
    leftArmRef.current.rotation.x = -Math.PI / 6 + Math.cos(t * 2) * 0.2;
    rightArmRef.current.rotation.z = -Math.PI / 4 + Math.sin(t * 3.2) * 0.2;
    rightArmRef.current.rotation.x = -Math.PI / 6 + Math.cos(t * 2.2) * 0.2;
  });

  return (
    <group ref={ref} position={[0, 0.25, 1]} rotation={[0, -Math.PI / 6, 0]}>
      {/* Body */}
      <RoundedBox args={[0.2, 0.24, 0.16]} radius={0.06} castShadow>
        <meshStandardMaterial color={pastel.babyBody} roughness={0.8} />
      </RoundedBox>

      {/* Diaper */}
      <RoundedBox
        args={[0.22, 0.1, 0.18]}
        radius={0.04}
        position={[0, -0.08, 0]}
        castShadow
      >
        <meshStandardMaterial color={pastel.babyDiaper} roughness={0.9} />
      </RoundedBox>

      {/* Arms */}
      <mesh ref={leftArmRef} position={[-0.14, 0.05, 0]} castShadow>
        <capsuleGeometry args={[0.035, 0.12, 8, 8]} />
        <meshStandardMaterial color={pastel.baby} roughness={0.8} />
      </mesh>
      <mesh ref={rightArmRef} position={[0.14, 0.05, 0]} castShadow>
        <capsuleGeometry args={[0.035, 0.12, 8, 8]} />
        <meshStandardMaterial color={pastel.baby} roughness={0.8} />
      </mesh>

      {/* Head Group */}
      <group ref={headRef} position={[0, 0.22, 0]}>
        {/* Head */}
        <mesh castShadow>
          <sphereGeometry args={[0.14, 32, 32]} />
          <meshStandardMaterial color={pastel.baby} roughness={0.7} />
        </mesh>

        {/* Hair Sprig */}
        <mesh position={[0, 0.13, 0]}>
          <coneGeometry args={[0.02, 0.06, 8]} />
          <meshStandardMaterial color={pastel.babyHair} />
        </mesh>
        <mesh position={[0.02, 0.12, 0]} rotation={[0, 0, -0.3]}>
          <coneGeometry args={[0.015, 0.05, 8]} />
          <meshStandardMaterial color={pastel.babyHair} />
        </mesh>

        {/* Eyes */}
        <mesh position={[-0.05, 0.02, 0.125]}>
          <sphereGeometry args={[0.02, 16, 16]} />
          <meshStandardMaterial color="#263238" />
        </mesh>
        <mesh position={[0.05, 0.02, 0.125]}>
          <sphereGeometry args={[0.02, 16, 16]} />
          <meshStandardMaterial color="#263238" />
        </mesh>

        {/* Blush */}
        <mesh position={[-0.08, -0.02, 0.115]} rotation={[-0.1, -0.5, 0]}>
          <circleGeometry args={[0.025, 16]} />
          <meshBasicMaterial
            color="#ff8a80"
            transparent
            opacity={0.4}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0.08, -0.02, 0.115]} rotation={[-0.1, 0.5, 0]}>
          <circleGeometry args={[0.025, 16]} />
          <meshBasicMaterial
            color="#ff8a80"
            transparent
            opacity={0.4}
            depthWrite={false}
          />
        </mesh>

        {/* Smile */}
        <mesh position={[0, -0.03, 0.135]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.025, 0.005, 8, 16, Math.PI]} />
          <meshStandardMaterial color="#e57373" />
        </mesh>
      </group>
    </group>
  );
};

/* ─── Animated Particles (Dust Motes) ─────────────────────────────────────── */
const Particles = () => {
  const count = 40;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Store random starting positions and speeds
  const particles = useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      x: (Math.random() - 0.5) * 8,
      y: Math.random() * 4,
      z: (Math.random() - 0.5) * 8 - 1,
      speedScale: 0.2 + Math.random() * 0.5,
      wobbleSpeed: 0.5 + Math.random() * 1.5,
      wobbleSize: Math.random() * 0.2,
      scale: 0.5 + Math.random() * 1.5,
    }));
  }, [count]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.elapsedTime;

    particles.forEach((p, i) => {
      // Float up slowly
      let y = p.y + time * 0.1 * p.speedScale;
      // Loop around
      if (y > 4) y = y % 4;

      const x = p.x + Math.sin(time * p.wobbleSpeed + i) * p.wobbleSize;
      const z = p.z + Math.cos(time * p.wobbleSpeed + i) * p.wobbleSize;

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null as any, null as any, count]}>
      <sphereGeometry args={[0.015, 8, 8]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
    </instancedMesh>
  );
};

/* ─── Mouse Parallax Camera Rig ───────────────────────────────────────────── */
const CameraRig = () => {
  const { camera } = useThree();
  const mouse = useRef({ x: 0, y: 0 });

  useFrame(() => {
    // Tweak to show off the whole room nicely
    const targetX = 3.5 + mouse.current.x * 1.5;
    const targetZ = 5.0 + mouse.current.y * 1.0;
    camera.position.x += (targetX - camera.position.x) * 0.05;
    camera.position.y += (3.5 - camera.position.y) * 0.05;
    camera.position.z += (targetZ - camera.position.z) * 0.05;
    camera.lookAt(0, 0.8, -0.5);
  });

  if (typeof window !== "undefined") {
    const handleMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", handleMove, { passive: true });
  }

  return null;
};

/* ─── Main Component ──────────────────────────────────────────────────────── */
const HomeScene3D = () => {
  return (
    <div className="w-full h-full rounded-3xl overflow-hidden relative">
      <Canvas
        shadows
        camera={{ position: [3.5, 3.5, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        {/* Environment removed to save PMREM generation memory */}

        {/* Lighting */}
        <ambientLight intensity={0.6} color="#ffffff" />
        <hemisphereLight
          intensity={0.5}
          color="#ffffff"
          groundColor="#fce4ec"
        />

        {/* Main Sun Light */}
        <directionalLight
          position={[5, 8, 3]}
          intensity={0.8}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0005}
          shadow-camera-left={-5}
          shadow-camera-right={5}
          shadow-camera-top={5}
          shadow-camera-bottom={-5}
          color="#fff8e1"
        />

        {/* Window Light */}
        <directionalLight
          position={[-5, 3, 0]}
          intensity={0.5}
          color="#e0f7fa"
        />

        {/* Fog for depth */}
        <fog attach="fog" args={["#fef0f5", 6, 16]} />

        {/* Scene Objects */}
        <Room />
        <Table />
        <Chair />
        <Bed />
        <Shelf />
        <FloorLamp />
        <DecorativeElements />
        <Toys />
        <Baby />

        {/* The instanced points are rendered properly if the component does not break */}
        <Particles />

        {/* Realistic ground shadow (baked once for performance) */}
        <ContactShadows
          position={[0, 0.01, 0]}
          opacity={0.3}
          scale={10}
          blur={1.5}
          far={5}
          resolution={256}
          color="#880e4f"
          frames={1}
        />

        {/* Camera */}
        <CameraRig />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableRotate={false}
        />
      </Canvas>

      {/* Fallback gradient background underneath the canvas to match fog */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#fef0f5] to-transparent pointer-events-none" />
    </div>
  );
};

export default HomeScene3D;
