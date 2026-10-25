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

  return (
    <div className="sp-card sp-fade-up" style={{ padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--color-foreground)', marginBottom: '6px', lineHeight: 1.25, fontWeight: 600 }}>
            {exam?.title}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
            {[
              { icon: ICONS.cal,   label: completedDate },
              { icon: ICONS.users, label: `${submittedCount}/${attemptCount} submitted` },
              { icon: ICONS.trend, label: averageScore == null ? 'Avg: N/A' : `Avg: ${averageScore}%` },
            ].map(({ icon, label }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--color-muted-foreground)' }}>
                <Ico d={icon} size={14} color="var(--color-muted-foreground)" />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', background: 'var(--color-muted)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0, letterSpacing: '0.03em' }}>
          <Ico d={ICONS.check} size={12} color="var(--sp-accent)" /> COMPLETED
        </span>
      </div>

      {/* Metric chips — Unified cohesive card surfaces */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {[
          { icon: ICONS.clip,  label: 'Evaluated',  value: String(evaluatedCount) },
          { icon: ICONS.file,  label: 'Results',    value: alreadyReleased ? 'Released' : 'Pending' },
          { icon: ICONS.warn,  label: 'Violations', value: String(totalViolations) },
          { icon: ICONS.users, label: 'Attempts',   value: String(attemptCount) },
        ].map(({ icon, label, value }) => (
          <div
            key={label}
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'var(--color-muted)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Ico d={icon} size={13} color="var(--color-muted-foreground)" />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-muted-foreground)', fontWeight: 500 }}>{label}</span>
            </div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', fontWeight: 600, color: 'var(--color-foreground)', margin: 0 }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Average score bar */}
      {averageScore != null && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-muted-foreground)' }}>Class Average</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-foreground)' }}>{averageScore}%</span>
          </div>
          <div style={{ height: '5px', borderRadius: '3px', background: 'var(--color-border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, averageScore)}%`, background: 'var(--sp-accent)', borderRadius: '3px', transition: 'width 0.6s ease' }} />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
        {[
          { label: 'Analytics',         icon: ICONS.bar,  onClick: () => navigate(`/teacher-dashboard/completed/${encodeURIComponent(exam?.id)}/analytics`) },
          { label: 'Violation Report',  icon: ICONS.file, onClick: () => navigate(`/teacher-dashboard/completed/${encodeURIComponent(exam?.id)}/violation-report`) },
        ].map(({ label, icon, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              color: 'var(--color-foreground)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              minWidth: '100px',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sp-accent)'; e.currentTarget.style.color = 'var(--sp-accent)'; e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-foreground)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <Ico d={icon} size={14} /> {label}
          </button>
        ))}
        <button
          disabled={alreadyReleased || releasing}
          onClick={() => onReleaseResults?.(exam)}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '8px',
            background: alreadyReleased ? 'var(--color-muted)' : 'var(--sp-accent)',
            color: alreadyReleased ? 'var(--color-muted-foreground)' : '#fff',
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            fontWeight: 600,
            border: alreadyReleased ? '1px solid var(--color-border)' : 'none',
            cursor: (alreadyReleased || releasing) ? 'not-allowed' : 'pointer',
            opacity: releasing ? 0.7 : 1,
            transition: 'all 0.2s',
            minWidth: '130px',
          }}
          onMouseEnter={e => { if (!alreadyReleased && !releasing) { e.currentTarget.style.background = 'var(--sp-accent-hover)'; e.currentTarget.style.boxShadow = '0 0 12px var(--sp-accent-glow)'; } }}
          onMouseLeave={e => { e.currentTarget.style.background = alreadyReleased ? 'var(--color-muted)' : 'var(--sp-accent)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          {releasing
            ? <span style={{ width: '13px', height: '13px', borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
            : <Ico d={alreadyReleased ? ICONS.check : ICONS.send} size={13} color={alreadyReleased ? 'var(--color-muted-foreground)' : '#fff'} />
          }
          {alreadyReleased ? 'Results Released' : 'Release Results'}
        </button>
      </div>
    </div>
  );
};

export default CompletedExamCard;
