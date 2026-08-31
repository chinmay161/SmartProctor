import React, { useState, useEffect } from 'react';
import Icon from '../../../components/AppIcon';

export default function TimelineReplay({
  recordedFrames,
  currentIndex,
  onSelectFrame,
  onClearSession,
  onUploadSession
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000); // ms per frame

  useEffect(() => {
    let timer = null;
    if (isPlaying && recordedFrames.length > 0) {
      timer = setInterval(() => {
        onSelectFrame((prev) => (prev + 1) % recordedFrames.length);
      }, playbackSpeed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, recordedFrames.length, playbackSpeed, onSelectFrame]);

  if (recordedFrames.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mb-3">
          <Icon name="Film" className="w-6 h-6" />
        </div>
        <h3 className="text-slate-200 font-semibold text-sm">No Recorded Session In Memory</h3>
        <p className="text-slate-500 text-xs mt-1 max-w-md">
          Start the camera and click <strong>Record Session</strong> to capture frames with full stage telemetry, or upload an exported session JSON below.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <label className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg cursor-pointer border border-slate-700 flex items-center gap-2 transition">
            <Icon name="Upload" className="w-4 h-4" />
            Upload Session JSON
            <input
              type="file"
              accept=".json"
              onChange={onUploadSession}
              className="hidden"
            />
          </label>
        </div>
      </div>
    );
  }

  const currentFrame = recordedFrames[currentIndex] || recordedFrames[0];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
      {/* Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-2 rounded-lg text-white font-semibold transition ${
              isPlaying ? 'bg-amber-600 hover:bg-amber-500' : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            <Icon name={isPlaying ? 'Pause' : 'Play'} className="w-4 h-4" />
          </button>

          <button
            onClick={() => onSelectFrame(Math.max(0, currentIndex - 1))}
            disabled={currentIndex <= 0}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-40 transition"
          >
            <Icon name="SkipBack" className="w-4 h-4" />
          </button>

          <button
            onClick={() => onSelectFrame(Math.min(recordedFrames.length - 1, currentIndex + 1))}
            disabled={currentIndex >= recordedFrames.length - 1}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-40 transition"
          >
            <Icon name="SkipForward" className="w-4 h-4" />
          </button>

          <div className="text-xs font-mono text-slate-300 bg-slate-950 px-3 py-1.5 rounded border border-slate-800">
            Frame <span className="text-indigo-400 font-bold">{currentIndex + 1}</span> / {recordedFrames.length}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>Speed:</span>
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 text-slate-300 rounded px-2 py-1 outline-none"
            >
              <option value={2000}>0.5x (2s)</option>
              <option value={1000}>1x (1s)</option>
              <option value={500}>2x (500ms)</option>
              <option value={250}>4x (250ms)</option>
            </select>
          </div>

          <button
            onClick={onClearSession}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold rounded-lg transition"
          >
            Clear Buffer
          </button>
        </div>
      </div>

      {/* Scrubber Timeline Slider */}
      <div className="space-y-1.5">
        <input
          type="range"
          min={0}
          max={recordedFrames.length - 1}
          value={currentIndex}
          onChange={(e) => onSelectFrame(Number(e.target.value))}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>0s ({recordedFrames[0]?.timestamp?.substring(11, 19)})</span>
          <span>End ({recordedFrames[recordedFrames.length - 1]?.timestamp?.substring(11, 19)})</span>
        </div>
      </div>

      {/* Current Frame Snapshot & Telemetry Inspector */}
      {currentFrame && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Frame Image Preview */}
          <div className="bg-slate-950 rounded-lg p-2 border border-slate-800 flex flex-col items-center justify-center">
            {currentFrame.image_base64 ? (
              <img
                src={currentFrame.image_base64}
                alt={`Frame ${currentIndex + 1}`}
                className="w-full h-auto rounded object-contain max-h-48"
              />
            ) : (
              <div className="h-32 flex items-center justify-center text-slate-600 text-xs font-mono">
                No Raw Image Preview
              </div>
            )}
            <span className="text-[11px] font-mono text-slate-400 mt-2">
              Captured: {currentFrame.timestamp?.substring(11, 23)}
            </span>
          </div>

          {/* Detections & Head Pose Summary */}
          <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 text-xs space-y-2 font-mono">
            <h4 className="text-indigo-400 font-semibold uppercase text-[11px] tracking-wider">
              Inference Outputs
            </h4>
            <div className="flex justify-between text-slate-300">
              <span>Faces Detected:</span>
              <span className="font-bold text-white">{currentFrame.face_detection?.face_count || 0}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Pose Direction:</span>
              <span className="font-bold text-amber-400 uppercase">{currentFrame.head_pose?.direction || 'center'}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Yaw / Pitch:</span>
              <span className="text-white">
                {currentFrame.head_pose?.angles?.yaw || 0}° / {currentFrame.head_pose?.angles?.pitch || 0}°
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Avg EAR (Eyes):</span>
              <span className="text-white">{currentFrame.eye_tracking?.avg_ear || 0}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>MAR (Mouth):</span>
              <span className="text-white">{currentFrame.mouth_detection?.mar || 0}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Phone Detected:</span>
              <span className={currentFrame.phone_detection?.status ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                {currentFrame.phone_detection?.status ? 'TRUE' : 'FALSE'}
              </span>
            </div>
          </div>

          {/* Temporal Engine & Risk Status */}
          <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 text-xs space-y-2 font-mono">
            <h4 className="text-indigo-400 font-semibold uppercase text-[11px] tracking-wider">
              Temporal Engine State
            </h4>
            <div className="flex justify-between text-slate-300">
              <span>Risk Score:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                (currentFrame.temporal_engine?.risk_score || 0) > 30 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
              }`}>
                {currentFrame.temporal_engine?.risk_score || 0} / 100
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Active Violations:</span>
              <span className="font-bold text-white">{currentFrame.temporal_engine?.violations?.length || 0}</span>
            </div>
            {currentFrame.temporal_engine?.violations?.map((v, i) => (
              <div key={i} className="p-1.5 bg-rose-950/40 border border-rose-800/40 rounded text-[11px] text-rose-300">
                <span className="font-bold">{v.type}:</span> {v.reason}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
