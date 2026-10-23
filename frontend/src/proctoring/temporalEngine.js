// Time-windowed proctoring rules (JS port of ai-worker/services/temporal_engine.py).
//
// Pure module: no MediaPipe, no DOM. Callers feed timestamped feature objects
// (milliseconds on any monotonic clock) and get violation events back.
//
// Reporting is episode-based: a rule's condition (e.g. "no face in >=70% of the
// last 3 s") opens an episode and is reported once. The episode ends after the
// condition has been false for 3 s. An episode that lasts 60 s is reported once
// more (severity major). A new episode of the same type needs a 10 s gap.
//
// Precedence: while the camera is disconnected or frozen, face and object rules
// are suspended (their samples are excluded and their episodes paused).
//
// Angle conventions (degrees, relative to the calibrated baseline):
//   yaw   > 0 = head turned to the student's left, < 0 = to their right
//   pitch > 0 = head tilted down,                  < 0 = tilted up
import { VISION_VIOLATION_SEVERITY } from '../utils/violationSeverity';

export const DEFAULT_CONFIG = Object.freeze({
  episode: { endAfterFalseMs: 3_000, prolongedAfterMs: 60_000, minGapMs: 10_000 },
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
  voice: { windowMs: 4_000, ratio: 0.5, minSamples: 3, scoreThreshold: 0.5, minSustainSamples: 1, sustainWindowMs: 2_000 },
  micDisconnected: { muteGraceMs: 2_000 },
});

export const EPISODE_TYPES = Object.freeze([
  'NO_FACE', 'MULTIPLE_FACES', 'LOOKING_AWAY', 'PHONE_DETECTED', 'BOOK_DETECTED', 'CAMERA_FROZEN', 'CAMERA_DISCONNECTED',
  'VOICE_DETECTED', 'MIC_DISCONNECTED',
]);
const CAMERA_TYPES = new Set(['CAMERA_FROZEN', 'CAMERA_DISCONNECTED']);
const MIC_TYPES = new Set(['MIC_DISCONNECTED']);
const VOICE_TYPES = new Set(['VOICE_DETECTED']);

const EPISODE_LABELS = {
  NO_FACE: 'No face',
  MULTIPLE_FACES: 'Multiple faces',
  LOOKING_AWAY: 'Looking away',
  PHONE_DETECTED: 'Phone in view',
  BOOK_DETECTED: 'Book in view',
  CAMERA_FROZEN: 'Frozen camera image',
  CAMERA_DISCONNECTED: 'Camera disconnected',
  VOICE_DETECTED: 'Voice detected',
  MIC_DISCONNECTED: 'Microphone disconnected',
};


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
const round2 = (x) => Math.round(Math.min(1, Math.max(0, x)) * 100) / 100;

