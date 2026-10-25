import React from 'react';

/**
 * SmartProctor Sentinel Iris Brand Emblem
 * Represents security (shield), AI vision & gaze (iris), and biometric landmarks (neural mesh).
 */
export function SmartProctorLogo({
  size = 36,
  className = '',
  showText = false,
  textClassName = '',
  animated = false,
}) {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`flex-shrink-0 transition-transform duration-300 hover:scale-105 ${animated ? 'animate-pulse' : ''}`}
        aria-label="SmartProctor Logo"
      >
        <defs>
          <linearGradient id="spShieldGrad" x1="15" y1="10" x2="85" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4F46E5" />
            <stop offset="50%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>

          <radialGradient id="spIrisGlow" cx="50" cy="50" r="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.85" />
            <stop offset="60%" stopColor="#4F46E5" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#0B0F19" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="spPupilGrad" x1="42" y1="42" x2="58" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>

          <filter id="spGlowFilter" x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Shield Boundary */}
        <path
          d="M50 12 L82 24 C82 54 67 76 50 88 C33 76 18 54 18 24 Z"
          stroke="url(#spShieldGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="#0B0F19"
        />

        {/* Facial Landmark & Neural Grid Struts */}
        <path
          d="M50 12 L50 36 M18 24 L34 40 M82 24 L66 40 M50 88 L50 64"
          stroke="#06B6D4"
          strokeOpacity="0.35"
          strokeWidth="2.5"
          strokeDasharray="2 2"
        />

        {/* Biometric Eye Gaze Contour */}
        <path
          d="M28 50 C36 38 64 38 72 50 C64 62 36 62 28 50 Z"
          stroke="#22D3EE"
          strokeWidth="4"
          fill="url(#spIrisGlow)"
        />

        {/* Iris Ring */}
        <circle cx="50" cy="50" r="11" stroke="#38BDF8" strokeWidth="2.5" fill="none" />

        {/* Pupil Focal Core */}
        <circle cx="50" cy="50" r="5" fill="url(#spPupilGrad)" />
        <circle cx="48.5" cy="48.5" r="1.5" fill="#FFFFFF" />

        {/* FaceMesh Anchor Nodes */}
        <circle cx="34" cy="40" r="2.5" fill="#22D3EE" />
        <circle cx="66" cy="40" r="2.5" fill="#22D3EE" />
        <circle cx="50" cy="36" r="2.5" fill="#4F46E5" />
      </svg>

      {showText && (
        <span className={`text-xl font-bold tracking-tight text-slate-900 dark:text-white ${textClassName}`}>
          Smart<span className="text-blue-600 dark:text-cyan-400">Proctor</span>
        </span>
      )}
    </div>
  );
}

export default SmartProctorLogo;
