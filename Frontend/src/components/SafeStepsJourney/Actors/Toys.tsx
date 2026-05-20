/**
 * Toys — Three toy models scattered around the baby's play area.
 *
 * Calibrated values:
 *   car_toy  : scale=0.002557, floor_offset= 0.0990  (raw minY=-38.711)
 *   dog_toy  : scale=0.143678, floor_offset=-0.1243  (raw minY=+0.865 → already above origin)
 *   seal_toys: scale=0.036738, floor_offset= 0.0381  (raw minY=-1.038)
 *
 * Toys are placed around the baby's sitting position (world 0, 0, 0.5).
 * They gently float/bob to add Disney magic life.
 */
import { useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ── Individual toy wrapper with bob animation ────────── */
interface ToyProps {
  url: string;
  scale: number;
  floorY: number;
  position: [number, number, number];
  rotY?: number;
  bobAmp?: number;
  bobSpeed?: number;
  bobOffset?: number;
  visible?: boolean;
}

function Toy({
  url,
  scale,
  floorY,
  position,
  rotY = 0,
  bobAmp = 0.008,
  bobSpeed = 1.2,
  bobOffset = 0,
  visible = true,
}: ToyProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene } = useGLTF(url);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.position.y =
      position[1] + floorY + Math.sin(t * bobSpeed + bobOffset) * bobAmp;
    groupRef.current.rotation.y = rotY + Math.sin(t * 0.4 + bobOffset) * 0.08;
  });

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1] + floorY, position[2]]}
      scale={scale}
      rotation={[0, rotY, 0]}
      visible={visible}
    >
      <primitive object={scene.clone()} />
    </group>
  );
}

/* ── Master Toys Component ────────────────────────────── */
interface Props {
  visible?: boolean;
}

export default function Toys({ visible = true }: Props) {
  return (
    <group visible={visible}>
      {/* Toy car — right of baby */}
      <Toy
        url="/models/car_toy.glb"
        scale={0.002557}
        floorY={0.1}   
        position={[0.167, 0, 0.7]}
        rotY={-2}
        bobAmp={0.006}
        bobSpeed={0.9}
        bobOffset={0}
        visible={visible}
      />

      {/* Dog on wheels — left of baby */}
      <Toy
        url="/models/dog_toy.glb"
        scale={0.143678}
        floorY={0.05} 
        position={[-0.1, 0, 0.48]}
        rotY={0.5}
        bobAmp={0.005}
        bobSpeed={1.1}
        bobOffset={1.2}
        visible={visible}
      />

      {/* Seal stacker — slightly behind baby */}
      <Toy
        url="/models/seal_toys.glb"
        scale={0.036738}
        floorY={0.05}
        position={[-0.1, 0, 0.6]}
        rotY={2.3}
        bobAmp={0.01}
        bobSpeed={1.4}
        bobOffset={2.4}
        visible={visible}
      />
    </group>
  );
}

useGLTF.preload("/models/car_toy.glb");
useGLTF.preload("/models/dog_toy.glb");
useGLTF.preload("/models/seal_toys.glb");
