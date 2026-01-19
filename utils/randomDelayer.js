// utils/randomDelayer.js
//
// Backward-compatible random delay helpers with optional extras.
// - nextDelaySecs(min, max): returns seconds (float)
// - waitRandomIncreasing(page, label, opts): waits in ms, supports exact sequences
//
// New (optional) features (backward compatible):
// - opts.sequenceMs: an array of exact delays in ms, e.g. [1000, 1200, 1400, 1500]
// - opts.steps, opts.jitter: shape the "increasing" pattern
// - SCRAPER_SPEED_SCALE env var to globally scale all waits (default 1)
// - FAST_MODE=true will reduce some delays and (unless SCRAPER_SPEED_SCALE is set)
//   apply a smaller default scale.

const FAST_MODE = ['1', 'true', 'yes'].includes(String(process.env.FAST_MODE || '').toLowerCase());
const RAW_SCALE =
  process.env.SCRAPER_SPEED_SCALE != null && String(process.env.SCRAPER_SPEED_SCALE).trim() !== ''
    ? process.env.SCRAPER_SPEED_SCALE
    : FAST_MODE
      ? '0.5'
      : '1';

const SPEED_SCALE = Math.max(0, Number(RAW_SCALE) || 1);

/** Random delay in seconds. */
function nextDelaySecs(min = 0.5, max = 1) {
  const rng = Math.random() * (max - min) + min;
  return rng * SPEED_SCALE;
}

// Named sequences keyed by label (so call sites don’t need to change)
const NAMED_SEQUENCES = FAST_MODE
  ? {
      // Fast mode: keep a small "human" pause, but don't spend ~10–15s here.
      'pre-contactout-extract': [250, 300, 350],
    }
  : {
      // Normal mode: original longer sequence for stability.
      'pre-contactout-extract': [1000, 1200, 1400, 1500, 1600, 1700, 1800, 1900, 2000],
    };

/**
 * Random/increasing wait in ms. Backward-compatible:
 * opts = { base=500, factor=1.2, max=1000 }
 * Optional:
 *   - sequenceMs: exact waits like [1000, 1200, 1400, 1500]
 *   - steps: number of increments (default 1)
 *   - jitter: +/- percentage noise per step (default 0.15)
 */
async function waitRandomIncreasing(page, label = '', opts = {}) {
  const {
    base = 500,
    factor = 1.2,
    max = 1000,
    steps = 1,
    jitter = 0.15,
    sequenceMs,
  } = opts;

  // 1) If a named sequence is configured for this label, use it (no call-site changes needed).
  const namedSeq = NAMED_SEQUENCES[label];
  if (Array.isArray(namedSeq) && namedSeq.length) {
    for (const ms of namedSeq) {
      const scaled = Math.max(0, Math.round(ms * SPEED_SCALE));
      await page.waitForTimeout(scaled);
    }
    return;
  }

  // 2) If caller passed an explicit sequence, honor it.
  if (Array.isArray(sequenceMs) && sequenceMs.length > 0) {
    for (const ms of sequenceMs) {
      const scaled = Math.max(0, Math.round(ms * SPEED_SCALE));
      await page.waitForTimeout(scaled);
    }
    return;
  }

  // 3) Default/back-compat path: one or more jittered waits increasing by factor up to max.
  let delay = base;
  for (let i = 0; i < Math.max(1, steps); i++) {
    const jitterAmt = delay * jitter * (Math.random() * 2 - 1);
    let ms = Math.round(Math.min(Math.max(delay + jitterAmt, base), max));
    ms = Math.max(0, Math.round(ms * SPEED_SCALE));
    await page.waitForTimeout(ms);
    delay = Math.min(Math.round(delay * factor), max);
  }
}

module.exports = { nextDelaySecs, waitRandomIncreasing };
