import React, { useEffect, useRef } from 'react';

/**
 * NeonGridBackground
 * - mode="viewport": Viewport-calibrated glowing neon grid for landing page.
 *   Uses a balanced opacity and center text-clearing vignette so typography remains 100% crisp and readable.
 * - mode="mouse": Interactive cursor-following spotlight for focused screens (Login & Signup).
 */
export function NeonGridBackground({
  mode = 'mouse', // 'viewport' | 'mouse'
  gridSize = 38,
  glowRadius = 320,
  className = '',
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (mode !== 'mouse') return;

    const el = containerRef.current;
    if (!el) return;

    let isVisible = false;

    const handlePointerMove = (e) => {
      if (!isVisible) {
        isVisible = true;
        el.style.setProperty('--mouse-opacity', '1');
      }
      el.style.setProperty('--mouse-x', `${e.clientX}px`);
      el.style.setProperty('--mouse-y', `${e.clientY}px`);
    };

    const handlePointerLeave = () => {
      isVisible = false;
      el.style.setProperty('--mouse-opacity', '0');
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('mouseleave', handlePointerLeave);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('mouseleave', handlePointerLeave);
    };
  }, [mode]);

  if (mode === 'viewport') {
    return (
      <div
        className={`fixed inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
        aria-hidden="true"
      >
        {/* 1. Base subtle geometric matrix across full viewport */}
        <div
          className="absolute inset-0 opacity-[0.08] dark:opacity-[0.12]"
          style={{
            backgroundImage: `
              linear-gradient(to right, currentColor 1px, transparent 1px),
              linear-gradient(to bottom, currentColor 1px, transparent 1px)
            `,
            backgroundSize: `${gridSize}px ${gridSize}px`,
          }}
        />

        {/* 2. Soft, ambient viewport cyber glow (diffuse, non-glaring) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(
                ellipse 70vw 45vh at 50% 28%,
                rgba(6, 182, 212, 0.10) 0%,
                rgba(79, 70, 229, 0.06) 40%,
                transparent 75%
              ),
              radial-gradient(
                ellipse 85vw 40vh at 50% 80%,
                rgba(99, 102, 241, 0.05) 0%,
                transparent 70%
              )
            `,
          }}
        />

        {/* 3. Clearly visible illuminated neon grid lines (calibrated for high text contrast) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(6, 182, 212, 0.22) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(99, 102, 241, 0.20) 1px, transparent 1px)
            `,
            backgroundSize: `${gridSize}px ${gridSize}px`,
            WebkitMaskImage: `
              radial-gradient(
                ellipse 90vw 80vh at 50% 32%,
                black 30%,
                rgba(0, 0, 0, 0.5) 60%,
                rgba(0, 0, 0, 0.15) 85%,
                transparent 100%
              )
            `,
            maskImage: `
              radial-gradient(
                ellipse 90vw 80vh at 50% 32%,
                black 30%,
                rgba(0, 0, 0, 0.5) 60%,
                rgba(0, 0, 0, 0.15) 85%,
                transparent 100%
              )
            `,
          }}
        />

        {/* 4. Subtle Landmark Nodes at intersections (framing the viewport) */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-60"
          style={{
            backgroundImage: `radial-gradient(circle 1.5px at 1px 1px, rgba(34, 211, 238, 0.8) 100%, transparent 0)`,
            backgroundSize: `${gridSize}px ${gridSize}px`,
            WebkitMaskImage: `
              radial-gradient(
                ellipse 75vw 60vh at 50% 32%,
                black 15%,
                rgba(0, 0, 0, 0.3) 50%,
                transparent 80%
              )
            `,
            maskImage: `
              radial-gradient(
                ellipse 75vw 60vh at 50% 32%,
                black 15%,
                rgba(0, 0, 0, 0.3) 50%,
                transparent 80%
              )
            `,
          }}
        />
      </div>
    );
  }

  // mode === 'mouse' (Interactive cursor spotlight for Login & Signup)
  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
      style={{
        '--mouse-x': '-999px',
        '--mouse-y': '-999px',
        '--mouse-opacity': '0',
      }}
      aria-hidden="true"
    >
      {/* 1. Base dormant subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.06] dark:opacity-[0.08]"
        style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: `${gridSize}px ${gridSize}px`,
        }}
      />

      {/* 2. Reactive glowing radial aura */}
      <div
        className="absolute inset-0 transition-opacity duration-300 ease-out"
        style={{
          opacity: 'var(--mouse-opacity)',
          background: `radial-gradient(
            circle ${glowRadius * 0.85}px at var(--mouse-x) var(--mouse-y),
            rgba(6, 182, 212, 0.16) 0%,
            rgba(79, 70, 229, 0.10) 45%,
            rgba(15, 23, 42, 0) 75%
          )`,
        }}
      />

      {/* 3. Reactive illuminated neon grid lines */}
      <div
        className="absolute inset-0 transition-opacity duration-300 ease-out"
        style={{
          opacity: 'var(--mouse-opacity)',
          backgroundImage: `
            linear-gradient(to right, rgba(6, 182, 212, 0.40) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(99, 102, 241, 0.35) 1px, transparent 1px)
          `,
          backgroundSize: `${gridSize}px ${gridSize}px`,
          WebkitMaskImage: `radial-gradient(
            circle ${glowRadius}px at var(--mouse-x) var(--mouse-y),
            black 0%,
            rgba(0, 0, 0, 0.7) 40%,
            rgba(0, 0, 0, 0.2) 70%,
            transparent 100%
          )`,
          maskImage: `radial-gradient(
            circle ${glowRadius}px at var(--mouse-x) var(--mouse-y),
            black 0%,
            rgba(0, 0, 0, 0.7) 40%,
            rgba(0, 0, 0, 0.2) 70%,
            transparent 100%
          )`,
        }}
      />

      {/* 4. Intersection node highlights */}
      <div
        className="absolute inset-0 transition-opacity duration-300 ease-out"
        style={{
          opacity: 'var(--mouse-opacity)',
          backgroundImage: `radial-gradient(circle 1.5px at 1px 1px, rgba(34, 211, 238, 0.85) 100%, transparent 0)`,
          backgroundSize: `${gridSize}px ${gridSize}px`,
          WebkitMaskImage: `radial-gradient(
            circle ${glowRadius * 0.65}px at var(--mouse-x) var(--mouse-y),
            black 0%,
            rgba(0, 0, 0, 0.4) 60%,
            transparent 100%
          )`,
          maskImage: `radial-gradient(
            circle ${glowRadius * 0.65}px at var(--mouse-x) var(--mouse-y),
            black 0%,
            rgba(0, 0, 0, 0.4) 60%,
            transparent 100%
          )`,
        }}
      />
    </div>
  );
}

export default NeonGridBackground;
