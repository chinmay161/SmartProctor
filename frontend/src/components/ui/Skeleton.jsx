import React from 'react';

/**
 * Base Skeleton Primitive with animated shimmer effect
 */
export const Skeleton = ({
  className = '',
  width,
  height,
  borderRadius,
  circle = false,
  style = {},
  ...props
}) => {
  const inlineStyle = {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(borderRadius ? { borderRadius } : {}),
    ...(circle ? { borderRadius: '50%' } : {}),
    ...style,
  };

  return (
    <div
      className={`sp-skeleton ${className}`}
      style={inlineStyle}
      aria-hidden="true"
      {...props}
    />
  );
};

/**
 * Multiple line skeleton text
 */
export const SkeletonText = ({ lines = 3, className = '', lineSpacing = '8px' }) => {
  return (
    <div className={`space-y-2 ${className}`} style={{ display: 'flex', flexDirection: 'column', gap: lineSpacing }}>
      {Array.from({ length: lines }).map((_, idx) => {
        const width = idx === lines - 1 && lines > 1 ? '65%' : `${90 - (idx % 2) * 10}%`;
        return (
          <Skeleton
            key={idx}
            height="14px"
            width={width}
            borderRadius="4px"
          />
        );
      })}
    </div>
  );
};

/**
 * Skeleton for single Stat Card
 */
export const SkeletonStatCard = ({ delay = '0s' }) => {
  return (
    <div
      className="sp-skeleton-card p-5"
      style={{
        padding: '20px',
        animationDelay: delay,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <Skeleton width="40px" height="40px" borderRadius="10px" />
      </div>
      <Skeleton width="50%" height="28px" borderRadius="6px" style={{ marginBottom: '8px' }} />
      <Skeleton width="70%" height="14px" borderRadius="4px" />
    </div>
  );
};

/**
 * Skeleton for single Exam Card
 */
export const SkeletonExamCard = ({ delay = '0s' }) => {
  return (
    <div
      className="sp-skeleton-card p-5"
      style={{
        padding: '22px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        animationDelay: delay,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Skeleton width="80px" height="22px" borderRadius="999px" />
        <Skeleton width="60px" height="14px" borderRadius="4px" />
      </div>

      <div>
        <Skeleton width="75%" height="20px" borderRadius="6px" style={{ marginBottom: '8px' }} />
        <Skeleton width="50%" height="14px" borderRadius="4px" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
        <Skeleton height="14px" borderRadius="4px" />
        <Skeleton height="14px" borderRadius="4px" />
      </div>

      <Skeleton width="100%" height="40px" borderRadius="9px" style={{ marginTop: '6px' }} />
    </div>
  );
};

/**
 * Skeleton for Table Rows
 */
export const SkeletonTableRow = ({ columns = 5 }) => {
  return (
    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
      {Array.from({ length: columns }).map((_, idx) => (
        <td key={idx} style={{ padding: '16px' }}>
          <Skeleton
            height="16px"
            width={idx === 0 ? '70%' : idx === columns - 1 ? '50px' : '60%'}
            borderRadius="4px"
            style={idx === columns - 1 ? { marginLeft: 'auto' } : {}}
          />
        </td>
      ))}
    </tr>
  );
};

/**
 * History Table Skeleton
 */
export const HistoryTableSkeleton = ({ rows = 4 }) => {
  return (
    <div className="sp-skeleton-card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '12px' }}>
        <Skeleton width="120px" height="18px" />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} columns={5} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Exam List Skeleton Grid
 */
export const ExamListSkeleton = ({ count = 3 }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonExamCard key={i} delay={`${i * 0.08}s`} />
      ))}
    </div>
  );
};

/**
 * Full Dashboard Skeleton (used during ProtectedRoute loads and page transitions)
 */
export const DashboardSkeleton = ({ subtitle = 'Loading workspace...' }) => {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)' }}>
      {/* Header bar placeholder */}
      <header
        style={{
          height: '64px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 clamp(1rem, 4vw, 2rem)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Skeleton width="34px" height="34px" borderRadius="10px" />
          <Skeleton width="130px" height="18px" borderRadius="6px" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Skeleton width="90px" height="32px" borderRadius="8px" />
          <Skeleton width="34px" height="34px" circle />
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: 'clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2rem)' }}>
        {/* Hero zone skeleton */}
        <div
          className="sp-skeleton-card"
          style={{
            borderRadius: '16px',
            padding: '28px 28px 24px',
            marginBottom: '28px',
          }}
        >
          <div style={{ marginBottom: '22px' }}>
            <Skeleton width="220px" height="30px" borderRadius="6px" style={{ marginBottom: '10px' }} />
            <Skeleton width="160px" height="14px" borderRadius="4px" />
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            <SkeletonStatCard delay="0s" />
            <SkeletonStatCard delay="0.08s" />
            <SkeletonStatCard delay="0.16s" />
            <SkeletonStatCard delay="0.24s" />
          </div>
        </div>

        {/* Tab / action placeholder */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <Skeleton width="150px" height="24px" borderRadius="6px" />
          <Skeleton width="100px" height="36px" borderRadius="8px" />
        </div>

        {/* Cards grid */}
        <ExamListSkeleton count={3} />
      </main>
    </div>
  );
};

/**
 * High-polish Auth Transition Loading Screen
 * Displayed when user logs in and credentials are confirmed, bridging the redirect to dashboard
 */
export const AuthTransitionSkeleton = ({
  message = 'Authenticating and loading your workspace...',
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--color-background)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        className="sp-fade-up"
        style={{
          width: '100%',
          maxWidth: '460px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '24px',
        }}
      >
        {/* Animated Brand Shield */}
        <div
          style={{
            position: 'relative',
            width: '68px',
            height: '68px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '20px',
              background: 'rgba(59, 130, 246, 0.15)',
              transform: 'rotate(6deg)',
              animation: 'sp-pulse-dot 2s ease-in-out infinite',
            }}
          />
          <div
            style={{
              position: 'relative',
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'var(--sp-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 8px 24px var(--sp-accent-glow)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: '28px', height: '28px' }}
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
        </div>

        {/* Text info */}
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.4rem',
              color: 'var(--color-foreground)',
              fontWeight: 500,
              marginBottom: '8px',
            }}
          >
            Preparing Dashboard
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.88rem',
              color: 'var(--color-muted-foreground)',
            }}
          >
            {message}
          </p>
        </div>

        {/* Shimmer progress indicator */}
        <div
          style={{
            width: '100%',
            height: '6px',
            borderRadius: '999px',
            background: 'var(--color-muted)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            className="sp-skeleton"
            style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(90deg, var(--sp-accent) 0%, #60A5FA 50%, var(--sp-accent) 100%)',
              backgroundSize: '200% 100%',
            }}
          />
        </div>

        {/* Preview placeholder cards */}
        <div
          style={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            marginTop: '8px',
            opacity: 0.6,
          }}
        >
          <Skeleton height="54px" borderRadius="10px" />
          <Skeleton height="54px" borderRadius="10px" />
          <Skeleton height="54px" borderRadius="10px" />
        </div>
      </div>
    </div>
  );
};

export default Skeleton;
