import React, { useEffect, useMemo, useState } from 'react';

const WATERMARK_POSITIONS = [
  'top-[6%] left-[4%] sm:left-[6%]',
  'top-[6%] right-[4%] sm:right-[6%] hidden sm:block',
  'top-[48%] left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-[4%]',
  'top-[48%] right-[4%] hidden sm:block',
  'bottom-[6%] left-[4%] sm:left-[6%]',
  'bottom-[6%] right-[4%] sm:right-[6%] hidden sm:block',
];

const ProctoredWatermarkOverlay = ({
  examTitle,
  userLabel,
  sessionId,
}) => {
  const [timestamp, setTimestamp] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTimestamp(new Date());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const watermarkText = useMemo(() => {
    const pieces = [
      'SMARTPROCTOR',
      'PROCTORED SESSION',
      examTitle || 'Exam Session',
      userLabel || 'Student',
      sessionId ? `Session ${String(sessionId).slice(0, 8)}` : null,
      timestamp.toLocaleString(),
    ].filter(Boolean);

    return pieces.join(' • ');
  }, [examTitle, sessionId, timestamp, userLabel]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none" aria-hidden="true">
      {WATERMARK_POSITIONS.map((position, index) => (
        <div
          key={`${position}-${index}`}
          className={`absolute ${position} max-w-[85vw] sm:max-w-[28rem] -rotate-18 rounded-md border border-primary/10 bg-background/5 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[8px] font-semibold uppercase tracking-[0.2em] sm:tracking-[0.3em] text-primary/12 shadow-none backdrop-blur-[1px] whitespace-nowrap overflow-hidden text-ellipsis`}
        >
          {watermarkText}
        </div>
      ))}
    </div>
  );
};

export default ProctoredWatermarkOverlay;
