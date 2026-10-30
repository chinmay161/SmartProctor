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
  server:   'M2 4h20v6H2V4zm0 10h20v6H2v-6zm4-7h.01M6 17h.01',
};

const ICON_MAP = {
  Users: ICONS.users,
  Sessions: ICONS.activity,
  Violations: ICONS.warn,
  Server: ICONS.server,
};

const SystemMetricsCard = ({
  title,
  value,
  subtitle,
  color = '#3B82F6',
  trend = [],
  delay,
  loading = false,
  error = null,
  iconName = 'Activity',
}) => {
  const iconD = ICON_MAP[iconName] || ICONS.activity;

  if (loading) {
    return (
      <div
        className="sp-card"
        style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}
        data-testid="metrics-card-skeleton"
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'var(--color-border)' }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ width: '80px', height: '12px', background: 'var(--color-muted)', borderRadius: '4px', marginBottom: '8px' }} />
            <div style={{ width: '120px', height: '28px', background: 'var(--color-muted)', borderRadius: '6px' }} />
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--color-muted)' }} />
        </div>
        <div style={{ width: '140px', height: '10px', background: 'var(--color-muted)', borderRadius: '4px' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="sp-card"
        style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden', borderLeft: '3px solid var(--sp-error)' }}
        data-testid="metrics-card-error"
      >
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--color-muted-foreground)', fontWeight: 500, marginBottom: '6px' }}>{title}</p>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--sp-error)' }}>{error}</p>
      </div>
    );
  }

  const maxTrend = trend && trend.length > 0 ? Math.max(...trend, 1) : 1;

  return (
    <div
      className="sp-card sp-count-up"
      style={{ padding: '18px 20px', animationDelay: delay, position: 'relative', overflow: 'hidden' }}
      data-testid={`metrics-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {/* Subtle top glow band */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg,${color},transparent)`, borderRadius: '14px 14px 0 0' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--color-muted-foreground)', fontWeight: 500, marginBottom: '6px', letterSpacing: '0.02em' }}>{title}</p>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--color-foreground)', fontWeight: 600, lineHeight: 1.1 }}>
            {value !== null && value !== undefined ? value : '—'}
          </h3>
        </div>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
          <Ico d={iconD} size={20} color={color} />
        </div>
      </div>

      {subtitle && (
        <div style={{ marginBottom: trend.length > 0 ? '12px' : 0 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.74rem', color: 'var(--color-muted-foreground)' }}>{subtitle}</span>
        </div>
      )}

      {/* Small bars for the real 7-day series only */}
      {trend.length > 0 && (
        <div style={{ height: '32px', display: 'flex', alignItems: 'flex-end', gap: '4px', marginTop: '8px' }}>
          {trend.map((v, i) => {
            const pct = Math.max(8, Math.round((v / maxTrend) * 100));
            const isToday = i === trend.length - 1;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  borderRadius: '2px 2px 0 0',
                  background: isToday ? color : color + '44',
                  transition: 'all 0.3s ease',
                  height: `${pct}%`,
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = color; }}
                onMouseLeave={e => { e.currentTarget.style.background = isToday ? color : color + '44'; }}
                title={`Day ${i + 1}${isToday ? ' (Today)' : ''}: ${v} violations`}
                data-testid={`trend-bar-${i}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SystemMetricsCard;