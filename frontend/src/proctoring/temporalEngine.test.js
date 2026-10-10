import { describe, expect, it } from 'vitest';
import { createTemporalEngine, DEFAULT_CONFIG } from './temporalEngine';

const FACE_FPS = 5;
const STEP = 1000 / FACE_FPS;

const face = (ts, over = {}) => ({ ts, faceCount: 1, yaw: 0, pitch: 0, roll: 0, blink: false, frameDiff: 5, ...over });

/** Feed face samples at `fps` from `start` for `durationMs`; returns all events. */
const run = (engine, { start = 0, durationMs, fps = FACE_FPS, sample = () => ({}) }) => {
  const events = [];
  const step = 1000 / fps;
  for (let t = start; t < start + durationMs; t += step) {
    events.push(...engine.pushFace(face(t, sample(t))).map((e) => ({ ...e })));
  }
  return events;
};

const typesOf = (events) => events.map((e) => e.type);
const count = (events, type) => events.filter((e) => e.type === type).length;

// ---- Ports of ai-worker/tests/test_temporal_engine.py (frame counts -> time windows) ----

describe('ported from test_temporal_engine.py', () => {
  it('(a) a single missing-face frame among present ones never emits NO_FACE', () => {
    const engine = createTemporalEngine();
    const pattern = [1, 1, 0, 1, 1];
    const events = pattern.flatMap((f, i) => engine.pushFace(face(i * STEP, { faceCount: f })));
    expect(typesOf(events)).not.toContain('NO_FACE');
  });

  it('(b) face present then gone emits NO_FACE within the 3 s window', () => {
    const engine = createTemporalEngine();
    run(engine, { durationMs: 1000 });
    const goneAt = 1000;
    let firstAt = null;
    for (let t = goneAt; t < goneAt + 4000; t += STEP) {
      const ev = engine.pushFace(face(t, { faceCount: 0 }));
      if (firstAt === null && typesOf(ev).includes('NO_FACE')) firstAt = t;
    }
    expect(firstAt).not.toBeNull();
    expect(firstAt - goneAt).toBeLessThanOrEqual(3000);
  });

  it('(c) a single looking-away frame among normal frames does not emit LOOKING_AWAY', () => {
    const engine = createTemporalEngine();
    const yaws = [0, 0, 40, 0, 0];
    const events = yaws.flatMap((yaw, i) => engine.pushFace(face(i * STEP, { yaw })));
    expect(typesOf(events)).not.toContain('LOOKING_AWAY');
  });

  it('(d) consistently looking away emits LOOKING_AWAY', () => {
    const engine = createTemporalEngine();
    const events = run(engine, { durationMs: 3000, sample: () => ({ yaw: 35 }) });
    expect(typesOf(events)).toContain('LOOKING_AWAY');
  });

  it('(e) a single phone detection does not emit PHONE_DETECTED', () => {
    const engine = createTemporalEngine();
    const frames = [[], [{ categoryName: 'cell phone', score: 0.9 }], [], []];
    const events = frames.flatMap((detections, i) => engine.pushObjects({ ts: i * 700, detections }));
    expect(typesOf(events)).not.toContain('PHONE_DETECTED');
  });

  it('(f) mutating the input object after submission does not change stored history', () => {
    const engine = createTemporalEngine();
    const input = face(0, { yaw: 1, pitch: 2, nested: { a: 1 } });
    engine.pushFace(input);
    input.faceCount = 999;
    input.yaw = 90;
    input.nested.a = 42;
    const objects = { ts: 0, detections: [{ categoryName: 'book', score: 0.6 }] };
    engine.pushObjects(objects);
    objects.detections[0].score = 0.01;
    objects.detections.push({ categoryName: 'cell phone', score: 1 });

    const { face: storedFace, objects: storedObjects } = engine.getHistory();
    expect(storedFace[0]).toMatchObject({ faceCount: 1, yaw: 1, pitch: 2, nested: { a: 1 } });
    expect(storedObjects[0].detections).toEqual([{ categoryName: 'book', score: 0.6 }]);
  });

  it('(g) 80 s without blinks at a low frame rate never emits NO_BLINK', () => {
    // Python: frames 2 s apart. At 0.5 fps a blink can't be observed, so the fps gate holds it back.
    const engine = createTemporalEngine({ noBlink: { mode: 'on' } });
    const events = run(engine, { durationMs: 80_000, fps: 0.5 });
    expect(typesOf(events)).not.toContain('NO_BLINK');
  });
});

// ---- Requested behaviour ----

