import React from 'react';

/**
 * SmartProctor Brand text component (emblem logo removed per requirement).
 */
export function SmartProctorLogo({
  className = '',
  showText = false,
  textClassName = '',
}) {
  if (showText) {
    return (
      <span className={`text-xl font-bold tracking-tight text-slate-900 dark:text-white select-none ${textClassName || className}`}>
        Smart<span className="text-blue-600 dark:text-cyan-400">Proctor</span>
      </span>
    );
  }
  return null;
}

export default SmartProctorLogo;
