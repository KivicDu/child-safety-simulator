/**
 * PixieDustCursor — Disney-style pixie dust trail following the cursor.
 *
 * IMPROVEMENTS (C3):
 *   • Object pool: max 80 active particles (recycled, not push/filter)
 *   • Sparkle shape variation: circle + 4-point star
 *   • Better color gradient: warm gold → white
 *   • Reduced overdraw with smarter canvas clearing
 */
import { useEffect, useRef } from "react";

const MAX_PARTICLES = 80;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  shape: "circle" | "star";
  active: boolean;
}

export default function PixieDustCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poolRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -999, y: -999 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    /* ── Initialize particle pool ──────────────────── */
    if (poolRef.current.length === 0) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        poolRef.current.push({
          x: 0, y: 0, vx: 0, vy: 0,
          life: 0, maxLife: 1, size: 2,
          hue: 50, shape: "circle", active: false,
        });
      }
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    /* ── Get a free particle from pool ─────────────── */
    const getParticle = (): Particle | null => {
      for (const p of poolRef.current) {
        if (!p.active) return p;
      }
      // If pool is full, recycle oldest (lowest life)
      let oldest = poolRef.current[0];
      for (const p of poolRef.current) {
        if (p.life < oldest.life) oldest = p;
      }
      return oldest;
    };

    const onMove = (e: MouseEvent) => {
      const mx = e.clientX;
      const my = e.clientY;
      mouseRef.current = { x: mx, y: my };

      /* Spawn 3–4 particles per move event */
      const count = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const p = getParticle();
        if (!p) continue;

        p.x = mx + (Math.random() - 0.5) * 8;
        p.y = my + (Math.random() - 0.5) * 8;
        p.vx = (Math.random() - 0.5) * 1.5;
        p.vy = -0.8 - Math.random() * 1.6;
        p.life = 1.0;
        p.maxLife = 0.6 + Math.random() * 0.6;
        p.size = 2 + Math.random() * 3;
        p.hue = 42 + Math.random() * 35; // gold→amber range
        p.shape = Math.random() > 0.6 ? "star" : "circle";
        p.active = true;
      }
    };

    window.addEventListener("mousemove", onMove);

    /* ── Draw 4-point star shape ───────────────────── */
    const drawStar = (
      cx: number, cy: number, r: number, alpha: number, hue: number,
    ) => {
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = `hsla(${hue}, 85%, 75%, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.shadowBlur = 6;
      ctx.shadowColor = `hsla(${hue}, 90%, 70%, ${alpha * 0.8})`;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 1.5);
      ctx.lineTo(cx, cy + r * 1.5);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.5, cy);
      ctx.lineTo(cx + r * 1.5, cy);
      ctx.stroke();

      // Center dot (white core)
      ctx.fillStyle = `hsla(${hue}, 30%, 95%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    let last = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of poolRef.current) {
        if (!p.active) continue;

        p.life -= dt / p.maxLife;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04; // gentle gravity
        p.vx *= 0.97;

        const alpha = p.life * p.life; // quadratic fade
        const r = p.size * p.life;

        if (p.shape === "star" && p.life > 0.3) {
          drawStar(p.x, p.y, r, alpha, p.hue);
        } else {
          ctx.save();
          ctx.globalAlpha = alpha * 0.9;
          ctx.shadowBlur = 8;
          ctx.shadowColor = `hsla(${p.hue}, 90%, 70%, ${alpha})`;
          ctx.fillStyle = `hsl(${p.hue}, 90%, 70%)`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();

          /* White core for larger particles */
          if (p.size > 3.5 && p.life > 0.5) {
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 0.3, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    />
  );
}
