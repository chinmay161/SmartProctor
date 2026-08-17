import React from 'react';

const Ico = ({ d, size = 16, color }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
    <path d={d} />
  </svg>
);

const STAT_ITEMS = [
  { key: 'totalExams',       label: 'Total Exams',      icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', color: '#3B82F6', subLabel: '+12% from last semester' },
  { key: 'totalStudents',    label: 'Total Students',   icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z',                                                                color: '#10B981', subLabel: '+8% enrollment increase' },
  { key: 'averageScore',     label: 'Average Score',    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', color: '#3B82F6', subLabel: '+3.5% improvement',   suffix: '%' },
  { key: 'totalViolations',  label: 'Total Violations', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', color: '#F59E0B', subLabel: '-15% from last semester' },
];

const StatisticsPanel = ({ statistics }) => (
  <div className="sp-card sp-fade-up-3" style={{ overflow: 'hidden' }}>
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-foreground)', fontWeight: 400, marginBottom: '2px' }}>Semester Statistics</h2>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--color-muted-foreground)' }}>Current Academic Period</p>
    </div>

    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {STAT_ITEMS.map(({ key, label, icon, color, subLabel, suffix }) => {
        const val = statistics?.[key];
        return (
          <div
            key={key}
            style={{ padding: '12px 14px', borderRadius: '10px', background: `${color}0A`, border: `1px solid ${color}22`, transition: 'border-color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = color + '44'}
            onMouseLeave={e => e.currentTarget.style.borderColor = color + '22'}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
                  <Ico d={icon} size={15} color={color} />
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 500, color: 'var(--color-foreground)' }}>{label}</span>
              </div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color, fontWeight: 600, lineHeight: 1 }}>
                {val != null ? `${val}${suffix || ''}` : '—'}
              </span>
            </div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.71rem', color: 'var(--color-muted-foreground)', paddingLeft: '38px' }}>{subLabel}</p>
          </div>
        );
      })}

      {/* Violation breakdown */}
      {statistics?.violationBreakdown?.length > 0 && (
        <div style={{ paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-foreground)', marginBottom: '8px' }}>Violation Breakdown</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {statistics.violationBreakdown.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.77rem', color: 'var(--color-muted-foreground)' }}>{item?.type}</span>
                <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-foreground)' }}>{item?.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export */}
      <div style={{ paddingTop: '10px', borderTop: '1px solid var(--color-border)' }}>
        <button style={{ width: '100%', padding: '9px', borderRadius: '9px', background: 'var(--sp-accent)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: '0.83rem', fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--sp-accent-hover)'; e.currentTarget.style.boxShadow = '0 0 14px var(--sp-accent-glow)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--sp-accent)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" width="14" height="14"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Export Full Report
        </button>
      </div>
    </div>
  </div>
);

export default StatisticsPanel;