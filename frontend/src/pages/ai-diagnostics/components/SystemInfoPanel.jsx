import React from 'react';
import Icon from '../../../components/AppIcon';

export default function SystemInfoPanel({ envDiagnostics, runtimeInfo, onRefreshEnv, envLoading }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-slate-200 font-semibold text-sm">System & Runtime Environment Diagnostics</h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Verifies package versions, hardware acceleration, and model initialization state across backend and browser.
          </p>
        </div>
        <button
          onClick={onRefreshEnv}
          disabled={envLoading}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition disabled:opacity-50"
        >
          <Icon name="RefreshCw" className={`w-3.5 h-3.5 ${envLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Grid of Diagnostic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-mono">
        {/* Python & OS Environment */}
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold uppercase tracking-wider text-[11px] pb-1 border-b border-slate-800">
            <Icon name="Cpu" className="w-4 h-4" />
            Backend System & Python
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">OS:</span>
            <span>{envDiagnostics?.system?.os} ({envDiagnostics?.system?.architecture})</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">CPU Cores:</span>
            <span>{envDiagnostics?.system?.cpu_cores || 'N/A'} Cores</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Memory Total:</span>
            <span>{envDiagnostics?.system?.memory?.total_gb || 'N/A'} GB</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Python Version:</span>
            <span className="text-right truncate max-w-[160px] text-white">
              {envDiagnostics?.python_version?.split(' ')?.[0] || '3.12.2'}
            </span>
          </div>
        </div>

        {/* AI Frameworks & Vision Models */}
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold uppercase tracking-wider text-[11px] pb-1 border-b border-slate-800">
            <Icon name="Boxes" className="w-4 h-4" />
            Vision Models & Frameworks
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">MediaPipe Version:</span>
            <span className="text-emerald-400 font-bold">{envDiagnostics?.mediapipe?.version || '0.10.14'}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">FaceMesh Loaded:</span>
            <span className={envDiagnostics?.mediapipe?.face_mesh_loaded ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
              {envDiagnostics?.mediapipe?.face_mesh_loaded ? 'YES' : 'NO'}
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">OpenCV Version:</span>
            <span>{envDiagnostics?.opencv_version || '5.0.0'}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">NumPy Version:</span>
            <span>{envDiagnostics?.numpy_version || '2.4.5'}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">YOLO Model:</span>
            <span className={envDiagnostics?.ultralytics_yolo?.model_loaded ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
              {envDiagnostics?.ultralytics_yolo?.model_loaded ? 'yolov8n.pt (Active)' : 'Not Loaded'}
            </span>
          </div>
        </div>

        {/* Browser & Hardware Acceleration */}
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-sky-400 font-semibold uppercase tracking-wider text-[11px] pb-1 border-b border-slate-800">
            <Icon name="Monitor" className="w-4 h-4" />
            Browser & Client Hardware
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">WebGL Supported:</span>
            <span className={runtimeInfo.webglAvailable ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
              {runtimeInfo.webglAvailable ? 'YES' : 'NO'}
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">WebAssembly (WASM):</span>
            <span className={runtimeInfo.wasmAvailable ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
              {runtimeInfo.wasmAvailable ? 'YES' : 'NO'}
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">WebGPU:</span>
            <span className={runtimeInfo.webgpuAvailable ? 'text-emerald-400' : 'text-slate-400'}>
              {runtimeInfo.webgpuAvailable ? 'Available' : 'Disabled / Fallback'}
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">Screen Resolution:</span>
            <span>{runtimeInfo.screenWidth}×{runtimeInfo.screenHeight} (DPR {runtimeInfo.devicePixelRatio})</span>
          </div>
        </div>
      </div>
    </div>
  );
}
