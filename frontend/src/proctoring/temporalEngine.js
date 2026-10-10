// Time-windowed proctoring rules (JS port of ai-worker/services/temporal_engine.py).
//
// Pure module: no MediaPipe, no DOM. Callers feed timestamped feature objects
// (milliseconds on any monotonic clock) and get violation events back.
//
// Angle conventions (degrees, relative to the calibrated baseline):
//   yaw   > 0 = head turned to the student's left, < 0 = to their right
//   pitch > 0 = head tilted down,                  < 0 = tilted up
import { VISION_VIOLATION_SEVERITY } from '../utils/violationSeverity';

export const DEFAULT_CONFIG = Object.freeze({
  cooldownMs: 10_000,
  historyMs: 65_000,
  noFace: { windowMs: 3_000, ratio: 0.7, minSamples: 3 },
  multipleFaces: { windowMs: 2_000, ratio: 0.6, minSamples: 3 },
  lookingAway: { windowMs: 3_000, ratio: 0.7, minSamples: 3, yawDeg: 20, pitchUpDeg: -15, pitchDownDeg: 20 },
  objects: {
    windowMs: 4_000,
    minDetections: 2,
    minScore: 0.5,
    categories: { 'cell phone': 'PHONE_DETECTED', book: 'BOOK_DETECTED' },
  },
  // mode: 'off' | 'shadow' (computed, never reported) | 'on'
  noBlink: { mode: 'shadow', windowMs: 60_000, minFacePresentRatio: 0.8, minFaceFps: 3 },
  cameraFrozen: { diffThreshold: 0.5, minDurationMs: 3_000 },
  cameraDisconnected: { noFrameMs: 5_000, muteGraceMs: 2_000 },
});

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const mergeConfig = (base, overrides) => {
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides || {})) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? mergeConfig(base[key], value) : value;
  }
  return out;
};

const pct = (ratio) => `${Math.round(ratio * 100)}%`;
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const signed = (deg) => `${deg >= 0 ? '+' : ''}${Math.round(deg)}°`;

