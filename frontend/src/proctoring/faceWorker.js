// Runs the FaceLandmarker off the main thread. Frames arrive as transferred
// ImageBitmaps; face landmarks and metadata go back as plain objects.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let landmarker = null;
let lastTs = 0;

const post = (msg) => self.postMessage(msg);

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      // Module workers can't importScripts(), so use the ES-module WASM loader.
      const fileset = await FilesetResolver.forVisionTasks(data.wasmBase, true);
      const create = (delegate) => FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: data.modelUrl, delegate },
        runningMode: 'VIDEO',
        numFaces: data.numFaces || 3,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      let delegate = data.delegate || 'CPU';
      try {
        landmarker = await create(delegate);
      } catch (error) {
        if (delegate !== 'GPU') throw error;
        delegate = 'CPU';
        landmarker = await create(delegate);
      }
      post({ type: 'ready', delegate });
    } catch (error) {
      post({ type: 'init-error', error: String(error?.message || error) });
    }
    return;
  }

  if (data.type === 'detect') {
    const { id, bitmap, ts } = data;
    try {
      if (!landmarker) throw new Error('face landmarker not ready');
      const stamp = Math.max(Math.round(ts), lastTs + 1);
      lastTs = stamp;
      const t0 = performance.now();
      const rawResult = landmarker.detectForVideo(bitmap, stamp);
      const ms = performance.now() - t0;
      const result = rawResult ? {
        faceLandmarks: rawResult.faceLandmarks ? rawResult.faceLandmarks.map((points) =>
          points.map((p) => ({ x: p.x, y: p.y, z: p.z }))
        ) : [],
        faceBlendshapes: rawResult.faceBlendshapes ? rawResult.faceBlendshapes.map((fb) => ({
          categories: (fb.categories || []).map((c) => ({
            categoryName: c.categoryName,
            score: c.score,
          })),
        })) : [],
        facialTransformationMatrixes: rawResult.facialTransformationMatrixes ? rawResult.facialTransformationMatrixes.map((m) => ({
          rows: m.rows || 4,
          columns: m.columns || 4,
          data: Array.from(m.data || []),
        })) : [],
      } : null;
      const faceCount = result?.faceLandmarks?.length || 0;
      post({ type: 'result', id, faceCount, ms, result });
    } catch (error) {
      post({ type: 'detect-error', id, error: String(error?.message || error) });
    } finally {
      bitmap?.close?.();
    }
    return;
  }

  if (data.type === 'close') {
    try { landmarker?.close(); } catch { /* ignore */ }
    landmarker = null;
    self.close();
  }
};
