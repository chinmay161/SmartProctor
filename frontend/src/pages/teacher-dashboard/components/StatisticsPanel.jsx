import React from 'react';

const Ico = ({ d, size = 16, color }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
    <path d={d} />
  </svg>
);

const STAT_ITEMS = [
  {
    key: 'totalExams',
    label: 'Total Exams',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    color: '#3B82F6',
    getValue: (s) => {
      const d = s?.DRAFT ?? null;
      const sc = s?.SCHEDULED ?? null;
      const a = s?.ACTIVE ?? null;
      const e = s?.ENDED ?? null;
      if (d === null && sc === null && a === null && e === null) return null;
      return (d || 0) + (sc || 0) + (a || 0) + (e || 0);
    },
  },
  {
    key: 'activeNow',
    label: 'Active Now',
    icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    color: '#10B981',
    getValue: (s) => s?.attention?.live_exams ?? s?.ACTIVE ?? null,
  },
  {
    key: 'awaitingGrading',
    label: 'Awaiting Grading',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    color: '#F59E0B',
    getValue: (s) => s?.attention?.awaiting_grading_total ?? null,
  },
  {
    key: 'pendingDisputes',
    label: 'Pending Disputes',
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    color: '#EF4444',
    getValue: (s) => s?.attention?.pending_disputes_total ?? null,
  },
  {
    key: 'resultsToPublish',
    label: 'Results to Publish',
    icon: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
    color: '#8B5CF6',
    getValue: (s) => s?.attention?.results_unpublished ?? null,
  },
];

const StatisticsPanel = ({ statistics }) => (
  <div className="sp-card sp-fade-up-3" style={{ overflow: 'hidden' }}>
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-foreground)', fontWeight: 400, marginBottom: '2px' }}>Dashboard Statistics</h2>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--color-muted-foreground)' }}>Live data from your exams</p>
    </div>

    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {STAT_ITEMS.map(({ key, label, icon, color, getValue }) => {
        const val = getValue(statistics);
        return (
          <div
            key={key}
            style={{ padding: '12px 14px', borderRadius: '10px', background: `${color}0A`, border: `1px solid ${color}22`, transition: 'border-color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = color + '44'}
            onMouseLeave={e => e.currentTarget.style.borderColor = color + '22'}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
                  <Ico d={icon} size={15} color={color} />
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 500, color: 'var(--color-foreground)' }}>{label}</span>
              </div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color, fontWeight: 600, lineHeight: 1 }}>
                {val != null ? val : '—'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export default StatisticsPanel;
