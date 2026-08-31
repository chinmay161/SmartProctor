import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Icon from '../../components/AppIcon';
import { MODULE_TABS, MODULE_VALIDATIONS, drawCanvasOverlay } from './modules/definitions';
import CameraPanel from './components/CameraPanel';
import TimelineReplay from './components/TimelineReplay';
import PerformanceProfiler from './components/PerformanceProfiler';
import SystemInfoPanel from './components/SystemInfoPanel';
import LogsConsole from './components/LogsConsole';
import ExportModal from './components/ExportModal';
import ValidationChecklist from './components/ValidationChecklist';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export default function AIDiagnosticsDashboard() {
  // --- Navigation Tab ---
  const [activeTab, setActiveTab] = useState('overview');

  // --- Camera & Stream State ---
  const videoRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const isProcessingRef = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [videoDimensions, setVideoDimensions] = useState({ width: 640, height: 480 });
  const [fps, setFps] = useState(0);

  // --- Session Recording & Replay ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFrames, setRecordedFrames] = useState([]);
  const [replayIndex, setReplayIndex] = useState(0);

  // --- Pipeline Context & Telemetry ---
  const [latestContext, setLatestContext] = useState(null);
  const [envDiagnostics, setEnvDiagnostics] = useState(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [detectionIntervalMs, setDetectionIntervalMs] = useState(1000);

  // --- Performance Profiler Timings ---
  const [latestTimings, setLatestTimings] = useState(null);
  const [timingsBuffer, setTimingsBuffer] = useState([]);
  const [performanceStats, setPerformanceStats] = useState({
    avgLatency: 0,
    minLatency: 0,
    maxLatency: 0,
    stdDev: 0,
    fps: 0
  });

  // --- Logs & Validation Battery State ---
  const [logs, setLogs] = useState([]);
  const [validationsState, setValidationsState] = useState(() => {
    const init = {};
    Object.keys(MODULE_VALIDATIONS).forEach((k) => {
      init[k] = MODULE_VALIDATIONS[k].map((t) => ({ ...t, passed: false }));
    });
    return init;
  });

  // --- Export Modal ---
  const [isExportOpen, setIsExportOpen] = useState(false);

  // --- Hardware / Browser Specs ---
  const [runtimeInfo, setRuntimeInfo] = useState({});

  const addLog = useCallback((stage, event, severity = 'INFO', data = null) => {
    const entry = {
      id: Date.now() + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString() + '.' + String(new Date().getMilliseconds()).padStart(3, '0'),
      stage,
      event,
      severity,
      data: data ? JSON.parse(JSON.stringify(data)) : null,
    };
    setLogs((prev) => [entry, ...prev.slice(0, 499)]);
  }, []);

  // --- Initialize Runtime Hardware Specs ---
  useEffect(() => {
    const info = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      devicePixelRatio: window.devicePixelRatio || 1,
      webglAvailable: !!(window.WebGLRenderingContext && document.createElement('canvas').getContext('webgl')),
      wasmAvailable: typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function',
      webgpuAvailable: typeof navigator !== 'undefined' && 'gpu' in navigator,
      apiBase: API_BASE
    };
    setRuntimeInfo(info);
    fetchEnvDiagnostics();
    fetchDevices();
  }, []);

  const fetchEnvDiagnostics = async () => {
    setEnvLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai/diagnostics/env`);
      if (res.ok) {
        const data = await res.json();
        setEnvDiagnostics(data);
        addLog('SYSTEM', 'System environment diagnostics updated', 'SUCCESS', data);
      }
    } catch (e) {
      addLog('SYSTEM', `Failed to fetch environment diagnostics: ${e.message}`, 'ERROR');
    } finally {
      setEnvLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = list.filter((d) => d.kind === 'videoinput');
      setDevices(videoDevs);
      if (videoDevs.length > 0 && !selectedDevice) {
        setSelectedDevice(videoDevs[0].deviceId);
      }
    } catch (e) {
      console.warn('Could not enumerate devices:', e);
    }
  };

  // --- Start / Stop Camera ---
  const startCamera = async (deviceId = selectedDevice) => {
    try {
      setCameraStatus('initializing');
      setCameraError('');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          const w = videoRef.current.videoWidth || 640;
          const h = videoRef.current.videoHeight || 480;
          setVideoDimensions({ width: w, height: h });
          if (overlayCanvasRef.current) {
            overlayCanvasRef.current.width = w;
            overlayCanvasRef.current.height = h;
          }
          if (captureCanvasRef.current) {
            captureCanvasRef.current.width = w;
            captureCanvasRef.current.height = h;
          }
        };
      }

      setCameraActive(true);
      setCameraStatus('active');
      addLog('CAMERA', 'Webcam stream active', 'SUCCESS');
    } catch (err) {
      setCameraActive(false);
      setCameraStatus('error');
      setCameraError(err.message);
      addLog('CAMERA', `Webcam failed: ${err.message}`, 'ERROR');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraStatus('idle');
    addLog('CAMERA', 'Webcam stream stopped', 'INFO');
  };

  const handleToggleCamera = () => {
    if (cameraActive) stopCamera();
    else startCamera();
  };

  // --- Real-time AI Diagnostic Inference Loop ---
  useEffect(() => {
    if (!cameraActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    let frameCount = 0;
    const fpsTimer = setInterval(() => {
      setFps(frameCount);
      frameCount = 0;
    }, 1000);

    const activeModuleDef = MODULE_TABS.find((t) => t.id === activeTab);
    const reqModules = activeModuleDef?.requiredBackend || ['all'];

    intervalRef.current = setInterval(async () => {
      if (isProcessingRef.current) return;
      if (!videoRef.current || videoRef.current.readyState < 2) return;

      isProcessingRef.current = true;
      const tClientStart = performance.now();

      try {
        const v = videoRef.current;
        const canvas = captureCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const tCapture = performance.now();
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const tDraw = performance.now();

        const base64Image = canvas.toDataURL('image/jpeg', 0.82);
        const tEncode = performance.now();

        const response = await fetch(`${API_BASE}/ai/diagnostic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64Image,
            timestamp: new Date().toISOString(),
            modules: reqModules
          })
        });

        const tNetwork = performance.now();

        if (response.ok) {
          const result = await response.json();
          const tJson = performance.now();

          // Render overlay
          if (overlayCanvasRef.current) {
            const overlayCtx = overlayCanvasRef.current.getContext('2d');
            drawCanvasOverlay(overlayCtx, overlayCanvasRef.current.width, overlayCanvasRef.current.height, result, activeTab);
          }
          const tRender = performance.now();

          frameCount += 1;
          setLatestContext(result);

          // Record performance breakdown
          const timingRecord = {
            capture: Math.max(0.1, tCapture - tClientStart),
            canvas_draw: Math.max(0.1, tDraw - tCapture),
            encode: Math.max(0.1, tEncode - tDraw),
            network: Math.max(0.5, tNetwork - tEncode - (result.timings_ms?.total_worker_ms || 0)),
            face_detection: result.timings_ms?.face_detection || 0,
            facemesh: result.timings_ms?.facemesh_and_derived || 0,
            headpose: result.head_pose ? 1.0 : 0,
            yolo: result.timings_ms?.yolo_inference || 0,
            temporal: result.timings_ms?.temporal_engine || 0,
            json_serialize: Math.max(0.1, tJson - tNetwork),
            render: Math.max(0.1, tRender - tJson),
            total: Math.max(1, tRender - tClientStart)
          };
          setLatestTimings(timingRecord);

          setTimingsBuffer((prev) => {
            const next = [timingRecord, ...prev.slice(0, 29)];
            const totals = next.map((t) => t.total);
            const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
            const min = Math.min(...totals);
            const max = Math.max(...totals);
            const variance = totals.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / totals.length;
            const stdDev = Math.sqrt(variance);

            setPerformanceStats({
              avgLatency: Math.round(avg),
              minLatency: Math.round(min),
              maxLatency: Math.round(max),
              stdDev: Math.round(stdDev * 10) / 10,
              fps: Math.round(1000 / Math.max(1, avg))
            });

            return next;
          });

          // Session Recording Buffer
          if (isRecording) {
            setRecordedFrames((prev) => [
              ...prev,
              {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                image_base64: base64Image,
                ...result
              }
            ]);
          }

          // Evaluate validation rules for active tab
          if (MODULE_VALIDATIONS[activeTab]) {
            setValidationsState((prev) => {
              const currentTests = prev[activeTab] || [];
              const updated = currentTests.map((test) => {
                if (test.passed) return test;
                const passedNow = test.test(result);
                return passedNow ? { ...test, passed: true } : test;
              });
              return { ...prev, [activeTab]: updated };
            });
          }

          addLog(
            'INFERENCE',
            `Processed [${result.modules_executed?.join(', ')}] in ${Math.round(timingRecord.total)}ms | Risk: ${result.production_output?.risk_score || 0}`,
            result.is_healthy ? 'SUCCESS' : 'WARN',
            { timings: result.timings_ms, violations: result.production_output?.violations }
          );
        }
      } catch (err) {
        addLog('INFERENCE', `Inference request failed: ${err.message}`, 'ERROR');
      } finally {
        isProcessingRef.current = false;
      }
    }, detectionIntervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(fpsTimer);
    };
  }, [cameraActive, activeTab, detectionIntervalMs, isRecording, addLog]);

  // --- Reset validation battery for tab ---
  const handleResetValidations = (tabId) => {
    if (MODULE_VALIDATIONS[tabId]) {
      setValidationsState((prev) => ({
        ...prev,
        [tabId]: MODULE_VALIDATIONS[tabId].map((t) => ({ ...t, passed: false }))
      }));
      addLog('VALIDATION', `Validation tests reset for module: ${tabId}`, 'INFO');
    }
  };

  // --- Upload session JSON ---
  const handleUploadSession = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const frames = Array.isArray(parsed) ? parsed : parsed.recorded_frames || [parsed];
        setRecordedFrames(frames);
        setReplayIndex(0);
        setActiveTab('replay');
        addLog('SESSION', `Loaded session replay with ${frames.length} frames`, 'SUCCESS');
      } catch (err) {
        addLog('SESSION', `Failed to parse session file: ${err.message}`, 'ERROR');
      }
    };
    reader.readAsText(file);
  };

  const exportPayload = useMemo(() => ({
    exportedAt: new Date().toISOString(),
    runtimeInfo,
    system_info: envDiagnostics,
    performance: {
      stats: performanceStats,
      latestTimings,
      recentBuffer: timingsBuffer
    },
    pipeline: latestContext,
    recorded_frames: recordedFrames,
    validations: validationsState,
    logs
  }), [runtimeInfo, envDiagnostics, performanceStats, latestTimings, timingsBuffer, latestContext, recordedFrames, validationsState, logs]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header Bar */}
      <header className="px-6 py-4 bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-40 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Icon name="Cpu" className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base text-white tracking-tight">SmartProctor AI Observability Platform</h1>
              <span className="text-[10px] uppercase font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
                v2.0 Unified
              </span>
            </div>
            <p className="text-xs text-slate-400">Single-Pass Multi-Module Diagnostic & Telemetry Suite</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Refresh Environment Specs */}
          <button
            onClick={fetchEnvDiagnostics}
            disabled={envLoading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <Icon name="RefreshCw" className={`w-3.5 h-3.5 ${envLoading ? 'animate-spin' : ''}`} />
            Env Status
          </button>

          {/* Export Telemetry */}
          <button
            onClick={() => setIsExportOpen(true)}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 transition"
          >
            <Icon name="Download" className="w-3.5 h-3.5" />
            Export Diagnostics
          </button>
        </div>
      </header>

      {/* Module Navigation Tabs */}
      <nav className="px-6 py-2.5 bg-slate-900 border-b border-slate-800/80 overflow-x-auto flex items-center gap-1.5 scrollbar-thin">
        {MODULE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition ${
                isActive
                  ? 'bg-indigo-600 text-white shadow font-semibold'
                  : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800/50'
              }`}
            >
              <Icon name={tab.icon} className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Main Content Dashboard Grid */}
      <main className="p-6 flex-1 max-w-7xl w-full mx-auto space-y-6">
        {/* Top Split: Live Camera HUD vs Active Module View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Live Camera Stream with Overlay HUD */}
          <div className="lg:col-span-6 space-y-4">
            <CameraPanel
              videoRef={videoRef}
              overlayCanvasRef={overlayCanvasRef}
              captureCanvasRef={captureCanvasRef}
              cameraActive={cameraActive}
              cameraStatus={cameraStatus}
              cameraError={cameraError}
              fps={fps}
              videoDimensions={videoDimensions}
              isRecording={isRecording}
              recordedFramesCount={recordedFrames.length}
              onToggleCamera={handleToggleCamera}
              onToggleRecording={() => setIsRecording(!isRecording)}
              devices={devices}
              selectedDevice={selectedDevice}
              onSelectDevice={(id) => {
                setSelectedDevice(id);
                if (cameraActive) startCamera(id);
              }}
              activeTabTitle={MODULE_TABS.find((t) => t.id === activeTab)?.label || 'Overview'}
            />

            {/* Validation Checklist for Active Tab */}
            <ValidationChecklist
              activeTab={activeTab}
              validationsState={validationsState}
              onResetValidations={handleResetValidations}
            />
          </div>

          {/* Right Column: Active Diagnostic Module Telemetry View */}
          <div className="lg:col-span-6 space-y-4 flex flex-col justify-start">
            {/* View Switcher based on Active Tab */}
            {activeTab === 'overview' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Icon name="LayoutDashboard" className="w-4 h-4 text-indigo-400" />
                    Master Pipeline Stage Health
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                    latestContext?.is_healthy ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {latestContext?.is_healthy ? 'ALL STAGES HEALTHY' : 'DEGRADED / CHECK'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Face Detector:</span>
                      <span className={latestContext?.face_detection?.success ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {latestContext?.face_detection?.face_count || 0} Face(s)
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>468 Mesh:</span>
                      <span className={latestContext?.face_landmarks?.landmarks_count === 468 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {latestContext?.face_landmarks?.landmarks_count || 0} Pts
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Head Pose:</span>
                      <span className="text-amber-400 font-bold uppercase">{latestContext?.head_pose?.direction || 'center'}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Looking Away:</span>
                      <span className={latestContext?.head_pose?.looking_away ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                        {latestContext?.head_pose?.looking_away ? 'TRUE' : 'FALSE'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Avg EAR (Eyes):</span>
                      <span className="text-white font-bold">{latestContext?.eye_tracking?.avg_ear || 0}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Blinking:</span>
                      <span className={latestContext?.blink_detection?.is_blinking ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                        {latestContext?.blink_detection?.is_blinking ? 'PULSE' : 'OPEN'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Mouth MAR:</span>
                      <span className="text-white font-bold">{latestContext?.mouth_detection?.mar || 0}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Speaking:</span>
                      <span className={latestContext?.mouth_detection?.is_talking ? 'text-pink-400 font-bold' : 'text-slate-400'}>
                        {latestContext?.mouth_detection?.is_talking ? 'ACTIVE' : 'QUIET'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>YOLO Objects:</span>
                      <span className="text-white font-bold">{latestContext?.yolo_objects?.total_objects || 0}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Phone Status:</span>
                      <span className={latestContext?.phone_detection?.status ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                        {latestContext?.phone_detection?.status ? 'DETECTED' : 'CLEAR'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Risk Score:</span>
                      <span className={`font-bold ${
                        (latestContext?.temporal_engine?.risk_score || 0) > 30 ? 'text-rose-400' : 'text-emerald-400'
                      }`}>
                        {latestContext?.temporal_engine?.risk_score || 0} / 100
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Violations:</span>
                      <span className="text-white font-bold">{latestContext?.temporal_engine?.violations?.length || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'face' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 text-xs font-mono">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Icon name="ScanFace" className="w-4 h-4 text-indigo-400" />
                  Face Detection Subsystem
                </h3>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span>Face Count:</span>
                    <span className="text-emerald-400 font-bold">{latestContext?.face_detection?.face_count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Stability Score:</span>
                    <span className="text-white">{latestContext?.face_detection?.stability_score || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Face Center Coordinates:</span>
                    <span className="text-white">{JSON.stringify(latestContext?.face_detection?.face_center || [])}</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'landmarks' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 text-xs font-mono">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Icon name="Grid" className="w-4 h-4 text-indigo-400" />
                  MediaPipe 468 Facial Landmarks
                </h3>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span>Extracted Count:</span>
                    <span className="text-emerald-400 font-bold">{latestContext?.face_landmarks?.landmarks_count || 0} / 468</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Missing Count:</span>
                    <span className="text-white">{latestContext?.face_landmarks?.missing_count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Mesh Confidence:</span>
                    <span className="text-emerald-400 font-bold">{Math.round((latestContext?.face_landmarks?.confidence || 0) * 100)}%</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'headpose' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 text-xs font-mono">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Icon name="Compass" className="w-4 h-4 text-indigo-400" />
                  Head Pose & 3D SolvePnP
                </h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Pitch (X)</span>
                    <span className="text-base font-bold text-white mt-1 block">{latestContext?.head_pose?.angles?.pitch || 0}°</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Yaw (Y)</span>
                    <span className="text-base font-bold text-white mt-1 block">{latestContext?.head_pose?.angles?.yaw || 0}°</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Roll (Z)</span>
                    <span className="text-base font-bold text-white mt-1 block">{latestContext?.head_pose?.angles?.roll || 0}°</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1 text-slate-300">
                  <div className="flex justify-between">
                    <span>Orientation Direction:</span>
                    <span className="text-amber-400 font-bold uppercase">{latestContext?.head_pose?.direction || 'center'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SolvePnP Convergence:</span>
                    <span className="text-emerald-400 font-bold">{latestContext?.head_pose?.solve_pnp_success ? 'SUCCESS' : 'FAILED'}</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'eyes' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 text-xs font-mono">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Icon name="Eye" className="w-4 h-4 text-indigo-400" />
                  Eye Tracking & Eye Aspect Ratio (EAR)
                </h3>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span>Left Eye EAR:</span>
                    <span className="text-white font-bold">{latestContext?.eye_tracking?.left_ear || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Right Eye EAR:</span>
                    <span className="text-white font-bold">{latestContext?.eye_tracking?.right_ear || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg EAR:</span>
                    <span className="text-emerald-400 font-bold">{latestContext?.eye_tracking?.avg_ear || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Eye Openness:</span>
                    <span className="text-sky-400 font-bold">{latestContext?.eye_tracking?.openness_pct || 0}%</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'blink' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 text-xs font-mono">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Icon name="EyeOff" className="w-4 h-4 text-indigo-400" />
                  Blink Detection & Liveness Pulse
                </h3>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span>Current EAR:</span>
                    <span className="text-white font-bold">{latestContext?.blink_detection?.ear || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Blink Threshold:</span>
                    <span className="text-slate-400">&lt; {latestContext?.blink_detection?.threshold || 0.20}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Blink State:</span>
                    <span className={`px-2 py-0.5 rounded font-bold ${
                      latestContext?.blink_detection?.is_blinking ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {latestContext?.blink_detection?.is_blinking ? 'BLINK DETECTED' : 'EYES OPEN'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'mouth' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 text-xs font-mono">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Icon name="Mic" className="w-4 h-4 text-indigo-400" />
                  Mouth Detection & Speaking MAR
                </h3>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span>Mouth Aspect Ratio (MAR):</span>
                    <span className="text-white font-bold">{latestContext?.mouth_detection?.mar || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Speaking Threshold:</span>
                    <span className="text-slate-400">&gt;= {latestContext?.mouth_detection?.threshold || 0.40}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Talking State:</span>
                    <span className={`px-2 py-0.5 rounded font-bold ${
                      latestContext?.mouth_detection?.is_talking ? 'bg-pink-500/20 text-pink-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {latestContext?.mouth_detection?.is_talking ? 'SPEAKING / MOUTH OPEN' : 'NEUTRAL / CLOSED'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'objects' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 text-xs font-mono">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Icon name="Boxes" className="w-4 h-4 text-indigo-400" />
                  YOLO General Object Detection
                </h3>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-slate-300 max-h-48 overflow-y-auto">
                  <div className="flex justify-between border-b border-slate-800 pb-1 font-bold text-slate-400">
                    <span>Class</span>
                    <span>Confidence</span>
                  </div>
                  {latestContext?.yolo_objects?.detections?.map((obj, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-white font-semibold">{obj.class_name}</span>
                      <span className="text-emerald-400">{Math.round(obj.confidence * 100)}%</span>
                    </div>
                  ))}
                  {(!latestContext?.yolo_objects?.detections || latestContext.yolo_objects.detections.length === 0) && (
                    <span className="text-slate-600 block text-center py-2">No unauthorized objects in frame</span>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'person' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 text-xs font-mono">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Icon name="Users" className="w-4 h-4 text-indigo-400" />
                  Person Detection & Multi-Student Tracking
                </h3>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span>People Count in Scene:</span>
                    <span className="text-emerald-400 font-bold">{latestContext?.person_detection?.count || 0}</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'phone' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 text-xs font-mono">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Icon name="Smartphone" className="w-4 h-4 text-indigo-400" />
                  Cell Phone Detection & Verification
                </h3>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span>Phone Status:</span>
                    <span className={latestContext?.phone_detection?.status ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                      {latestContext?.phone_detection?.status ? 'PHONE DETECTED' : 'CLEAR'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Confidence Score:</span>
                    <span className="text-white font-bold">{Math.round((latestContext?.phone_detection?.confidence || 0) * 100)}%</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'book' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 text-xs font-mono">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Icon name="BookOpen" className="w-4 h-4 text-indigo-400" />
                  Book & Notes Detection
                </h3>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span>Book Status:</span>
                    <span className={latestContext?.book_detection?.status ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                      {latestContext?.book_detection?.status ? 'BOOK DETECTED' : 'CLEAR'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Confidence Score:</span>
                    <span className="text-white font-bold">{Math.round((latestContext?.book_detection?.confidence || 0) * 100)}%</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'temporal' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 text-xs font-mono">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Icon name="Activity" className="w-4 h-4 text-indigo-400" />
                    Temporal Engine State & Risk Assessment
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    (latestContext?.temporal_engine?.risk_score || 0) > 30 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    Risk: {latestContext?.temporal_engine?.risk_score || 0} / 100
                  </span>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span>Active Sliding Window Length:</span>
                    <span className="text-white font-bold">{latestContext?.temporal_engine?.history_length || 0} frames</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Seconds Since Last Blink:</span>
                    <span className="text-white">{latestContext?.temporal_engine?.last_blink_seconds_ago || 0}s</span>
                  </div>
                </div>

                {/* Active Violations List */}
                <div className="space-y-1.5">
                  <span className="text-slate-400 font-bold block">Triggered Violations:</span>
                  {latestContext?.temporal_engine?.violations?.map((v, i) => (
                    <div key={i} className="p-2 bg-rose-950/40 border border-rose-800/50 rounded-lg text-rose-300 flex flex-col gap-0.5">
                      <div className="flex justify-between font-bold">
                        <span>{v.type}</span>
                        <span>Confidence: {Math.round(v.confidence * 100)}%</span>
                      </div>
                      <p className="text-[11px] text-rose-200/80">{v.reason}</p>
                    </div>
                  ))}
                  {(!latestContext?.temporal_engine?.violations || latestContext.temporal_engine.violations.length === 0) && (
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-500 text-center">
                      No active violations triggered in sliding window
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Performance Profiler Tab */}
            {activeTab === 'profiler' && (
              <PerformanceProfiler
                performanceStats={performanceStats}
                latestTimings={latestTimings}
              />
            )}

            {/* Session Replay Tab */}
            {activeTab === 'replay' && (
              <TimelineReplay
                recordedFrames={recordedFrames}
                currentIndex={replayIndex}
                onSelectFrame={setReplayIndex}
                onClearSession={() => {
                  setRecordedFrames([]);
                  setReplayIndex(0);
                }}
                onUploadSession={handleUploadSession}
              />
            )}

            {/* Logs Console Tab */}
            {activeTab === 'logs' && (
              <LogsConsole logs={logs} onClearLogs={() => setLogs([])} />
            )}

            {/* System Information Tab */}
            {activeTab === 'system' && (
              <SystemInfoPanel
                envDiagnostics={envDiagnostics}
                runtimeInfo={runtimeInfo}
                onRefreshEnv={fetchEnvDiagnostics}
                envLoading={envLoading}
              />
            )}
          </div>
        </div>

        {/* Global Bottom Console / Latency Quick Bar */}
        {activeTab !== 'logs' && activeTab !== 'profiler' && activeTab !== 'system' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-6">
              <PerformanceProfiler
                performanceStats={performanceStats}
                latestTimings={latestTimings}
              />
            </div>
            <div className="md:col-span-6">
              <LogsConsole logs={logs} onClearLogs={() => setLogs([])} />
            </div>
          </div>
        )}
      </main>

      {/* Unified Multi-File Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        exportData={exportPayload}
      />
    </div>
  );
}
