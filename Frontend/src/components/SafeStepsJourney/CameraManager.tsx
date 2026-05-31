/**
 * CameraManager — Cinematic 4-Frame timeline with per-segment easing
 *
 * Frame 0  (0.00–0.18): Bầu trời sao — nhìn lên, không thấy nhà
 * Trans 0→1(0.18–0.35): Bay xuống → nhắm window_glass → xuyên qua kính → vào phòng
 * Frame 1  (0.35–0.50): Trong phòng, 3/4 nhìn xuống baby
 * Frame 2  (0.50–0.70): Tập trung góc bàn + baby đang đi
 * Frame 3  (0.70–0.82): Giữ nguyên camera, baby dừng + guardian
 * Frame 4  (0.82–1.00): Kéo thẳng lên theo Y, top-down → blueprint
 */
import { useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";

/* ── Per-segment easing functions ─────────────────────── */
type EaseFn = (t: number) => number;

const EASE: Record<string, EaseFn> = {
  /** Gentle smoothstep — contemplative starry sky */
  gentle: (t) => t * t * (3 - 2 * t),
  /** Cubic ease-out — dramatic pull toward house */
  pullIn: (t) => 1 - Math.pow(1 - t, 3),
  /** Ease-in-out — smooth interior reveal */
  reveal: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  /** Quadratic ease-in — accelerating ascent */
  ascend: (t) => t * t,
  /** Linear — ultra-short segments */
  linear: (t) => t,
};

/* ── Types ────────────────────────────────────────────── */
interface Waypoint {
  scroll: number;
  pos: [number, number, number];
  lookAt: [number, number, number];
  ease?: EaseFn;
  fov?: number;
}

/* window_glass world pos: (0.065, 1.267, 1.626) */
const WINDOW_POS: [number, number, number] = [0.065, 1.267, 1.626];

/* ── Waypoints ────────────────────────────────────────── */
const WAYPOINTS: Waypoint[] = [
  /* ── Frame 0: Bầu trời sao ─────────────────────────
     Camera bắt đầu ở trên cao, xa nhà, nhìn bầu trời sao. */
  {
    scroll: 0.0,
    pos: [0, 1.267, 5.0],
    lookAt: [0, 10.0, 5.0],
    fov: 50,
    ease: EASE.gentle,
  },
  {
    scroll: 0.08,
    pos: [0, 1.267, 5.0],
    lookAt: [0, 10.0, 3.0],
    fov: 50,
    ease: EASE.gentle,
  },
  {
    scroll: 0.16,
    pos: [0, 1.267, 5.0],
    lookAt: [0, 10.0, 1.0],
    fov: 50,
    ease: EASE.linear,
  },

  /* ── Transition 0→1: Bay xuống → nhắm cửa sổ ──────
     FOV narrows as camera pulls in toward window */
  {
    scroll: 0.2,
    pos: [WINDOW_POS[0], WINDOW_POS[1], 4.5],
    lookAt: [WINDOW_POS[0], WINDOW_POS[1], WINDOW_POS[2]],
    fov: 45,
    ease: EASE.pullIn,
  },
  {
    scroll: 0.26,
    pos: [0, 1.8, 2.8],
    lookAt: [WINDOW_POS[0], WINDOW_POS[1], WINDOW_POS[2]],
    fov: 40,
    ease: EASE.pullIn,
  },
  /* Xuyên qua cửa sổ */
  {
    scroll: 0.33,
    pos: [WINDOW_POS[0], WINDOW_POS[1], WINDOW_POS[2]],
    lookAt: [0.05, 0.35, 0.4],
    fov: 36,
    ease: EASE.pullIn,
  },

  /* ── Frame 1: Chơi đồ chơi (Vào trong nhà) ─────────
     3/4 angle to see baby playing */
  {
    scroll: 0.35,
    pos: [1, 0.8, 0.3],
    lookAt: [0.05, 0.25, 0.8],
    fov: 38,
    ease: EASE.reveal,
  },
  {
    scroll: 0.48,
    pos: [1, 0.8, 0.3],
    lookAt: [0.05, 0.25, 0.8],
    fov: 40,
    ease: EASE.reveal,
  },

  /* ── Frame 2: Tập trung góc bàn lồi bên trái + bé ── */
  {
    scroll: 0.55,
    pos: [0.85, 1.0, -0.5],
    lookAt: [-0.35, 0.2, 0.35],
    fov: 46,
    ease: EASE.reveal,
  },
  {
    scroll: 0.65,
    pos: [0.85, 0.95, -0.5],
    lookAt: [-0.35, 0.25, 0.35],
    fov: 44,
    ease: EASE.gentle,
  },

  /* ── Frame 3: Giữ góc xem Guardian ───────────────── */
  {
    scroll: 0.72,
    pos: [0.85, 0.8, 0.1],
    lookAt: [-0.35, 0.15, 0.3],
    fov: 44,
    ease: EASE.gentle,
  },
  {
    scroll: 0.8,
    pos: [0.85, 0.8, 0.1],
    lookAt: [-0.35, 0.15, 0.3],
    fov: 44,
    ease: EASE.gentle,
  },

  /* ── Frame 4: Kéo thẳng lên — 7 waypoints for smooth ascent ──
     X/Z converge gradually: 0.65→0.55→0.40→0.25→0.12→0.05→0.0→0.0
     FOV widens progressively: 44→46→48→52→56→60→62→65 */
  {
    scroll: 0.82,
    pos: [0.55, 0.9, 0.45],
    lookAt: [0.5, -0.1, -0.5],
    fov: 46,
    ease: EASE.ascend,
  },
  {
    scroll: 0.85,
    pos: [0.4, 1.3, 0.35],
    lookAt: [0.3, -0.1, -0.5],
    fov: 48,
    ease: EASE.ascend,
  },
  {
    scroll: 0.88,
    pos: [0.4, 2, 0.35],
    lookAt: [0, 0, 0],
    fov: 52,
    ease: EASE.ascend,
  },
  {
    scroll: 0.91,
    pos: [0.4, 4, 0.35],
    lookAt: [0.5, -0.3, -0.5],
    fov: 56,
    ease: EASE.ascend,
  },
  {
    scroll: 0.94,
    pos: [0.4, 6, 0.35],
    lookAt: [0.5, -0.3, -0.5],
    fov: 60,
    ease: EASE.gentle,
  },
  {
    scroll: 0.97,
    pos: [0.4, 8, 0.35],
    lookAt: [0.0, 0.0, -0.5],
    fov: 62,
    ease: EASE.gentle,
  },
  {
    scroll: 1.0,
    pos: [0.4, 10, 0.35],
    lookAt: [0, 0, -0.5],
    fov: 65,
    ease: EASE.linear,
  },
];

/* ── Interpolation with per-segment easing ────────── */
function lerpWP(a: Waypoint, b: Waypoint, rawT: number) {
  const easeFn = b.ease || EASE.gentle;
  const t = easeFn(Math.max(0, Math.min(1, rawT)));
  const l = (x: number, y: number) => x + (y - x) * t;
  return {
    pos: [
      l(a.pos[0], b.pos[0]),
      l(a.pos[1], b.pos[1]),
      l(a.pos[2], b.pos[2]),
    ] as [number, number, number],
    lookAt: [
      l(a.lookAt[0], b.lookAt[0]),
      l(a.lookAt[1], b.lookAt[1]),
      l(a.lookAt[2], b.lookAt[2]),
    ] as [number, number, number],
    fov: l(a.fov ?? 50, b.fov ?? 50),
  };
}

/* ── Component ────────────────────────────────────────── */
export default function CameraManager({
  scrollProgress,
}: {
  scrollProgress: number;
}) {
  const { camera } = useThree();
  const gt = useRef({ px: 0, py: 0.8, pz: 0, lx: 0, ly: 12, lz: -8, fov: 50 });

  useEffect(() => {
    const s = Math.max(0, Math.min(1, scrollProgress));
    let wpA = WAYPOINTS[0],
      wpB = WAYPOINTS[1],
      lt = 0;

    for (let i = 0; i < WAYPOINTS.length - 1; i++) {
      if (s >= WAYPOINTS[i].scroll && s <= WAYPOINTS[i + 1].scroll) {
        wpA = WAYPOINTS[i];
        wpB = WAYPOINTS[i + 1];
        lt = (s - wpA.scroll) / Math.max(0.001, wpB.scroll - wpA.scroll);
        break;
      }
    }
    if (s >= WAYPOINTS[WAYPOINTS.length - 1].scroll) {
      wpA = WAYPOINTS[WAYPOINTS.length - 1];
      wpB = wpA;
      lt = 0;
    }

    const wp = lerpWP(wpA, wpB, lt);
    gsap.killTweensOf(gt.current); // T-10: cancel stale tweens to prevent scroll lag
    gsap.to(gt.current, {
      px: wp.pos[0],
      py: wp.pos[1],
      pz: wp.pos[2],
      lx: wp.lookAt[0],
      ly: wp.lookAt[1],
      lz: wp.lookAt[2],
      fov: wp.fov,
      duration: 0.4,
      ease: "power2.out",
    });
  }, [scrollProgress]);

  const camPos = useRef(new THREE.Vector3(0, 0.8, 0));
  const lookVec = useRef(new THREE.Vector3(0, 12, -8));
  const tP = useRef(new THREE.Vector3());
  const tL = useRef(new THREE.Vector3());

  useFrame(() => {
    tP.current.set(gt.current.px, gt.current.py, gt.current.pz);
    tL.current.set(gt.current.lx, gt.current.ly, gt.current.lz);

    // Faster lerp for crisper response (was 0.06)
    camPos.current.lerp(tP.current, 0.1);
    lookVec.current.lerp(tL.current, 0.1);

    camera.position.copy(camPos.current);
    camera.lookAt(lookVec.current);

    // FOV animation
    const cam = camera as THREE.PerspectiveCamera;
    const targetFov = gt.current.fov ?? 50;
    if (Math.abs(cam.fov - targetFov) > 0.1) {
      cam.fov += (targetFov - cam.fov) * 0.08;
      cam.updateProjectionMatrix();
    }
  });

  return null;
}
