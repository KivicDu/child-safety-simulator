/**
 * JourneyScene — 4 Frame Timeline
 *
 * Frame 0  (0.00–0.18): Bầu trời sao thuần
 * Trans 0→1(0.18–0.35): Bay xuống xuyên cửa sổ
 * Frame 1  (0.35–0.50): Baby chơi trong phòng
 * Frame 2  (0.50–0.70): Baby đứng → tối → table xuất hiện → đi về góc bàn
 * Frame 3  (0.70–0.84): Baby dừng, guardian xanh (T-08: 0.82→0.84)
 * Frame 4  (0.84–1.00): Nhà hiện, camera kéo lên → blueprint
 */
import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { type BabyPhase } from "./Actors/BabyCharacter";

import CameraManager from "./CameraManager";
import PostProcessingEffects from "./PostProcessingEffects";
import HouseComplete from "./Environment/HouseComplete";
import StarrySky from "./Environment/StarrySky";
import BabyCharacter from "./Actors/BabyCharacter";
import Toys from "./Actors/Toys";
import HazardTable from "./Actors/HazardTable";
import GuardianParticles from "./Effects/GuardianParticles";
import AudioEngine from "./AudioEngine";
import BlueprintOverlay from "./BlueprintOverlay";
import PixieDustCursor from "./Effects/PixieDustCursor";
import StoryOverlay from "./StoryOverlay";

/* ── Fading Ground ────────────────────────────────────── */
function Ground({ opacity }: { opacity: number }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const meshRef = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    if (!matRef.current || !meshRef.current) return;
    matRef.current.opacity = opacity;
    matRef.current.depthWrite = opacity > 0.5;
    meshRef.current.visible = opacity > 0.01;
  });
  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.01, 0]}
      receiveShadow
    >
      <planeGeometry args={[80, 80]} />
      <meshStandardMaterial
        ref={matRef}
        color="#0e2418"
        roughness={0.92}
        metalness={0}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
}

