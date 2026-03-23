import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatExamDateTime } from '../../../utils/dateTime';

const Ico = ({ d, size = 16, color }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
    <path d={d} />
  </svg>
);

const ICONS = {
  check:  'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  clip:   'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  file:   'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  warn:   'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  send:   'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
  bar:    'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  cal:    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  users:  'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z',
  trend:  'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
};

const CompletedExamCard = ({ exam, onReleaseResults, releasing = false }) => {
  const navigate = useNavigate();
  const submittedCount  = exam?.submitted_count ?? 0;
  const attemptCount    = exam?.attempt_count ?? 0;
  const evaluatedCount  = exam?.evaluated_count ?? 0;
  const averageScore    = exam?.average_score_percent;
  const totalViolations = exam?.violation_count ?? 0;
  const alreadyReleased = Boolean(exam?.results_visible);

  const completedDate = exam?.end_time
    ? formatExamDateTime(exam.end_time, exam, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'N/A';

  const scoreColor = averageScore == null ? 'var(--color-muted-foreground)'
    : averageScore >= 80 ? '#10B981'
    : averageScore >= 60 ? '#3B82F6'
    : '#EF4444';

  return (
    <div className="sp-card sp-fade-up" style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      {/* Completed accent edge */}
      <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: '3px', borderRadius: '0 3px 3px 0', background: '#10B981' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--color-foreground)', marginBottom: '6px', lineHeight: 1.25 }}>
            {exam?.title}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {[
              { icon: ICONS.cal,   label: completedDate },
              { icon: ICONS.users, label: `${submittedCount}/${attemptCount} submitted` },
              { icon: ICONS.trend, label: averageScore == null ? 'Avg: N/A' : `Avg: ${averageScore}%` },
            ].map(({ icon, label }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--color-muted-foreground)' }}>
                <Ico d={icon} size={13} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
          <Ico d={ICONS.check} size={12} color="#10B981" /> COMPLETED
        </span>
      </div>

      {/* Metric chips — 2×2 responsive grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
        {[
          { icon: ICONS.clip,  label: 'Evaluated',  value: String(evaluatedCount),                  color: '#10B981' },
          { icon: ICONS.file,  label: 'Results',     value: alreadyReleased ? 'Released' : 'Pending', color: alreadyReleased ? '#10B981' : '#F59E0B' },
          { icon: ICONS.warn,  label: 'Violations',  value: String(totalViolations),                 color: totalViolations > 0 ? '#F59E0B' : '#10B981' },
          { icon: ICONS.users, label: 'Attempts',    value: String(attemptCount),                    color: '#3B82F6' },
        ].map(({ icon, label, value, color }) => (
          <div key={label} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
              <Ico d={icon} size={13} color={color} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: 'var(--color-muted-foreground)', fontWeight: 500 }}>{label}</span>
            </div>
            <p style={{ fontFamily: 'var(--font-data)', fontSize: '0.95rem', fontWeight: 700, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Average score bar */}
      {averageScore != null && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-muted-foreground)' }}>Class Average</span>
            <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.85rem', fontWeight: 700, color: scoreColor }}>{averageScore}%</span>
          </div>
          <div style={{ height: '5px', borderRadius: '3px', background: 'var(--color-border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, averageScore)}%`, background: scoreColor, borderRadius: '3px', transition: 'width 0.6s ease' }} />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
        {[
          { label: 'Analytics',         icon: ICONS.bar,  onClick: () => navigate(`/teacher-dashboard/completed/${encodeURIComponent(exam?.id)}/analytics`),         style: 'ghost'   },
          { label: 'Violation Report',  icon: ICONS.file, onClick: () => navigate(`/teacher-dashboard/completed/${encodeURIComponent(exam?.id)}/violation-report`),   style: 'ghost'   },
        ].map(({ label, icon, onClick, style }) => (
          <button
            key={label}
            onClick={onClick}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s', minWidth: '100px' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sp-accent)'; e.currentTarget.style.color = 'var(--sp-accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-muted-foreground)'; }}
          >
            <Ico d={icon} size={13} /> {label}
          </button>
        ))}
        <button
          disabled={alreadyReleased || releasing}
          onClick={() => onReleaseResults?.(exam)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', background: alreadyReleased ? 'rgba(16,185,129,0.10)' : 'var(--sp-accent)', color: alreadyReleased ? '#10B981' : '#fff', fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 600, border: alreadyReleased ? '1px solid rgba(16,185,129,0.3)' : 'none', cursor: (alreadyReleased || releasing) ? 'not-allowed' : 'pointer', opacity: releasing ? 0.7 : 1, transition: 'all 0.2s', minWidth: '130px' }}
          onMouseEnter={e => { if (!alreadyReleased && !releasing) { e.currentTarget.style.background = 'var(--sp-accent-hover)'; e.currentTarget.style.boxShadow = '0 0 12px var(--sp-accent-glow)'; } }}
          onMouseLeave={e => { e.currentTarget.style.background = alreadyReleased ? 'rgba(16,185,129,0.10)' : 'var(--sp-accent)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          {releasing
            ? <span style={{ width: '13px', height: '13px', borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
            : <Ico d={alreadyReleased ? ICONS.check : ICONS.send} size={13} color={alreadyReleased ? '#10B981' : '#fff'} />
          }
          {alreadyReleased ? 'Results Released' : 'Release Results'}
        </button>
      </div>
    </div>
  );
};

export default CompletedExamCard;
