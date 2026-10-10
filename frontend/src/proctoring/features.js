// Pure feature extraction helpers (no MediaPipe import, no DOM).

const RAD_TO_DEG = 180 / Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Head pose from MediaPipe's 4x4 facial transformation matrix.
 *
 * The matrix maps the canonical face model into camera space (x right in the
 * unmirrored image, y up, z towards the camera). Decomposed as
 * R = Ry(yaw) · Rx(pitch) · Rz(roll):
 *   yaw   > 0  -> nose turned towards image-right = the student's left
 *   pitch > 0  -> nose tilted down
 * MediaPipe packs the data column-major; the layout is detected from where the
 * (large, negative-z) translation sits so a row-major source also works.
 *
 * @param {{rows:number, columns:number, data:ArrayLike<number>}|null} matrix
 * @returns {{yaw:number, pitch:number, roll:number}|null} degrees
 */
export function poseFromMatrix(matrix) {
  const data = matrix?.data;
  if (!data || data.length < 16) return null;
  const columnMajor = Math.abs(data[14]) >= Math.abs(data[11]);
  const at = (r, c) => (columnMajor ? data[c * 4 + r] : data[r * 4 + c]);

  const pitch = Math.asin(clamp(-at(1, 2), -1, 1));
  const yaw = Math.atan2(at(0, 2), at(2, 2));
  const roll = Math.atan2(at(1, 0), at(1, 1));
  if (![yaw, pitch, roll].every(Number.isFinite)) return null;
  return { yaw: yaw * RAD_TO_DEG, pitch: pitch * RAD_TO_DEG, roll: roll * RAD_TO_DEG };
}

/** max(eyeBlinkLeft, eyeBlinkRight) from one face's blendshape categories, or null. */
export function blinkScoreFromBlendshapes(categories) {
  if (!Array.isArray(categories)) return null;
  let score = null;
  for (const c of categories) {
    if (c?.categoryName === 'eyeBlinkLeft' || c?.categoryName === 'eyeBlinkRight') {
      score = Math.max(score ?? 0, Number(c.score) || 0);
    }
  }
  return score;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Counts blinks from per-frame blink scores. A frame is "closed" when the score
 * crosses an absolute threshold OR jumps well above this person's recent open-eye
 * level; the latter catches blinks that a 5 fps sampler only partly sees.
 * update() returns true once per closed run (rising edge).
 */
export function createBlinkDetector({ threshold = 0.45, jump = 0.25, baselineFrames = 15 } = {}) {
  const recent = [];
  let closed = false;
  return {
    update(score) {
      if (typeof score !== 'number' || !Number.isFinite(score)) {
        closed = false;
        return false;
      }
      const base = recent.length >= 3 ? median(recent) : null;
      const isClosed = score >= threshold || (base !== null && score - base >= jump);
      const blink = isClosed && !closed;
      closed = isClosed;
      recent.push(score);
      if (recent.length > baselineFrames) recent.shift();
      return blink;
    },
  };
}

/** RGBA pixel buffer -> 8-bit luma (Rec. 601). */
export function toGrayscale(rgba) {
  const out = new Uint8Array(rgba.length >> 2);
  for (let i = 0, j = 0; j < out.length; i += 4, j += 1) {
    out[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return out;
}

/** Mean absolute difference (0..255) between two equal-length grayscale frames. */
export function meanAbsDiff(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Median of numbers, ignoring non-finite values; null when empty. */
export function medianOf(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? median(finite) : null;
}