describe('LOOKING_AWAY timing and calibration', () => {
  it('a 1 s glance away emits nothing', () => {
    const engine = createTemporalEngine();
    const events = run(engine, { durationMs: 10_000, sample: (t) => ({ yaw: t >= 4000 && t < 5000 ? 40 : 0 }) });
    expect(events).toEqual([]);
  });

  it('looking away for 4 s emits exactly one LOOKING_AWAY', () => {
    const engine = createTemporalEngine();
    const events = run(engine, { durationMs: 12_000, sample: (t) => ({ yaw: t >= 3000 && t < 7000 ? -35 : 0 }) });
    expect(count(events, 'LOOKING_AWAY')).toBe(1);
    expect(events).toHaveLength(1);
    const [ev] = events;
    expect(ev.severity).toBe('minor');
    expect(ev.durationMs).toBeGreaterThanOrEqual(2000);
    expect(ev.reason).toMatch(/yaw -35°/);
  });

  it('uses the calibrated baseline (baselineYaw 15°, yaw 25° is not away)', () => {
    const engine = createTemporalEngine();
    engine.setBaseline({ yaw: 15, pitch: 0 });
    expect(run(engine, { durationMs: 6000, sample: () => ({ yaw: 25 }) })).toEqual([]);

    const uncalibrated = createTemporalEngine();
    expect(typesOf(run(uncalibrated, { durationMs: 6000, sample: () => ({ yaw: 25 }) }))).toContain('LOOKING_AWAY');
  });

  it('pitch thresholds are asymmetric: up beyond 15°, down beyond 20°', () => {
    const up = createTemporalEngine();
    expect(typesOf(run(up, { durationMs: 4000, sample: () => ({ pitch: -16 }) }))).toContain('LOOKING_AWAY');
    const slightlyDown = createTemporalEngine();
    expect(run(slightlyDown, { durationMs: 4000, sample: () => ({ pitch: 18 }) })).toEqual([]);
    const down = createTemporalEngine();
    expect(typesOf(run(down, { durationMs: 4000, sample: () => ({ pitch: 22 }) }))).toContain('LOOKING_AWAY');
  });

  it('frames without a face are not counted as looking away', () => {
    const engine = createTemporalEngine();
    const events = run(engine, { durationMs: 4000, sample: (t) => (t % 400 === 0 ? { faceCount: 0, yaw: NaN } : { yaw: 0 }) });
    expect(typesOf(events)).not.toContain('LOOKING_AWAY');
  });
});

describe('NO_FACE / MULTIPLE_FACES', () => {
  it('leaving the frame for 5 s emits exactly one NO_FACE', () => {
    const engine = createTemporalEngine();
    const events = run(engine, { durationMs: 12_000, sample: (t) => ({ faceCount: t >= 2000 && t < 7000 ? 0 : 1 }) });
    expect(typesOf(events)).toEqual(['NO_FACE']);
    expect(events[0].severity).toBe('minor');
  });

  it('a second person for 3 s emits MULTIPLE_FACES (major)', () => {
    const engine = createTemporalEngine();
    const events = run(engine, { durationMs: 8000, sample: (t) => ({ faceCount: t >= 2000 && t < 5000 ? 2 : 1 }) });
    expect(typesOf(events)).toEqual(['MULTIPLE_FACES']);
    expect(events[0].severity).toBe('major');
  });

  it('a 0.6 s second face does not emit MULTIPLE_FACES', () => {
    const engine = createTemporalEngine();
    const events = run(engine, { durationMs: 6000, sample: (t) => ({ faceCount: t >= 2000 && t < 2600 ? 2 : 1 }) });
    expect(events).toEqual([]);
  });
});

describe('objects', () => {
  it('a phone held up for 5 s emits PHONE_DETECTED once (major)', () => {
    const engine = createTemporalEngine();
    const events = [];
    for (let t = 0; t < 8000; t += 700) {
      const detections = t >= 1000 && t < 6000 ? [{ categoryName: 'cell phone', score: 0.72 }] : [];
      events.push(...engine.pushObjects({ ts: t, detections }));
    }
    expect(typesOf(events)).toEqual(['PHONE_DETECTED']);
    expect(events[0]).toMatchObject({ severity: 'major', confidence: 0.72 });
  });

  it('two book detections within 4 s emit BOOK_DETECTED; low scores do not', () => {
    const engine = createTemporalEngine();
    const weak = [0, 700, 1400].flatMap((ts) => engine.pushObjects({ ts, detections: [{ categoryName: 'book', score: 0.45 }] }));
    expect(weak).toEqual([]);
    const strong = [5000, 6000].flatMap((ts) => engine.pushObjects({ ts, detections: [{ categoryName: 'book', score: 0.8 }] }));
    expect(typesOf(strong)).toEqual(['BOOK_DETECTED']);
  });

  it('detections further apart than 4 s do not combine', () => {
    const engine = createTemporalEngine();
    const events = [0, 4500, 9000].flatMap((ts) => engine.pushObjects({ ts, detections: [{ categoryName: 'cell phone', score: 0.9 }] }));
    expect(events).toEqual([]);
  });
});

