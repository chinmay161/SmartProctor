import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../AppIcon';
import Button from '../ui/Button';
import { probeCameraPermission } from './useVisionProctoring';
import { SCREEN_SHARE_HELP, shareEntireScreen } from './screenShare';
import { requestExamFullscreen } from './fullscreen';
import { isNativeApp } from '../../utils/platform';
import flightRecorder from '../../telemetry/flightRecorder';
import { getDeviceSnapshot } from '../../telemetry/deviceSnapshot';

export const MIN_FACE_FPS = 2;

const CAMERA_HELP = {
  denied: {
    title: 'Camera access is blocked',
    steps: [
      'Click the camera (or lock) icon at the left of the address bar.',
      'Set Camera to "Allow" for this site.',
      'If you dismissed the prompt earlier, open your browser\'s Site settings and allow the camera there.',
      'On Windows/macOS, also check that the browser is allowed to use the camera in system privacy settings.',
    ],
  },
  'not-found': {
    title: 'No camera was found',
    steps: [
      'Connect a webcam, or turn on the built-in camera (some laptops have a privacy switch or key).',
      'If you just plugged it in, wait a few seconds.',
    ],
  },
  busy: {
    title: 'Your camera is in use or not responding',
    steps: [
      'Close other apps that may be using the camera (Zoom, Teams, Meet, the Camera app, other browser tabs).',
      'Unplug and reconnect an external webcam.',
    ],
  },
  unsupported: {
    title: 'This browser cannot access a camera',
    steps: ['Use a recent version of Chrome, Edge, Firefox or Safari, and open the exam over https.'],
  },
  'load-failed': {
    title: 'The proctoring module could not be downloaded',
    steps: ['Check your internet connection, then retry.'],
  },
  unknown: {
    title: 'The camera could not be started',
    steps: ['Reconnect your camera or restart the browser, then retry.'],
  },
};

const CALIBRATION_HELP = {
  'no-face': {
    title: 'We could not see your face',
    steps: ['Sit in front of the camera with your whole face visible.', 'Make sure your face is well lit (avoid a bright window behind you).', 'Remove anything covering the camera.'],
  },
  'multiple-faces': {
    title: 'More than one face is visible',
    steps: ['Make sure you are alone in the camera view (also check for photos or screens behind you).'],
  },
  'off-center': {
    title: 'You are not facing the screen',
    steps: ['Center the camera on your face and look straight at the screen.', 'If your camera is on the side, move it above or below the screen.'],
  },
};

const MIC_HELP = {
  denied: {
    title: 'Microphone access is blocked',
    steps: [
      'Click the microphone (or lock) icon at the left of the address bar.',
      'Set Microphone to "Allow" for this site.',
      'If you dismissed the prompt earlier, open your browser\'s Site settings and allow the microphone there.',
      'On Windows/macOS, also check that the browser is allowed to use the microphone in system privacy settings.',
    ],
  },
  'not-found': {
    title: 'No microphone was found',
    steps: [
      'Connect a microphone or headset, or turn on your computer\'s built-in microphone.',
      'If you just plugged it in, wait a few seconds and retry.',
    ],
  },
  busy: {
    title: 'Your microphone is in use or not responding',
    steps: [
      'Close other apps that may be using the microphone (Zoom, Teams, Meet, other browser tabs).',
    ],
  },
  unsupported: {
    title: 'This browser cannot access a microphone',
    steps: ['Use a recent version of Chrome, Edge, Firefox or Safari, and open the exam over https.'],
  },
  'load-failed': {
    title: 'The audio proctoring model could not be loaded',
    steps: ['Check your internet connection, reconnect your microphone, and retry.'],
  },
  unknown: {
    title: 'The microphone could not be started',
    steps: ['Reconnect your microphone or restart the browser, then retry.'],
  },
};

const STEP_LABELS = {
  camera: 'Camera permission',
  models: 'Load proctoring models',
  fps: 'Measure device speed (5 s)',
  calibrate: 'Calibrate (look at the screen)',
  mic: 'Microphone permission',
  noise: 'Ambient noise check (stay quiet for 3 s)',
  speech: 'Voice check (say: "I am ready")',
  screen: 'Share your entire screen',
  fullscreen: 'Enter fullscreen',
};

const FULLSCREEN_HELP = {
  title: 'Fullscreen could not be turned on',
  steps: [
    'Click "Enter fullscreen and start" again.',
    'If you pressed F11 (browser fullscreen), that is fine — the button still switches the exam into fullscreen.',
  ],
};

