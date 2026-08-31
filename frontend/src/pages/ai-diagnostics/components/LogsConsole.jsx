import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';

export default function LogsConsole({ logs, onClearLogs }) {
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  const filteredLogs = logs.filter((log) => {
    if (filter !== 'ALL' && log.severity !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        log.event?.toLowerCase().includes(q) ||
        log.stage?.toLowerCase().includes(q) ||
        JSON.stringify(log.data || {}).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(logs, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'SUCCESS':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'WARN':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'ERROR':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col h-[500px]">
      {/* Console Controls Bar */}
      <div className="p-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="Terminal" className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-xs text-slate-200 uppercase tracking-wider">
            Diagnostic Event Stream ({filteredLogs.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Icon name="Search" className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
            <input
              type="text"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-1 outline-none w-40 focus:w-56 transition-all"
            />
          </div>

          {/* Severity Filter */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[11px] font-mono">
            {['ALL', 'SUCCESS', 'WARN', 'ERROR', 'INFO'].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-2 py-0.5 rounded transition ${
                  filter === s ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700 flex items-center gap-1.5 transition"
          >
            <Icon name={copied ? 'Check' : 'Copy'} className="w-3.5 h-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>

          <button
            onClick={onClearLogs}
            className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs rounded border border-rose-500/30 transition"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log Feed */}
      <div className="flex-1 p-3 overflow-y-auto font-mono text-xs space-y-1.5 bg-black/50">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600">
            No log entries matching filter
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="p-2 rounded bg-slate-950/80 border border-slate-900 hover:border-slate-800 transition flex flex-col gap-1"
            >
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{log.timeFormatted}</span>
                  <span className={`px-1.5 py-0.2 rounded border text-[10px] font-bold ${getSeverityBadge(log.severity)}`}>
                    {log.severity}
                  </span>
                  <span className="text-slate-400 font-semibold">[{log.stage}]</span>
                </div>
              </div>
              <p className="text-slate-200">{log.event}</p>
              {log.data && (
                <pre className="text-[10px] text-slate-400 bg-slate-900/90 p-1.5 rounded overflow-x-auto border border-slate-800/80 mt-1">
                  {JSON.stringify(log.data, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
