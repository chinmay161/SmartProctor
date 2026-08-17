import React from 'react';
import { useNavigate } from 'react-router-dom';

const Ico = ({ d, size = 18 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
    <path d={d} />
  </svg>
);

const ACTIONS = [
  {
    icon: 'M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    label: 'Create New Exam',
    desc:  'Set up a new assessment',
    color: '#3B82F6',
    route: '/exam-creation',
    custom: true,
  },
  {
    icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
    label: 'Question Bank',
    desc:  'Manage question library',
    color: '#10B981',
    route: '/question-bank-management',
  },
  {
    icon: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
    label: 'Exam Templates',
    desc:  'Use saved templates',
    color: '#F59E0B',
    route: null,
  },
  {
    icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z',
    label: 'Student Management',
    desc:  'Manage enrollments',
    color: '#8B9BBE',
    route: null,
  },
];

const QuickActionsPanel = ({ onCreateExam, onOpenTemplates }) => {
  const navigate = useNavigate();
  const isActionEnabled = (action) => {
    if (action.custom) return true;
    if (action.route) return true;
    if (action.label === 'Exam Templates' && onOpenTemplates) return true;
    return false;
  };

  const handleClick = (action) => {
    if (action.custom && onCreateExam) { onCreateExam(); return; }
    if (action.label === 'Exam Templates' && onOpenTemplates) { onOpenTemplates(); return; }
    if (action.route) navigate(action.route);
  };

  return (
    <div className="sp-card sp-fade-up-2" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-foreground)', fontWeight: 400, marginBottom: '2px' }}>Quick Actions</h2>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--color-muted-foreground)' }}>Frequently used tools</p>
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {ACTIONS.map((action, i) => (
          (() => {
            const enabled = isActionEnabled(action);
            return (
          <button
            key={i}
            onClick={() => handleClick(action)}
            disabled={!enabled}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
              borderRadius: '10px', background: 'var(--color-muted)', border: '1px solid var(--color-border)',
              cursor: enabled ? 'pointer' : 'not-allowed',
              opacity: enabled ? 1 : 0.5,
              transition: 'all 0.2s', textAlign: 'left', width: '100%',
            }}
            onMouseEnter={e => {
              if (!enabled) return;
              e.currentTarget.style.borderColor = action.color + '55';
              e.currentTarget.style.background = action.color + '0D';
              e.currentTarget.style.transform = 'translateX(3px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.background = 'var(--color-muted)';
              e.currentTarget.style.transform = 'translateX(0)';
            }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: action.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: action.color, flexShrink: 0 }}>
              <Ico d={action.icon} size={17} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-foreground)', marginBottom: '2px' }}>{action.label}</p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.74rem', color: 'var(--color-muted-foreground)' }}>{action.desc}</p>
            </div>
          </button>
            );
          })()
        ))}
      </div>
    </div>
  );
};

export default QuickActionsPanel;
