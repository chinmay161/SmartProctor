// Browser-side proctoring loop: camera -> MediaPipe -> features -> temporal rules.
import { createTemporalEngine } from './temporalEngine';
import {
  blinkScoreFromBlendshapes,
  createBlinkDetector,
  meanAbsDiff,
  medianOf,
  poseFromMatrix,
  toGrayscale,
} from './features';
import { loadVisionTasks } from './visionEngine';

export const CONTROLLER_DEFAULTS = Object.freeze({
  targetFaceFps: 5,
  minFaceFps: 2,
  targetObjectFps: 1.5,
  minObjectFps: 0.5,
  budgetMsPerSec: 250, // max main-thread inference cost per second (25%)
  adaptEveryMs: 2000,
  staleAfterMs: 3000, // telemetry reports running=false after this long without inference
  fpsWindowMs: 5000,
  evidenceMaxWidth: 640,
  evidenceQuality: 0.7,
  diffWidth: 32,
  diffHeight: 24,
  calibration: { minFaceRatio: 0.6, minSamples: 5, maxAbsYaw: 25, maxAbsPitch: 25 },
  cameraConstraints: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
});

const ewma = (prev, value, alpha = 0.2) => (prev == null ? value : prev + alpha * (value - prev));

export const classifyCameraError = (error) => {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'not-found';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return 'unknown';
};

/** Index of the largest face (by landmark bounding box) — the student in front of the camera. */
const primaryFaceIndex = (landmarkSets) => {
  let best = 0;
  let bestArea = -1;
  landmarkSets.forEach((points, i) => {
    let minX = 1; let maxX = 0; let minY = 1; let maxY = 0;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area > bestArea) { bestArea = area; best = i; }
  });
  return best;
};

