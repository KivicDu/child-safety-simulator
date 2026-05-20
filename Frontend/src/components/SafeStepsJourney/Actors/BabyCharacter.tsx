/**
 * BabyCharacter — Enhanced with cinematic polish
 *
 * Files:
 *   play_toys_animated.glb → clip "play_toys"  (Frame 1)
 *   baby_animation.glb     → clip "stand_up"   (Frame 2 đầu)
 *   baby_animation.glb     → clip "walk"       (Frame 2 đi)
 *   baby_animation.glb     → clip "idle"       (Frame 3 + 4)
 */
import { useRef, useEffect } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SCALE = 0.08; 
const FLOOR_Y = 0.1335;

/* Start: Đứng xa hơn để đi lại gần bàn an toàn */
const WALK_START: [number, number, number] = [0.05, 0, 0.8];
/* End: baby dừng TRƯỚC góc trái bàn, nhìn thẳng vào corner */
const WALK_END: [number, number, number] = [-0.45, 0, 0.13]; 

/* Walk bob parameters */
const BOB_AMPLITUDE = 0.008; // subtle Y bounce
const BOB_FREQUENCY = 8.0; // steps per second

/* ── Helper: apply opacity to all meshes in scene ────── */
function applyOpacity(scene: THREE.Object3D, opacity: number) {
  scene.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mat) => {
      const sm = mat as THREE.MeshStandardMaterial;
      if (sm.isMeshStandardMaterial) {
        sm.transparent = true;
        sm.opacity = opacity;
        sm.depthWrite = opacity > 0.5;
      }
    });
  });
}

/* ── Contact Shadow ──────────────────────────────────── */
function ContactShadow() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
      <circleGeometry args={[0.35, 24]} />
      <meshBasicMaterial
        color="#000000"
        transparent
        opacity={0.2}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ── Model: play_toys_animated.glb ───────────────────── */
function PlayModel({ active, phase }: { active: boolean; phase: BabyPhase }) {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF("/models/play_toys_animated.glb");
  const { actions } = useAnimations(animations, groupRef);
  const opRef = useRef(0);

  useEffect(() => {
    if (!active) {
      Object.values(actions).forEach((a) => a?.fadeOut(0.4));
      return;
    }
    /* T-07: Use sitting_standup as exit bridge when transitioning to 'stand' */
    if (phase === "stand") {
      const bridge = actions["sitting_standup"] ?? null;
      if (bridge && !bridge.isRunning()) {
        bridge.setLoop(THREE.LoopOnce, 1).reset().play();
        bridge.clampWhenFinished = true;
      }
      return;
    }
    const a = actions["play_toys"] ?? Object.values(actions).find(Boolean);
    if (!a) return;
    a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.4).play();
    return () => {
      a.fadeOut(0.4);
    };
  }, [active, phase, actions]);

  useEffect(() => {
    scene.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }, [scene]);

  useFrame((_s, dt) => {
    opRef.current += ((active ? 1 : 0) - opRef.current) * Math.min(1, 5 * dt);
    applyOpacity(scene, opRef.current);
    if (groupRef.current) groupRef.current.visible = opRef.current > 0.01;
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive object={scene} />
    </group>
  );
}

