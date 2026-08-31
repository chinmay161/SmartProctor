import React from 'react';
import Icon from '../../../components/AppIcon';

export default function ExportModal({ isOpen, onClose, exportData }) {
  if (!isOpen) return null;

  const downloadFile = (filename, content) => {
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportsList = [
    {
      id: 'logs',
      filename: 'logs.json',
      title: 'Structured Diagnostic Logs',
      desc: 'All recorded stage events, pipeline transitions, and errors.',
      data: exportData.logs,
      icon: 'Terminal',
      color: 'bg-indigo-500/20 text-indigo-300'
    },
    {
      id: 'performance',
      filename: 'performance.json',
      title: 'Performance & Profiler Timings',
      desc: '14-stage latency breakdown, rolling averages, min/max, and std dev.',
      data: exportData.performance,
      icon: 'Gauge',
      color: 'bg-emerald-500/20 text-emerald-300'
    },
    {
      id: 'pipeline',
      filename: 'pipeline.json',
      title: 'Pipeline Context & Outputs',
      desc: 'Latest frame raw outputs, detections, landmarks, and temporal states.',
      data: exportData.pipeline,
      icon: 'Activity',
      color: 'bg-amber-500/20 text-amber-300'
    },
    {
      id: 'system_info',
      filename: 'system_info.json',
      title: 'System & Package Versions',
      desc: 'MediaPipe, OpenCV, PyTorch, YOLO, OS, CPU, RAM, and WebGL specs.',
      data: exportData.system_info,
      icon: 'Cpu',
      color: 'bg-sky-500/20 text-sky-300'
    },
    {
      id: 'bundle',
      filename: 'diagnostic_bundle.json',
      title: 'Complete Master Diagnostic Bundle',
      desc: 'All 4 files combined with recorded session frames for complete offline reproduction.',
      data: exportData,
      icon: 'Archive',
      color: 'bg-purple-500/20 text-purple-300'
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <Icon name="Download" className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-slate-100 font-bold text-base">Export Diagnostic Telemetry</h3>
              <p className="text-slate-400 text-xs">Download reproducible session artifacts for debugging.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <Icon name="X" className="w-5 h-5" />
          </button>
        </div>

        {/* Export Items List */}
        <div className="space-y-2.5">
          {exportsList.map((item) => (
            <div
              key={item.id}
              className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between gap-3 hover:border-slate-700 transition"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${item.color}`}>
                  <Icon name={item.icon} className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-200">{item.title}</span>
                    <code className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                      {item.filename}
                    </code>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                </div>
              </div>

              <button
                onClick={() => downloadFile(item.filename, item.data)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow"
              >
                <Icon name="Download" className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          ))}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
