import React from 'react';
import Icon from '../../../components/AppIcon';

export default function ValidationChecklist({ activeTab, validationsState, onResetValidations }) {
  const tests = validationsState[activeTab] || [];

  if (tests.length === 0) {
    return null;
  }

  const passedCount = tests.filter((t) => t.passed).length;
  const allPassed = passedCount === tests.length && tests.length > 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${allPassed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
            Automated Validation Suite ({passedCount}/{tests.length} Passed)
          </h4>
        </div>
        <button
          onClick={() => onResetValidations(activeTab)}
          className="text-[11px] text-slate-400 hover:text-slate-200 transition underline"
        >
          Reset Battery
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {tests.map((test) => (
          <div
            key={test.id}
            className={`p-2.5 rounded-lg border flex items-center gap-2.5 transition text-xs font-mono ${
              test.passed
                ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                : 'bg-slate-950 border-slate-800/80 text-slate-400'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                test.passed ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {test.passed ? '✓' : '○'}
            </div>
            <span className="flex-1 truncate">{test.text}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              test.passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
            }`}>
              {test.passed ? 'PASSED' : 'PENDING'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