const statusIcon = {
  pending: { name: 'Circle', cls: 'text-muted-foreground' },
  running: { name: 'Loader', cls: 'text-primary animate-spin' },
  ok: { name: 'CheckCircle', cls: 'text-success' },
  warn: { name: 'AlertTriangle', cls: 'text-warning' },
  error: { name: 'XCircle', cls: 'text-error' },
  skipped: { name: 'MinusCircle', cls: 'text-muted-foreground' },
};

const fmtMs = (ms) => (ms == null ? '—' : `${Math.round(ms)} ms`);

/**
 * Pre-exam gate: camera permission -> model load -> fps check -> calibration
 * -> screen share (if required) -> fullscreen (if required, last, on a click).
 * Screen share and fullscreen are browser prompts started from button clicks,
 * so their focus/fullscreen side effects never reach the exam's violation checks.
 *
 * variant:
 *   'exam'            full check before starting a new attempt
 *   'resume'          permission + quick calibration (fps skipped when `skipFps`)
 *   'device-test'     same as 'exam' but only reports results (dashboard)
 *   'permission-only' camera permission only (server inference mode)
 */
const PreExamGate = ({
  vision,
  variant = 'exam',
  skipFps = false,
  calibrationMs = 3000,
  title = 'Before you start',
  onComplete,
  onCancel,
  cancelLabel = 'Back to dashboard',
  cameraRequired = true,
  micRequired = false,
  requireScreenShare = false,
  requireFullscreen = false,
  onScreenStream,
  onRequestReportProblem,
}) => {
  const visionSteps = !cameraRequired
    ? []
    : variant === 'permission-only'
      ? ['camera']
      : ['camera', 'models', ...(skipFps ? [] : ['fps']), 'calibrate'];
  const audioSteps = (micRequired || variant === 'device-test') && variant !== 'permission-only'
    ? ['mic', 'noise', 'speech']
    : [];
  const isNative = isNativeApp();
  const stepIds = [
    ...visionSteps,
    ...audioSteps,
    ...(!isNative && requireScreenShare && variant !== 'device-test' ? ['screen'] : []),
    ...(!isNative && requireFullscreen && variant !== 'device-test' ? ['fullscreen'] : []),
  ];

  const [steps, setSteps] = useState(() => Object.fromEntries(stepIds.map((id) => [id, { status: 'pending', detail: '' }])));
  const [failure, setFailure] = useState(null); // { step, title, steps[] }
  const [fpsWarning, setFpsWarning] = useState(null);
  const [summary, setSummary] = useState(null);
  const [calibrating, setCalibrating] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const resultsRef = useRef({ timings: {} });
  const runningRef = useRef(false);
  const continueRef = useRef(null);
  const previewRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    let unsubLevel = null;
    let unsubSample = null;
    let cancelled = false;

    if (stepIds.includes('mic')) {
      void vision?.ensureAudioEngine?.().then((ae) => {
        if (cancelled || !ae) return;
        unsubLevel = ae.onLevel?.((lvl) => setMicLevel(lvl));
        unsubSample = ae.onSample?.((s) => setIsSpeaking((s?.speechScore || 0) >= 0.5));
      });
    }

    return () => {
      cancelled = true;
      unsubLevel?.();
      unsubSample?.();
    };
  }, [vision, stepIds]);
  // Steps that need a click (browser prompts require a user gesture).
  const [action, setAction] = useState(null); // 'screen' | 'fullscreen' | null
  const [actionError, setActionError] = useState(null);
  const actionRef = useRef(null);

  const waitForAction = (kind) => new Promise((resolve) => {
    actionRef.current = resolve;
    setActionError(null);
    setAction(kind);
  });

  const onShareClick = async () => {
    setActionError(null);
    try {
      const stream = await shareEntireScreen();
      actionRef.current?.(stream);
    } catch (error) {
      setActionError(SCREEN_SHARE_HELP[error.kind] || SCREEN_SHARE_HELP.failed);
    }
  };

  const onFullscreenClick = async () => {
    setActionError(null);
    try {
      await requestExamFullscreen();
      actionRef.current?.();
    } catch {
      setActionError(FULLSCREEN_HELP);
    }
  };

  const setStep = (id, status, detail = '') => setSteps((prev) => ({ ...prev, [id]: { status, detail } }));

  useEffect(() => {
    if (previewRef.current && vision?.stream && previewRef.current.srcObject !== vision.stream) {
      previewRef.current.srcObject = vision.stream;
      previewRef.current.play?.().catch(() => {});
    }
  }, [vision?.stream]);

  const timed = async (key, fn) => {
    const t0 = performance.now();
    const out = await fn();
    resultsRef.current.timings[key] = Math.round(performance.now() - t0);
    return out;
  };

  const run = useCallback(async (fromIndex = 0) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setFailure(null);
    flightRecorder.init({ kind: variant === 'device-test' ? 'device_test' : 'exam' });
    flightRecorder.record('gate', 'gate_start', { variant, steps_count: stepIds.length });
    const results = resultsRef.current;
    try {
      for (let i = fromIndex; i < stepIds.length; i += 1) {
        const id = stepIds[i];
        setStep(id, 'running');
        flightRecorder.record('gate', 'gate_step_start', { step: id });

        if (id === 'camera') {
          const r = await timed('camera', () => (variant === 'permission-only' ? probeCameraPermission() : vision.requestCamera()));
          results.camera = r;
          flightRecorder.record('gate', 'gate_step_end', {
            step: id,
            status: r.ok ? 'ok' : 'error',
            duration_ms: results.timings.camera,
            width: r.width || null,
            height: r.height || null,
            kind: r.kind || null,
          });
          if (!r.ok) {
            const help = CAMERA_HELP[r.kind] || CAMERA_HELP.unknown;
            setStep(id, 'error', help.title);
            setFailure({ index: i, ...help });
            return;
          }
          setStep(id, 'ok', r.width ? `${r.width}×${r.height}` : 'Allowed');
        }

        if (id === 'models') {
          const r = await timed('models', () => vision.loadModels());
          results.models = r;
          const d = r.delegates || {};
          flightRecorder.record('gate', 'gate_step_end', {
            step: id,
            status: r.ok ? 'ok' : 'error',
            duration_ms: results.timings.models,
            load_ms: r.loadMs || null,
            warmup_ms: r.warmupMs || null,
            face_delegate: d.face || null,
            object_delegate: d.objects || null,
          });
          flightRecorder.record('device', 'device_snapshot', getDeviceSnapshot(d));
          if (!r.ok) {
            setStep(id, 'error', 'Download failed');
            setFailure({ index: i, title: 'Proctoring models could not be loaded', steps: ['Check your internet connection and retry.', r.error].filter(Boolean) });
            return;
          }
          setStep(id, 'ok', `face: ${d.face}${d.objects ? `, objects: ${d.objects}` : ''}`);
        }

        if (id === 'fps') {
          const m = await timed('fps', () => vision.measure(5000));
          results.measure = m;
          const pass = m.faceFps >= MIN_FACE_FPS;
          flightRecorder.record('gate', 'gate_step_end', {
            step: id,
            status: pass ? 'ok' : 'warn',
            duration_ms: results.timings.fps,
            face_fps: m.faceFps,
            object_fps: m.objectFps ?? null,
            face_ms: m.faceMs ? Math.round(m.faceMs) : null,
          });
          const detail = `${m.faceFps} fps face${m.objectFps != null ? `, ${m.objectFps} fps objects` : ''}`;
          setStep(id, pass ? 'ok' : 'warn', detail);
          if (!pass && variant !== 'device-test') {
            // Allowed, but the student must acknowledge it.
            setFpsWarning(m);
            await new Promise((resolve) => { continueRef.current = resolve; });
            setFpsWarning(null);
          }
        }

        if (id === 'calibrate') {
          setCalibrating(true);
          const c = await timed('calibrate', () => vision.calibrate(calibrationMs));
          setCalibrating(false);
          results.calibration = c;
          flightRecorder.record('gate', 'gate_step_end', {
            step: id,
            status: c.ok ? 'ok' : 'error',
            duration_ms: results.timings.calibrate,
            samples: c.samples || 0,
            face_samples: c.faceSamples || 0,
            baseline_yaw: c.baseline ? Math.round(c.baseline.yaw) : null,
            baseline_pitch: c.baseline ? Math.round(c.baseline.pitch) : null,
            reason: c.reason || null,
          });
          if (!c.ok) {
            const help = CALIBRATION_HELP[c.reason] || CALIBRATION_HELP['no-face'];
            const extra = c.reason === 'off-center' && c.baseline
              ? [`Measured: turned ${Math.round(c.baseline.yaw)}°, tilted ${Math.round(c.baseline.pitch)}° (max 25°).`]
              : [];
            setStep(id, 'error', help.title);
            setFailure({ index: i, title: help.title, steps: [...help.steps, ...extra] });
            return;
          }
          setStep(id, 'ok', `${c.faceSamples}/${c.samples} frames with your face`);
        }

        if (id === 'mic') {
          const r = await timed('mic', async () => {
            const ae = await vision?.ensureAudioEngine?.();
            if (!ae) return { ok: false, kind: 'unknown', error: 'audioEngine unavailable' };
            const req = await vision.requestMic();
            if (!req.ok) return req;
            try {
              await ae.start?.();
              if (typeof ae.isReady === 'function' && !ae.isReady()) {
                throw new Error('Audio engine failed to initialize');
              }
            } catch (err) {
              console.error('[PreExamGate] Audio engine failed to start:', err);
              return { ok: false, kind: 'load-failed', error: err?.message || String(err) };
            }
            return { ok: true };
          });
          results.mic = r;
          flightRecorder.record('gate', 'gate_step_end', {
            step: id,
            status: r.ok ? 'ok' : 'error',
            duration_ms: results.timings.mic,
            kind: r.kind || null,
          });
          if (!r.ok) {
            const help = MIC_HELP[r.kind] || MIC_HELP.unknown;
            setStep(id, 'error', help.title);
            setFailure({ index: i, ...help });
            return;
          }
          setStep(id, 'ok', 'Allowed');
        }

        if (id === 'noise') {
          setStep(id, 'running', 'Stay quiet for 3 seconds…');
          const ae = await vision?.ensureAudioEngine?.();
          const levels = [];
          let maxSpeech = 0;

          const unsubSample = ae?.onSample?.((s) => {
            if (s.speechScore > maxSpeech) maxSpeech = s.speechScore;
          });
          const unsubLevel = ae?.onLevel?.((l) => {
            levels.push(l);
          });

          for (let sec = 3; sec > 0; sec -= 1) {
            setStep(id, 'running', `Stay quiet for ${sec} second${sec > 1 ? 's' : ''}…`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          unsubSample?.();
          unsubLevel?.();

          const avgRms = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : (ae?.getNoiseFloor?.() ?? 0);
          const isLoud = maxSpeech >= 0.5 || avgRms > 0.12;

          results.noiseCheck = { avgRms, maxSpeech, isLoud };
          results.mic = {
            ...(results.mic || {}),
            ok: true,
            noiseLevel: Math.round(avgRms * 1000) / 1000,
            noisyEnvironment: isLoud,
          };

          flightRecorder.record('gate', 'gate_step_end', {
            step: id,
            status: isLoud ? 'warn' : 'ok',
            avg_rms: Math.round(avgRms * 1000) / 1000,
            max_speech: maxSpeech,
            is_loud: isLoud,
          });

          if (isLoud) {
            setStep(id, 'warn', `Noisy environment (${Math.round(avgRms * 100)}% level)`);
          } else {
            setStep(id, 'ok', `Quiet room (${Math.round(avgRms * 100)}% level)`);
          }
        }

        if (id === 'speech') {
          setStep(id, 'running', 'Say: "I am ready" (within 8 s)');
          const ae = await vision?.ensureAudioEngine?.();
          let speechDetected = false;

          await new Promise((resolve) => {
            let elapsed = 0;
            const timer = setInterval(() => {
              elapsed += 1;
              if (speechDetected || elapsed >= 8) {
                clearInterval(timer);
                resolve();
              } else {
                setStep(id, 'running', `Say: "I am ready" (${8 - elapsed} s remaining)`);
              }
            }, 1000);

            const unsub = ae?.onSample?.((s) => {
              if (s.speechScore >= 0.5) {
                speechDetected = true;
                unsub?.();
                clearInterval(timer);
                resolve();
              }
            });
          });

          results.speechCheck = { detected: speechDetected };
          results.mic = {
            ...(results.mic || {}),
            speechDetected,
          };

          flightRecorder.record('gate', 'gate_step_end', {
            step: id,
            status: speechDetected ? 'ok' : 'warn',
            detected: speechDetected,
          });

          if (speechDetected) {
            setStep(id, 'ok', 'Voice recognized ("I am ready")');
          } else {
            setStep(id, 'warn', 'Speech not detected — check your microphone');
          }
        }

        if (id === 'screen') {
          setStep(id, 'running', 'Waiting for you to share your entire screen');
          const stream = await waitForAction('screen');
          setAction(null);
          onScreenStream?.(stream);
          flightRecorder.record('gate', 'gate_step_end', { step: id, status: 'ok' });
          setStep(id, 'ok', 'Entire screen shared');
        }

        if (id === 'fullscreen') {
          if (!document.fullscreenElement) {
            setStep(id, 'running', 'Click the button to enter fullscreen');
            await waitForAction('fullscreen');
            setAction(null);
          }
          flightRecorder.record('gate', 'gate_step_end', { step: id, status: 'ok' });
          setStep(id, 'ok', 'Fullscreen on');
        }
      }

      const summaryData = {
        ...results,
        fpsSkipped: !stepIds.includes('fps'),
        weakDevice: results.measure ? results.measure.faceFps < MIN_FACE_FPS : false,
      };
      flightRecorder.record('gate', 'gate_complete', {
        variant,
        weak_device: summaryData.weakDevice,
        fps_skipped: summaryData.fpsSkipped,
      });
      if (variant === 'device-test') setSummary(summaryData);
      else onComplete?.(summaryData);
    } finally {
      runningRef.current = false;
      setCalibrating(false);
    }

  // stepIds is derived from props that don't change while the gate is mounted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vision, variant, calibrationMs, onComplete]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run(0);
  }, [run]);

  const showPreview = variant !== 'permission-only' && Boolean(vision?.stream);
  const m = summary?.measure;

  return (
    <div className="fixed inset-0 z-[130] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl p-6 md:p-8">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <Icon name="ShieldCheck" size={24} className="text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">{title}</h2>
          </div>
          {onRequestReportProblem && (
            <Button
              variant="outline"
              size="xs"
              iconName="AlertCircle"
              onClick={onRequestReportProblem}
              className="text-xs"
            >
              Report a problem
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {variant === 'device-test'
            ? 'This runs the same camera and device check as the exam. Nothing is recorded and no exam is started.'
            : variant === 'resume'
              ? 'Your exam is in progress. Complete these quick checks to continue where you left off.'
              : 'Your exam timer has not started yet. It starts after these checks pass.'}
        </p>

        <div className={`grid gap-6 ${showPreview ? 'md:grid-cols-[1fr_240px]' : ''}`}>
          <ol className="space-y-3">
            {stepIds.map((id) => {
              const s = steps[id];
              const icon = statusIcon[s.status];
              return (
                <li key={id} className="flex items-start gap-3">
                  <Icon name={icon.name} size={18} className={`mt-0.5 shrink-0 ${icon.cls}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{STEP_LABELS[id]}</p>
                    {s.detail && <p className="text-xs text-muted-foreground">{s.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ol>

          {showPreview && (
            <div>
              <div className={`aspect-video bg-black rounded-lg overflow-hidden relative ring-2 ${calibrating ? 'ring-primary' : 'ring-transparent'}`}>
                <video ref={previewRef} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" />
                {calibrating && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs text-center py-1.5">
                    Look at the screen and keep still…
                  </div>
                )}
              </div>
              {calibrating && (
                <p className="text-xs text-primary mt-2 text-center font-medium">Calibrating — look straight at the screen</p>
              )}
            </div>
          )}
        </div>

        {stepIds.includes('mic') && steps.mic?.status !== 'pending' && (
          <div className="mt-4 p-3 bg-muted/40 rounded-lg border border-border/50">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Icon name="Mic" size={14} className={micLevel > 0.05 ? 'text-primary' : 'text-muted-foreground'} />
                Microphone input
              </span>
              <span className="flex items-center gap-1.5">
                {isSpeaking ? (
                  <span className="text-primary font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Speech detected
                  </span>
                ) : (
                  <span className="text-muted-foreground">Listening…</span>
                )}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-75"
                style={{ width: `${Math.min(100, Math.round(micLevel * 300))}%` }}
              />
            </div>
          </div>
        )}

        {action === 'screen' && (
          <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/30">
            <p className="text-sm font-semibold text-foreground mb-1">Share your entire screen</p>
            <p className="text-sm text-muted-foreground mb-3">
              This exam records your screen. In the browser's picker choose <strong>Entire screen</strong>, select your
              screen, then click <strong>Share</strong>. Windows and browser tabs are not accepted.
            </p>
            <Button iconName="Monitor" onClick={() => void onShareClick()}>Share entire screen</Button>
          </div>
        )}

        {action === 'fullscreen' && (
          <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/30">
            <p className="text-sm font-semibold text-foreground mb-1">Last step: fullscreen</p>
            <p className="text-sm text-muted-foreground mb-3">
              The exam runs in fullscreen. Leaving fullscreen during the exam is recorded as a violation.
            </p>
            <Button iconName="Maximize" onClick={() => void onFullscreenClick()}>Enter fullscreen and start</Button>
          </div>
        )}

        {actionError && (
          <div role="alert" className="mt-4 p-4 rounded-lg bg-error/10 border border-error/30">
            <p className="text-sm font-semibold text-foreground mb-2">{actionError.title}</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              {actionError.steps.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        )}

        {fpsWarning && (
          <div role="alert" className="mt-6 p-4 rounded-lg bg-warning/15 border border-warning/30">
            <p className="text-sm font-semibold text-foreground mb-1">This device is slow for camera proctoring</p>
            <p className="text-sm text-muted-foreground mb-3">
              Measured {fpsWarning.faceFps} frames/second (recommended at least {MIN_FACE_FPS}). You can still take the exam, but
              close other apps and browser tabs if you can. Your teacher will see that this device was slow.
            </p>
            <Button variant="warning" onClick={() => continueRef.current?.()}>Continue anyway</Button>
          </div>
        )}

        {failure && (
          <div role="alert" className="mt-6 p-4 rounded-lg bg-error/10 border border-error/30">
            <p className="text-sm font-semibold text-foreground mb-2">{failure.title}</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground mb-4">
              {failure.steps.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button iconName="RotateCw" onClick={() => void run(failure.index)}>Retry</Button>
              {onRequestReportProblem && (
                <Button variant="outline" iconName="AlertCircle" onClick={onRequestReportProblem}>
                  Report a problem
                </Button>
              )}
              {onCancel && <Button variant="outline" onClick={onCancel}>{cancelLabel}</Button>}
            </div>
          </div>
        )}

        {summary && (
          <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
            <p className={`text-sm font-semibold mb-3 ${summary.weakDevice ? 'text-warning' : 'text-success'}`}>
              {summary.weakDevice ? 'Warning: this device is slow, but exams will still run.' : 'Pass: this device is ready for proctored exams.'}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Camera</dt>
              <dd className="text-foreground">OK{summary.camera?.width ? ` (${summary.camera.width}×${summary.camera.height})` : ''}</dd>
              <dt className="text-muted-foreground">Models</dt>
              <dd className="text-foreground">Loaded in {fmtMs(summary.timings.models)} (face {summary.models?.delegates?.face}{summary.models?.delegates?.objects ? `, objects ${summary.models.delegates.objects}` : ''})</dd>
              <dt className="text-muted-foreground">Face detection</dt>
              <dd className="text-foreground">{m?.faceFps} fps ({fmtMs(m?.faceMs)}/frame)</dd>
              {m?.objectFps != null && (<>
                <dt className="text-muted-foreground">Object detection</dt>
                <dd className="text-foreground">{m.objectFps} fps ({fmtMs(m.objectMs)}/frame)</dd>
              </>)}
              <dt className="text-muted-foreground">Calibration</dt>
              <dd className="text-foreground">Passed</dd>
              {summary.mic && (
                <>
                  <dt className="text-muted-foreground">Microphone</dt>
                  <dd className="text-foreground">{summary.mic.ok ? 'OK' : 'Error'}</dd>
                  <dt className="text-muted-foreground">Ambient noise</dt>
                  <dd className="text-foreground">
                    {summary.mic.noisyEnvironment ? 'Noisy room' : 'Quiet room'} ({Math.round((summary.mic.noiseLevel || 0) * 100)}% level)
                  </dd>
                  <dt className="text-muted-foreground">Speech detected</dt>
                  <dd className="text-foreground">{summary.mic.speechDetected ? 'Yes' : 'No (check microphone)'}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        {(summary || (!failure && onCancel && variant === 'device-test')) && (
          <div className="mt-6 flex justify-end gap-2">
            {summary && (
              <Button variant="outline" iconName="RotateCw" onClick={() => {
                setSummary(null);
                resultsRef.current = { timings: {} };
                setSteps(Object.fromEntries(stepIds.map((id) => [id, { status: 'pending', detail: '' }])));
                void run(0);
              }}>
                Run again
              </Button>
            )}
            <Button onClick={onCancel}>{summary ? 'Done' : 'Cancel'}</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreExamGate;