/* ── Dust Motes — UPGRADED: 40→80, warmer golden tint ── */
function DustMotes({ visible }: { visible: boolean }) {
  const DUST_COUNT = 80;
  const [pos] = useState(() => {
    const p = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      p[i * 3] = (Math.random() - 0.5) * 4;
      p[i * 3 + 1] = Math.random() * 2.5;
      p[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    return p;
  });
  if (!visible) return null;
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.012}
        color="#ffe8b0"
        transparent
        opacity={0.18}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/* ── Scene Lighting — SMOOTH TRANSITIONS (no hard cuts) ─ */
function SceneLighting({ sp }: { sp: number }) {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

  /* ── Smooth ambient intensity & color ───────────── */
  let ambInt: number;
  let ambColor: string;

  if (sp < 0.18) {
    // Frame 0: Dark starry sky with cool blue tint
    ambInt = 0.03;
    ambColor = "#c0d0ff";
  } else if (sp < 0.35) {
    // Transition: Gradually brighten entering house
    const t = (sp - 0.18) / 0.17;
    ambInt = lerp(0.03, 0.30, t);
    ambColor = "#fff5ee";
  } else if (sp < 0.45) {
    // Frame 1: Warm interior
    ambInt = 0.30;
    ambColor = "#fff5ee";
  } else if (sp < 0.52) {
    // SMOOTH fade to dark (was instant at 0.50)
    const t = (sp - 0.45) / 0.07;
    ambInt = lerp(0.30, 0.05, t);
    ambColor = "#fff5ee";
  } else if (sp < 0.82) {
    // Frame 2-3: Dark spotlight mode
    ambInt = 0.05;
    ambColor = "#0a0a18";
  } else {
    // Frame 4: Dawn rising
    const t = Math.min(1, (sp - 0.82) / 0.15);
    ambInt = lerp(0.05, 0.50, t);
    ambColor = t < 0.5 ? "#e8d8c0" : "#a0c4ff";
  }

  /* ── Key light intensity (smooth transitions) ──── */
  let keyInt: number;
  if (sp < 0.35) {
    keyInt = 0.07;
  } else if (sp < 0.45) {
    keyInt = 0.5;
  } else if (sp < 0.52) {
    // Smooth fade-out
    keyInt = lerp(0.5, 0, (sp - 0.45) / 0.07);
  } else if (sp < 0.82) {
    keyInt = 0;
  } else {
    // Smooth fade-in on ascent
    keyInt = lerp(0, 0.6, Math.min(1, (sp - 0.82) / 0.1));
  }

  /* ── God-ray (smooth fade-in) ─────────────────── */
  const godRayInt = (sp >= 0.33 && sp < 0.50)
    ? 0.9 * Math.min(1, (sp - 0.33) / 0.04)
    : 0;

  /* ── Dark spotlights (smooth fade-in) ──────────── */
  const darkSpot = (sp >= 0.50 && sp < 0.82)
    ? Math.min(1, (sp - 0.50) / 0.03)
    : 0;

  return (
    <>
      <ambientLight intensity={ambInt} color={ambColor} />

      {/* Key light — smooth intensity transition */}
      <directionalLight
        position={[3, 5, 2]}
        intensity={keyInt}
        color={sp > 0.9 ? "#a0c4ff" : "#ffe4b5"}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-bias={-0.001}
      />

      {/* Window god-ray — smooth fade-in */}
      {godRayInt > 0.01 && (
        <spotLight
          position={[2.8, 3.5, 1.8]}
          angle={0.38}
          penumbra={0.85}
          intensity={godRayInt}
          color="#fff8e7"
        />
      )}

      {/* Frame 2-3: spotlight on baby + table — smooth fade-in */}
      {darkSpot > 0.01 && (
        <>
          <spotLight
            position={[0.2, 2.0, 0.5]}
            angle={0.45}
            penumbra={0.8}
            intensity={1.5 * darkSpot}
            color="#ffffff"
          />
          <spotLight
            position={[0.5, 1.8, 0.3]}
            angle={0.35}
            penumbra={0.7}
            intensity={1.2 * darkSpot}
            color="#ffe4e4"
            target-position={[-0.05, 0.275, 0.12]}
          />
        </>
      )}
    </>
  );
}

/* ── Fog — SMOOTH TRANSITIONS (no color pops) ────────── */
function FogController({ sp }: { sp: number }) {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

  let near: number, far: number, color: string;

  if (sp < 0.18) {
    // Frame 0: Wide open sky
    near = 50;
    far = 100;
    color = "#050818";
  } else if (sp < 0.35) {
    // Transition: Fog closes in
    const t = (sp - 0.18) / 0.17;
    near = lerp(50, 3, t);
    far = lerp(100, 15, t);
    color = "#080c1c";
  } else if (sp < 0.45) {
    // Frame 1: Interior fog
    near = lerp(3, 4, (sp - 0.35) / 0.10);
    far = lerp(15, 20, (sp - 0.35) / 0.10);
    color = "#16131e";
  } else if (sp < 0.52) {
    // SMOOTH transition to dark fog (was instant jump)
    const t = (sp - 0.45) / 0.07;
    near = lerp(4, 1.5, t);
    far = lerp(20, 6, t);
    color = "#0a0810";
  } else if (sp < 0.82) {
    // Frame 2-3: Tight dark fog
    near = 1.5;
    far = 6;
    color = "#000008";
  } else {
    // Frame 4: Fog opens back up for ascent
    const t = (sp - 0.82) / 0.18;
    near = lerp(1.5, 8, t);
    far = lerp(6, 30, t);
    color = "#050818";
  }

  return <fog attach="fog" args={[color, near, far]} />;
}

/* ── Loader ───────────────────────────────────────────── */
function Loader() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#050818",
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            border: "2px solid rgba(255,228,160,0.12)",
            borderTopColor: "#ffe4a0",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <span
          style={{
            fontFamily: "'Cinzel Decorative',serif",
            fontSize: 13,
            letterSpacing: "0.14em",
            color: "rgba(255,248,230,0.55)",
          }}
        >
          Once upon a time...
        </span>
      </div>
    </div>
  );
}

/* ── Scroll HUD ───────────────────────────────────────── */
const HUD_PHASES = [
  { label: "Starlight", range: [0.0, 0.18] },
  { label: "Entering", range: [0.18, 0.35] },
  { label: "Wonderland", range: [0.35, 0.5] },
  { label: "First Steps", range: [0.5, 0.7] },
  { label: "Guardian", range: [0.7, 0.84] },   
  { label: "Blueprint", range: [0.84, 1.0] },   
];

