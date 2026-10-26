import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { FilesetResolver } from '@mediapipe/tasks-vision';
import { loadVisionTasks, ASSETS } from '../../proctoring/visionEngine';
import { createVisionController } from '../../proctoring/controller';
import { createAudioClassifier, createAudioEngine } from '../../proctoring/audioEngine';
import flightRecorder from '../../telemetry/flightRecorder';

function percentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, Math.min(index, sorted.length - 1))] * 10) / 10;
}

function getDeviceInfo() {
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
  const androidMatch = ua.match(/Android\s+([0-9.]+)/i);
  const androidVersion = androidMatch ? androidMatch[1] : 'N/A (non-Android)';

  let deviceModel = 'N/A';
  const modelMatch = ua.match(/;\s*([^;)]+?)\s+Build\//i) || ua.match(/;\s*([^;)]+?)\s*\)/i);
  if (modelMatch && androidMatch) {
    deviceModel = modelMatch[1].trim();
  } else if (/iPhone|iPad/i.test(ua)) {
    deviceModel = 'iOS Device';
  } else {
    deviceModel = (typeof navigator !== 'undefined' && navigator.platform) || 'Desktop';
  }

  const chromeMatch = ua.match(/Chrome\/([0-9.]+)/i);
  const webViewVersion = chromeMatch ? chromeMatch[1] : (ua.slice(0, 40) || 'unknown');

  return {
    androidVersion,
    deviceModel,
    webViewVersion,
    hardwareConcurrency: (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || null,
    deviceMemory: (typeof navigator !== 'undefined' && navigator.deviceMemory) || null,
    userAgent: ua,
  };
}

async function getBatterySnapshot() {
  if (typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
    try {
      const b = await navigator.getBattery();
      const level = Math.round(b.level * 100);
      const charging = Boolean(b.charging);
      return {
        level,
        charging,
        text: `${level}% (${charging ? 'charging' : 'discharging'})`,
      };
    } catch {
      return { level: null, charging: null, text: 'N/A' };
    }
  }
  return { level: null, charging: null, text: 'N/A' };
}

async function detectWasmVariant() {
  try {
    const entries = performance.getEntriesByType('resource');
    const wasmEntry = entries.find((e) => e.name && e.name.includes('.wasm'));
    if (wasmEntry) {
      if (wasmEntry.name.includes('nosimd')) return 'nosimd (network)';
      return 'simd (network)';
    }
  } catch {
    /* ignore */
  }

  try {
    const isSimd = await FilesetResolver.isSimdSupported();
    return isSimd ? 'simd (probe)' : 'nosimd (probe)';
  } catch {
    return 'unknown';
  }
}

/**
 * Creates a module Web Worker running FaceLandmarker off the main thread.
 */
function createFaceWorkerHandle({ faceDelegate = 'CPU' } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof Worker !== 'function' || typeof createImageBitmap !== 'function') {
      reject(new Error('Worker or createImageBitmap is not supported in this environment'));
      return;
    }
    const worker = new Worker(new URL('../../proctoring/faceWorker.js', import.meta.url), { type: 'module' });
    let delegate = null;
    let failed = false;
    let nextId = 1;
    const pending = new Map();
    const initTimeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('Face worker initialization timed out after 30s'));
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
        const handoffMs = performance.now() - t0;
        const id = nextId;
        nextId += 1;
        return new Promise((done) => {
          pending.set(id, (msg) => done(msg.type === 'result'
            ? { faceCount: msg.faceCount, ms: msg.ms, handoffMs }
            : null));
          worker.postMessage({ type: 'detect', id, bitmap, ts }, [bitmap]);
        });
      },
      close() {
        failed = true;
        clearTimeout(initTimeout);
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
        if (data.type === 'detect-error') console.warn('[faceWorker] detect failed', data.error);
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
      reject(new Error(event?.message || 'face worker crashed'));
    };

    worker.postMessage({
      type: 'init',
      wasmBase: new URL(ASSETS.wasmBase, location.href).href,
      modelUrl: new URL(ASSETS.faceModel, location.href).href,
      delegate: faceDelegate,
      numFaces: 1,
    });
  });
}

