import React from 'react';

const Ico = ({ d, size = 16 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
    <path d={d} />
  </svg>
);

const ICONS = {
  clock:  'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  help:   'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  edit:   'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  trash:  'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  cal:    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
};

const ScheduledExamCard = ({ exam, onEdit, onDelete, onUseTemplate, variant = 'scheduled' }) => {
  const isDraft = variant === 'draft';
  const isTemplate = variant === 'template';
  const createdAt = exam?.created_at
    ? new Date(exam.created_at).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'N/A';
  const accentColor = isDraft ? '#F59E0B' : isTemplate ? '#8B5CF6' : '#3B82F6';
  const badgeStyles = isDraft
    ? { background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B', label: 'DRAFT' }
    : isTemplate
    ? { background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.25)', color: '#8B5CF6', label: 'TEMPLATE' }
    : { background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)', color: 'var(--sp-accent)', label: 'SCHEDULED' };
  const footerLabel = isDraft ? 'Continue editing' : isTemplate ? 'Reusable' : 'Ready';

  return (
    <div className="sp-card sp-fade-up" style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: '3px', borderRadius: '0 3px 3px 0', background: accentColor }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--color-foreground)', marginBottom: '4px', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {exam?.title}
          </h3>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted-foreground)', lineHeight: 1.5 }}>
            {exam?.description || 'No description added'}
          </p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '999px', background: badgeStyles.background, border: badgeStyles.border, color: badgeStyles.color, fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0, letterSpacing: '0.04em' }}>
          {badgeStyles.label}
        </span>
      </div>

      {/* Meta chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
        {[
          { label: 'Duration',   value: exam?.duration_minutes ? `${exam.duration_minutes} min` : 'Not set' },
          { label: 'Questions',  value: String(exam?.question_ids?.length || 0) },
          { label: 'Created',    value: createdAt },
        ].map(({ label, value }) => (
          <div key={label} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--color-muted-foreground)', marginBottom: '3px', fontWeight: 500 }}>{label}</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-foreground)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={() => onEdit?.(exam)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sp-accent)'; e.currentTarget.style.color = 'var(--sp-accent)'; e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-muted-foreground)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <Ico d={ICONS.edit} size={14} /> {isTemplate ? 'Edit Template' : 'Edit'}
        </button>
        {isTemplate && (
          <button
            onClick={() => onUseTemplate?.(exam)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#8B5CF6', fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.14)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.2)'; }}
          >
            <Ico d={ICONS.cal} size={14} /> Use Template
          </button>
        )}
        <button
          onClick={() => onDelete?.(exam)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--sp-error)', fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'; }}
        >
          <Ico d={ICONS.trash} size={14} /> Delete
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--color-muted-foreground)', paddingLeft: '6px' }}>
          <Ico d={ICONS.clock} size={13} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem' }}>{footerLabel}</span>
        </div>
      </div>
    </div>
  );
};

export default ScheduledExamCard;
