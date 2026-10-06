'use strict';

/**
 * Counts hardware-button presses (here: volume changes) and says when the pattern is "N presses within
 * windowMs". After it fires it ignores presses for cooldownMs, so holding the button or a jittery
 * sensor cannot fire it twice.
 */
function createPressDetector({ presses = 3, windowMs = 2000, cooldownMs = 10000 } = {}) {
  let times = [];
  let blockedUntil = 0;
  return {
    /** @returns {boolean} true when this press completes the pattern */
    press(ts) {
      if (ts < blockedUntil) return false;
      times = times.filter((t) => ts - t <= windowMs);
      times.push(ts);
      if (times.length >= presses) {
        times = [];
        blockedUntil = ts + cooldownMs;
        return true;
      }
      return false;
    },
    reset() {
      times = [];
      blockedUntil = 0;
    },
  };
}

module.exports = { createPressDetector };
