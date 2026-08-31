import React, { useState, useEffect, useRef, useMemo } from 'react';
import Icon from '../../components/AppIcon';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export default function HeadPoseDiagnosticPage() {
  // --- Refs ---
  const videoRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const animFrameRef = useRef(null);

  // --- State: Camera & Stream ---
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('idle'); // idle | initializing | active | error
  const [cameraError, setCameraError] = useState('');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [cameraStats, setCameraStats] = useState({
    readyState: 0,
    currentTime: 0,
    framesAdvancing: false,
    trackState: 'none',
    trackSettings: {},
  });

  // --- State: Detection Loop ---
  const [detectionRunning, setDetectionRunning] = useState(false);
  const [detectionIntervalMs, setDetectionIntervalMs] = useState(1000); // 1000ms or 3000ms
  const [simulationMode, setSimulationMode] = useState('continuous'); // continuous | live_simulation (3s + frame skip)
  const [simFrameCount, setSimFrameCount] = useState(0);

  // --- State: Inference & Diagnostics ---
  const [latestReport, setLatestReport] = useState(null);
  const [envDiagnostics, setEnvDiagnostics] = useState(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);
  const latestReportRef = useRef(null);

  // --- State: Telemetry Ring Buffer ---
  const [ringBuffer, setRingBuffer] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('ALL');

  // --- State: Browser & Runtime Specs ---
  const [runtimeInfo, setRuntimeInfo] = useState({});

  // --- State: Test Checklist (Phase 5) ---
  const [testsStatus, setTestsStatus] = useState({
    test1_center: { passed: false, text: 'Look directly at camera (Center pose)' },
    test2_left: { passed: false, text: 'Turn head left (Yaw < -10°)' },
    test3_right: { passed: false, text: 'Turn head right (Yaw > 10°)' },
    test4_up: { passed: false, text: 'Look up (Pitch > 20°)' },
    test5_down: { passed: false, text: 'Look down (Pitch < -10°)' },
    test6_close: { passed: false, text: 'Move closer to camera' },
    test7_far: { passed: false, text: 'Move farther from camera' },
    test8_cover: { passed: false, text: 'Temporarily cover face (No face detection)' },
  });

  // --- Helper: Structured Logging ---
  const addLog = (stage, event, severity = 'INFO', data = null) => {
    const entry = {
      id: Date.now() + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString() + '.' + String(new Date().getMilliseconds()).padStart(3, '0'),
      stage,
      event,
      severity, // 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'
      data: data ? JSON.parse(JSON.stringify(data)) : null,
    };
    setLogs((prev) => [entry, ...prev.slice(0, 499)]); // Keep last 500 logs
  };

  // --- Collect Browser / Hardware Specs ---
  useEffect(() => {
    const checkWebGL = () => {
      try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
      } catch (e) {
        return false;
      }
    };

    const checkWASM = () => {
      try {
        return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
      } catch (e) {
        return false;
      }
    };

    const checkWebGPU = () => {
      return typeof navigator !== 'undefined' && 'gpu' in navigator;
    };

    const info = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenWidth: window.screen?.width,
      screenHeight: window.screen?.height,
      devicePixelRatio: window.devicePixelRatio,
      webglAvailable: checkWebGL(),
      wasmAvailable: checkWASM(),
      webgpuAvailable: checkWebGPU(),
      apiBase: API_BASE,
    };
    setRuntimeInfo(info);
    addLog('RUNTIME', 'Collected browser and runtime environment information', 'INFO', info);

    // Global Error Listeners (Phase 6)
    const handleGlobalError = (event) => {
      addLog('JAVASCRIPT', `Uncaught error: ${event.message}`, 'ERROR', {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error ? String(event.error.stack || event.error) : null,
      });
    };

    const handleUnhandledRejection = (event) => {
      addLog('PROMISE', `Unhandled Promise Rejection: ${event.reason}`, 'ERROR', {
        reason: event.reason ? String(event.reason.stack || event.reason) : null,
      });
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Fetch AI Worker Backend Env Diagnostics
    fetchBackendEnv();

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const fetchBackendEnv = async () => {
    setEnvLoading(true);
    try {
      addLog('BACKEND', 'Fetching AI worker environment diagnostics...', 'INFO');
      const res = await fetch(`${API_BASE}/ai/diagnostics/env`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      setEnvDiagnostics(data);
      addLog('BACKEND', 'AI worker environment diagnostics received', 'SUCCESS', data);
    } catch (err) {
      addLog('BACKEND', `Failed to fetch backend env diagnostics: ${err.message}`, 'ERROR', { error: err.message });
    } finally {
      setEnvLoading(false);
    }
  };

  // --- Camera Management ---
  const startCamera = async () => {
    try {
      setCameraStatus('initializing');
      setCameraError('');
      addLog('CAMERA', 'Requesting camera stream via getUserMedia({ video: true })...', 'INFO');

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      const settings = track ? track.getSettings() : {};
      setSelectedDevice(track ? track.label : 'Default Camera');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch((e) => addLog('CAMERA', `Video play error: ${e.message}`, 'WARN'));
      }

      setCameraActive(true);
      setCameraStatus('active');
      addLog('CAMERA', 'Camera stream initialized and playing', 'SUCCESS', {
        deviceLabel: track ? track.label : 'Unknown',
        trackSettings: settings,
      });
    } catch (err) {
      setCameraStatus('error');
      setCameraError(err.message || 'Camera permission denied or device busy');
      addLog('CAMERA', `Camera initialization failed: ${err.name} - ${err.message}`, 'ERROR', {
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
    }
  };

  const stopCamera = () => {
    stopDetection();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraStatus('idle');
    addLog('CAMERA', 'Camera stream stopped', 'INFO');
  };

  // Camera frame monitor loop
  useEffect(() => {
    let lastTime = 0;
    const monitor = () => {
      if (videoRef.current && cameraActive) {
        const v = videoRef.current;
        const track = streamRef.current?.getVideoTracks()?.[0];
        setVideoDimensions({ width: v.videoWidth, height: v.videoHeight });
        setCameraStats({
          readyState: v.readyState,
          currentTime: v.currentTime,
          framesAdvancing: v.currentTime > lastTime,
          trackState: track ? track.readyState : 'none',
          trackSettings: track ? track.getSettings() : {},
        });
        lastTime = v.currentTime;
      }
      animFrameRef.current = requestAnimationFrame(monitor);
    };
    animFrameRef.current = requestAnimationFrame(monitor);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [cameraActive]);

  // --- Snapshot & Inference Execution ---
  const captureAndDiagnose = async () => {
    if (!videoRef.current || !captureCanvasRef.current) return;
    if (isProcessingRef.current) return;

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    const captureStartTime = performance.now();

    try {
      // 1. Draw video to off-screen canvas (matching SecurityMonitor.jsx)
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 2. Encode to Base64 JPEG (matching SecurityMonitor.jsx)
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
      const encodingDurationMs = Math.round(performance.now() - captureStartTime);

      // 3. Send payload to Backend / AI Worker
      const apiStartTime = performance.now();
      const payload = {
        image: imageBase64,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(`${API_BASE}/ai/diagnostics/headpose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const networkLatencyMs = Math.round(performance.now() - apiStartTime);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error HTTP ${response.status}: ${errorText}`);
      }

      const report = await response.json();
      setLatestReport(report);
      latestReportRef.current = report;

      const isHealthy = Boolean(report.is_healthy);
      const failureStage = report.failure_stage;
      const prodOut = report.production_output || {};
      const poseCalc = report.stages?.pose_calculation || {};
      const angles = poseCalc.angles || {};

      // 4. Update Telemetry Ring Buffer
      const faceBox = report.stages?.face_detection?.face_boxes?.[0] || null;
      const ringEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        networkLatencyMs,
        totalDurationMs: report.total_duration_ms || networkLatencyMs,
        isHealthy,
        failureStage,
        direction: prodOut.direction || 'center',
        lookingAway: prodOut.looking_away || false,
        confidence: prodOut.confidence || 0.0,
        pitch: angles.pitch ?? 0,
        yaw: angles.yaw ?? 0,
        roll: angles.roll ?? 0,
        facesCount: report.stages?.face_detection?.face_count || 0,
        landmarksCount: report.stages?.face_mesh?.landmarks_count || 0,
        faceBox,
      };

      setRingBuffer((prev) => [ringEntry, ...prev.slice(0, 49)]);

      // 5. Evaluate Phase 5 Checklist Automatic Triggers
      evaluateChecklist(ringEntry);

      // 6. Log results
      const logSeverity = isHealthy ? (prodOut.looking_away ? 'WARN' : 'SUCCESS') : 'ERROR';
      addLog(
        'INFERENCE',
        `Diagnostic Inference: ${isHealthy ? 'HEALTHY' : 'FAILED (' + (failureStage || 'UNKNOWN') + ')'} | Dir: ${prodOut.direction || 'N/A'} (Yaw: ${angles.yaw != null ? angles.yaw.toFixed(1) : 0}°, Pitch: ${angles.pitch != null ? angles.pitch.toFixed(1) : 0}°)`,
        logSeverity,
        {
          networkLatencyMs,
          totalDurationMs: report.total_duration_ms,
          reportSummary: report.summary,
          stages: report.stages,
          productionOutput: prodOut,
          temporalOutput: report.temporal_output,
        }
      );

      // 7. Render Visual Overlay
      renderOverlay(report, canvas.width, canvas.height);
    } catch (err) {
      addLog('INFERENCE', `Inference request failed: ${err.message}`, 'ERROR', {
        error: err.message,
        stack: err.stack,
      });
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      setSimFrameCount((prev) => prev + 1);
    }
  };


  // --- Checklist Evaluation ---
  const evaluateChecklist = (entry) => {
    setTestsStatus((prev) => {
      const next = { ...prev };
      // Test 1: Center
      if (entry.isHealthy && Math.abs(entry.yaw) < 8 && Math.abs(entry.pitch) < 8) {
        next.test1_center = { ...next.test1_center, passed: true };
      }
      // Test 2: Left
      if (entry.yaw < -10 || entry.direction === 'left') {
        next.test2_left = { ...next.test2_left, passed: true };
      }
      // Test 3: Right
      if (entry.yaw > 10 || entry.direction === 'right') {
        next.test3_right = { ...next.test3_right, passed: true };
      }
      // Test 4: Up (Trigger at pitch > 6° or < -6° or direction 'up')
      if (entry.pitch > 6 || entry.pitch < -6 || entry.direction === 'up') {
        next.test4_up = { ...next.test4_up, passed: true };
      }
      // Test 5: Down (Trigger at pitch < -6° or > 8° or direction 'down')
      if (entry.pitch < -6 || entry.pitch > 8 || entry.direction === 'down') {
        next.test5_down = { ...next.test5_down, passed: true };
      }

      // Test 6: Move closer to camera (bounding box width > 30% of frame)
      if (entry.faceBox && (entry.faceBox.width > 0.30 || entry.faceBox.height > 0.35)) {
        next.test6_close = { ...next.test6_close, passed: true };
      }
      // Test 7: Move farther from camera (bounding box width < 22% of frame)
      if (entry.faceBox && (entry.faceBox.width < 0.22 && entry.faceBox.height < 0.28)) {
        next.test7_far = { ...next.test7_far, passed: true };
      }
      // Test 8: Cover face
      if (entry.facesCount === 0 || entry.failureStage === 'FACE_NOT_FOUND') {
        next.test8_cover = { ...next.test8_cover, passed: true };
      }
      return next;
    });
  };


  // --- Visual Overlay Renderer (Phase 4) ---
  const renderOverlay = (report, videoW, videoH) => {
    if (!overlayCanvasRef.current) return;
    const canvas = overlayCanvasRef.current;
    canvas.width = videoW;
    canvas.height = videoH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const stages = report.stages || {};
    const faceDetection = stages.face_detection || {};
    const faceMesh = stages.face_mesh || {};
    const poseCalc = stages.pose_calculation || {};
    const prodOut = report.production_output || {};

    // 1. Draw Face Bounding Boxes
    const faceBoxes = faceDetection.face_boxes || [];
    faceBoxes.forEach((box) => {
      ctx.strokeStyle = report.is_healthy ? '#10B981' : '#EF4444';
      ctx.lineWidth = 3;
      ctx.strokeRect(box.xmin * videoW, box.ymin * videoH, box.width * videoW, box.height * videoH);

      ctx.fillStyle = report.is_healthy ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(box.xmin * videoW, box.ymin * videoH, box.width * videoW, box.height * videoH);
    });

    // 2. Draw Keypoints / Landmarks
    const keypoints2D = faceMesh.keypoints_2d || [];
    keypoints2D.forEach((pt, idx) => {
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 5, 0, 2 * Math.PI);
      ctx.fillStyle = idx === 0 ? '#EC4899' : '#3B82F6'; // Pink for nose tip
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // 3. Draw Pose Direction / Vector Overlay
    const angles = poseCalc.angles || {};
    const yaw = angles.yaw ?? 0;
    const pitch = angles.pitch ?? 0;
    const roll = angles.roll ?? 0;

    // Center nose or mid canvas
    const centerX = keypoints2D[0] ? keypoints2D[0][0] : videoW / 2;
    const centerY = keypoints2D[0] ? keypoints2D[0][1] : videoH / 2;

    if (poseCalc.solve_pnp_success) {
      const vectorLength = 80;
      const targetX = centerX + yaw * 3;
      const targetY = centerY - pitch * 3;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(targetX, targetY);
      ctx.strokeStyle = prodOut.looking_away ? '#EF4444' : '#10B981';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(targetX, targetY, 6, 0, 2 * Math.PI);
      ctx.fillStyle = prodOut.looking_away ? '#EF4444' : '#10B981';
      ctx.fill();
    }

    // 4. Draw Telemetry HUD on Canvas
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(12, 12, 340, 145);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, 340, 145);

    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillStyle = report.is_healthy ? (prodOut.looking_away ? '#F59E0B' : '#10B981') : '#EF4444';
    ctx.fillText(`STATUS: ${report.is_healthy ? (prodOut.looking_away ? 'LOOKING AWAY' : 'CENTER POSE (OK)') : (report.failure_stage || 'ERROR')}`, 24, 34);

    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(`Yaw: ${yaw.toFixed(1)}° | Pitch: ${pitch.toFixed(1)}° | Roll: ${roll.toFixed(1)}°`, 24, 56);
    ctx.fillText(`Direction: ${prodOut.direction || 'none'} | Looking Away: ${String(prodOut.looking_away || false)}`, 24, 76);
    ctx.fillText(`Faces: ${faceDetection.face_count || 0} | Keypoints: ${keypoints2D.length}/6`, 24, 96);
    ctx.fillText(`EAR: ${(faceMesh.ear_metrics?.avg_ear || 0).toFixed(3)} | Blink: ${String(faceMesh.ear_metrics?.is_blinking || false)}`, 24, 116);
    ctx.fillText(`Latency: ${report.total_duration_ms || 0}ms | Model: ${stages.model_availability?.face_mesh_loaded ? 'FaceMesh Loaded' : 'UNAVAILABLE'}`, 24, 136);
  };

  // --- Detection Controls ---
  const startDetection = () => {
    if (!cameraActive) {
      addLog('DETECTION', 'Cannot start detection: camera is not active', 'WARN');
      return;
    }
    setDetectionRunning(true);
    addLog('DETECTION', `Detection loop started (interval: ${detectionIntervalMs}ms, mode: ${simulationMode})`, 'INFO');
  };

  const stopDetection = () => {
    setDetectionRunning(false);
    addLog('DETECTION', 'Detection loop stopped', 'INFO');
  };

  useEffect(() => {
    if (!detectionRunning || !cameraActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    captureAndDiagnose();
    intervalRef.current = setInterval(() => {
      captureAndDiagnose();
    }, detectionIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [detectionRunning, detectionIntervalMs, cameraActive]);


  // --- Aggregated Ring Buffer Statistics ---
  const aggregateStats = useMemo(() => {
    if (ringBuffer.length === 0) {
      return { total: 0, avgLatency: 0, minLatency: 0, maxLatency: 0, healthyPercent: 0, lookingAwayCount: 0 };
    }
    const total = ringBuffer.length;
    const latencies = ringBuffer.map((r) => r.totalDurationMs);
    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / total);
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const healthyCount = ringBuffer.filter((r) => r.isHealthy).length;
    const healthyPercent = Math.round((healthyCount / total) * 100);
    const lookingAwayCount = ringBuffer.filter((r) => r.lookingAway).length;

    return { total, avgLatency, minLatency, maxLatency, healthyPercent, lookingAwayCount };
  }, [ringBuffer]);

  // --- Export & Download Logs (Phase 3) ---
  const handleCopyLogs = () => {
    const jsonStr = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        runtimeInfo,
        envDiagnostics,
        aggregateStats,
        testsStatus,
        recentFramesRingBuffer: ringBuffer,
        logs,
      },
      null,
      2
    );
    navigator.clipboard.writeText(jsonStr);
    addLog('LOGS', 'Diagnostic logs copied to clipboard', 'SUCCESS');
    alert('All diagnostic logs copied to clipboard!');
  };

  const handleDownloadLogs = () => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      runtimeInfo,
      envDiagnostics,
      aggregateStats,
      testsStatus,
      recentFramesRingBuffer: ringBuffer,
      logs,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartproctor_headpose_diagnostics_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog('LOGS', `Diagnostic logs downloaded as ${a.download}`, 'SUCCESS');
  };

  const handleClearLogs = () => {
    setLogs([]);
    setRingBuffer([]);
    addLog('LOGS', 'Logs and telemetry ring-buffer cleared', 'INFO');
  };

  const filteredLogs = useMemo(() => {
    if (logFilter === 'ALL') return logs;
    return logs.filter((l) => l.severity === logFilter);
  }, [logs, logFilter]);

  // Determine active pipeline stage statuses
  const currentModelStatus = envDiagnostics?.mediapipe?.face_mesh_loaded ? 'SUCCESS' : 'ERROR';
  const currentFaceStatus = latestReport?.stages?.face_detection?.success ? 'SUCCESS' : (latestReport ? 'ERROR' : 'IDLE');
  const currentLandmarkStatus = latestReport?.stages?.face_mesh?.executed && latestReport?.stages?.face_mesh?.landmarks_count > 0 ? 'SUCCESS' : (latestReport ? 'ERROR' : 'IDLE');
  const currentPoseStatus = latestReport?.stages?.pose_calculation?.solve_pnp_success ? 'SUCCESS' : (latestReport ? 'ERROR' : 'IDLE');

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 font-sans">
      {/* Hidden Offscreen Capture Canvas */}
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* Header */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-border gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded bg-primary/10 text-primary border border-primary/20">
              Debug & Diagnostic Tool
            </span>
            <span className="text-xs text-muted-foreground">SmartProctor Live Proctoring Diagnostic Probe</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground mt-1">
            Head-Pose Detection Diagnostic Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time stage-by-stage instrumentation of the live head-pose pipeline (Camera → Frame → API → FaceMesh → SolvePnP → Angles → Temporal Engine).
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={fetchBackendEnv}
            disabled={envLoading}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground flex items-center gap-1.5 transition-colors"
          >
            <Icon name="RefreshCw" size={14} className={envLoading ? 'animate-spin' : ''} />
            Check Backend Env
          </button>
          <button
            onClick={handleCopyLogs}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground flex items-center gap-1.5 transition-colors"
          >
            <Icon name="Copy" size={14} />
            Copy JSON Logs
          </button>
          <button
            onClick={handleDownloadLogs}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Icon name="Download" size={14} />
            Export Diagnostic Report
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        
        {/* LEFT COLUMN: Live Camera & Overlay + Controls (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Camera Card */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${cameraActive ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
                <h2 className="text-sm font-semibold text-foreground">Live Camera Feed & Overlay</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {videoDimensions.width}x{videoDimensions.height} @ {cameraStats.framesAdvancing ? 'Active' : 'Static'}
                </span>
              </div>
            </div>

            {/* Video Viewport Container */}
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border border-border/50">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none object-cover"
              />

              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/90 p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
                    <Icon name="Camera" size={24} />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1">Webcam Inactive</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mb-4">
                    Click "Start Camera" below to grant camera access and initialize the live video stream.
                  </p>
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    Start Camera
                  </button>
                </div>
              )}
            </div>

            {/* Camera & Detection Control Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-border">
              {cameraActive ? (
                <button
                  onClick={stopCamera}
                  className="px-3 py-2 bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Icon name="Square" size={14} />
                  Stop Camera
                </button>
              ) : (
                <button
                  onClick={startCamera}
                  className="px-3 py-2 bg-success/10 text-success border border-success/20 hover:bg-success/20 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Icon name="Play" size={14} />
                  Start Camera
                </button>
              )}

              {detectionRunning ? (
                <button
                  onClick={stopDetection}
                  className="px-3 py-2 bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Icon name="Pause" size={14} />
                  Pause Loop
                </button>
              ) : (
                <button
                  onClick={startDetection}
                  disabled={!cameraActive}
                  className="px-3 py-2 bg-primary text-primary-foreground disabled:opacity-50 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Icon name="PlayCircle" size={14} />
                  Start Detection Loop
                </button>
              )}

              <button
                onClick={captureAndDiagnose}
                disabled={!cameraActive || isProcessing}
                className="px-3 py-2 bg-card border border-border hover:bg-muted disabled:opacity-50 text-foreground text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <Icon name="Camera" size={14} className={isProcessing ? 'animate-spin' : ''} />
                Single Frame Step
              </button>

              <select
                value={detectionIntervalMs}
                onChange={(e) => setDetectionIntervalMs(Number(e.target.value))}
                className="px-2 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value={500}>Fast (500ms)</option>
                <option value={1000}>Diagnostic (1000ms)</option>
                <option value={3000}>Live Proctoring (3000ms)</option>
              </select>
            </div>
          </div>

          {/* Pipeline Stage Visualizer */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Icon name="Layers" size={16} className="text-primary" />
              Live Pipeline Stages Status
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Stage 1: Camera */}
              <div className={`p-3 rounded-lg border text-xs flex flex-col justify-between ${
                cameraActive ? 'bg-success/5 border-success/30 text-success' : 'bg-muted/30 border-border text-muted-foreground'
              }`}>
                <div className="font-semibold mb-1">1. Camera Stream</div>
                <div className="text-[11px] opacity-90">{cameraActive ? `${videoDimensions.width}x${videoDimensions.height}` : 'Disconnected'}</div>
                <div className="text-[10px] mt-1 uppercase font-bold">{cameraStatus}</div>
              </div>

              {/* Stage 2: Model Loading */}
              <div className={`p-3 rounded-lg border text-xs flex flex-col justify-between ${
                currentModelStatus === 'SUCCESS' ? 'bg-success/5 border-success/30 text-success' : 'bg-destructive/5 border-destructive/30 text-destructive'
              }`}>
                <div className="font-semibold mb-1">2. MediaPipe FaceMesh</div>
                <div className="text-[11px] opacity-90">{envDiagnostics?.mediapipe?.version ? `v${envDiagnostics.mediapipe.version}` : 'Probing...'}</div>
                <div className="text-[10px] mt-1 uppercase font-bold">{envDiagnostics?.mediapipe?.face_mesh_loaded ? 'Loaded' : 'FAILED'}</div>
              </div>

              {/* Stage 3: Face Detection */}
              <div className={`p-3 rounded-lg border text-xs flex flex-col justify-between ${
                currentFaceStatus === 'SUCCESS' ? 'bg-success/5 border-success/30 text-success' : (currentFaceStatus === 'ERROR' ? 'bg-destructive/5 border-destructive/30 text-destructive' : 'bg-muted/30 border-border text-muted-foreground')
              }`}>
                <div className="font-semibold mb-1">3. Face Detection</div>
                <div className="text-[11px] opacity-90">{latestReport?.stages?.face_detection?.face_count ?? 0} Face(s) Found</div>
                <div className="text-[10px] mt-1 uppercase font-bold">{currentFaceStatus}</div>
              </div>

              {/* Stage 4: SolvePnP & Angles */}
              <div className={`p-3 rounded-lg border text-xs flex flex-col justify-between ${
                currentPoseStatus === 'SUCCESS' ? 'bg-success/5 border-success/30 text-success' : (currentPoseStatus === 'ERROR' ? 'bg-destructive/5 border-destructive/30 text-destructive' : 'bg-muted/30 border-border text-muted-foreground')
              }`}>
                <div className="font-semibold mb-1">4. SolvePnP Angles</div>
                <div className="text-[11px] opacity-90">{latestReport?.stages?.pose_calculation?.solve_pnp_success ? `Yaw: ${latestReport.stages.pose_calculation.angles?.yaw?.toFixed(1)}°` : 'No Pose'}</div>
                <div className="text-[10px] mt-1 uppercase font-bold">{currentPoseStatus}</div>
              </div>
            </div>

            {/* Diagnostic Alert Box */}
            {latestReport && !latestReport.is_healthy && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-xs">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <Icon name="AlertTriangle" size={14} />
                  PIPELINE FAILURE DETECTED AT: {latestReport.failure_stage}
                </div>
                <p className="text-muted-foreground">{latestReport.summary}</p>
              </div>
            )}
          </div>

          {/* Test Checklist (Phase 5) */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Icon name="CheckSquare" size={16} className="text-primary" />
                Diagnostic Test Checklist (Phase 5)
              </h3>
              <span className="text-xs text-muted-foreground">
                {Object.values(testsStatus).filter((t) => t.passed).length}/8 Passed
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {Object.entries(testsStatus).map(([key, item]) => (
                <div
                  key={key}
                  className={`p-2.5 rounded-lg border flex items-center justify-between transition-colors ${
                    item.passed ? 'bg-success/10 border-success/30 text-foreground' : 'bg-muted/20 border-border text-muted-foreground'
                  }`}
                >
                  <span className="font-medium">{item.text}</span>
                  {item.passed ? (
                    <Icon name="CheckCircle" size={16} className="text-success shrink-0" />
                  ) : (
                    <Icon name="Circle" size={16} className="text-muted-foreground shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Real-time Telemetry & Live Logs (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Telemetry Stats Card */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Icon name="Activity" size={16} className="text-primary" />
              Real-Time Telemetry & Ring Buffer
            </h3>

            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
              <div className="p-2.5 bg-muted/30 rounded-lg border border-border">
                <div className="text-xs text-muted-foreground">Avg Latency</div>
                <div className="text-base font-bold text-foreground mt-0.5">{aggregateStats.avgLatency}ms</div>
              </div>
              <div className="p-2.5 bg-muted/30 rounded-lg border border-border">
                <div className="text-xs text-muted-foreground">Healthy Frames</div>
                <div className="text-base font-bold text-foreground mt-0.5">{aggregateStats.healthyPercent}%</div>
              </div>
              <div className="p-2.5 bg-muted/30 rounded-lg border border-border">
                <div className="text-xs text-muted-foreground">Looking Away</div>
                <div className="text-base font-bold text-foreground mt-0.5">{aggregateStats.lookingAwayCount}</div>
              </div>
            </div>

            {/* Raw Pose Values Table */}
            <div className="border border-border rounded-lg overflow-hidden text-xs">
              <div className="bg-muted/50 p-2 font-semibold text-foreground border-b border-border flex justify-between">
                <span>Metric</span>
                <span>Current Value</span>
              </div>
              <div className="divide-y divide-border">
                <div className="p-2 flex justify-between">
                  <span className="text-muted-foreground">Yaw (Horizontal Angle)</span>
                  <span className="font-mono font-medium">
                    {latestReport?.stages?.pose_calculation?.angles?.yaw != null
                      ? `${latestReport.stages.pose_calculation.angles.yaw.toFixed(2)}°`
                      : 'N/A'}
                  </span>
                </div>
                <div className="p-2 flex justify-between">
                  <span className="text-muted-foreground">Pitch (Vertical Angle)</span>
                  <span className="font-mono font-medium">
                    {latestReport?.stages?.pose_calculation?.angles?.pitch != null
                      ? `${latestReport.stages.pose_calculation.angles.pitch.toFixed(2)}°`
                      : 'N/A'}
                  </span>
                </div>
                <div className="p-2 flex justify-between">
                  <span className="text-muted-foreground">Roll (Tilt Angle)</span>
                  <span className="font-mono font-medium">
                    {latestReport?.stages?.pose_calculation?.angles?.roll != null
                      ? `${latestReport.stages.pose_calculation.angles.roll.toFixed(2)}°`
                      : 'N/A'}
                  </span>
                </div>
                <div className="p-2 flex justify-between">
                  <span className="text-muted-foreground">Eye Aspect Ratio (EAR)</span>
                  <span className="font-mono font-medium">
                    {latestReport?.stages?.face_mesh?.ear_metrics?.avg_ear != null
                      ? latestReport.stages.face_mesh.ear_metrics.avg_ear.toFixed(4)
                      : 'N/A'}
                  </span>
                </div>
                <div className="p-2 flex justify-between">
                  <span className="text-muted-foreground">Direction Classification</span>
                  <span className="font-semibold uppercase text-primary">
                    {latestReport?.production_output?.direction || 'N/A'}
                  </span>
                </div>
                <div className="p-2 flex justify-between">
                  <span className="text-muted-foreground">Looking Away Flag</span>
                  <span className={`font-semibold ${latestReport?.production_output?.looking_away ? 'text-destructive' : 'text-success'}`}>
                    {String(latestReport?.production_output?.looking_away ?? false)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Structured Live Logs Terminal */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col flex-1">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
              <div className="flex items-center gap-2">
                <Icon name="Terminal" size={16} className="text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Diagnostic Event Logs</h3>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="px-2 py-1 bg-muted/50 border border-border rounded text-xs text-foreground"
                >
                  <option value="ALL">All ({logs.length})</option>
                  <option value="ERROR">Errors</option>
                  <option value="WARN">Warnings</option>
                  <option value="SUCCESS">Success</option>
                  <option value="INFO">Info</option>
                </select>
                <button
                  onClick={handleClearLogs}
                  title="Clear Logs"
                  className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                >
                  <Icon name="Trash2" size={14} />
                </button>
              </div>
            </div>

            {/* Logs Window */}
            <div className="bg-muted/30 border border-border/60 rounded-lg p-3 h-80 overflow-y-auto font-mono text-[11px] space-y-2">
              {filteredLogs.length === 0 ? (
                <div className="text-muted-foreground text-center py-10">No diagnostic logs recorded yet.</div>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className="border-b border-border/30 pb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-muted-foreground text-[10px]">{log.timeFormatted}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                        log.severity === 'ERROR'
                          ? 'bg-destructive/20 text-destructive'
                          : log.severity === 'WARN'
                          ? 'bg-warning/20 text-warning'
                          : log.severity === 'SUCCESS'
                          ? 'bg-success/20 text-success'
                          : 'bg-primary/20 text-primary'
                      }`}>
                        {log.severity}
                      </span>
                      <span className="text-muted-foreground text-[10px]">[{log.stage}]</span>
                      <span className="text-foreground font-medium">{log.event}</span>
                    </div>
                    {log.data && (
                      <pre className="mt-1 p-1 bg-card/60 rounded text-[10px] text-muted-foreground overflow-x-auto">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Environment & Backend Specs Info */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm text-xs">
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <Icon name="Cpu" size={16} className="text-primary" />
              Runtime Environment Specs
            </h3>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div>Python: <span className="text-foreground font-mono">{envDiagnostics?.python_version?.split(' ')[0] || 'Unknown'}</span></div>
              <div>OpenCV: <span className="text-foreground font-mono">{envDiagnostics?.opencv_version || 'Unknown'}</span></div>
              <div>MediaPipe: <span className="text-foreground font-mono">{envDiagnostics?.mediapipe?.version || 'Unknown'}</span></div>
              <div>FaceMesh Instance: <span className={`font-mono font-bold ${envDiagnostics?.mediapipe?.face_mesh_loaded ? 'text-success' : 'text-destructive'}`}>{envDiagnostics?.mediapipe?.face_mesh_loaded ? 'Ready' : 'None'}</span></div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