export function createTemporalEngine(overrides = {}) {
  const config = mergeConfig(DEFAULT_CONFIG, overrides);

  let faceHistory = [];
  let objectHistory = [];
  const lastTrigger = {};
  let baseline = { yaw: 0, pitch: 0 };
  let lastBlinkTs = null;
  let frozenSince = null;
  let lastFrameTs = null;
  let mutedSince = null;

  const windowOf = (history, now, windowMs) => history.filter((s) => s.ts > now - windowMs && s.ts <= now);

  const prune = (now) => {
    const cutoff = now - config.historyMs;
    if (faceHistory.length && faceHistory[0].ts < cutoff) faceHistory = faceHistory.filter((s) => s.ts >= cutoff);
    if (objectHistory.length && objectHistory[0].ts < cutoff) objectHistory = objectHistory.filter((s) => s.ts >= cutoff);
  };

  const emit = (events, type, ts, { confidence, durationMs = 0, reason, shadow = false }) => {
    const last = lastTrigger[type];
    if (last !== undefined && ts - last < config.cooldownMs) return false;
    lastTrigger[type] = ts;
    const event = {
      type,
      severity: VISION_VIOLATION_SEVERITY[type] || 'minor',
      confidence: Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100,
      durationMs: Math.max(0, Math.round(durationMs)),
      reason,
      ts,
    };
    if (shadow) event.shadow = true;
    events.push(event);
    return true;
  };

  const isAway = (s) => {
    const dYaw = s.yaw - baseline.yaw;
    const dPitch = s.pitch - baseline.pitch;
    const { yawDeg, pitchUpDeg, pitchDownDeg } = config.lookingAway;
    return Math.abs(dYaw) > yawDeg || dPitch < pitchUpDeg || dPitch > pitchDownDeg;
  };

  const ratioRule = (events, now, type, rule, samples, matches, describe) => {
    if (samples.length < rule.minSamples) return;
    const hits = samples.filter(matches);
    const ratio = hits.length / samples.length;
    if (ratio < rule.ratio) return;
    const durationMs = now - hits[0].ts;
    emit(events, type, now, { confidence: ratio, durationMs, reason: describe(ratio, durationMs, hits) });
  };

  const evaluateFace = (now, sample) => {
    const events = [];

    const noFaceWindow = windowOf(faceHistory, now, config.noFace.windowMs);
    ratioRule(events, now, 'NO_FACE', config.noFace, noFaceWindow, (s) => s.faceCount === 0,
      (r) => `No face visible in ${pct(r)} of frames over the last ${secs(config.noFace.windowMs)}.`);

    const multiWindow = windowOf(faceHistory, now, config.multipleFaces.windowMs);
    ratioRule(events, now, 'MULTIPLE_FACES', config.multipleFaces, multiWindow, (s) => s.faceCount >= 2,
      (r, _d, hits) => `${Math.max(...hits.map((h) => h.faceCount))} faces visible in ${pct(r)} of frames over the last ${secs(config.multipleFaces.windowMs)}.`);

    const poseWindow = windowOf(faceHistory, now, config.lookingAway.windowMs)
      .filter((s) => s.faceCount >= 1 && Number.isFinite(s.yaw) && Number.isFinite(s.pitch));
    ratioRule(events, now, 'LOOKING_AWAY', config.lookingAway, poseWindow, isAway, (r, d, hits) => {
      const last = hits[hits.length - 1];
      return `Looking away (yaw ${signed(last.yaw - baseline.yaw)}, pitch ${signed(last.pitch - baseline.pitch)} from baseline) in ${pct(r)} of frames for ${secs(d)}.`;
    });

    // NO_BLINK: one event per 60 s without a blink, only when we could have seen one.
    if (sample.faceCount >= 1 && sample.blink) lastBlinkTs = now;
    if (lastBlinkTs === null) lastBlinkTs = now;
    const nb = config.noBlink;
    if (nb.mode !== 'off' && now - lastBlinkTs >= nb.windowMs) {
      const w = windowOf(faceHistory, now, nb.windowMs);
      const presentRatio = w.length ? w.filter((s) => s.faceCount >= 1).length / w.length : 0;
      const fps = w.length / (nb.windowMs / 1000);
      if (presentRatio >= nb.minFacePresentRatio && fps >= nb.minFaceFps) {
        const fired = emit(events, 'NO_BLINK', now, {
          confidence: presentRatio,
          durationMs: now - lastBlinkTs,
          reason: `No eye blink detected for ${secs(now - lastBlinkTs)} with the face visible ${pct(presentRatio)} of the time.`,
          shadow: nb.mode === 'shadow',
        });
        if (fired) lastBlinkTs = now;
      }
    }

    // CAMERA_FROZEN: picture effectively unchanged for a continuous period.
    if (typeof sample.frameDiff === 'number') {
      if (sample.frameDiff < config.cameraFrozen.diffThreshold) {
        if (frozenSince === null) frozenSince = now;
        const frozenFor = now - frozenSince;
        if (frozenFor >= config.cameraFrozen.minDurationMs) {
          emit(events, 'CAMERA_FROZEN', now, {
            confidence: 0.9,
            durationMs: frozenFor,
            reason: `Camera image unchanged for ${secs(frozenFor)} (frozen, covered, or a static virtual camera).`,
          });
        }
      } else {
        frozenSince = null;
      }
    }

    return events;
  };

  const evaluateObjects = (now) => {
    const events = [];
    const rule = config.objects;
    const w = windowOf(objectHistory, now, rule.windowMs);
    for (const [category, type] of Object.entries(rule.categories)) {
      const hits = [];
      for (const s of w) {
        const best = Math.max(0, ...s.detections.filter((d) => d.categoryName === category).map((d) => d.score));
        if (best >= rule.minScore) hits.push({ ts: s.ts, score: best });
      }
      if (hits.length >= rule.minDetections) {
        const mean = hits.reduce((acc, h) => acc + h.score, 0) / hits.length;
        emit(events, type, now, {
          confidence: mean,
          durationMs: now - hits[0].ts,
          reason: `Detected '${category}' in ${hits.length} frames within ${secs(rule.windowMs)} (avg score ${mean.toFixed(2)}).`,
        });
      }
    }
    return events;
  };

  return {
    config,

    setBaseline({ yaw, pitch }) {
      baseline = { yaw: Number(yaw) || 0, pitch: Number(pitch) || 0 };
    },

    getBaseline() {
      return { ...baseline };
    },

    /** sample: { ts, faceCount, yaw?, pitch?, roll?, blink?, frameDiff? } */
    pushFace(sample) {
      const copy = structuredClone(sample);
      faceHistory.push(copy);
      prune(copy.ts);
      return evaluateFace(copy.ts, copy);
    },

    /** sample: { ts, detections: [{ categoryName, score }] } */
    pushObjects(sample) {
      const copy = structuredClone(sample);
      copy.detections = Array.isArray(copy.detections) ? copy.detections : [];
      objectHistory.push(copy);
      prune(copy.ts);
      return evaluateObjects(copy.ts);
    },

    /** kind: 'frame' | 'mute' | 'unmute' | 'ended' */
    cameraEvent(kind, ts) {
      const events = [];
      if (kind === 'frame') lastFrameTs = ts;
      else if (kind === 'mute') mutedSince = mutedSince ?? ts;
      else if (kind === 'unmute') mutedSince = null;
      else if (kind === 'ended') {
        emit(events, 'CAMERA_DISCONNECTED', ts, { confidence: 1, reason: 'Camera track ended (unplugged, disabled, or permission revoked).' });
      }
      return events;
    },

    /** Time-based checks that don't depend on a new sample arriving. */
    tick(now) {
      const events = [];
      const rule = config.cameraDisconnected;
      if (mutedSince !== null && now - mutedSince >= rule.muteGraceMs) {
        emit(events, 'CAMERA_DISCONNECTED', now, {
          confidence: 1,
          durationMs: now - mutedSince,
          reason: `Camera muted by the system for ${secs(now - mutedSince)}.`,
        });
      } else if (lastFrameTs !== null && now - lastFrameTs >= rule.noFrameMs) {
        emit(events, 'CAMERA_DISCONNECTED', now, {
          confidence: 1,
          durationMs: now - lastFrameTs,
          reason: `No camera frames received for ${secs(now - lastFrameTs)}.`,
        });
      }
      return events;
    },

    /** Call when inference resumes after a deliberate pause (e.g. tab hidden). */
    resume(now) {
      if (lastFrameTs !== null) lastFrameTs = now;
      frozenSince = null;
      lastBlinkTs = now;
    },

    getHistory() {
      return { face: structuredClone(faceHistory), objects: structuredClone(objectHistory) };
    },
  };
}