function ScrollHUD({ progress }: { progress: number }) {
  const active =
    HUD_PHASES.find((p) => progress >= p.range[0] && progress <= p.range[1]) ||
    HUD_PHASES[0];
  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 55,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          padding: "5px 18px",
          borderRadius: 999,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,228,160,0.10)",
          fontFamily: "'Cormorant Garamond',serif",
          color: "rgba(255,228,160,0.75)",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.12em",
        }}
      >
        {active.label}
      </div>
      <div
        style={{
          width: 180,
          height: 2,
          borderRadius: 4,
          background: "rgba(255,255,255,0.05)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            borderRadius: 4,
            background: "linear-gradient(90deg,#ffe4a0,#78dcd2)",
            transition: "width 0.1s ease-out",
          }}
        />
      </div>
      {progress < 0.03 && (
        <div
          style={{
            fontFamily: "'Cormorant Garamond',serif",
            color: "rgba(255,248,230,0.28)",
            fontSize: 11,
            fontStyle: "italic",
            animation: "pulse 2.2s ease-in-out infinite",
          }}
        >
          ↓ Scroll to begin the journey
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function JourneyScene() {
  const rawRef = useRef(0);
  const smoothRef = useRef(0);
  const rafRef = useRef<number>(0);
  const [sp, setSp] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const SCROLL_PAGES = 6; // 4 frames in 6 screen heights

  /*
   * T-16: Góc nguy hiểm thực tế do HazardTable tính và gửi lên.
   * Dùng cho GuardianParticles để particles luôn xuất hiện đúng góc bàn.
   * Khởi tạo = null; fallback tạm [-0.40, 0.41, 0.20] chỉ hiển thị
   * khi callback chưa kịp fire (trước lần mount đầu tiên của HazardTable).
   */
  const [tableCorner, setTableCorner] = useState<THREE.Vector3 | null>(null);

  const handleCornerReady = useCallback((worldPos: THREE.Vector3) => {
    setTableCorner(worldPos.clone());
  }, []);

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      smoothRef.current += (rawRef.current - smoothRef.current) * 0.14;
      if (Math.abs(rawRef.current - smoothRef.current) > 0.0004)
        scheduleUpdate();
      setSp(+smoothRef.current.toFixed(4));
    });
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      rawRef.current = Math.max(
        0,
        Math.min(
          1,
          rawRef.current + e.deltaY / (window.innerHeight * SCROLL_PAGES),
        ),
      );
      scheduleUpdate();
    },
    [scheduleUpdate],
  );

  const touchY = useRef(0);
  const onTouchStart = useCallback((e: TouchEvent) => {
    touchY.current = e.touches[0].clientY;
  }, []);
  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();
      const dy = touchY.current - e.touches[0].clientY;
      touchY.current = e.touches[0].clientY;
      rawRef.current = Math.max(
        0,
        Math.min(1, rawRef.current + dy / (window.innerHeight * SCROLL_PAGES)),
      );
      scheduleUpdate();
    },
    [scheduleUpdate],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      cancelAnimationFrame(rafRef.current);
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [handleWheel, onTouchStart, onTouchMove]);

  /* ── Derived values ──────────────────────────────── */

  /* Baby phase */
  const babyPhase: BabyPhase =
    sp < 0.5 ? "play" : sp < 0.56 ? "stand" : sp < 0.7 ? "walk" : "idle";

  /* Table: T-09 — start from 0.47 to overlap with sceneAlpha fadeout (0.45→0.48) */
  const tableOpacity =
    sp < 0.47
      ? 0
      : sp < 0.52
        ? (sp - 0.47) / 0.05
        : sp < 0.77
          ? 1
          : sp < 0.80
            ? 1 - (sp - 0.77) / 0.03
            : 0;

  /* Danger: T-06 — fade out ends at 0.70 (was 0.72) to avoid purple overlap */
  const dangerIntensity =
    sp >= 0.50 && sp < 0.70
      ? sp < 0.55
        ? (sp - 0.50) / 0.05
        : sp < 0.66
          ? 1
          : Math.max(0, 1 - (sp - 0.66) / 0.04)
      : 0;

  /* Guardian: T-06 — starts at 0.72 (gap 0.70→0.72 = clean), T-08 — ends at 0.84 */
  const guardianIntensity =
    sp >= 0.72 && sp < 0.84
      ? sp < 0.78
        ? Math.min(1, (sp - 0.72) / 0.06)
        : Math.max(0, 1 - (sp - 0.82) / 0.02)
      : 0;

  const guardianParticles = guardianIntensity;

  /* House + Ground + Toys visibility
     Chìm vào bóng tối từ 0.45→0.48. Đen đặc trong suốt Frame 2,3.
     T-08: Hiện ra lại từ 0.84→0.87 (was 0.80→0.83). */
  const sceneAlpha =
    sp < 0.45
      ? 1
      : sp < 0.48
        ? 1 - (sp - 0.45) / 0.03
        : sp < 0.84
          ? 0
          : sp < 0.87
            ? (sp - 0.84) / 0.03
            : 1;

  /* Canvas → Blueprint crossfade — T-08 shifted, T-14 overlap fix (0.91) */
  const canvasOpacity = sp > 0.94 ? Math.max(0, 1 - (sp - 0.94) / 0.05) : 1;
  const blueprintOpacity = sp > 0.91 ? Math.min(1, (sp - 0.91) / 0.06) : 0;

  /* T-11: Danger vignette — HTML overlay radial-gradient tied to dangerIntensity */
  const vignetteOp = dangerIntensity * 0.55;

  /* T-12: White flash when camera passes through window (scroll 0.30→0.34) */
  const flashOp = sp >= 0.30 && sp <= 0.34
    ? Math.sin((sp - 0.30) / 0.04 * Math.PI) * 0.85
    : 0;

  const showToys = sp >= 0.35 && sceneAlpha > 0.01;
  const showDustMotes = sp >= 0.35 && sp < 0.5;

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#050818",
        cursor: "none",
      }}
    >
      {/* Keyframes & fonts now in index.css — no inline duplication */}

      <div
        style={{
          position: "fixed",
          inset: 0,
          opacity: canvasOpacity,
          pointerEvents: canvasOpacity < 0.05 ? "none" : "auto",
        }}
      >
        <Suspense fallback={<Loader />}>
          <Canvas
            shadows
            dpr={[1, 1.5]}
            gl={{
              antialias: false,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 0.9,
              powerPreference: "high-performance",
              stencil: false,
            }}
            camera={{ fov: 50, near: 0.05, far: 150 }}
          >
            <FogController sp={sp} />
            <SceneLighting sp={sp} />
            <CameraManager scrollProgress={sp} />
            <Ground opacity={sceneAlpha} />

            {/* Frame 0: bầu trời sao */}
            <StarrySky scrollProgress={sp} />

            {/* Nhà — fade theo sceneAlpha */}
            {/* House — fade theo sceneAlpha */}
            <HouseComplete scrollProgress={sp} />

            {/* Baby — luôn hiện từ Frame 1 trở đi */}
            <BabyCharacter
              scrollProgress={sp}
              phase={babyPhase}
              position={[0, 0, 0]}
              walkEnd={tableCorner ? [tableCorner.x, tableCorner.y, tableCorner.z] : undefined}
            />

            {/* Toys — chỉ dùng trong animation "play" Frame 1. Đặt cao lên (y=0.16) để không lún thảm */}
            <group position={[0, 0.16, 0]}>
              <Toys visible={showToys} />
            </group>

            {/* Table — xuất hiện Frame 2.
                T-16: Không hardcode dangerTarget nữa.
                HazardTable tự tính góc nguy hiểm từ bounding box thực tế
                và trả về qua onCornerReady để đồng bộ GuardianParticles. */}
            {tableOpacity > 0.01 && (
              <HazardTable
                dangerIntensity={dangerIntensity}
                guardianIntensity={guardianIntensity}
                opacity={tableOpacity}
                position={[-0.05, 0.1317, 0.12]}
                onCornerReady={handleCornerReady}
              />
            )}

            {/* Guardian particles — T-16: position lấy từ tableCorner thực tế.
                +0.05 Y để particles nổi nhẹ phía trên góc bàn.
                Fallback về giá trị cũ nếu corner chưa được tính (trước mount đầu). */}
            {guardianParticles > 0.01 && (
              <GuardianParticles
                progress={guardianParticles}
                position={
                  tableCorner
                    ? [tableCorner.x, tableCorner.y + 0.05, tableCorner.z]
                    : [-0.40, 0.46, 0.20]
                }
              />
            )}

            <DustMotes visible={showDustMotes} />
            <PostProcessingEffects scrollProgress={sp} />
          </Canvas>
        </Suspense>
      </div>

      {/* T-11: Danger vignette overlay */}
      {vignetteOp > 0.01 && (
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 35,
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignetteOp}) 100%)`,
          transition: 'background 0.3s ease',
        }} />
      )}

      {/* T-12: White flash when passing through window */}
      {flashOp > 0.01 && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 55,
          background: 'white', opacity: flashOp,
          pointerEvents: 'none',
        }} />
      )}

      <AudioEngine scrollProgress={sp} />
      <PixieDustCursor />
      <StoryOverlay scrollProgress={sp} />
      <ScrollHUD progress={sp} />
      <BlueprintOverlay
        visible={blueprintOpacity > 0.01}
        opacity={blueprintOpacity}
      />
    </div>
  );
}