export function createVisionController({
  video,
  detectObjects = true,
  objectModel,
  objectDelegate,
  engineConfig = {},
  options = {},
  onViolation = () => {},
  onShadowViolation = () => {},
  onStateChange = () => {},
} = {}) {
  if (!video) throw new Error('createVisionController requires a <video> element in the DOM');
  const cfg = { ...CONTROLLER_DEFAULTS, ...options };

  let stream = null;
  let tasks = null;
  let engine = createTemporalEngine(engineConfig);
  const blinkDetector = createBlinkDetector();

  let phase = 'idle'; // idle | camera | models | measuring | calibrating | running | paused | stopped | error
  let loopMode = null; // null | 'measure' | 'calibrate' | 'monitor'
  let timer = null;
  let disposed = false;

  let faceFps = cfg.targetFaceFps;
  let objectFps = cfg.targetObjectFps;
  let nextFaceAt = 0;
  let nextObjectAt = 0;
  let faceMs = null;
  let objectMs = null; // inference time (off-thread when in a worker)
  let objectMainMs = null; // main-thread share of each object inference
  let lastAdaptAt = 0;
  const faceTimes = [];
  const objectTimes = [];
  let lastInferencePerf = null;
  let lastInferenceAt = null;
  let noBlinkShadowCount = 0;
  let lastFrameDiff = null;
  let collector = null; // per-sample callback for measure/calibrate

  let lastFramePerf = null;
  let frameSource = 'none';
  let lastPlaybackFrames = -1;
  let lastVideoTime = -1;
  let rvfcHandle = null;

  let diffCtx = null;
  let prevGray = null;
  let evidenceCanvas = null;

  const trackListeners = [];

  const setPhase = (next) => {
    if (phase === next) return;
    phase = next;
    onStateChange(next);
  };

  // ---------- camera ----------

  const videoReady = () => video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;

  const watchFrames = () => {
    // Prefer requestVideoFrameCallback (fires only on genuinely new frames);
    // fall back to decoded-frame counters / currentTime polling in step().
    if (typeof video.requestVideoFrameCallback !== 'function') return;
    const onFrame = () => {
      lastFramePerf = performance.now();
      frameSource = 'rvfc';
      if (!disposed) rvfcHandle = video.requestVideoFrameCallback(onFrame);
    };
    rvfcHandle = video.requestVideoFrameCallback(onFrame);
  };

  const pollFrames = (now) => {
    if (frameSource === 'rvfc' && lastFramePerf !== null && now - lastFramePerf < 1000) return;
    const quality = typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;
    const frames = quality ? quality.totalVideoFrames : -1;
    if (frames > 0 && frames !== lastPlaybackFrames) {
      lastPlaybackFrames = frames;
      lastFramePerf = now;
      if (frameSource !== 'rvfc') frameSource = 'playback-quality';
    } else if (frames <= 0 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      lastFramePerf = now;
      frameSource = 'current-time';
    }
  };

  const onTrackEvent = (kind) => {
    if (loopMode !== 'monitor') return;
    handleEvents(engine.cameraEvent(kind, performance.now()));
  };

  async function requestCamera() {
    if (stream && stream.getVideoTracks().some((t) => t.readyState === 'live')) {
      return { ok: true };
    }
    setPhase('camera');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        return { ok: false, kind: 'unsupported', error: 'This browser cannot access a camera (use a recent Chrome, Edge, Firefox or Safari over HTTPS).' };
      }
      stream = await navigator.mediaDevices.getUserMedia({ video: cfg.cameraConstraints, audio: false });
      if (disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return { ok: false, kind: 'unknown', error: 'disposed' };
      }
      const [track] = stream.getVideoTracks();
      for (const kind of ['ended', 'mute', 'unmute']) {
        const handler = () => onTrackEvent(kind);
        track.addEventListener(kind, handler);
        trackListeners.push([track, kind, handler]);
      }
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay race; readiness wait below */ }
      const deadline = performance.now() + 5000;
      while (!videoReady() && performance.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!videoReady()) {
        return { ok: false, kind: 'busy', error: 'The camera started but sent no picture.' };
      }
      watchFrames();
      return { ok: true, width: video.videoWidth, height: video.videoHeight, label: track?.label || '' };
    } catch (error) {
      setPhase('error');
      return { ok: false, kind: classifyCameraError(error), error: error?.message || String(error) };
    }
  }

  // ---------- models ----------

  async function loadModels() {
    if (tasks) return { ok: true, delegates: delegates(), loadMs: 0 };
    setPhase('models');
    try {
      tasks = await loadVisionTasks({ detectObjects, objectModel, ...(objectDelegate ? { objectDelegate } : {}) });
      const warmupMs = await warmUp();
      return { ok: true, delegates: delegates(), loadMs: tasks.loadMs, warmupMs };
    } catch (error) {
      setPhase('error');
      return { ok: false, error: error?.message || String(error) };
    }
  }

  // The first GPU inferences compile shaders and can take seconds; run them
  // before anything is timed so the fps check measures steady state.
  const warmUp = async () => {
    const started = performance.now();
    const deadline = started + 5000;
    while (!videoReady() && performance.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    if (!videoReady()) return 0;
    for (let i = 0; i < 3; i += 1) {
      tasks.face.detect(video, performance.now());
      if (tasks.objects) await tasks.objects.detectAsync(video, performance.now());
      await new Promise((r) => setTimeout(r, 0));
    }
    return Math.round(performance.now() - started);
  };

  const delegates = () => ({ face: tasks?.face?.delegate ?? null, objects: tasks?.objects?.delegate ?? null });

  // ---------- features ----------

  let lastDiffFramePerf = null;
  const frameDiff = () => {
    // No new frame since the last comparison means the camera stalled; that is
    // CAMERA_DISCONNECTED's job, so don't also report it as a frozen picture.
    if (lastFramePerf !== null && lastFramePerf === lastDiffFramePerf) return null;
    lastDiffFramePerf = lastFramePerf;
    if (!diffCtx) {
      const canvas = typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(cfg.diffWidth, cfg.diffHeight)
        : Object.assign(document.createElement('canvas'), { width: cfg.diffWidth, height: cfg.diffHeight });
      diffCtx = canvas.getContext('2d', { willReadFrequently: true });
    }
    diffCtx.drawImage(video, 0, 0, cfg.diffWidth, cfg.diffHeight);
    const gray = toGrayscale(diffCtx.getImageData(0, 0, cfg.diffWidth, cfg.diffHeight).data);
    const diff = prevGray ? meanAbsDiff(prevGray, gray) : null;
    prevGray = gray;
    return diff;
  };

  const runFace = (now) => {
    const t0 = performance.now();
    const result = tasks.face.detect(video, now);
    const ms = performance.now() - t0;
    if (!result) return null;
    faceMs = ewma(faceMs, ms);
    faceTimes.push(now);
    lastInferencePerf = now;
    lastInferenceAt = Date.now();

    const landmarks = result.faceLandmarks || [];
    const faceCount = landmarks.length;
    let pose = null;
    let blinkScore = null;
    if (faceCount > 0) {
      const i = primaryFaceIndex(landmarks);
      pose = poseFromMatrix(result.facialTransformationMatrixes?.[i]);
      blinkScore = blinkScoreFromBlendshapes(result.faceBlendshapes?.[i]?.categories);
    }
    const blink = faceCount > 0 ? blinkDetector.update(blinkScore) : blinkDetector.update(null);
    return {
      ts: now,
      faceCount,
      yaw: pose ? pose.yaw : null,
      pitch: pose ? pose.pitch : null,
      roll: pose ? pose.roll : null,
      blink,
      blinkScore,
      frameDiff: (lastFrameDiff = frameDiff()),
      inferenceMs: ms,
    };
  };

  // Object detection is asynchronous (normally in a worker); at most one in flight.
  let objectsInFlight = false;
  const runObjects = (now) => {
    objectsInFlight = true;
    const mode = loopMode;
    tasks.objects.detectAsync(video, now).then((result) => {
      objectsInFlight = false;
      if (!result || disposed || loopMode !== mode) return;
      objectMs = ewma(objectMs, result.ms);
      objectMainMs = ewma(objectMainMs, result.mainThreadMs);
      objectTimes.push(now);
      const sample = { ts: now, detections: result.detections, inferenceMs: result.ms };
      collector?.('objects', sample);
      if (mode === 'monitor') handleEvents(engine.pushObjects(sample));
    }, () => { objectsInFlight = false; });
  };

  // ---------- violations ----------

  function captureEvidence() {
    if (!videoReady()) return null;
    const scale = Math.min(1, cfg.evidenceMaxWidth / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    if (!evidenceCanvas) evidenceCanvas = document.createElement('canvas');
    evidenceCanvas.width = width;
    evidenceCanvas.height = height;
    evidenceCanvas.getContext('2d').drawImage(video, 0, 0, width, height);
    return evidenceCanvas.toDataURL('image/jpeg', cfg.evidenceQuality);
  }

  function handleEvents(events) {
    for (const event of events) {
      if (event.shadow) {
        noBlinkShadowCount += 1;
        if (import.meta.env.DEV) console.info('[vision] shadow violation (not reported)', event);
        onShadowViolation(event);
        continue;
      }
      onViolation({ ...event, image: captureEvidence() });
    }
  }

  // ---------- scheduling ----------

  const trimTimes = (times, now) => {
    while (times.length && times[0] < now - cfg.fpsWindowMs) times.shift();
  };

  const adapt = (now) => {
    if (now - lastAdaptAt < cfg.adaptEveryMs) return;
    lastAdaptAt = now;
    // Budget only what blocks the main thread.
    const cost = faceFps * (faceMs ?? 0) + (tasks?.objects ? objectFps * (objectMainMs ?? 0) : 0);
    if (cost > cfg.budgetMsPerSec) {
      if (tasks?.objects && objectFps > cfg.minObjectFps) objectFps = Math.max(cfg.minObjectFps, objectFps * 0.75);
      else if (faceFps > cfg.minFaceFps) faceFps = Math.max(cfg.minFaceFps, faceFps - 1);
    } else if (cost < cfg.budgetMsPerSec * 0.5) {
      if (faceFps < cfg.targetFaceFps) faceFps = Math.min(cfg.targetFaceFps, faceFps + 1);
      else if (tasks?.objects && objectFps < cfg.targetObjectFps) objectFps = Math.min(cfg.targetObjectFps, objectFps * 1.25);
    }
  };

  const schedule = (delayMs) => {
    if (disposed || !loopMode) return;
    timer = setTimeout(step, Math.max(0, delayMs));
  };

  function step() {
    timer = null;
    if (disposed || !loopMode) return;
    const now = performance.now();
    const monitoring = loopMode === 'monitor';

    if (monitoring && document.hidden) {
      // Hidden tabs throttle timers; TAB_SWITCH already covers this. Pause rather
      // than report the throttling as a disconnected camera.
      setPhase('paused');
      schedule(500);
      return;
    }
    if (monitoring && phase === 'paused') {
      engine.resume(now);
      prevGray = null;
      setPhase('running');
    }

    pollFrames(now);
    if (monitoring) {
      if (lastFramePerf !== null) handleEvents(engine.cameraEvent('frame', lastFramePerf));
      handleEvents(engine.tick(now));
    }

    if (!videoReady() || !tasks || tasks.face.failed) {
      if (tasks?.face.failed) setPhase('error');
      schedule(100);
      return;
    }

    let ran = false;
    if (now >= nextFaceAt) {
      const sample = runFace(now);
      const interval = 1000 / faceFps;
      nextFaceAt = Math.max(nextFaceAt + interval, now + interval * 0.5);
      if (sample) {
        ran = true;
        collector?.('face', sample);
        if (monitoring) handleEvents(engine.pushFace(sample));
      }
    } else if (tasks.objects && !tasks.objects.failed && !objectsInFlight && loopMode !== 'calibrate' && now >= nextObjectAt) {
      runObjects(now);
      const interval = 1000 / objectFps;
      nextObjectAt = Math.max(nextObjectAt + interval, now + interval * 0.5);
      ran = true;
    }

    if (monitoring) adapt(now);
    trimTimes(faceTimes, now);
    trimTimes(objectTimes, now);

    const objectsDue = tasks.objects && loopMode !== 'calibrate' ? nextObjectAt : Infinity;
    const after = performance.now();
    // Always yield at least a few ms after an inference so input/rendering can run.
    schedule(Math.max(ran ? 4 : 0, Math.min(nextFaceAt, objectsDue) - after));
  }

  const startLoop = (mode) => {
    loopMode = mode;
    if (timer) clearTimeout(timer);
    const now = performance.now();
    nextFaceAt = now;
    nextObjectAt = now + 100;
    schedule(0);
  };

  const stopLoop = () => {
    loopMode = null;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const runFor = (mode, durationMs, onSample) => new Promise((resolve) => {
    collector = onSample;
    faceFps = cfg.targetFaceFps;
    objectFps = cfg.targetObjectFps;
    startLoop(mode);
    setTimeout(() => {
      stopLoop();
      collector = null;
      resolve();
    }, durationMs);
  });

  // ---------- public API ----------

  async function measure(durationMs = 5000) {
    setPhase('measuring');
    const face = [];
    const objects = [];
    const started = performance.now();
    await runFor('measure', durationMs, (kind, s) => (kind === 'face' ? face : objects).push(s));
    const seconds = (performance.now() - started) / 1000;
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const result = {
      faceFps: Math.round((face.length / seconds) * 10) / 10,
      objectFps: tasks?.objects ? Math.round((objects.length / seconds) * 10) / 10 : null,
      faceMs: mean(face.map((s) => s.inferenceMs)),
      objectMs: mean(objects.map((s) => s.inferenceMs)),
      delegates: delegates(),
    };
    setPhase('models');
    return result;
  }

  async function calibrate(durationMs = 3000) {
    setPhase('calibrating');
    const samples = [];
    await runFor('calibrate', durationMs, (kind, s) => { if (kind === 'face') samples.push(s); });
    setPhase('models');

    const c = cfg.calibration;
    const single = samples.filter((s) => s.faceCount === 1 && Number.isFinite(s.yaw) && Number.isFinite(s.pitch));
    const multi = samples.filter((s) => s.faceCount >= 2).length;
    const base = { samples: samples.length, faceSamples: single.length };
    if (samples.length && multi / samples.length > 0.5) return { ok: false, reason: 'multiple-faces', ...base };
    if (single.length < c.minSamples || single.length / Math.max(1, samples.length) < c.minFaceRatio) {
      return { ok: false, reason: 'no-face', ...base };
    }
    const baseline = { yaw: medianOf(single.map((s) => s.yaw)), pitch: medianOf(single.map((s) => s.pitch)) };
    if (Math.abs(baseline.yaw) > c.maxAbsYaw || Math.abs(baseline.pitch) > c.maxAbsPitch) {
      return { ok: false, reason: 'off-center', baseline, ...base };
    }
    return { ok: true, baseline, ...base };
  }

  function start(baseline) {
    engine = createTemporalEngine(engineConfig);
    engine.setBaseline(baseline || { yaw: 0, pitch: 0 });
    faceFps = cfg.targetFaceFps;
    objectFps = cfg.targetObjectFps;
    prevGray = null;
    lastAdaptAt = performance.now();
    setPhase('running');
    startLoop('monitor');
  }

  function stop() {
    stopLoop();
    setPhase('stopped');
  }

  function getTelemetry() {
    const now = performance.now();
    trimTimes(faceTimes, now);
    trimTimes(objectTimes, now);
    const windowSec = cfg.fpsWindowMs / 1000;
    const inferenceAgeMs = lastInferencePerf === null ? null : Math.round(now - lastInferencePerf);
    return {
      mode: 'client',
      phase,
      running: loopMode === 'monitor' && phase === 'running' && inferenceAgeMs !== null && inferenceAgeMs < cfg.staleAfterMs,
      faceFps: Math.round((faceTimes.length / windowSec) * 10) / 10,
      objectFps: tasks?.objects ? Math.round((objectTimes.length / windowSec) * 10) / 10 : null,
      targetFaceFps: Math.round(faceFps * 10) / 10,
      targetObjectFps: tasks?.objects ? Math.round(objectFps * 10) / 10 : null,
      faceMs: faceMs === null ? null : Math.round(faceMs),
      objectMs: objectMs === null ? null : Math.round(objectMs),
      objectsInWorker: Boolean(tasks?.objects?.inWorker),
      lastInferenceAt,
      inferenceAgeMs,
      delegate: delegates().face,
      frameSource,
      frameDiff: lastFrameDiff === null ? null : Math.round(lastFrameDiff * 100) / 100,
      noBlinkShadowCount,
    };
  }

  function dispose() {
    disposed = true;
    stopLoop();
    if (rvfcHandle !== null && typeof video.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(rvfcHandle);
    }
    for (const [track, kind, handler] of trackListeners) track.removeEventListener(kind, handler);
    trackListeners.length = 0;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video.srcObject) video.srcObject = null;
    tasks?.close();
    tasks = null;
    setPhase('idle');
  }

  return {
    requestCamera,
    loadModels,
    measure,
    calibrate,
    start,
    stop,
    dispose,
    getTelemetry,
    captureEvidence,
    getStream: () => stream,
    getPhase: () => phase,
    /** Test hook: kills the loop without updating any state, like a crashed/tampered loop. */
    killLoopForTest: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      loopMode = null;
    },
  };
}
