import React from 'react';

const Ico = ({ d, size = 18, color }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
    <path d={d} />
  </svg>
);

const ICONS = {
  users:    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  file:     'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  warn:     'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  up:       'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  down:     'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6',
};

const ICON_MAP = {
  Users: ICONS.users,
  FileText: ICONS.file,
  Activity: ICONS.activity,
  AlertTriangle: ICONS.warn,
};

const SystemMetricsCard = ({ title, value, change, changeType = 'positive', color = '#3B82F6', trend = [], delay }) => {
  const changeColor = changeType === 'positive' ? '#10B981' : changeType === 'negative' ? '#EF4444' : '#8B9BBE';
  const trendUp = changeType === 'positive';

  return (
    <div
      className="sp-card sp-count-up"
      style={{ padding: '18px 20px', animationDelay: delay, position: 'relative', overflow: 'hidden' }}
    >
      {/* Subtle top glow band */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg,${color},transparent)`, borderRadius: '14px 14px 0 0' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--color-muted-foreground)', fontWeight: 500, marginBottom: '6px', letterSpacing: '0.02em' }}>{title}</p>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--color-foreground)', fontWeight: 600, lineHeight: 1 }}>{value}</h3>
        </div>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" width="20" height="20">
            <path d={Object.values(ICON_MAP)[Math.abs(title.charCodeAt(0) % 4)] || ICONS.activity} />
          </svg>
        </div>
      </div>

      {change && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: trend.length > 0 ? '12px' : 0 }}>
          <Ico d={trendUp ? ICONS.up : ICONS.down} size={14} color={changeColor} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.79rem', fontWeight: 600, color: changeColor }}>{change}</span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.73rem', color: 'var(--color-muted-foreground)' }}>vs last month</span>
        </div>
      )}

      {/* Sparkline */}
      {trend.length > 0 && (
        <div style={{ height: '36px', display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
          {trend.map((v, i) => {
            const pct = (v / Math.max(...trend)) * 100;
            return (
              <div
                key={i}
                style={{ flex: 1, borderRadius: '2px 2px 0 0', background: color + '33', transition: 'height 0.4s ease', height: `${pct}%` }}
                onMouseEnter={e => { e.currentTarget.style.background = color + '88'; }}
                onMouseLeave={e => { e.currentTarget.style.background = color + '33'; }}
                title={String(v)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SystemMetricsCard;