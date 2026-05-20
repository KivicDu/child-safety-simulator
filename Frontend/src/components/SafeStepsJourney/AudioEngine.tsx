/**
 * AudioEngine — Enhanced Timeline 4 frames
 *
 * toys_clack    : scroll 0.35–0.50 (Frame 1, loop — tiếng đồ chơi)
 * heartbeat     : scroll 0.58 → PLAY ONCE (Frame 2, baby đi về bàn)
 * shimmer_magic : scroll 0.70 → PLAY ONCE (Frame 3, guardian xuất hiện)
 */
import { useEffect, useRef, useCallback } from "react";

interface GainSource {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface AudioRef {
  ctx: AudioContext | null;
  buffers: Record<string, AudioBuffer>;
  active: Record<string, GainSource | null>;
  played: Record<string, boolean>; // track one-shot sounds
}

const SOUND_FILES: Record<string, string> = {
  toys: "/sounds/toys_clack.wav",
  heartbeat: "/sounds/heartbeat_pulse.wav",
  shimmer: "/sounds/shimmer_magic.wav",
};

/* Fade duration constants */
const FADE_IN_DURATION = 0.8;
const FADE_OUT_DURATION = 0.6;

export default function AudioEngine({
  scrollProgress,
}: {
  scrollProgress: number;
}) {
  const ref = useRef<AudioRef>({
    ctx: null,
    buffers: {},
    active: {},
    played: {},
  });
  const loaded = useRef(false);

  const init = useCallback(async () => {
    if (loaded.current) return;
    loaded.current = true;
    const ctx = new AudioContext();
    ref.current.ctx = ctx;
    await Promise.all(
      Object.entries(SOUND_FILES).map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          ref.current.buffers[key] = await ctx.decodeAudioData(
            await res.arrayBuffer(),
          );
        } catch {
          console.warn(`[Audio] Cannot load ${url}`);
        }
      }),
    );
  }, []);

  useEffect(() => {
    const resume = () => {
      init();
      if (ref.current.ctx?.state === "suspended") ref.current.ctx.resume();
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("wheel", resume, { once: true });
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("wheel", resume);
    };
  }, [init]);

  /* ── Play looping sound with smooth fade-in ────────── */
  const playLoop = useCallback((key: string, volume = 0.18) => {
    const { ctx, buffers, active } = ref.current;
    if (!ctx || !buffers[key] || active[key]) return;

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffers[key];
    source.loop = true;

    // Smooth fade-in
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(
      volume,
      ctx.currentTime + FADE_IN_DURATION,
    );

    source.connect(gain).connect(ctx.destination);
    source.start();
    ref.current.active[key] = { source, gain };
  }, []);

  /* ── Stop looping sound with smooth fade-out ───────── */
  const stopLoop = useCallback((key: string) => {
    const { ctx, active } = ref.current;
    if (!ctx || !active[key]) return;

    const { source, gain } = active[key]!;

    // Smooth fade-out then stop
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + FADE_OUT_DURATION);

    // Stop source after fade completes
    setTimeout(
      () => {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      },
      FADE_OUT_DURATION * 1000 + 50,
    );

    ref.current.active[key] = null;
  }, []);

  /* ── Play ONCE with volume envelope ────────────────── */
  const playOnce = useCallback((key: string, volume = 0.22) => {
    const { ctx, buffers, played } = ref.current;
    if (!ctx || !buffers[key] || played[key]) return;
    played[key] = true;

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffers[key];
    source.loop = false;

    // Volume envelope: quick attack, hold, then natural decay
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.15); // 150ms attack

    source.connect(gain).connect(ctx.destination);
    source.start();
  }, []);

  /* ── Reset one-shot flags khi scroll quay về trước trigger ── */
  const prevSp = useRef(0);
  useEffect(() => {
    /* Nếu người dùng scroll ngược lại → reset để âm thanh có thể phát lại */
    if (scrollProgress < 0.55 && prevSp.current >= 0.55) {
      ref.current.played["heartbeat"] = false;
    }
    if (scrollProgress < 0.68 && prevSp.current >= 0.68) {
      ref.current.played["shimmer"] = false;
    }
    prevSp.current = scrollProgress;

    /* toys_clack: loop trong Frame 1 */
    if (scrollProgress >= 0.35 && scrollProgress <= 0.5) {
      playLoop("toys", 0.15);
    } else {
      stopLoop("toys");
    }

    /* heartbeat: play ONCE khi baby bắt đầu đi (Frame 2) */
    if (scrollProgress >= 0.58) {
      playOnce("heartbeat", 0.22);
    }

    /* shimmer: play ONCE khi guardian xuất hiện (Frame 3) */
    if (scrollProgress >= 0.7) {
      playOnce("shimmer", 0.2);
    }
  }, [scrollProgress, playLoop, stopLoop, playOnce]);

  useEffect(() => {
    return () => {
      // Clean up all active sources
      const { active } = ref.current;
      Object.keys(active).forEach((key) => {
        if (active[key]) {
          try {
            active[key]!.source.stop();
          } catch {
            /* noop */
          }
        }
      });
      ref.current.ctx?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
