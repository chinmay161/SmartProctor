import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../AppIcon';
import Button from '../ui/Button';
import { probeCameraPermission } from './useVisionProctoring';

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

const STEP_LABELS = {
  camera: 'Camera permission',
  models: 'Load proctoring models',
  fps: 'Measure device speed (5 s)',
  calibrate: 'Calibrate (look at the screen)',
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
 * Pre-exam device gate: permission -> model load -> fps check -> calibration.
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
}) => {
  const stepIds = variant === 'permission-only'
    ? ['camera']
    : ['camera', 'models', ...(skipFps ? [] : ['fps']), 'calibrate'];

  const [steps, setSteps] = useState(() => Object.fromEntries(stepIds.map((id) => [id, { status: 'pending', detail: '' }])));
  const [failure, setFailure] = useState(null); // { step, title, steps[] }
  const [fpsWarning, setFpsWarning] = useState(null);
  const [summary, setSummary] = useState(null);
  const [calibrating, setCalibrating] = useState(false);
  const resultsRef = useRef({ timings: {} });
  const runningRef = useRef(false);
  const continueRef = useRef(null);
  const previewRef = useRef(null);
  const startedRef = useRef(false);

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
    const results = resultsRef.current;
    try {
      for (let i = fromIndex; i < stepIds.length; i += 1) {
        const id = stepIds[i];
        setStep(id, 'running');

        if (id === 'camera') {
          const r = await timed('camera', () => (variant === 'permission-only' ? probeCameraPermission() : vision.requestCamera()));
          results.camera = r;
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
          if (!r.ok) {
            setStep(id, 'error', 'Download failed');
            setFailure({ index: i, title: 'Proctoring models could not be loaded', steps: ['Check your internet connection and retry.', r.error].filter(Boolean) });
            return;
          }
          const d = r.delegates || {};
          setStep(id, 'ok', `face: ${d.face}${d.objects ? `, objects: ${d.objects}` : ''}`);
        }

        if (id === 'fps') {
          const m = await timed('fps', () => vision.measure(5000));
          results.measure = m;
          const pass = m.faceFps >= MIN_FACE_FPS;
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
      }

      const summaryData = {
        ...results,
        fpsSkipped: !stepIds.includes('fps'),
        weakDevice: results.measure ? results.measure.faceFps < MIN_FACE_FPS : false,
      };
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
        <div className="flex items-center gap-3 mb-1">
          <Icon name="ShieldCheck" size={24} className="text-primary" />
          <h2 className="text-lg md:text-xl font-semibold text-foreground">{title}</h2>
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