/* ── Model: baby_animation.glb (stand/walk/idle) ─────── */
function BabyModel({ active, phase }: { active: boolean; phase: BabyPhase }) {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF("/models/baby_animation.glb");
  const { actions } = useAnimations(animations, groupRef);
  const opRef = useRef(0);

  useEffect(() => {
    if (!active || phase === "play") {
      Object.values(actions).forEach((a) => {
        if (a?.isRunning()) a.fadeOut(0.4);
      });
      return;
    }

    let clipName = "idle";
    let loopOnce = false;
    if (phase === "stand") {
      clipName = "stand_up";
      loopOnce = true;
    } else if (phase === "walk") {
      clipName = "walk";
    } else if (phase === "idle") {
      clipName = "idle";
    }

    const a =
      actions[clipName] ?? Object.values(actions).find((_, idx) => idx === 0);
    if (!a) return;

    // crossfade: tắt các clip đang chạy khác
    Object.values(actions).forEach((act) => {
      if (act && act !== a && act.isRunning()) {
        act.fadeOut(0.4);
      }
    });

    a.reset();
    a.setLoop(
      loopOnce ? THREE.LoopOnce : THREE.LoopRepeat,
      loopOnce ? 1 : Infinity,
    );
    a.clampWhenFinished = loopOnce;
    /* T-07: Delay fadeIn 350ms to avoid ghost overlap with PlayModel */
    const timer = setTimeout(() => {
      a.fadeIn(0.4).play();
    }, 350);
    return () => clearTimeout(timer);
  }, [active, phase, actions]);

  useEffect(() => {
    scene.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }, [scene]);

  useFrame((_s, dt) => {
    opRef.current += ((active ? 1 : 0) - opRef.current) * Math.min(1, 5 * dt);
    applyOpacity(scene, opRef.current);
    if (groupRef.current) groupRef.current.visible = opRef.current > 0.01;
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive object={scene} />
    </group>
  );
}

/* ── Master BabyCharacter ─────────────────────────────── */
export type BabyPhase = "play" | "stand" | "walk" | "idle";

interface Props {
  scrollProgress: number;
  phase: BabyPhase;
  position?: [number, number, number];
}

export default function BabyCharacter({
  scrollProgress,
  phase,
  position = [0, 0, 0],
}: Props) {
  const rootRef = useRef<THREE.Group>(null!);
  const worldPos = useRef(new THREE.Vector3(...WALK_START));
  const targetPos = useRef(new THREE.Vector3(...WALK_START));
  const targetRotY = useRef(0);
  const timeRef = useRef(0);

  useEffect(() => {
    if (phase === "play") {
      targetPos.current.set(...WALK_START);
      /* Ngồi chơi: Quay 180 độ (Math.PI) hướng ngược về phía các đồ chơi (Z=0) */
      targetRotY.current = Math.PI;
    } else if (phase === "stand") {
      targetPos.current.set(...WALK_START);
      /* Bắt đầu đứng lên: Rục rịch quay người sang hướng cái bàn */
      targetRotY.current = Math.atan2(
        WALK_END[0] - WALK_START[0],
        WALK_END[2] - WALK_START[2],
      );
    } else if (phase === "walk" || phase === "idle") {
      /* Walk progress — baby stops when it reaches WALK_END */
      const wp = Math.min(1, Math.max(0, (scrollProgress - 0.58) / 0.12));
      const ease = wp * wp * (3 - 2 * wp);
      targetPos.current.set(
        WALK_START[0] + (WALK_END[0] - WALK_START[0]) * ease,
        0,
        WALK_START[2] + (WALK_END[2] - WALK_START[2]) * ease,
      );
      targetRotY.current = Math.atan2(
        WALK_END[0] - WALK_START[0],
        WALK_END[2] - WALK_START[2],
      );
    }
  }, [scrollProgress, phase]);

  useFrame((_, delta) => {
    if (!rootRef.current) return;
    timeRef.current += delta;

    worldPos.current.lerp(targetPos.current, 0.055);

    /* ── Walk bob: sinusoidal Y offset during walk phase ── */
    let bobY = 0;
    if (phase === "walk") {
      bobY =
        Math.abs(Math.sin(timeRef.current * BOB_FREQUENCY)) * BOB_AMPLITUDE;
    }

    rootRef.current.position.set(
      position[0] + worldPos.current.x,
      position[1] + FLOOR_Y + bobY,
      position[2] + worldPos.current.z,
    );
    rootRef.current.rotation.y +=
      (targetRotY.current - rootRef.current.rotation.y) * 0.07;
  });

  if (scrollProgress < 0.35) return null;

  return (
    <group ref={rootRef} scale={SCALE}>
      <PlayModel active={phase === "play"} phase={phase} />
      <BabyModel active={phase !== "play"} phase={phase} />
      {/* Contact shadow blob under baby */}
      <ContactShadow />
    </group>
  );
}

useGLTF.preload("/models/play_toys_animated.glb");
useGLTF.preload("/models/baby_animation.glb");
