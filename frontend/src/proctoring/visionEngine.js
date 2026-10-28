// Thin wrapper around @mediapipe/tasks-vision: self-hosted assets, GPU delegate
// with automatic CPU fallback (at creation and if inference later fails).
import { FaceLandmarker, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import flightRecorder from '../telemetry/flightRecorder';

export const OBJECT_MODELS = Object.freeze({
  lite0: '/models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite',
});

export const ASSETS = Object.freeze({
  wasmBase: `/mediapipe/${import.meta.env.VITE_MEDIAPIPE_VERSION}/wasm`,
  faceModel: '/models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  objectModel: OBJECT_MODELS.lite0,
});

// EfficientDet-Lite0 int8 runs faster on CPU (XNNPACK) than on the GPU delegate
// (measured 67 ms vs 83 ms per frame on an Intel UHD iGPU), with shorter long tasks.
export const DEFAULT_OBJECT_DELEGATE = 'CPU';

export const OBJECT_CATEGORIES = Object.freeze(['cell phone', 'book']);

let filesetPromise = null;
const getFileset = () => {
  if (!filesetPromise) {
    filesetPromise = FilesetResolver.forVisionTasks(ASSETS.wasmBase).catch((error) => {
      filesetPromise = null;
      throw error;
    });
  }
  return filesetPromise;
};

const faceOptions = (delegate) => ({
  baseOptions: { modelAssetPath: ASSETS.faceModel, delegate },
  runningMode: 'VIDEO',
  numFaces: 3,
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true,
});

export const OBJECT_SCORE_THRESHOLD = 0.2;
export const OBJECT_MAX_RESULTS = 5;

const objectOptions = (delegate, modelAssetPath) => ({
  baseOptions: { modelAssetPath, delegate },
  runningMode: 'VIDEO',
  scoreThreshold: OBJECT_SCORE_THRESHOLD,
  maxResults: OBJECT_MAX_RESULTS,
  categoryAllowlist: [...OBJECT_CATEGORIES],
});

async function createWithFallback(create, preferGpu) {
  const fileset = await getFileset();
  if (preferGpu) {
    try {
      return { task: await create(fileset, 'GPU'), delegate: 'GPU' };
    } catch (error) {
      console.warn('[vision] GPU delegate unavailable, falling back to CPU', error);
    }
  }
  return { task: await create(fileset, 'CPU'), delegate: 'CPU' };
}

/**
 * Loads the face landmarker (and optionally the object detector).
 * Returns detector handles whose detect() calls never throw; a GPU failure
 * during inference transparently recreates that task on the CPU.
 */
export async function loadVisionTasks({
  detectObjects = true,
  objectModel = ASSETS.objectModel,
  faceDelegate = 'GPU',
  objectDelegate = DEFAULT_OBJECT_DELEGATE,
  objectsInWorker = true,
  faceInWorker = false,
} = {}) {
  const started = performance.now();

  const makeHandle = async (create, run, preferred) => {
    let { task, delegate } = await createWithFallback(create, preferred === 'GPU');
    let lastTs = 0;
    let rebuilding = null;
    let failed = false;

    return {
      get delegate() { return delegate; },
      get failed() { return failed; },
      /** Returns the raw result, or null if the task is unavailable right now. */
      detect(source, nowMs) {
        if (!task || rebuilding || failed) return null;
        // VIDEO mode requires strictly increasing timestamps per task.
        const ts = Math.max(Math.round(nowMs), lastTs + 1);
        lastTs = ts;
        try {
          return run(task, source, ts);
        } catch (error) {
          if (delegate === 'GPU') {
            console.warn('[vision] GPU inference failed, recreating on CPU', error);
            const old = task;
            task = null;
            rebuilding = createWithFallback(create, false)
              .then((next) => { ({ task, delegate } = next); lastTs = 0; })
              .catch((e) => { failed = true; console.error('[vision] CPU fallback failed', e); })
              .finally(() => { rebuilding = null; try { old.close(); } catch { /* already gone */ } });
          } else {
            failed = true;
            console.error('[vision] inference failed', error);
          }
          return null;
        }
      },
      close() {
        try { task?.close(); } catch { /* ignore */ }
        task = null;
      },
    };
  };

  const createMainFaceHandle = async () => {
    const handle = await makeHandle(
      (fileset, delegate) => FaceLandmarker.createFromOptions(fileset, faceOptions(delegate)),
      (task, source, ts) => task.detectForVideo(source, ts),
      faceDelegate,
    );
    return mainThreadFaceHandle(handle);
  };

  let face = null;
  if (faceInWorker) {
    try {
      const workerHandle = await createFaceWorkerHandle({ faceDelegate });
      let currentFaceHandle = workerHandle;
      let fallenBack = false;

      const triggerFallback = async (reason) => {
        if (fallenBack) return;
        fallenBack = true;
        flightRecorder.record('vision', 'face_worker_fallback', {
          reason: String(reason || 'worker_error').slice(0, 32),
        });
        console.warn('[vision] Face worker failed, falling back to main-thread engine:', reason);
        try { workerHandle.close(); } catch { /* ignore */ }
        try {
          currentFaceHandle = await createMainFaceHandle();
        } catch (err) {
          console.error('[vision] Failed to create main-thread face fallback:', err);
        }
      };

      workerHandle.onCrash = (err) => {
        void triggerFallback(err);
      };

      face = {
        get inWorker() { return currentFaceHandle.inWorker; },
        get delegate() { return currentFaceHandle.delegate; },
        get failed() { return currentFaceHandle.failed; },
        get busy() { return currentFaceHandle.busy || false; },
        detect(source, ts) {
          if (currentFaceHandle.detect) return currentFaceHandle.detect(source, ts);
          return null;
        },
        async detectAsync(source, ts) {
          if (fallenBack || !currentFaceHandle.inWorker) {
            return currentFaceHandle.detectAsync(source, ts);
          }
          try {
            const res = await currentFaceHandle.detectAsync(source, ts);
            if (currentFaceHandle.failed) {
              await triggerFallback('detect_failed');
            }
            return res;
          } catch (err) {
            await triggerFallback(err?.message || 'detect_error');
            return currentFaceHandle.detectAsync(source, ts);
          }
        },
        fallbackToMainThread: triggerFallback,
        close() {
          currentFaceHandle?.close();
        },
      };
    } catch (error) {
      console.warn('[vision] Face worker init failed, falling back to main-thread engine', error);
      flightRecorder.record('vision', 'face_worker_fallback', { reason: 'init_failed' });
    }
  }

  if (!face) {
    face = await createMainFaceHandle();
  }

  let objects = null;
  if (detectObjects) {
    if (objectsInWorker) {
      try {
        objects = await createObjectWorkerHandle({ objectModel, objectDelegate });
      } catch (error) {
        console.warn('[vision] object worker unavailable, detecting on the main thread', error);
      }
    }
    if (!objects) {
      const handle = await makeHandle(
        (fileset, delegate) => ObjectDetector.createFromOptions(fileset, objectOptions(delegate, objectModel)),
        (task, source, ts) => task.detectForVideo(source, ts),
        objectDelegate,
      );
      objects = mainThreadObjectHandle(handle);
    }
  }

  return {
    face,
    objects,
    loadMs: Math.round(performance.now() - started),
    close() {
      face.close();
      objects?.close();
    },
  };
}

/** Async/sync face handle over the synchronous main-thread task. */
function mainThreadFaceHandle(handle) {
  return {
    inWorker: false,
    get delegate() { return handle.delegate; },
    get failed() { return handle.failed; },
    get busy() { return false; },
    detect(source, nowMs) {
      return handle.detect(source, nowMs);
    },
    async detectAsync(source, nowMs) {
      const t0 = performance.now();
      const result = handle.detect(source, nowMs);
      if (!result) return null;
      const ms = performance.now() - t0;
      return { result, ms, handoffMs: ms };
    },
    close: () => handle.close(),
  };
}

/**
 * Face detection in a module Web Worker. The main thread only pays for
 * createImageBitmap() handoff (a few ms); heavy FaceLandmarker inference runs off-thread.
 */
function createFaceWorkerHandle({ faceDelegate = 'CPU' } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof Worker !== 'function' || typeof createImageBitmap !== 'function') {
      reject(new Error('Worker/createImageBitmap unsupported'));
      return;
    }
    const worker = new Worker(new URL('./faceWorker.js', import.meta.url), { type: 'module' });
    let delegate = null;
    let failed = false;
    let busy = false;
    let nextId = 1;
    const pending = new Map();
    let onCrash = null;
    const initTimeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('face worker init timed out'));
    }, 30000);

    const handle = {
      inWorker: true,
      get delegate() { return delegate; },
      get failed() { return failed; },
      get busy() { return busy; },
      set onCrash(fn) { onCrash = fn; },
      async detectAsync(video, ts) {
        if (failed) return null;
        if (busy) return null; // skip frame if worker is busy (no queue growth)
        const t0 = performance.now();
        let bitmap;
        try {
          bitmap = await createImageBitmap(video);
        } catch {
          return null;
        }
        const handoffMs = performance.now() - t0;
        const id = nextId;
        nextId += 1;
        busy = true;
        return new Promise((done) => {
          pending.set(id, (msg) => {
            busy = false;
            done(msg.type === 'result'
              ? { result: msg.result, ms: msg.ms, handoffMs }
              : null);
          });
          try {
            worker.postMessage({ type: 'detect', id, bitmap, ts }, [bitmap]);
          } catch {
            busy = false;
            pending.delete(id);
            try { bitmap.close(); } catch { /* ignore */ }
            done(null);
          }
        });
      },
      close() {
        failed = true;
        busy = false;
        try { worker.postMessage({ type: 'close' }); } catch { /* ignore */ }
        pending.forEach((cb) => cb({ type: 'closed' }));
        pending.clear();
      },
    };

    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        clearTimeout(initTimeout);
        delegate = data.delegate;
        resolve(handle);
      } else if (data.type === 'init-error') {
        clearTimeout(initTimeout);
        worker.terminate();
        reject(new Error(data.error));
      } else if (data.type === 'result' || data.type === 'detect-error') {
        if (data.type === 'detect-error') console.warn('[vision] face worker detect failed', data.error);
        const cb = pending.get(data.id);
        pending.delete(data.id);
        cb?.(data);
      }
    };
    worker.onerror = (event) => {
      failed = true;
      busy = false;
      clearTimeout(initTimeout);
      pending.forEach((cb) => cb({ type: 'detect-error' }));
      pending.clear();
      onCrash?.(event?.message || 'face worker crashed');
      reject(new Error(event?.message || 'face worker crashed'));
    };

    worker.postMessage({
      type: 'init',
      wasmBase: new URL(ASSETS.wasmBase, location.href).href,
      modelUrl: new URL(ASSETS.faceModel, location.href).href,
      delegate: faceDelegate,
      numFaces: 3,
    });
  });
}

