// Runs the ObjectDetector off the main thread. Frames arrive as transferred
// ImageBitmaps; detections go back as plain objects.
import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';

let detector = null;
let lastTs = 0;

const post = (msg) => self.postMessage(msg);

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      // Module workers can't importScripts(), so use the ES-module WASM loader.
      const fileset = await FilesetResolver.forVisionTasks(data.wasmBase, true);
      const create = (delegate) => ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: data.modelUrl, delegate },
        runningMode: 'VIDEO',
        scoreThreshold: data.scoreThreshold,
        maxResults: data.maxResults,
        categoryAllowlist: data.categories,
      });
      let delegate = data.delegate;
      try {
        detector = await create(delegate);
      } catch (error) {
        if (delegate !== 'GPU') throw error;
        delegate = 'CPU';
        detector = await create(delegate);
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
      if (!detector) throw new Error('detector not ready');
      const stamp = Math.max(Math.round(ts), lastTs + 1);
      lastTs = stamp;
      const t0 = performance.now();
      const result = detector.detectForVideo(bitmap, stamp);
      const ms = performance.now() - t0;
      const detections = (result.detections || []).flatMap((d) =>
        (d.categories || []).map((c) => ({ categoryName: c.categoryName, score: c.score })));
      post({ type: 'result', id, detections, ms });
    } catch (error) {
      post({ type: 'detect-error', id, error: String(error?.message || error) });
    } finally {
      bitmap?.close?.();
    }
    return;
  }

  if (data.type === 'close') {
    try { detector?.close(); } catch { /* ignore */ }
    detector = null;
    self.close();
  }
};
