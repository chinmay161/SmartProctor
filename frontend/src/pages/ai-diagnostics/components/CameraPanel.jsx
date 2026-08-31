import React from 'react';
import Icon from '../../../components/AppIcon';

export default function CameraPanel({
  videoRef,
  overlayCanvasRef,
  captureCanvasRef,
  cameraActive,
  cameraStatus,
  cameraError,
  fps,
  videoDimensions,
  isRecording,
  recordedFramesCount,
  onToggleCamera,
  onToggleRecording,
  devices,
  selectedDevice,
  onSelectDevice,
  activeTabTitle
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
      {/* Panel Header */}
      <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${cameraActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="font-semibold text-sm text-slate-200">Webcam Stream & Telemetry HUD</span>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-mono">
            {activeTabTitle}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* FPS Badge */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs font-mono text-emerald-400">
            <Icon name="Activity" className="w-3.5 h-3.5" />
            <span>{fps} FPS</span>
          </div>

          {/* Resolution Badge */}
          {videoDimensions.width > 0 && (
            <div className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs font-mono text-slate-400">
              {videoDimensions.width}×{videoDimensions.height}
            </div>
          )}
        </div>
      </div>

      {/* Video Frame Area */}
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-full object-contain ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
        />
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />
        <canvas ref={captureCanvasRef} className="hidden" />

        {/* Inactive or Error Overlay */}
        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 z-20">
            <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 mb-3">
              <Icon name="CameraOff" className="w-6 h-6" />
            </div>
            <p className="text-slate-300 font-medium text-sm">Webcam Stream Inactive</p>
            <p className="text-slate-500 text-xs mt-1 max-w-sm">
              {cameraError || 'Click Start Camera below to initialize real-time AI pipeline inference.'}
            </p>
            <button
              onClick={onToggleCamera}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg flex items-center gap-2 transition"
            >
              <Icon name="Play" className="w-4 h-4" />
              Start Camera
            </button>
          </div>
        )}

        {/* Recording Banner */}
        {isRecording && (
          <div className="absolute top-3 left-3 bg-rose-500/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 z-20 shadow-lg animate-pulse">
            <span className="w-2 h-2 rounded-full bg-white" />
            Recording ({recordedFramesCount} frames)
          </div>
        )}
      </div>

      {/* Stream Controls Footer */}
      <div className="p-3 bg-slate-950/60 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCamera}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition ${
              cameraActive
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
            }`}
          >
            <Icon name={cameraActive ? 'Square' : 'Play'} className="w-3.5 h-3.5" />
            {cameraActive ? 'Stop Camera' : 'Start Camera'}
          </button>

          <button
            onClick={onToggleRecording}
            disabled={!cameraActive}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition border ${
              isRecording
                ? 'bg-rose-600 text-white border-rose-500 hover:bg-rose-700'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 disabled:opacity-50'
            }`}
          >
            <Icon name="Circle" className="w-3.5 h-3.5" />
            {isRecording ? 'Stop Recording' : 'Record Session'}
          </button>
        </div>

        {/* Camera Device Switcher */}
        {devices.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Icon name="Video" className="w-3.5 h-3.5" />
            <select
              value={selectedDevice || ''}
              onChange={(e) => onSelectDevice(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded px-2 py-1 outline-none"
            >
              {devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