describe('CAMERA_FROZEN', () => {
  it('needs at least 3 s of an unchanged picture', () => {
    const short = createTemporalEngine();
    expect(run(short, { durationMs: 5000, sample: (t) => ({ frameDiff: t >= 1000 && t < 3600 ? 0.1 : 4 }) })).toEqual([]);

    const long = createTemporalEngine();
    const events = run(long, { durationMs: 5000, sample: (t) => ({ frameDiff: t >= 1000 && t < 4400 ? 0.1 : 4 }) });
    expect(typesOf(events)).toEqual(['CAMERA_FROZEN']);
    expect(events[0].durationMs).toBeGreaterThanOrEqual(3000);
    expect(events[0].severity).toBe('minor');
  });

  it('one changed frame restarts the 3 s clock', () => {
    const engine = createTemporalEngine();
    const events = run(engine, { durationMs: 5000, sample: (t) => ({ frameDiff: t === 2400 ? 3 : 0 }) });
    expect(events).toEqual([]);
  });

  it('samples without a frame diff are ignored', () => {
    const engine = createTemporalEngine();
    expect(run(engine, { durationMs: 5000, sample: () => ({ frameDiff: null }) })).toEqual([]);
  });
});

describe('CAMERA_DISCONNECTED', () => {
  it('track ended emits immediately (major)', () => {
    const engine = createTemporalEngine();
    const [ev] = engine.cameraEvent('ended', 1000);
    expect(ev).toMatchObject({ type: 'CAMERA_DISCONNECTED', severity: 'major' });
  });

  it('a mute shorter than 2 s is ignored; a longer one emits', () => {
    const engine = createTemporalEngine();
    engine.cameraEvent('mute', 1000);
    expect(engine.tick(2500)).toEqual([]);
    engine.cameraEvent('unmute', 2600);
    expect(engine.tick(5000)).toEqual([]);

    engine.cameraEvent('mute', 6000);
    expect(typesOf(engine.tick(8100))).toEqual(['CAMERA_DISCONNECTED']);
  });

  it('no frames for 5 s emits', () => {
    const engine = createTemporalEngine();
    engine.cameraEvent('frame', 1000);
    expect(engine.tick(5900)).toEqual([]);
    expect(typesOf(engine.tick(6000))).toEqual(['CAMERA_DISCONNECTED']);
  });

  it('resume() after a deliberate pause does not count the pause as missing frames', () => {
    const engine = createTemporalEngine();
    engine.cameraEvent('frame', 1000);
    engine.resume(20_000);
    expect(engine.tick(21_000)).toEqual([]);
  });
});

describe('cooldown', () => {
  it('suppresses repeats of the same type within 10 s', () => {
    const engine = createTemporalEngine();
    const events = run(engine, { durationMs: 12_000, sample: () => ({ faceCount: 0 }) });
    const noFace = events.filter((e) => e.type === 'NO_FACE');
    expect(noFace).toHaveLength(2);
    expect(noFace[1].ts - noFace[0].ts).toBeGreaterThanOrEqual(DEFAULT_CONFIG.cooldownMs);
  });

  it('is tracked per type', () => {
    const engine = createTemporalEngine();
    const events = run(engine, { durationMs: 4000, sample: () => ({ faceCount: 0, frameDiff: 0 }) });
    expect(new Set(typesOf(events))).toEqual(new Set(['NO_FACE', 'CAMERA_FROZEN']));
  });
});

describe('NO_BLINK', () => {
  const noBlinkRun = (mode, durationMs = 61_000, sample = () => ({})) =>
    run(createTemporalEngine({ noBlink: { mode } }), { durationMs, sample });

  it("mode 'on': 60 s at 5 fps with a face and no blink emits one NO_BLINK", () => {
    const events = noBlinkRun('on');
    expect(typesOf(events)).toEqual(['NO_BLINK']);
    expect(events[0]).toMatchObject({ severity: 'minor' });
    expect(events[0].shadow).toBeUndefined();
  });

  it("mode 'shadow' (default) computes it but marks it shadow", () => {
    expect(DEFAULT_CONFIG.noBlink.mode).toBe('shadow');
    const events = run(createTemporalEngine(), { durationMs: 61_000 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'NO_BLINK', shadow: true });
  });

  it("mode 'off' never emits", () => {
    expect(noBlinkRun('off', 130_000)).toEqual([]);
  });

  it('a blink resets the 60 s clock', () => {
    expect(noBlinkRun('on', 61_000, (t) => ({ blink: t === 30_000 }))).toEqual([]);
  });

  it('fires at most once per 60 s blink-free stretch', () => {
    expect(count(noBlinkRun('on', 125_000), 'NO_BLINK')).toBe(2);
  });

  it('needs the face present at least 80% of the time', () => {
    const events = noBlinkRun('on', 61_000, (t) => ({ faceCount: t % 1000 < 400 ? 0 : 1 }));
    expect(typesOf(events)).not.toContain('NO_BLINK');
  });
});

describe('event shape', () => {
  it('matches what the violation endpoint expects', () => {
    const engine = createTemporalEngine();
    const [ev] = run(engine, { durationMs: 3000, sample: () => ({ faceCount: 0 }) });
    expect(Object.keys(ev).sort()).toEqual(['confidence', 'durationMs', 'reason', 'severity', 'ts', 'type']);
    expect(ev.confidence).toBeGreaterThanOrEqual(0.7);
    expect(ev.confidence).toBeLessThanOrEqual(1);
    expect(typeof ev.reason).toBe('string');
  });
});
