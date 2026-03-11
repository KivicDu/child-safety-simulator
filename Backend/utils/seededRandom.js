// Backend/utils/seededRandom.js
let currentSeed = Date.now();
let isDeterministic = false;

function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

let prng = mulberry32(currentSeed);
const originalRandom = Math.random;

export function initDeterministicMath(seedStr) {
    if (seedStr === null || seedStr === undefined) {
        // Revert to non-deterministic
        isDeterministic = false;
        Math.random = originalRandom;
        console.log(`[Simulation] Deterministic mode disabled. Using native Math.random().`);
        return;
    }
    
    // Hash string to number
    let hash = 0;
    const s = String(seedStr);
    for (let i = 0; i < s.length; i++) {
        const char = s.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    currentSeed = Math.abs(hash);
    if (currentSeed === 0) currentSeed = 1; // Seed cannot be exactly 0 for Mulberry32
    
    prng = mulberry32(currentSeed);
    isDeterministic = true;
    
    // Override global Math.random
    Math.random = function() {
        return prng();
    };
    
    console.log(`[Simulation] Deterministic mode enabled. Seed: "${seedStr}" (Hash: ${currentSeed})`);
}

export function restoreMathRandom() {
    isDeterministic = false;
    Math.random = originalRandom;
}
