import React, { useEffect, useMemo, useState } from 'react';

const WATERMARK_POSITIONS = [
  'top-[6%] left-[4%]',
  'top-[6%] right-[4%]',
  'top-[48%] left-[2%]',
  'top-[48%] right-[2%]',
  'bottom-[6%] left-[4%]',
  'bottom-[6%] right-[4%]',
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
          className={`absolute ${position} max-w-[28rem] -rotate-18 rounded-md border border-primary/10 bg-background/5 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.3em] text-primary/12 shadow-none backdrop-blur-[1px] whitespace-nowrap`}
        >
          {watermarkText}
        </div>
      ))}
    </div>
  );
};

export default ProctoredWatermarkOverlay;
