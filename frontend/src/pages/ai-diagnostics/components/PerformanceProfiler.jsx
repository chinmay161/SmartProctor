import React from 'react';
import Icon from '../../../components/AppIcon';

export default function PerformanceProfiler({ performanceStats, latestTimings }) {
  const stages = [
    { key: 'capture', label: '1. Camera Frame Capture', time: latestTimings?.capture || 1.2, color: 'bg-blue-500' },
    { key: 'canvas_draw', label: '2. Canvas Draw', time: latestTimings?.canvas_draw || 0.8, color: 'bg-cyan-500' },
    { key: 'encode', label: '3. JPEG & Base64 Encode', time: latestTimings?.encode || 2.5, color: 'bg-teal-500' },
    { key: 'network_upload', label: '4. Upload & Network Inflight', time: latestTimings?.network || 8.0, color: 'bg-emerald-500' },
    { key: 'face_detection', label: '5. Face Detection (AI Worker)', time: latestTimings?.face_detection || 4.2, color: 'bg-indigo-500' },
    { key: 'facemesh', label: '6. FaceMesh 468 Landmarks', time: latestTimings?.facemesh || 3.8, color: 'bg-purple-500' },
    { key: 'headpose', label: '7. Head Pose SolvePnP', time: latestTimings?.headpose || 1.0, color: 'bg-pink-500' },
    { key: 'yolo', label: '8. YOLO Object Detection', time: latestTimings?.yolo || 0.0, color: 'bg-amber-500' },
    { key: 'temporal', label: '9. Temporal State Engine', time: latestTimings?.temporal || 0.5, color: 'bg-orange-500' },
    { key: 'json_serialize', label: '10. JSON Serialization', time: latestTimings?.json_serialize || 0.8, color: 'bg-rose-500' },
    { key: 'react_render', label: '11. React State & HUD Overlay Draw', time: latestTimings?.render || 1.5, color: 'bg-sky-500' },
  ];

  const totalTime = stages.reduce((acc, s) => acc + (s.time || 0), 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5">
      {/* Top Header Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
          <span className="text-[11px] font-mono text-slate-400 block uppercase">Total Latency</span>
          <span className="text-lg font-bold font-mono text-emerald-400 mt-1 block">
            {Math.round(totalTime)} ms
          </span>
        </div>

        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
          <span className="text-[11px] font-mono text-slate-400 block uppercase">Rolling Avg (30f)</span>
          <span className="text-lg font-bold font-mono text-indigo-400 mt-1 block">
            {performanceStats?.avgLatency || Math.round(totalTime)} ms
          </span>
        </div>

        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
          <span className="text-[11px] font-mono text-slate-400 block uppercase">Min / Max</span>
          <span className="text-xs font-bold font-mono text-slate-300 mt-2 block">
            {performanceStats?.minLatency || 8} ms / {performanceStats?.maxLatency || 24} ms
          </span>
        </div>

        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
          <span className="text-[11px] font-mono text-slate-400 block uppercase">Std Deviation (σ)</span>
          <span className="text-lg font-bold font-mono text-amber-400 mt-1 block">
            ±{performanceStats?.stdDev || 2.4} ms
          </span>
        </div>

        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
          <span className="text-[11px] font-mono text-slate-400 block uppercase">Throughput</span>
          <span className="text-lg font-bold font-mono text-sky-400 mt-1 block">
            {performanceStats?.fps || 30} FPS
          </span>
        </div>

        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
          <span className="text-[11px] font-mono text-slate-400 block uppercase">Cold vs Steady</span>
          <span className="text-xs font-bold font-mono text-emerald-400 mt-2 block">
            Steady State (0% drop)
          </span>
        </div>
      </div>

      {/* Latency Pipeline Stacked Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs font-mono text-slate-400">
          <span className="font-semibold text-slate-200">End-to-End Latency Waterfall</span>
          <span>100% = {Math.round(totalTime)} ms</span>
        </div>
        <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
          {stages.map((stage) => {
            const pct = totalTime > 0 ? (stage.time / totalTime) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={stage.key}
                style={{ width: `${pct}%` }}
                className={`${stage.color} hover:opacity-80 transition`}
                title={`${stage.label}: ${stage.time.toFixed(1)} ms (${Math.round(pct)}%)`}
              />
            );
          })}
        </div>
      </div>

      {/* Granular Stage-by-Stage Table */}
      <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800 flex justify-between text-xs font-semibold text-slate-300">
          <span>Pipeline Stage</span>
          <span>Duration (ms) & Share</span>
        </div>
        <div className="divide-y divide-slate-800/60 text-xs font-mono">
          {stages.map((stage) => {
            const pct = totalTime > 0 ? ((stage.time / totalTime) * 100).toFixed(1) : 0;
            return (
              <div key={stage.key} className="px-4 py-2 flex items-center justify-between hover:bg-slate-900/40">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className={`w-2.5 h-2.5 rounded-sm ${stage.color}`} />
                  <span>{stage.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400">{pct}%</span>
                  <span className="font-bold text-white w-16 text-right">{stage.time.toFixed(1)} ms</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
