import { describe, expect, it } from 'vitest';
import { blinkScoreFromBlendshapes, createBlinkDetector, meanAbsDiff, medianOf, poseFromMatrix, toGrayscale } from './features';

const DEG = Math.PI / 180;

// R = Ry(yaw) · Rx(pitch) · Rz(roll), as a 4x4 with translation (0, 0, -50).
const rotation = (yawDeg, pitchDeg, rollDeg) => {
  const [y, p, r] = [yawDeg * DEG, pitchDeg * DEG, rollDeg * DEG];
  const Ry = [[Math.cos(y), 0, Math.sin(y)], [0, 1, 0], [-Math.sin(y), 0, Math.cos(y)]];
  const Rx = [[1, 0, 0], [0, Math.cos(p), -Math.sin(p)], [0, Math.sin(p), Math.cos(p)]];
  const Rz = [[Math.cos(r), -Math.sin(r), 0], [Math.sin(r), Math.cos(r), 0], [0, 0, 1]];
  const mul = (A, B) => A.map((row, i) => B[0].map((_, j) => row.reduce((s, _v, k) => s + A[i][k] * B[k][j], 0)));
  return mul(mul(Ry, Rx), Rz);
};

const packed = (R, columnMajor = true) => {
  const M = [[...R[0], 0], [...R[1], 0], [...R[2], -50], [0, 0, 0, 1]];
  const data = [];
  for (let a = 0; a < 4; a += 1) for (let b = 0; b < 4; b += 1) data.push(columnMajor ? M[b][a] : M[a][b]);
  return { rows: 4, columns: 4, data };
};

describe('poseFromMatrix', () => {
  it.each([
    [0, 0, 0],
    [25, 0, 0],
    [-30, 10, 0],
    [10, -18, 5],
    [0, 22, -8],
  ])('recovers yaw %d, pitch %d, roll %d from a column-major matrix', (yaw, pitch, roll) => {
    const pose = poseFromMatrix(packed(rotation(yaw, pitch, roll)));
    expect(pose.yaw).toBeCloseTo(yaw, 6);
    expect(pose.pitch).toBeCloseTo(pitch, 6);
    expect(pose.roll).toBeCloseTo(roll, 6);
  });

  it('also accepts row-major data', () => {
    const pose = poseFromMatrix(packed(rotation(-12, 7, 3), false));
    expect(pose.yaw).toBeCloseTo(-12, 6);
    expect(pose.pitch).toBeCloseTo(7, 6);
  });

  it('returns null for missing or short data', () => {
    expect(poseFromMatrix(null)).toBeNull();
    expect(poseFromMatrix({ data: [1, 2, 3] })).toBeNull();
  });
});

describe('blink detection', () => {
  it('takes the larger of the two eye blendshapes', () => {
    expect(blinkScoreFromBlendshapes([
      { categoryName: 'eyeBlinkLeft', score: 0.2 },
      { categoryName: 'jawOpen', score: 0.9 },
      { categoryName: 'eyeBlinkRight', score: 0.6 },
    ])).toBe(0.6);
    expect(blinkScoreFromBlendshapes([])).toBeNull();
  });

  it('counts one blink per closed run (rising edge)', () => {
    const d = createBlinkDetector();
    const blinks = [0.05, 0.06, 0.05, 0.7, 0.8, 0.06, 0.05, 0.6, 0.05].map((s) => d.update(s));
    expect(blinks.filter(Boolean)).toHaveLength(2);
    expect(blinks[3]).toBe(true);
    expect(blinks[4]).toBe(false);
  });

  it('catches a partially sampled blink via the jump over the open-eye baseline', () => {
    const d = createBlinkDetector();
    [0.05, 0.04, 0.06, 0.05].forEach((s) => d.update(s));
    expect(d.update(0.35)).toBe(true); // below 0.45 but +0.3 over baseline
  });

  it('does not treat a sustained elevated level (e.g. looking down) as repeated blinks', () => {
    const d = createBlinkDetector();
    [0.05, 0.05, 0.05].forEach((s) => d.update(s));
    const results = Array.from({ length: 30 }, () => d.update(0.5));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('ignores missing scores', () => {
    const d = createBlinkDetector();
    expect(d.update(null)).toBe(false);
    expect(d.update(Number.NaN)).toBe(false);
  });
});

describe('frame difference', () => {
  it('converts RGBA to luma and measures mean absolute difference', () => {
    const white = toGrayscale(new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]));
    const black = toGrayscale(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]));
    expect(Array.from(white)).toEqual([255, 255]);
    expect(meanAbsDiff(white, black)).toBe(255);
    expect(meanAbsDiff(white, white)).toBe(0);
    expect(meanAbsDiff(white, new Uint8Array(3))).toBeNull();
  });

  it('medianOf ignores non-finite values', () => {
    expect(medianOf([3, Number.NaN, 1, 2])).toBe(2);
    expect(medianOf([])).toBeNull();
  });
});
