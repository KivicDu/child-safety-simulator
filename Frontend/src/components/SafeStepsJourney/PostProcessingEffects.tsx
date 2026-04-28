/**
 * PostProcessingEffects — Cinematic effects with frame-dependent tuning
 *
 * IMPROVEMENTS (C3):
 *   • Frame-dependent bloom intensity (stronger during god-ray & guardian frames)
 *   • Vignette effect (stronger in Frame 0 starry sky & Frame 2 danger)
 *   • Luminance threshold tuned per frame for selective bloom
 */
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

interface Props {
  scrollProgress: number;
}

export default function PostProcessingEffects({ scrollProgress }: Props) {
  const sp = scrollProgress;

  /* ── Frame-dependent bloom intensity ─────────────── */
  let bloomIntensity: number;
  let bloomThreshold: number;

  if (sp < 0.18) {
    // Frame 0: Moderate bloom for starry sky glow
    bloomIntensity = 0.35;
    bloomThreshold = 0.80;
  } else if (sp < 0.35) {
    // Transition: Boost for window glow
    bloomIntensity = 0.45;
    bloomThreshold = 0.75;
  } else if (sp < 0.50) {
    // Frame 1: Medium bloom for warm interior + god-ray
    bloomIntensity = 0.50;
    bloomThreshold = 0.82;
  } else if (sp < 0.70) {
    // Frame 2: Subtle bloom (danger focus, less glow)
    bloomIntensity = 0.30;
    bloomThreshold = 0.88;
  } else if (sp < 0.82) {
    // Frame 3: Strong bloom for guardian particles
    bloomIntensity = 0.55;
    bloomThreshold = 0.75;
  } else {
    // Frame 4: Moderate bloom for ascent/blueprint
    bloomIntensity = 0.35;
    bloomThreshold = 0.85;
  }

  /* ── Vignette: stronger in contemplative/tense frames ── */
  let vignetteOffset: number;
  let vignetteDarkness: number;

  if (sp < 0.18) {
    // Frame 0: Strong vignette for starry sky mood
    vignetteOffset = 0.3;
    vignetteDarkness = 0.7;
  } else if (sp < 0.35) {
    // Transition: Soften
    vignetteOffset = 0.35;
    vignetteDarkness = 0.5;
  } else if (sp < 0.50) {
    // Frame 1: Light vignette
    vignetteOffset = 0.4;
    vignetteDarkness = 0.35;
  } else if (sp < 0.70) {
    // Frame 2: Strong vignette for danger tension
    vignetteOffset = 0.25;
    vignetteDarkness = 0.75;
  } else if (sp < 0.82) {
    // Frame 3: Medium vignette
    vignetteOffset = 0.3;
    vignetteDarkness = 0.55;
  } else {
    // Frame 4: Gentle vignette for open feel
    vignetteOffset = 0.45;
    vignetteDarkness = 0.3;
  }

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={bloomThreshold}
        luminanceSmoothing={0.9}
      />
      <Vignette
        offset={vignetteOffset}
        darkness={vignetteDarkness}
      />
    </EffectComposer>
  );
}
