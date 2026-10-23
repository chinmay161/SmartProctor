import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withSystemPrompt } from '../../utils/proctoringSuppression';

// 'client' (default): MediaPipe in the browser. 'server': legacy snapshot upload flow.
export const INFERENCE_MODE =
  String(import.meta.env.VITE_INFERENCE_MODE || 'client').toLowerCase() === 'server' ? 'server' : 'client';

// The inference <video> stays in the DOM (detached elements can be throttled) but invisible.
export const HIDDEN_VIDEO_STYLE = Object.freeze({
  position: 'fixed',
  left: 0,
  top: 0,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
  zIndex: -1,
});

const FPS_STORAGE_PREFIX = 'sp:vision:fps:';

/** Remembers a passed fps check for this exam for the rest of the browser session. */
export const fpsCheckStore = {
  get(examId) {
    try {
      return JSON.parse(sessionStorage.getItem(FPS_STORAGE_PREFIX + examId) || 'null');
    } catch {
      return null;
    }
  },
  set(examId, value) {
    try {
      sessionStorage.setItem(FPS_STORAGE_PREFIX + examId, JSON.stringify(value));
    } catch {
      /* storage unavailable: the check simply re-runs next time */
    }
  },
};

const classifyPermissionError = (error) => {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'not-found';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'unknown';
};

/** Lightweight permission probe for server mode (no MediaPipe download). */
export async function probeCameraPermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, kind: 'unsupported' };
  }
  try {
    const stream = await withSystemPrompt(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (error) {
    return { ok: false, kind: classifyPermissionError(error), error: error?.message };
  }
}

/**
 * Owns one vision controller (camera + MediaPipe + rules). The heavy module is
 * fetched with a dynamic import the first time it's needed.
 */
export function useVisionProctoring({ detectObjects = true, micRequired = false, onViolation, onShadowViolation } = {}) {
  const videoRef = useRef(null);
  const controllerRef = useRef(null);
  const loadingRef = useRef(null);
  const onViolationRef = useRef(onViolation);
  const onShadowRef = useRef(onShadowViolation);
  const [phase, setPhase] = useState('idle');
  const [stream, setStream] = useState(null);
  // { state: 'ok' | 'lost', permission: 'granted' | 'denied' | 'prompt' | null, kind }
  const [cameraStatus, setCameraStatus] = useState({ state: 'ok', permission: null, kind: null });

  useEffect(() => {
    onViolationRef.current = onViolation;
    onShadowRef.current = onShadowViolation;
  }, [onViolation, onShadowViolation]);

  const ensureController = useCallback(async () => {
    if (controllerRef.current) return controllerRef.current;
    if (!loadingRef.current) {
      loadingRef.current = import('../../proctoring/index.js').then((mod) => {
        controllerRef.current = mod.createVisionController({
          video: videoRef.current,
          detectObjects,
          micRequired,
          onViolation: (v) => onViolationRef.current?.(v),
          onShadowViolation: (v) => onShadowRef.current?.(v),
          onStateChange: setPhase,
          // Recovery swaps in a new camera stream; previews follow it.
          onStreamChange: setStream,
          onCameraStatus: setCameraStatus,
        });
        return controllerRef.current;
      }).catch((error) => {
        loadingRef.current = null;
        throw error;
      });
    }
    return loadingRef.current;
  }, [detectObjects, micRequired]);

  const requestCamera = useCallback(async () => {
    let controller;
    try {
      controller = await ensureController();
    } catch (error) {
      return { ok: false, kind: 'load-failed', error: error?.message || String(error) };
    }
    const result = await controller.requestCamera();
    if (result.ok) setStream(controller.getStream());
    return result;
  }, [ensureController]);

  const requestMic = useCallback(async () => {
    let controller;
    try {
      controller = await ensureController();
    } catch (error) {
      return { ok: false, kind: 'load-failed', error: error?.message || String(error) };
    }
    return controller.requestMic();
  }, [ensureController]);

  const ensureAudioEngine = useCallback(async () => {
    const controller = await ensureController();
    return controller.ensureAudioEngine();
  }, [ensureController]);

  const { loadModels, measure, calibrate, stop } = useMemo(() => {
    const call = (name) => async (...args) => {
      const controller = await ensureController();
      return controller[name](...args);
    };
    return { loadModels: call('loadModels'), measure: call('measure'), calibrate: call('calibrate'), stop: call('stop') };
  }, [ensureController]);

  const start = useCallback(async (baseline) => {
    const controller = await ensureController();
    controller.start(baseline);
    if (import.meta.env.DEV) {
      // Manual tamper test: window.__spVision.stop() kills the loop like a crashed/patched client.
      window.__spVision = {
        stop: () => controller.killLoopForTest(),
        telemetry: () => controller.getTelemetry(),
      };
    }
  }, [ensureController]);

  const getTelemetry = useCallback(() => controllerRef.current?.getTelemetry() ?? null, []);
  const captureEvidence = useCallback(() => controllerRef.current?.captureEvidence() ?? null, []);

  const dispose = useCallback(() => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
    loadingRef.current = null;
    setStream(null);
    setCameraStatus({ state: 'ok', permission: null, kind: null });
    if (import.meta.env.DEV) delete window.__spVision;
  }, []);

  useEffect(() => dispose, [dispose]);

  return useMemo(() => ({
    videoRef,
    phase,
    stream,
    cameraStatus,
    requestCamera,
    requestMic,
    ensureAudioEngine,
    loadModels,
    measure,
    calibrate,
    start,
    stop,
    getTelemetry,
    captureEvidence,
    dispose,
  }), [phase, stream, cameraStatus, requestCamera, requestMic, ensureAudioEngine, loadModels, measure, calibrate, start, stop, getTelemetry, captureEvidence, dispose]);
}