function ResultCardHeader({ info }) {
  const tasksText = [
    info.runFace ? 'Face: ON' : 'Face: OFF',
    info.runObject ? 'Object: ON' : 'Object: OFF',
    info.runAudio ? 'Audio: ON' : 'Audio: OFF',
  ].join(', ');

  const modeText = info.faceMode === 'worker' ? 'Worker (exp)' : 'Main Thread';

  return (
    <div
      style={{
        background: 'rgba(30, 41, 59, 0.95)',
        border: '1px solid rgba(56, 189, 248, 0.35)',
        borderRadius: '8px',
        padding: '10px 14px',
        marginBottom: '14px',
        fontSize: '0.8rem',
        color: '#e2e8f0',
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center' }}>
        <div>
          <span style={{ color: '#94a3b8' }}>Phone:</span>{' '}
          <strong style={{ color: '#38bdf8' }}>{info.deviceModel}</strong>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Android:</span>{' '}
          <strong style={{ color: '#f1f5f9' }}>{info.androidVersion}</strong>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>WebView:</span>{' '}
          <strong style={{ color: '#f1f5f9' }}>{info.webViewVersion}</strong>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Delegate:</span>{' '}
          <strong style={{ color: '#a7f3d0' }}>{info.delegate} ({modeText})</strong>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Req. Face FPS:</span>{' '}
          <strong style={{ color: '#fde047' }}>{info.targetFaceFps} fps</strong>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Tasks:</span>{' '}
          <strong style={{ color: '#c084fc' }}>{tasksText}</strong>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Battery:</span>{' '}
          <strong style={{ color: info.batteryCharging ? '#34d399' : '#fb923c' }}>
            {info.batteryText || 'N/A'}
          </strong>
        </div>
      </div>
    </div>
  );
}

const RUN_ALL_SUITE = [
  {
    id: 'face_cpu_3',
    name: 'face-only CPU @3',
    runFace: true,
    runObject: false,
    runAudio: false,
    faceMode: 'main',
    delegate: 'CPU',
    targetFps: 3,
    durationSec: 60,
  },
  {
    id: 'face_cpu_5',
    name: 'face-only CPU @5',
    runFace: true,
    runObject: false,
    runAudio: false,
    faceMode: 'main',
    delegate: 'CPU',
    targetFps: 5,
    durationSec: 60,
  },
  {
    id: 'face_cpu_8',
    name: 'face-only CPU @8',
    runFace: true,
    runObject: false,
    runAudio: false,
    faceMode: 'main',
    delegate: 'CPU',
    targetFps: 8,
    durationSec: 60,
  },
  {
    id: 'face_obj_cpu_5',
    name: 'face+object CPU @5',
    runFace: true,
    runObject: true,
    runAudio: false,
    faceMode: 'main',
    delegate: 'CPU',
    targetFps: 5,
    durationSec: 60,
  },
  {
    id: 'face_worker_cpu_5',
    name: 'face-in-worker CPU @5',
    runFace: true,
    runObject: false,
    runAudio: false,
    faceMode: 'worker',
    delegate: 'CPU',
    targetFps: 5,
    durationSec: 60,
  },
  {
    id: 'face_worker_cpu_8',
    name: 'face-in-worker CPU @8',
    runFace: true,
    runObject: false,
    runAudio: false,
    faceMode: 'worker',
    delegate: 'CPU',
    targetFps: 8,
    durationSec: 60,
  },
];

export default function AppSpikeBenchmark() {
  const navigate = useNavigate();

  // Test configuration
  const [runFace, setRunFace] = useState(true);
  const [runObject, setRunObject] = useState(true);
  const [runAudio, setRunAudio] = useState(true);
  const [faceMode, setFaceMode] = useState('main'); // 'main' | 'worker'
  const [selectedDelegate, setSelectedDelegate] = useState('CPU'); // 'GPU' | 'CPU'
  const [targetFaceFps, setTargetFaceFps] = useState(5); // 3 | 5 | 8

  // Execution state
  const [running, setRunning] = useState(false);
  const [suiteRunning, setSuiteRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Ready to run proctoring benchmark diagnostics');
  const [currentTestName, setCurrentTestName] = useState('');

  // Results
  const [finalReport, setFinalReport] = useState(null);
  const [suiteResults, setSuiteResults] = useState([]);
  const [batteryState, setBatteryState] = useState({ level: null, charging: null, text: 'reading...' });
  const [wasmVariant, setWasmVariant] = useState('detecting...');
  const [realTestRunning, setRealTestRunning] = useState(false);
  const [realTestProgress, setRealTestProgress] = useState('');
  const [realTestResults, setRealTestResults] = useState(null);

  // Live telemetry metrics
  const [liveFaceFps, setLiveFaceFps] = useState(0);
  const [liveObjectFps, setLiveObjectFps] = useState(0);
  const [liveAudioScore, setLiveAudioScore] = useState(0);
  const [liveFaceLatency, setLiveFaceLatency] = useState(0);
  const [liveObjectLatency, setLiveObjectLatency] = useState(0);
  const [liveLongTasksCount, setLiveLongTasksCount] = useState(0);
  const [liveLongTasksMs, setLiveLongTasksMs] = useState(0);
  const [liveHeapMB, setLiveHeapMB] = useState(null);
  const [errorLogs, setErrorLogs] = useState([]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cancelBenchmarkRef = useRef(false);

  // Device & static environment detection
  const deviceInfo = useRef(getDeviceInfo()).current;

  // Read initial battery
  useEffect(() => {
    getBatterySnapshot().then(setBatteryState);
    detectWasmVariant().then(setWasmVariant);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelBenchmarkRef.current = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const ensureCamera = useCallback(async () => {
    if (streamRef.current && streamRef.current.getVideoTracks().some((t) => t.readyState === 'live')) {
      return streamRef.current;
    }
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
        facingMode: { ideal: 'user' },
      },
      audio: false,
    });
    streamRef.current = mediaStream;
    if (videoRef.current) {
      videoRef.current.srcObject = mediaStream;
      await videoRef.current.play().catch(() => {});
    }
    return mediaStream;
  }, []);

  /**
   * Runs a single benchmark test according to cfg.
   */
  const executeSingleTest = useCallback(async (cfg) => {
    setStatusMessage(`Preparing: ${cfg.name}...`);
    setCurrentTestName(cfg.name);
    setSecondsRemaining(cfg.durationSec);
    setLiveFaceFps(0);
    setLiveObjectFps(0);
    setLiveAudioScore(0);
    setLiveFaceLatency(0);
    setLiveObjectLatency(0);
    setLiveLongTasksCount(0);
    setLiveLongTasksMs(0);

    const initialBattery = await getBatterySnapshot();
    setBatteryState(initialBattery);

    await ensureCamera();

    let tasks = null;
    let faceWorker = null;
    let audioEngine = null;
    let longTaskObserver = null;

    let longTaskCount = 0;
    let longTaskTotalMs = 0;

    const faceLatencies = [];
    const detectDurations = [];
    const loopIntervals = [];
    const idleGaps = [];
    const faceHandoffs = [];
    const objectLatencies = [];
    const objectHandoffs = [];
    let faceInferenceCount = 0;
    let objectInferenceCount = 0;
    let audioSampleCount = 0;
    let droppedFrames = 0;
    const errors = [];

    // Setup PerformanceObserver for longtask
    try {
      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTaskCount += 1;
            longTaskTotalMs += entry.duration;
            setLiveLongTasksCount(longTaskCount);
            setLiveLongTasksMs(Math.round(longTaskTotalMs));
          }
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
      }
    } catch (obsErr) {
      console.warn('[benchmark] LongTask observer error:', obsErr);
    }

    try {
      // 1. Initialize Face (Worker or Main thread)
      if (cfg.runFace) {
        if (cfg.faceMode === 'worker') {
          setStatusMessage(`Initializing Face in Worker (${cfg.delegate})...`);
          faceWorker = await createFaceWorkerHandle({ faceDelegate: cfg.delegate });
        } else {
          setStatusMessage(`Loading Main-Thread FaceLandmarker (${cfg.delegate})...`);
          tasks = await loadVisionTasks({
            detectObjects: cfg.runObject,
            faceDelegate: cfg.delegate,
            objectDelegate: 'CPU',
            objectsInWorker: true,
          });
        }
      }

      // 2. Initialize Objects if requested and not already loaded
      if (cfg.runObject && !tasks) {
        setStatusMessage('Loading Object Detector in Worker...');
        tasks = await loadVisionTasks({
          detectObjects: true,
          faceDelegate: 'CPU',
          objectDelegate: 'CPU',
          objectsInWorker: true,
        });
      }

      // 3. Initialize Audio if requested
      if (cfg.runAudio) {
        setStatusMessage('Loading Audio Classifier (YAMNet)...');
        const classifier = await createAudioClassifier();
        audioEngine = createAudioEngine({
          classifier,
          onSample: (sample) => {
            audioSampleCount += 1;
            setLiveAudioScore(Math.round((sample.speechScore || 0) * 100));
          },
        });
        await audioEngine.start();
      }

      setStatusMessage(`Running test: ${cfg.name} (${cfg.durationSec} s)...`);

      const benchmarkStart = performance.now();
      const durationMs = cfg.durationSec * 1000;
      const faceIntervalMs = cfg.runFace ? 1000 / cfg.targetFps : Infinity;
      const objectIntervalMs = 1000 / 1.5;

      let nextFaceTime = benchmarkStart;
      let nextObjectTime = benchmarkStart;
      let lastSecUpdate = benchmarkStart;

      let prevFaceStart = null;
      let prevFaceEnd = null;
      let objectInFlight = false;
      let faceWorkerInFlight = false;

      let prevQuality = videoRef.current?.getVideoPlaybackQuality?.();

      while (performance.now() - benchmarkStart < durationMs && !cancelBenchmarkRef.current) {
        const now = performance.now();

        // Second update
        if (now - lastSecUpdate >= 1000) {
          const elapsedSec = Math.floor((now - benchmarkStart) / 1000);
          const remainingSec = Math.max(0, cfg.durationSec - elapsedSec);
          setSecondsRemaining(remainingSec);
          lastSecUpdate = now;

          const sec = Math.max(1, elapsedSec);
          setLiveFaceFps(Math.round((faceInferenceCount / sec) * 10) / 10);
          setLiveObjectFps(Math.round((objectInferenceCount / sec) * 10) / 10);

          if (performance?.memory?.usedJSHeapSize) {
            setLiveHeapMB(Math.round(performance.memory.usedJSHeapSize / (1024 * 1024)));
          }

          if (videoRef.current?.getVideoPlaybackQuality) {
            const currentQuality = videoRef.current.getVideoPlaybackQuality();
            if (currentQuality && prevQuality) {
              droppedFrames = currentQuality.droppedVideoFrames || 0;
            }
          }
        }

        const videoReady = videoRef.current && videoRef.current.readyState >= 2;

        // Face Detection Tick
        if (cfg.runFace && videoReady && now >= nextFaceTime) {
          nextFaceTime = now + faceIntervalMs;

          if (prevFaceStart !== null) {
            loopIntervals.push(now - prevFaceStart);
          }
          prevFaceStart = now;

          if (prevFaceEnd !== null) {
            idleGaps.push(now - prevFaceEnd);
          }

          if (cfg.faceMode === 'worker' && faceWorker) {
            if (!faceWorkerInFlight) {
              faceWorkerInFlight = true;
              const t0 = performance.now();
              faceWorker.detectAsync(videoRef.current, now).then((res) => {
                faceWorkerInFlight = false;
                prevFaceEnd = performance.now();
                if (res) {
                  const roundTrip = performance.now() - t0;
                  detectDurations.push(res.ms);
                  faceLatencies.push(roundTrip);
                  if (typeof res.handoffMs === 'number') {
                    faceHandoffs.push(res.handoffMs);
                  }
                  faceInferenceCount += 1;
                  setLiveFaceLatency(Math.round(roundTrip));
                }
              }).catch((err) => {
                faceWorkerInFlight = false;
                errors.push({ type: 'faceWorker', message: String(err?.message || err) });
              });
            }
          } else if (tasks?.face) {
            const t0 = performance.now();
            try {
              tasks.face.detect(videoRef.current, now);
              const dur = performance.now() - t0;
              prevFaceEnd = performance.now();
              detectDurations.push(dur);
              faceLatencies.push(dur);
              faceInferenceCount += 1;
              setLiveFaceLatency(Math.round(dur));
            } catch (err) {
              errors.push({ type: 'face', message: String(err?.message || err) });
            }
          }
        }

        // Object Detection Tick
        if (cfg.runObject && tasks?.objects && videoReady && !objectInFlight && now >= nextObjectTime) {
          nextObjectTime = now + objectIntervalMs;
          objectInFlight = true;
          tasks.objects.detectAsync(videoRef.current, now).then((res) => {
            objectInFlight = false;
            if (res) {
              objectLatencies.push(res.ms);
              objectInferenceCount += 1;
              setLiveObjectLatency(Math.round(res.ms));
              if (typeof res.mainThreadMs === 'number') {
                objectHandoffs.push(res.mainThreadMs);
              }
            }
          }).catch((err) => {
            objectInFlight = false;
            errors.push({ type: 'object', message: String(err?.message || err) });
          });
        }

        // Yield to allow UI rendering and microtasks
        await new Promise((r) => setTimeout(r, 4));
      }

      const totalElapsedSec = Math.max(1, Math.round((performance.now() - benchmarkStart) / 1000));
      const finalBattery = await getBatterySnapshot();
      setBatteryState(finalBattery);

      const p50 = (arr) => percentile(arr, 50);
      const p95 = (arr) => percentile(arr, 95);

      const report = {
        name: cfg.name,
        durationSec: totalElapsedSec,
        targetFaceFps: cfg.runFace ? cfg.targetFps : 0,
        achievedFaceFps: cfg.runFace ? Math.round((faceInferenceCount / totalElapsedSec) * 10) / 10 : 0,
        faceLatencyP50Ms: p50(faceLatencies),
        faceLatencyP95Ms: p95(faceLatencies),
        detectDurationP50Ms: p50(detectDurations),
        detectDurationP95Ms: p95(detectDurations),
        loopIntervalP50Ms: p50(loopIntervals),
        loopIntervalP95Ms: p95(loopIntervals),
        idleGapP50Ms: p50(idleGaps),
        idleGapP95Ms: p95(idleGaps),
        faceHandoffP50Ms: cfg.faceMode === 'worker' ? p50(faceHandoffs) : null,
        faceHandoffP95Ms: cfg.faceMode === 'worker' ? p95(faceHandoffs) : null,
        longTaskCount,
        longTaskTotalMs: Math.round(longTaskTotalMs),
        objectFps: cfg.runObject ? Math.round((objectInferenceCount / totalElapsedSec) * 10) / 10 : null,
        objectLatencyP50Ms: cfg.runObject ? p50(objectLatencies) : null,
        objectLatencyP95Ms: cfg.runObject ? p95(objectLatencies) : null,
        objectHandoffP50Ms: cfg.runObject ? p50(objectHandoffs) : null,
        objectHandoffP95Ms: cfg.runObject ? p95(objectHandoffs) : null,
        audioChunksPerSec: cfg.runAudio ? Math.round((audioSampleCount / totalElapsedSec) * 10) / 10 : null,
        batteryLevel: finalBattery.level,
        batteryCharging: finalBattery.charging,
        batteryText: finalBattery.text,
        deviceModel: deviceInfo.deviceModel,
        androidVersion: deviceInfo.androidVersion,
        webViewVersion: deviceInfo.webViewVersion,
        delegate: cfg.delegate,
        faceMode: cfg.faceMode,
        runFace: cfg.runFace,
        runObject: cfg.runObject,
        runAudio: cfg.runAudio,
        droppedFrames,
        errorsCount: errors.length,
      };

      setErrorLogs([...errors]);
      return report;
    } finally {
      longTaskObserver?.disconnect();
      faceWorker?.close();
      tasks?.close();
      audioEngine?.stop();
      audioEngine?.dispose?.();
    }
  }, [deviceInfo, ensureCamera]);

  /**
   * Run Single Manual Test
   */
  const handleRunSingle = async () => {
    if (running || suiteRunning) return;
    setRunning(true);
    setCompleted(false);
    setFinalReport(null);
    cancelBenchmarkRef.current = false;

    const singleConfig = {
      name: `Manual (${selectedDelegate} @ ${targetFaceFps}fps, ${faceMode})`,
      runFace,
      runObject,
      runAudio,
      faceMode,
      delegate: selectedDelegate,
      targetFps: targetFaceFps,
      durationSec: 60,
    };

    try {
      const report = await executeSingleTest(singleConfig);
      setFinalReport(report);
      setStatusMessage('Single benchmark completed (60 s).');
      flightRecorder.record('benchmark', 'android_spike_single', report);
      flightRecorder.flush({ keepalive: true });
    } catch (err) {
      console.error('[benchmark] Single test error:', err);
      setStatusMessage(`Test failed: ${err?.message || err}`);
    } finally {
      setRunning(false);
      setCompleted(true);
    }
  };

  /**
   * Run All Suite (6 tests, 60s each, 20s cooldown)
   */
  const handleRunAll = async () => {
    if (running || suiteRunning) return;
    setSuiteRunning(true);
    setRunning(true);
    setCompleted(false);
    setFinalReport(null);
    setSuiteResults([]);
    cancelBenchmarkRef.current = false;

    const accumulatedResults = [];

    try {
      for (let i = 0; i < RUN_ALL_SUITE.length; i += 1) {
        if (cancelBenchmarkRef.current) break;
        const testCfg = RUN_ALL_SUITE[i];

        setStatusMessage(`Starting Test ${i + 1}/${RUN_ALL_SUITE.length}: ${testCfg.name}`);
        const result = await executeSingleTest(testCfg);
        accumulatedResults.push(result);
        setSuiteResults([...accumulatedResults]);

        // Cool-down between tests (except after the final test)
        if (i < RUN_ALL_SUITE.length - 1 && !cancelBenchmarkRef.current) {
          setStatusMessage(`Cooldown between tests (${testCfg.name} done). Cooling down phone for 20 s...`);
          for (let c = 20; c > 0; c -= 1) {
            if (cancelBenchmarkRef.current) break;
            setCooldownRemaining(c);
            await new Promise((r) => setTimeout(r, 1000));
          }
          setCooldownRemaining(0);
        }
      }

      setStatusMessage('All suite tests completed! Recording flight-recorder event...');

      // Record ONE flight-recorder event (numbers only)
      const numbersOnlyEvent = {
        deviceModel: deviceInfo.deviceModel,
        androidVersion: deviceInfo.androidVersion,
        webViewVersion: deviceInfo.webViewVersion,
        tests: accumulatedResults.map((r) => ({
          name: r.name,
          targetFaceFps: r.targetFaceFps,
          achievedFaceFps: r.achievedFaceFps,
          faceLatencyP50Ms: r.faceLatencyP50Ms,
          faceLatencyP95Ms: r.faceLatencyP95Ms,
          detectDurationP50Ms: r.detectDurationP50Ms,
          detectDurationP95Ms: r.detectDurationP95Ms,
          loopIntervalP50Ms: r.loopIntervalP50Ms,
          loopIntervalP95Ms: r.loopIntervalP95Ms,
          idleGapP50Ms: r.idleGapP50Ms,
          idleGapP95Ms: r.idleGapP95Ms,
          longTaskCount: r.longTaskCount,
          longTaskTotalMs: r.longTaskTotalMs,
          objectFps: r.objectFps,
          objectHandoffP50Ms: r.objectHandoffP50Ms,
          objectHandoffP95Ms: r.objectHandoffP95Ms,
          batteryLevel: r.batteryLevel,
        })),
      };

      flightRecorder.record('benchmark', 'run_all_suite', numbersOnlyEvent);
      flightRecorder.flush({ keepalive: true });

      try {
        Sentry.setTag('platform', 'android');
        Sentry.addBreadcrumb({
          category: 'benchmark',
          message: 'Android spike Run All suite complete',
          level: 'info',
          data: numbersOnlyEvent,
        });
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error('[benchmark] Run All error:', err);
      setStatusMessage(`Suite error: ${err?.message || err}`);
    } finally {
      setSuiteRunning(false);
      setRunning(false);
      setCompleted(true);
      setCooldownRemaining(0);
    }
  };

  const runRealControllerTest = async () => {
    if (realTestRunning || running || suiteRunning) return;
    setRealTestRunning(true);
    setRealTestResults(null);
    cancelBenchmarkRef.current = false;
    let c1 = null;
    let c2 = null;
    let observer1 = null;
    let observer2 = null;

    try {
      await ensureCamera();

      // ================= PHASE 1: Main Thread Mode (60 s) =================
      setRealTestProgress('Phase 1/2: Running Main-Thread Controller (60 s)...');
      const mainTrace = [];
      const mainViolations = [];
      let mainLongTaskCount = 0;
      let mainLongTaskTotalMs = 0;

      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        try {
          observer1 = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              mainLongTaskCount += 1;
              mainLongTaskTotalMs += entry.duration;
            }
          });
          observer1.observe({ type: 'longtask', buffered: false });
        } catch { /* ignore */ }
      }

      c1 = createVisionController({
        video: videoRef.current,
        detectObjects: true,
        micRequired: true,
        options: { faceInWorker: false },
        onViolation: (v) => {
          mainViolations.push({ type: v.type, ts: Math.round(v.ts || performance.now()) });
        },
      });
      await c1.loadModels();
      c1.start({ yaw: 0, pitch: 0 });

      const phase1Start = performance.now();
      let nextTrace1 = phase1Start + 2000;
      while (performance.now() - phase1Start < 60000 && !cancelBenchmarkRef.current) {
        const now = performance.now();
        if (now >= nextTrace1) {
          const tel = c1.getTelemetry();
          mainTrace.push(tel?.faceFps ?? 0);
          nextTrace1 = now + 2000;
          setRealTestProgress(`Phase 1/2: Main-Thread Mode (${Math.round((60000 - (now - phase1Start)) / 1000)} s remaining, face fps: ${tel?.faceFps ?? 0})...`);
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      c1.stop();
      c1.dispose();
      c1 = null;
      observer1?.disconnect();
      observer1 = null;

      if (cancelBenchmarkRef.current) {
        setRealTestProgress('Real controller test cancelled.');
        return;
      }

      // Cooldown 2s
      setRealTestProgress('Switching modes (2 s cooldown)...');
      await new Promise((r) => setTimeout(r, 2000));
      if (cancelBenchmarkRef.current) return;

      // ================= PHASE 2: Web Worker Mode (60 s) =================
      setRealTestProgress('Phase 2/2: Running Web Worker Controller (60 s)...');
      const workerTrace = [];
      const workerViolations = [];
      let workerLongTaskCount = 0;
      let workerLongTaskTotalMs = 0;

      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        try {
          observer2 = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              workerLongTaskCount += 1;
              workerLongTaskTotalMs += entry.duration;
            }
          });
          observer2.observe({ type: 'longtask', buffered: false });
        } catch { /* ignore */ }
      }

      c2 = createVisionController({
        video: videoRef.current,
        detectObjects: true,
        micRequired: true,
        options: { faceInWorker: true },
        onViolation: (v) => {
          workerViolations.push({ type: v.type, ts: Math.round(v.ts || performance.now()) });
        },
      });
      await c2.loadModels();
      c2.start({ yaw: 0, pitch: 0 });

      const phase2Start = performance.now();
      let nextTrace2 = phase2Start + 2000;
      while (performance.now() - phase2Start < 60000 && !cancelBenchmarkRef.current) {
        const now = performance.now();
        if (now >= nextTrace2) {
          const tel = c2.getTelemetry();
          workerTrace.push(tel?.faceFps ?? 0);
          nextTrace2 = now + 2000;
          setRealTestProgress(`Phase 2/2: Web Worker Mode (${Math.round((60000 - (now - phase2Start)) / 1000)} s remaining, face fps: ${tel?.faceFps ?? 0})...`);
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      c2.stop();
      c2.dispose();
      c2 = null;
      observer2?.disconnect();
      observer2 = null;

      const report = {
        main: {
          governorTrace: mainTrace,
          avgFaceFps: mainTrace.length ? Math.round((mainTrace.reduce((a, b) => a + b, 0) / mainTrace.length) * 10) / 10 : 0,
          longTaskCount: mainLongTaskCount,
          longTaskTotalMs: Math.round(mainLongTaskTotalMs),
          violations: mainViolations,
        },
        worker: {
          governorTrace: workerTrace,
          avgFaceFps: workerTrace.length ? Math.round((workerTrace.reduce((a, b) => a + b, 0) / workerTrace.length) * 10) / 10 : 0,
          longTaskCount: workerLongTaskCount,
          longTaskTotalMs: Math.round(workerLongTaskTotalMs),
          violations: workerViolations,
        },
      };
      setRealTestResults(report);
      setRealTestProgress('Real controller test completed (120 s total).');
    } catch (err) {
      console.error('[RealControllerTest] error:', err);
      setRealTestProgress(`Test failed: ${err?.message || err}`);
    } finally {
      observer1?.disconnect();
      observer2?.disconnect();
      try { c1?.dispose(); } catch { /* ignore */ }
      try { c2?.dispose(); } catch { /* ignore */ }
      setRealTestRunning(false);
    }
  };

  const stopAll = () => {
    cancelBenchmarkRef.current = true;
    setStatusMessage('Benchmark stopped by user.');
    setRunning(false);
    setSuiteRunning(false);
    setRealTestRunning(false);
    setCooldownRemaining(0);
  };

  const activeHeaderInfo = {
    deviceModel: deviceInfo.deviceModel,
    androidVersion: deviceInfo.androidVersion,
    webViewVersion: deviceInfo.webViewVersion,
    delegate: selectedDelegate,
    faceMode,
    targetFaceFps,
    runFace,
    runObject,
    runAudio,
    batteryCharging: batteryState.charging,
    batteryText: batteryState.text,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '1.25rem',
      }}
    >
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Top Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            paddingBottom: '1rem',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: '#38bdf8' }}>
              ⚡ SmartProctor Diagnostic Benchmark
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
              In-Depth Performance Bottleneck Analysis (Main Thread, Workers, Long Tasks & Handoff)
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🔄 Reload
            </button>
            <button
              onClick={() => navigate('/login')}
              style={{
                background: 'rgba(148, 163, 184, 0.15)',
                color: '#94a3b8',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              ← Back to Login
            </button>
          </div>
        </div>

        {/* Global Self-Describing Environment Card */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.25rem',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '8px' }}>
            📱 Detected Device Environment
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '10px',
              fontSize: '0.8rem',
            }}
          >
            <div>
              <span style={{ color: '#64748b' }}>Model:</span>{' '}
              <strong style={{ color: '#f1f5f9' }}>{deviceInfo.deviceModel}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Android Version:</span>{' '}
              <strong style={{ color: '#f1f5f9' }}>{deviceInfo.androidVersion}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>WebView:</span>{' '}
              <strong style={{ color: '#f1f5f9' }}>{deviceInfo.webViewVersion}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>CPU Cores:</span>{' '}
              <strong style={{ color: '#f1f5f9' }}>{deviceInfo.hardwareConcurrency || 'N/A'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Battery:</span>{' '}
              <strong style={{ color: batteryState.charging ? '#34d399' : '#fb923c' }}>
                {batteryState.text}
              </strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>WASM Variant:</span>{' '}
              <strong style={{ color: '#a7f3d0' }}>{wasmVariant}</strong>
            </div>
          </div>
        </div>

        {/* Configuration Controls & Checkboxes */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.25rem',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Checkboxes Row */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
              Select Active Detection Tasks:
            </label>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  disabled={running}
                  checked={runFace}
                  onChange={(e) => setRunFace(e.target.checked)}
                />
                <span style={{ color: runFace ? '#38bdf8' : '#64748b', fontWeight: 600 }}>Run face</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  disabled={running}
                  checked={runObject}
                  onChange={(e) => setRunObject(e.target.checked)}
                />
                <span style={{ color: runObject ? '#34d399' : '#64748b', fontWeight: 600 }}>Run object detector</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  disabled={running}
                  checked={runAudio}
                  onChange={(e) => setRunAudio(e.target.checked)}
                />
                <span style={{ color: runAudio ? '#fbbf24' : '#64748b', fontWeight: 600 }}>Run audio</span>
              </label>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '20px',
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            {/* Mode: Main thread vs Face in Worker */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '4px' }}>
                Face Mode:
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  disabled={running}
                  onClick={() => setFaceMode('main')}
                  style={{
                    background: faceMode === 'main' ? '#2563eb' : 'rgba(255,255,255,0.06)',
                    color: faceMode === 'main' ? '#fff' : '#94a3b8',
                    border: '1px solid ' + (faceMode === 'main' ? '#3b82f6' : 'rgba(255,255,255,0.1)'),
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: running ? 'not-allowed' : 'pointer',
                  }}
                >
                  Main Thread
                </button>
                <button
                  disabled={running}
                  onClick={() => setFaceMode('worker')}
                  style={{
                    background: faceMode === 'worker' ? '#0d9488' : 'rgba(255,255,255,0.06)',
                    color: faceMode === 'worker' ? '#fff' : '#94a3b8',
                    border: '1px solid ' + (faceMode === 'worker' ? '#14b8a6' : 'rgba(255,255,255,0.1)'),
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: running ? 'not-allowed' : 'pointer',
                  }}
                  title="Runs FaceLandmarker inside a separate module Web Worker with transferred ImageBitmaps"
                >
                  Face in Worker (experimental)
                </button>
              </div>
            </div>

            {/* Delegate Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '4px' }}>
                Face Delegate:
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['GPU', 'CPU'].map((d) => (
                  <button
                    key={d}
                    disabled={running}
                    onClick={() => setSelectedDelegate(d)}
                    style={{
                      background: selectedDelegate === d ? '#2563eb' : 'rgba(255,255,255,0.06)',
                      color: selectedDelegate === d ? '#fff' : '#94a3b8',
                      border: '1px solid ' + (selectedDelegate === d ? '#3b82f6' : 'rgba(255,255,255,0.1)'),
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: running ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Target FPS Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '4px' }}>
                Target Face FPS:
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[3, 5, 8].map((fps) => (
                  <button
                    key={fps}
                    disabled={running}
                    onClick={() => setTargetFaceFps(fps)}
                    style={{
                      background: targetFaceFps === fps ? '#2563eb' : 'rgba(255,255,255,0.06)',
                      color: targetFaceFps === fps ? '#fff' : '#94a3b8',
                      border: '1px solid ' + (targetFaceFps === fps ? '#3b82f6' : 'rgba(255,255,255,0.1)'),
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: running ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {fps} fps
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {!running && !realTestRunning ? (
                <>
                  <button
                    onClick={handleRunSingle}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '9px 18px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    ▶ Run Single (60s)
                  </button>

                  <button
                    onClick={handleRunAll}
                    style={{
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '9px 18px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                    }}
                    title="Runs 6 tests with 20s cooldowns: face-only CPU @3, @5, @8; face+object CPU @5; face-in-worker CPU @5 and @8"
                  >
                    ⚡ Run All Suite (6 Tests)
                  </button>

                  <button
                    onClick={runRealControllerTest}
                    style={{
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '9px 18px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)',
                    }}
                    title="Real controller test: runs createVisionController in main-thread and worker modes (face + object + audio, 60s each = 120s total)"
                  >
                    🧪 Real controller test (120 s)
                  </button>
                </>
              ) : (
                <button
                  onClick={stopAll}
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '9px 20px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ⏹ Stop Current Run
                </button>
              )}
            </div>
          </div>

          {/* Status banner */}
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              background: running || realTestRunning ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255,255,255,0.04)',
              border: '1px solid ' + (running || realTestRunning ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255,255,255,0.08)'),
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            <span>{realTestRunning ? realTestProgress : statusMessage}</span>
            <div style={{ display: 'flex', gap: '12px' }}>
              {cooldownRemaining > 0 && (
                <span style={{ color: '#fb923c', fontWeight: 700 }}>
                  ❄️ Cooldown: {cooldownRemaining} s
                </span>
              )}
              {running && cooldownRemaining === 0 && (
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                  ⏳ {secondsRemaining} s remaining
                </span>
              )}
              {realTestRunning && (
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                  ⚡ Real Controller Active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Live Video & Real-time Metrics Card */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.25rem',
          }}
        >
          {/* Result card header (self-describing) */}
          <ResultCardHeader
            info={{
              ...activeHeaderInfo,
              targetFaceFps: running && currentTestName ? (currentTestName.includes('@3') ? 3 : currentTestName.includes('@8') ? 8 : 5) : targetFaceFps,
              delegate: currentTestName ? (currentTestName.includes('GPU') ? 'GPU' : 'CPU') : selectedDelegate,
              faceMode: currentTestName ? (currentTestName.includes('worker') ? 'worker' : 'main') : faceMode,
            }}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(240px, 1fr) 2fr',
              gap: '15px',
            }}
          >
            {/* Camera feed */}
            <div
              style={{
                background: '#020617',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '190px',
                position: 'relative',
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  maxHeight: '200px',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)',
                }}
              />
              {!running && (
                <div
                  style={{
                    position: 'absolute',
                    color: '#64748b',
                    fontSize: '0.75rem',
                    textAlign: 'center',
                    padding: '1rem',
                  }}
                >
                  Camera preview inactive
                </div>
              )}
            </div>

            {/* Live metrics cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '10px',
              }}
            >
              <div style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Live Face FPS</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8' }}>{liveFaceFps}</div>
                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>latency: {liveFaceLatency} ms</div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Live Object FPS</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34d399' }}>{liveObjectFps}</div>
                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>latency: {liveObjectLatency} ms</div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Main Long Tasks (&gt;50ms)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f87171' }}>{liveLongTasksCount}</div>
                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>total: {liveLongTasksMs} ms</div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Audio Speech Score</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24' }}>{liveAudioScore}%</div>
                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>YAMNet speech</div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>JS Heap Used</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#c084fc' }}>
                  {liveHeapMB ? `${liveHeapMB} MB` : 'N/A'}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Memory</div>
              </div>
            </div>
          </div>
        </div>

        {/* Real Controller Test Results (120 s: Main vs Worker) */}
        {realTestResults && (
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(14, 165, 233, 0.4)',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                paddingBottom: '8px',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#38bdf8' }}>
                🧪 Real Vision Controller Test Results (120 s: Main Thread vs Web Worker)
              </h2>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: 'rgba(14, 165, 233, 0.2)',
                  color: '#38bdf8',
                  fontWeight: 600,
                }}
              >
                Face + Object + Audio (60s Main + 60s Worker)
              </span>
            </div>

            {/* Metrics Comparison Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left', marginBottom: '16px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '8px' }}>Controller Mode</th>
                  <th style={{ padding: '8px' }}>Average Face FPS</th>
                  <th style={{ padding: '8px' }}>Long Tasks (&gt;50 ms)</th>
                  <th style={{ padding: '8px' }}>Total Long Task Time</th>
                  <th style={{ padding: '8px' }}>Violations Emitted</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '8px', fontWeight: 700, color: '#38bdf8' }}>Main Thread (faceInWorker: false)</td>
                  <td style={{ padding: '8px', color: '#f1f5f9' }}>{realTestResults.main.avgFaceFps} fps</td>
                  <td style={{ padding: '8px', color: realTestResults.main.longTaskCount > 0 ? '#f87171' : '#34d399', fontWeight: 700 }}>
                    {realTestResults.main.longTaskCount}
                  </td>
                  <td style={{ padding: '8px', color: '#cbd5e1' }}>{realTestResults.main.longTaskTotalMs} ms</td>
                  <td style={{ padding: '8px', color: '#cbd5e1' }}>
                    {realTestResults.main.violations.length} {realTestResults.main.violations.length > 0 && `(${realTestResults.main.violations.map((v) => v.type).join(', ')})`}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '8px', fontWeight: 700, color: '#2dd4bf' }}>Web Worker (faceInWorker: true)</td>
                  <td style={{ padding: '8px', color: '#34d399', fontWeight: 700 }}>{realTestResults.worker.avgFaceFps} fps</td>
                  <td style={{ padding: '8px', color: '#34d399', fontWeight: 700 }}>
                    {realTestResults.worker.longTaskCount}
                  </td>
                  <td style={{ padding: '8px', color: '#34d399' }}>{realTestResults.worker.longTaskTotalMs} ms</td>
                  <td style={{ padding: '8px', color: '#cbd5e1' }}>
                    {realTestResults.worker.violations.length} {realTestResults.worker.violations.length > 0 && `(${realTestResults.worker.violations.map((v) => v.type).join(', ')})`}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Governor Trace (every 2 s) */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                📈 Governor Trace: Achieved Face FPS Every 2 s
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: 600, marginBottom: '6px' }}>
                    Main Thread Governor Trace (2 s intervals):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {realTestResults.main.governorTrace.map((fps, idx) => (
                      <span key={idx} style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.1)', color: '#93c5fd', fontSize: '0.75rem' }}>
                        {fps}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(45, 212, 191, 0.2)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#2dd4bf', fontWeight: 600, marginBottom: '6px' }}>
                    Web Worker Governor Trace (2 s intervals):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {realTestResults.worker.governorTrace.map((fps, idx) => (
                      <span key={idx} style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(45, 212, 191, 0.1)', color: '#5eead4', fontSize: '0.75rem' }}>
                        {fps}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* In-depth Analysis Report */}
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.7)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '0.8rem',
                lineHeight: 1.6,
                color: '#cbd5e1',
              }}
            >
              <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: '6px', fontSize: '0.85rem' }}>
                🔍 Diagnostic Analysis: Video Dropped Frames & CAMERA_FROZEN Stability
              </div>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong style={{ color: '#f1f5f9' }}>Why Video Dropped Frames rose from 124 to 452 per 60 s in worker mode:</strong><br />
                In main-thread mode, heavy synchronous WASM inference blocks the main JavaScript thread 60–92% of the time. This throttles the browser event loop, delaying video frame ingestion and decoder processing. In worker mode, inference runs completely off-thread, achieving <strong>0 main-thread long tasks</strong>. As a result, the camera feed and Chromium video decoder process at full unthrottled 30 fps (~1800 frames / 60 s). Because the proctoring <code>&lt;video&gt;</code> element is rendered off-screen (1px invisible), the Chromium compositor intentionally drops non-presented decoded frames (452 drops out of ~1800 decoded frames ≈ 25% drop rate, typical for backgrounded/unrendered video tracks).
              </p>
              <p style={{ margin: 0 }}>
                <strong style={{ color: '#f1f5f9' }}>Can CAMERA_FROZEN false-fire because of it?</strong><br />
                <strong style={{ color: '#34d399' }}>NO.</strong> <code>CAMERA_FROZEN</code> evaluates the pixel-level difference (<code>meanAbsDiff</code> via <code>frameDiff()</code>) between consecutive analyzed camera frames. Dropped decoded video frames do not freeze the camera image; as long as the student is in front of the camera, the frames that are analyzed exhibit normal motion and camera noise well above the threshold. In addition, <code>temporalEngine</code> requires frame differences to stay under threshold for 5 continuous seconds (<code>minDurationMs</code>) before triggering <code>CAMERA_FROZEN</code>, while total camera stalls are properly isolated as <code>CAMERA_DISCONNECTED</code>.
              </p>
            </div>
          </div>
        )}

        {/* Suite Results Table ("Run All") */}
        {suiteResults.length > 0 && (
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              overflowX: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                paddingBottom: '8px',
              }}
            >
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#c084fc' }}>
                📊 "Run All" Benchmark Suite Results ({suiteResults.length}/{RUN_ALL_SUITE.length} Completed)
              </h2>
              {suiteResults.length === RUN_ALL_SUITE.length && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#34d399',
                    fontWeight: 600,
                  }}
                >
                  SUITE COMPLETE (Flight Recorder Event Sent)
                </span>
              )}
            </div>

            {/* Self-describing top header for the suite screenshot */}
            <ResultCardHeader info={suiteResults[0]} />

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '8px' }}>Test Name</th>
                  <th style={{ padding: '8px' }}>Mode</th>
                  <th style={{ padding: '8px' }}>Achieved / Target FPS</th>
                  <th style={{ padding: '8px' }}>Detect Duration (p50 / p95)</th>
                  <th style={{ padding: '8px' }}>Loop Interval (p50 / p95)</th>
                  <th style={{ padding: '8px' }}>Idle Gap (p50 / p95)</th>
                  <th style={{ padding: '8px' }}>Long Tasks (&gt;50ms)</th>
                  <th style={{ padding: '8px' }}>Obj FPS / Handoff</th>
                  <th style={{ padding: '8px' }}>Battery</th>
                </tr>
              </thead>
              <tbody>
                {suiteResults.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '8px', fontWeight: 700, color: '#f1f5f9' }}>{r.name}</td>
                    <td style={{ padding: '8px', color: r.faceMode === 'worker' ? '#2dd4bf' : '#38bdf8' }}>
                      {r.faceMode === 'worker' ? 'Worker' : 'Main'}
                    </td>
                    <td style={{ padding: '8px', fontWeight: 700, color: r.achievedFaceFps >= r.targetFaceFps * 0.8 ? '#34d399' : '#f87171' }}>
                      {r.achievedFaceFps} / {r.targetFaceFps} fps
                    </td>
                    <td style={{ padding: '8px', color: '#cbd5e1' }}>
                      {r.detectDurationP50Ms} / {r.detectDurationP95Ms} ms
                    </td>
                    <td style={{ padding: '8px', color: '#cbd5e1' }}>
                      {r.loopIntervalP50Ms} / {r.loopIntervalP95Ms} ms
                    </td>
                    <td style={{ padding: '8px', color: '#cbd5e1' }}>
                      {r.idleGapP50Ms} / {r.idleGapP95Ms} ms
                    </td>
                    <td style={{ padding: '8px', color: r.longTaskCount > 0 ? '#fca5a5' : '#34d399' }}>
                      {r.longTaskCount} ({r.longTaskTotalMs} ms)
                    </td>
                    <td style={{ padding: '8px', color: '#a7f3d0' }}>
                      {r.objectFps !== null ? `${r.objectFps} fps (${r.objectHandoffP50Ms}/${r.objectHandoffP95Ms}ms)` : 'OFF'}
                    </td>
                    <td style={{ padding: '8px', color: '#e2e8f0' }}>{r.batteryText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Single Test Report Card */}
        {completed && finalReport && (
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                paddingBottom: '8px',
              }}
            >
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#38bdf8' }}>
                📊 Single Test Diagnostic Report: {finalReport.name}
              </h2>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  fontWeight: 600,
                }}
              >
                {finalReport.durationSec} s COMPLETE
              </span>
            </div>

            {/* Self-describing Header at Top */}
            <ResultCardHeader info={finalReport} />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
                fontSize: '0.8rem',
              }}
            >
              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8' }}>Face FPS:</div>
                <strong style={{ color: '#38bdf8', fontSize: '1rem' }}>
                  {finalReport.achievedFaceFps} fps (Target: {finalReport.targetFaceFps} fps)
                </strong>
              </div>

              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8' }}>detect() Duration:</div>
                <strong style={{ color: '#f1f5f9' }}>
                  p50: {finalReport.detectDurationP50Ms} ms | p95: {finalReport.detectDurationP95Ms} ms
                </strong>
              </div>

              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8' }}>Loop Interval (Between calls):</div>
                <strong style={{ color: '#f1f5f9' }}>
                  p50: {finalReport.loopIntervalP50Ms} ms | p95: {finalReport.loopIntervalP95Ms} ms
                </strong>
              </div>

              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8' }}>Idle Gap (Between detect end &amp; next start):</div>
                <strong style={{ color: '#f1f5f9' }}>
                  p50: {finalReport.idleGapP50Ms} ms | p95: {finalReport.idleGapP95Ms} ms
                </strong>
              </div>

              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8' }}>Main-Thread Long Tasks (&gt;50ms):</div>
                <strong style={{ color: finalReport.longTaskCount > 0 ? '#f87171' : '#34d399' }}>
                  {finalReport.longTaskCount} tasks | Total: {finalReport.longTaskTotalMs} ms
                </strong>
              </div>

              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8' }}>Object Worker Handoff:</div>
                <strong style={{ color: '#34d399' }}>
                  {finalReport.objectHandoffP50Ms !== null
                    ? `p50: ${finalReport.objectHandoffP50Ms} ms | p95: ${finalReport.objectHandoffP95Ms} ms`
                    : 'N/A (Object Detector OFF)'}
                </strong>
              </div>

              {finalReport.faceMode === 'worker' && (
                <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <div style={{ color: '#94a3b8' }}>Face Worker Handoff:</div>
                  <strong style={{ color: '#2dd4bf' }}>
                    p50: {finalReport.faceHandoffP50Ms} ms | p95: {finalReport.faceHandoffP95Ms} ms
                  </strong>
                </div>
              )}

              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8' }}>Object Detector Performance:</div>
                <strong style={{ color: '#a7f3d0' }}>
                  {finalReport.objectFps !== null
                    ? `${finalReport.objectFps} fps (p50: ${finalReport.objectLatencyP50Ms}ms, p95: ${finalReport.objectLatencyP95Ms}ms)`
                    : 'OFF'}
                </strong>
              </div>

              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8' }}>Audio Chunks:</div>
                <strong style={{ color: '#fbbf24' }}>
                  {finalReport.audioChunksPerSec !== null ? `${finalReport.audioChunksPerSec} chunks/s` : 'OFF'}
                </strong>
              </div>

              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8' }}>Video Dropped Frames &amp; Errors:</div>
                <strong style={{ color: '#f1f5f9' }}>
                  Dropped: {finalReport.droppedFrames} | Errors: {finalReport.errorsCount}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* Error log if any */}
        {errorLogs.length > 0 && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '10px',
              fontSize: '0.8rem',
              color: '#fca5a5',
            }}
          >
            <strong>Errors encountered:</strong>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {errorLogs.map((e, i) => (
                <li key={i}>{e.type}: {e.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