const toDetections = (result) => (result?.detections || []).flatMap((d) =>
  (d.categories || []).map((c) => ({ categoryName: c.categoryName, score: c.score })));

/** Async object handle over the synchronous main-thread task (fallback path). */
function mainThreadObjectHandle(handle) {
  return {
    inWorker: false,
    get delegate() { return handle.delegate; },
    get failed() { return handle.failed; },
    async detectAsync(video, ts) {
      const t0 = performance.now();
      const result = handle.detect(video, ts);
      if (!result) return null;
      const ms = performance.now() - t0;
      return { detections: toDetections(result), ms, mainThreadMs: ms };
    },
    close: () => handle.close(),
  };
}

/**
 * Object detection in a module Web Worker. The main thread only pays for
 * createImageBitmap() (a few ms); the ~70 ms inference runs off-thread.
 */
function createObjectWorkerHandle({ objectModel, objectDelegate }) {
  return new Promise((resolve, reject) => {
    if (typeof Worker !== 'function' || typeof createImageBitmap !== 'function') {
      reject(new Error('Worker/createImageBitmap unsupported'));
      return;
    }
    const worker = new Worker(new URL('./objectWorker.js', import.meta.url), { type: 'module' });
    let delegate = null;
    let failed = false;
    let nextId = 1;
    const pending = new Map();
    const initTimeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('object worker init timed out'));
    }, 30000);

    const handle = {
      inWorker: true,
      get delegate() { return delegate; },
      get failed() { return failed; },
      async detectAsync(video, ts) {
        if (failed) return null;
        const t0 = performance.now();
        let bitmap;
        try {
          bitmap = await createImageBitmap(video);
        } catch {
          return null;
        }
        const mainThreadMs = performance.now() - t0;
        const id = nextId;
        nextId += 1;
        return new Promise((done) => {
          pending.set(id, (msg) => done(msg.type === 'result'
            ? { detections: msg.detections, ms: msg.ms, mainThreadMs }
            : null));
          worker.postMessage({ type: 'detect', id, bitmap, ts }, [bitmap]);
        });
      },
      close() {
        failed = true;
        worker.postMessage({ type: 'close' });
        pending.forEach((cb) => cb({ type: 'closed' }));
        pending.clear();
      },
    };

    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        clearTimeout(initTimeout);
        delegate = data.delegate;
        resolve(handle);
      } else if (data.type === 'init-error') {
        clearTimeout(initTimeout);
        worker.terminate();
        reject(new Error(data.error));
      } else if (data.type === 'result' || data.type === 'detect-error') {
        if (data.type === 'detect-error') console.warn('[vision] object worker detect failed', data.error);
        const cb = pending.get(data.id);
        pending.delete(data.id);
        cb?.(data);
      }
    };
    worker.onerror = (event) => {
      failed = true;
      clearTimeout(initTimeout);
      pending.forEach((cb) => cb({ type: 'detect-error' }));
      pending.clear();
      reject(new Error(event?.message || 'object worker crashed'));
    };

    worker.postMessage({
      type: 'init',
      wasmBase: new URL(ASSETS.wasmBase, location.href).href,
      modelUrl: new URL(objectModel, location.href).href,
      delegate: objectDelegate,
      scoreThreshold: OBJECT_SCORE_THRESHOLD,
      maxResults: OBJECT_MAX_RESULTS,
      categories: [...OBJECT_CATEGORIES],
    });
  });
}
