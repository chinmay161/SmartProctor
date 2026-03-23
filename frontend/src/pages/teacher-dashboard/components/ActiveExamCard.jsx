import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatIstDateTime } from '../../../utils/dateTime';

const Ico = ({ d, size = 16, color }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color || 'currentColor'}
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    width={size}
    height={size}
  >
    <path d={d} />
  </svg>
);

const ICONS = {
  eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  cal: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  warn: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
};

const ActiveExamCard = ({ exam }) => {
  const navigate = useNavigate();
  const violationCount = exam?.violationCount ?? 0;
  const startTime = exam?.start_time || exam?.startTime;
  const endTime = exam?.end_time || exam?.endTime;
  const formattedStartTime = startTime
    ? `${formatIstDateTime(startTime, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })} IST`
    : 'Now';
  const computedTimeRemaining = (() => {
    if (!endTime) return null;
    const end = new Date(endTime);
    if (Number.isNaN(end.getTime())) return null;
    const diff = end.getTime() - Date.now();
    if (diff <= 0) return 'Ending';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
  })();
  const severity =
    violationCount === 0 ? { color: '#10B981', bg: 'rgba(16,185,129,0.10)', label: 'No Issues' } :
    violationCount <= 3 ? { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', label: 'Minor' } :
      { color: '#EF4444', bg: 'rgba(239,68,68,0.10)', label: 'Critical' };

  return (
    <div className="sp-card sp-fade-up" style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #10B981, #3B82F6)' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--color-foreground)', marginBottom: '6px', lineHeight: 1.25 }}>
            {exam?.title}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {[
              { icon: ICONS.users, label: `${exam?.activeStudents ?? '?'}/${exam?.totalStudents ?? '?'} Active` },
              { icon: ICONS.clock, label: exam?.timeRemaining || computedTimeRemaining || '—' },
              { icon: ICONS.cal, label: formattedStartTime },
            ].map(({ icon, label }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--color-muted-foreground)' }}>
                <Ico d={icon} size={13} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
          <span className="sp-pulse-dot" style={{ background: '#10B981' }} />
          LIVE
        </span>
      </div>

      {exam?.studentPreviews?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '10px', marginBottom: '14px' }}>
          {exam.studentPreviews.slice(0, 3).map((student) => (
            <div
              key={student?.id}
              style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--color-muted)', border: '1px solid var(--color-border)', transition: 'border-color 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', color: 'var(--sp-accent)', fontSize: '1rem' }}>
                    {student?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '9px', height: '9px', borderRadius: '50%', background: student?.status === 'active' ? '#10B981' : '#EF4444', border: '2px solid var(--color-card)' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.79rem', fontWeight: 600, color: 'var(--color-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{student?.name}</p>
                  <p style={{ fontFamily: 'var(--font-data)', fontSize: '0.7rem', color: 'var(--color-muted-foreground)' }}>{student?.studentId}</p>
                </div>
              </div>
              {student?.violations > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#F59E0B' }}>
                  <Ico d={ICONS.warn} size={12} color="#F59E0B" />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem' }}>{student?.violations} violation{student?.violations !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '8px', background: severity.bg }}>
          <Ico d={ICONS.warn} size={15} color={severity.color} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 600, color: severity.color }}>{violationCount} Violations - {severity.label}</span>
        </div>
        <button
          onClick={() => navigate(`/exam-monitoring/${exam?.id}`)}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', borderRadius: '8px', background: 'var(--sp-accent)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sp-accent-hover)'; e.currentTarget.style.boxShadow = '0 0 14px var(--sp-accent-glow)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--sp-accent)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <Ico d={ICONS.eye} size={14} color="#fff" />
          Monitor Details
        </button>
      </div>
    </div>
  );
};

export default ActiveExamCard;
