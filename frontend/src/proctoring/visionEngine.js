// Thin wrapper around @mediapipe/tasks-vision: self-hosted assets, GPU delegate
// with automatic CPU fallback (at creation and if inference later fails).
import { FaceLandmarker, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';

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

const OBJECT_SCORE_THRESHOLD = 0.3;
const OBJECT_MAX_RESULTS = 5;

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

  const face = await makeHandle(
    (fileset, delegate) => FaceLandmarker.createFromOptions(fileset, faceOptions(delegate)),
    (task, source, ts) => task.detectForVideo(source, ts),
    faceDelegate,
  );

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