export function createTemporalEngine(overrides = {}) {
  const config = mergeConfig(DEFAULT_CONFIG, overrides);

  let faceHistory = [];
  let objectHistory = [];
  let audioHistory = [];
  let baseline = { yaw: 0, pitch: 0 };
  let lastBlinkTs = null;
  let lastNoBlinkTs = null;
  let frozenSince = null;
  let lastFrameTs = null;
  let mutedSince = null;
  let trackEnded = false;
  let micMutedSince = null;
  let micTrackEnded = false;
  let lastAudioTs = null;
  const episodes = {};

  // ---------- camera state (precedence) ----------

  const cameraDisconnected = (now) => {
    const rule = config.cameraDisconnected;
    if (trackEnded) return { on: true, reason: 'Camera track ended (unplugged, disabled, or permission revoked).', since: null };
    if (mutedSince !== null && now - mutedSince >= rule.muteGraceMs) {
      return { on: true, reason: `Camera muted by the system for ${secs(now - mutedSince)}.`, since: mutedSince };
    }
    if (lastFrameTs !== null && now - lastFrameTs >= rule.noFrameMs) {
      return { on: true, reason: `No camera frames received for ${secs(now - lastFrameTs)}.`, since: lastFrameTs };
    }
    return { on: false };
  };

  const cameraFrozen = (now) => frozenSince !== null && now - frozenSince >= config.cameraFrozen.minDurationMs;
  const cameraImpaired = (now) => cameraDisconnected(now).on || cameraFrozen(now);
  // Face/object rules pause as soon as the camera *might* be impaired (picture not
  // changing, or the track muted/ended), so e.g. covering the camera is reported as
  // CAMERA_FROZEN only, not NO_FACE first.
  const rulesSuspended = (now) => cameraImpaired(now) || frozenSince !== null || mutedSince !== null || trackEnded;

  // ---------- mic state (precedence) ----------

  const micDisconnected = (now) => {
    const rule = config.micDisconnected;
    if (micTrackEnded) return { on: true, reason: 'Microphone track ended (unplugged, disabled, or permission revoked).', since: null };
    if (micMutedSince !== null && now - micMutedSince >= rule.muteGraceMs) {
      return { on: true, reason: `Microphone muted by the system for ${secs(now - micMutedSince)}.`, since: micMutedSince };
    }
    return { on: false };
  };

  const micSuspended = (now) => micDisconnected(now).on || micMutedSince !== null || micTrackEnded;

  // ---------- episodes ----------

  const episodeOf = (type) => {
    if (!episodes[type]) episodes[type] = { active: false, lastEndTs: null };
    return episodes[type];
  };

  const maybeProlong = (events, type, ep, now) => {
    const rule = config.episode;
    if (ep.prolongedSent || now - ep.startTs < rule.prolongedAfterMs) return;
    ep.prolongedSent = true;
    events.push({
      type,
      severity: 'major',
      confidence: ep.confidence,
      durationMs: Math.round(now - ep.startTs),
      reason: `${EPISODE_LABELS[type]} continued for over 60 s.`,
      ts: now,
      episode: 'prolonged',
    });
  };

  const endEpisode = (ep, now) => {
    ep.active = false;
    ep.lastEndTs = now;
  };

  /**
   * Feed one evaluation of a rule. describe() is only called when an episode starts.
   * `sustained` keeps an open episode alive on short-window evidence, so the lag of
   * the longer start window doesn't turn a brief flicker into an episode end.
   */
  const observe = (events, type, isTrue, now, describe, sustained = false) => {
    const ep = episodeOf(type);
    if (ep.active && (isTrue || sustained)) {
      ep.lastTrueTs = now;
      maybeProlong(events, type, ep, now);
      return;
    }
    if (isTrue) {
      if (ep.lastEndTs !== null && now - ep.lastEndTs < config.episode.minGapMs) return;
      const d = describe();
      Object.assign(ep, { active: true, startTs: now, lastTrueTs: now, prolongedSent: false, confidence: round2(d.confidence) });
      events.push({
        type,
        severity: VISION_VIOLATION_SEVERITY[type] || 'minor',
        confidence: round2(d.confidence),
        durationMs: Math.max(0, Math.round(d.durationMs || 0)),
        reason: d.reason,
        ts: now,
        episode: 'start',
      });
    } else if (ep.active && now - ep.lastTrueTs >= config.episode.endAfterFalseMs) {
      endEpisode(ep, now);
    }
  };

  /** End or prolong open episodes without a fresh evaluation (time passing). */
  const sweepEpisodes = (events, now, { includeFaceObjects, includeVoice }) => {
    for (const [type, ep] of Object.entries(episodes)) {
      if (!ep.active) continue;
      if (!includeFaceObjects && !CAMERA_TYPES.has(type) && !MIC_TYPES.has(type) && !VOICE_TYPES.has(type)) continue;
      if (!includeVoice && VOICE_TYPES.has(type)) continue;
      if (now - ep.lastTrueTs >= config.episode.endAfterFalseMs) endEpisode(ep, now);
      else maybeProlong(events, type, ep, now);
    }
  };

  // ---------- rules ----------

  const windowOf = (history, now, windowMs) => history.filter((s) => !s.impaired && s.ts > now - windowMs && s.ts <= now);

  const prune = (now) => {
    const cutoff = now - config.historyMs;
    if (faceHistory.length && faceHistory[0].ts < cutoff) faceHistory = faceHistory.filter((s) => s.ts >= cutoff);
    if (objectHistory.length && objectHistory[0].ts < cutoff) objectHistory = objectHistory.filter((s) => s.ts >= cutoff);
    if (audioHistory.length && audioHistory[0].ts < cutoff) audioHistory = audioHistory.filter((s) => s.ts >= cutoff);
  };

  const isAway = (s) => {
    const dYaw = s.yaw - baseline.yaw;
    const dPitch = s.pitch - baseline.pitch;
    const { yawDeg, pitchUpDeg, pitchDownDeg } = config.lookingAway;
    return Math.abs(dYaw) > yawDeg || dPitch < pitchUpDeg || dPitch > pitchDownDeg;
  };

  const SUSTAIN_WINDOW_MS = 1_000;

  const ratioRule = (events, now, type, rule, samples, matches, describe) => {
    const hits = samples.length >= rule.minSamples ? samples.filter(matches) : [];
    const ratio = samples.length ? hits.length / samples.length : 0;
    const isTrue = samples.length >= rule.minSamples && ratio >= rule.ratio;
    // Majority of recent window still matching: the episode is still going on.
    const sustainWin = rule.sustainWindowMs || SUSTAIN_WINDOW_MS;
    const minSustain = rule.minSustainSamples ?? 2;
    const recent = samples.filter((s) => s.ts > now - sustainWin);
    const sustained = recent.length >= minSustain && recent.filter(matches).length / recent.length >= 0.5;
    observe(events, type, isTrue, now, () => ({
      confidence: ratio,
      durationMs: hits.length ? now - hits[0].ts : 0,
      reason: describe(ratio, hits),
    }), sustained);
  };

  const evaluateMic = (events, now) => {
    const disc = micDisconnected(now);
    observe(events, 'MIC_DISCONNECTED', disc.on, now, () => ({
      confidence: 1,
      durationMs: disc.since === null ? 0 : now - disc.since,
      reason: disc.reason,
    }));
  };

  const evaluateAudio = (now, sample) => {
    const events = [];
    evaluateMic(events, now);
    if (micSuspended(now)) {
      sample.impaired = true;
      return events;
    }
    ratioRule(
      events,
      now,
      'VOICE_DETECTED',
      config.voice,
      windowOf(audioHistory, now, config.voice.windowMs),
      (s) => s.speechScore >= config.voice.scoreThreshold,
      (r) => `Voice detected in ${pct(r)} of samples over the last ${secs(config.voice.windowMs)}.`,
    );
    return events;
  };

  const evaluateCamera = (events, now) => {
    const disc = cameraDisconnected(now);
    observe(events, 'CAMERA_DISCONNECTED', disc.on, now, () => ({
      confidence: 1,
      durationMs: disc.since === null ? 0 : now - disc.since,
      reason: disc.reason,
    }));
    // A disconnected camera is reported as such, never also as frozen.
    const frozen = !disc.on && cameraFrozen(now);
    observe(events, 'CAMERA_FROZEN', frozen, now, () => ({
      confidence: 0.9,
      durationMs: now - frozenSince,
      reason: `Camera image unchanged for ${secs(now - frozenSince)} (frozen, covered, or a static virtual camera).`,
    }));
  };

  const evaluateFace = (now, sample) => {
    const events = [];

    if (typeof sample.frameDiff === 'number') {
      if (sample.frameDiff < config.cameraFrozen.diffThreshold) {
        if (frozenSince === null) frozenSince = now;
      } else {
        frozenSince = null;
      }
    }
    evaluateCamera(events, now);

    if (rulesSuspended(now)) {
      sample.impaired = true;
      return events;
    }

    ratioRule(events, now, 'NO_FACE', config.noFace, windowOf(faceHistory, now, config.noFace.windowMs),
      (s) => s.faceCount === 0,
      (r) => `No face visible in ${pct(r)} of frames over the last ${secs(config.noFace.windowMs)}.`);

    ratioRule(events, now, 'MULTIPLE_FACES', config.multipleFaces, windowOf(faceHistory, now, config.multipleFaces.windowMs),
      (s) => s.faceCount >= 2,
      (r, hits) => `${Math.max(...hits.map((h) => h.faceCount))} faces visible in ${pct(r)} of frames over the last ${secs(config.multipleFaces.windowMs)}.`);

    const poseWindow = windowOf(faceHistory, now, config.lookingAway.windowMs)
      .filter((s) => s.faceCount >= 1 && Number.isFinite(s.yaw) && Number.isFinite(s.pitch));
    ratioRule(events, now, 'LOOKING_AWAY', config.lookingAway, poseWindow, isAway, (r, hits) => {
      const last = hits[hits.length - 1];
      return `Looking away (yaw ${signed(last.yaw - baseline.yaw)}, pitch ${signed(last.pitch - baseline.pitch)} from baseline) in ${pct(r)} of frames.`;
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
        const event = {
          type: 'NO_BLINK',
          severity: VISION_VIOLATION_SEVERITY.NO_BLINK,
          confidence: round2(presentRatio),
          durationMs: Math.round(now - lastBlinkTs),
          reason: `No eye blink detected for ${secs(now - lastBlinkTs)} with the face visible ${pct(presentRatio)} of the time.`,
          ts: now,
        };
        if (nb.mode === 'shadow') event.shadow = true;
        events.push(event);
        lastNoBlinkTs = now;
        lastBlinkTs = now;
      }
    }

    return events;
  };

  const evaluateObjects = (now, sample) => {
    const events = [];
    evaluateCamera(events, now);
    if (rulesSuspended(now)) {
      sample.impaired = true;
      return events;
    }
    const rule = config.objects;
    const w = windowOf(objectHistory, now, rule.windowMs);
    for (const [category, type] of Object.entries(rule.categories)) {
      const hits = [];
      for (const s of w) {
        const best = Math.max(0, ...s.detections.filter((d) => d.categoryName === category).map((d) => d.score));
        if (best >= rule.minScore) hits.push({ ts: s.ts, score: best });
      }
      const latestHit = hits.length > 0 && hits[hits.length - 1].ts === now;
      observe(events, type, hits.length >= rule.minDetections, now, () => {
        const mean = hits.reduce((acc, h) => acc + h.score, 0) / hits.length;
        return {
          confidence: mean,
          durationMs: now - hits[0].ts,
          reason: `Detected '${category}' in ${hits.length} frames within ${secs(rule.windowMs)} (avg score ${mean.toFixed(2)}).`,
        };
      }, latestHit);
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
      return evaluateObjects(copy.ts, copy);
    },

    /** sample: { ts, speechScore, rms } */
    pushAudio(sample) {
      const copy = structuredClone(sample);
      audioHistory.push(copy);
      prune(copy.ts);
      return evaluateAudio(copy.ts, copy);
    },

    /** kind: 'frame' | 'mute' | 'unmute' | 'ended' | 'restored' (a new camera stream is bound) */
    cameraEvent(kind, ts) {
      const events = [];
      if (kind === 'frame') lastFrameTs = ts;
      else if (kind === 'mute') mutedSince = mutedSince ?? ts;
      else if (kind === 'unmute') mutedSince = null;
      else if (kind === 'ended') trackEnded = true;
      else if (kind === 'restored') {
        trackEnded = false;
        mutedSince = null;
        frozenSince = null;
        lastFrameTs = ts;
        lastBlinkTs = ts;
      }
      if (kind !== 'frame') evaluateCamera(events, ts);
      return events;
    },

    /** kind: 'sample' | 'mute' | 'unmute' | 'ended' | 'restored' (a new mic stream is bound) */
    micEvent(kind, ts) {
      const events = [];
      if (kind === 'sample') lastAudioTs = ts;
      else if (kind === 'mute') micMutedSince = micMutedSince ?? ts;
      else if (kind === 'unmute') micMutedSince = null;
      else if (kind === 'ended') micTrackEnded = true;
      else if (kind === 'restored') {
        micTrackEnded = false;
        micMutedSince = null;
        lastAudioTs = ts;
      }
      if (kind !== 'sample') evaluateMic(events, ts);
      return events;
    },

    /** Time-based checks that don't depend on a new sample arriving. */
    tick(now) {
      const events = [];
      evaluateCamera(events, now);
      evaluateMic(events, now);
      sweepEpisodes(events, now, {
        includeFaceObjects: !rulesSuspended(now),
        includeVoice: !micSuspended(now),
      });
      return events;
    },

    /** Call when inference resumes after a deliberate pause (e.g. tab hidden). */
    resume(now) {
      if (lastFrameTs !== null) lastFrameTs = now;
      if (lastAudioTs !== null) lastAudioTs = now;
      frozenSince = null;
      lastBlinkTs = now;
    },

    /** Camera health for the UI and the inference loop. */
    cameraState(now) {
      const disc = cameraDisconnected(now);
      return { disconnected: disc.on, frozen: !disc.on && cameraFrozen(now), ended: trackEnded, rulesSuspended: rulesSuspended(now) };
    },

    /** Mic health for the UI and the inference loop. */
    micState(now) {
      const disc = micDisconnected(now);
      return { disconnected: disc.on, ended: micTrackEnded, muted: micMutedSince !== null, rulesSuspended: micSuspended(now) };
    },

    getHistory() {
      return {
        face: structuredClone(faceHistory),
        objects: structuredClone(objectHistory),
        audio: structuredClone(audioHistory),
      };
    },

    /** Test/diagnostic helper. */
    getLastNoBlinkTs: () => lastNoBlinkTs,
  };
}

