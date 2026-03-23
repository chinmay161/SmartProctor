import React, { useEffect, useMemo, useState } from 'react';

const WATERMARK_POSITIONS = [
  'top-[10%] left-[6%]',
  'top-[18%] right-[8%]',
  'top-[42%] left-[14%]',
  'top-[56%] right-[12%]',
  'bottom-[18%] left-[10%]',
  'bottom-[12%] right-[16%]',
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
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden select-none">
      {WATERMARK_POSITIONS.map((position, index) => (
        <div
          key={`${position}-${index}`}
          className={`absolute ${position} -rotate-24 rounded-md border border-primary/15 bg-background/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-primary/30 shadow-sm backdrop-blur-[1px]`}
        >
          {watermarkText}
        </div>
      ))}
    </div>
  );
};

export default ProctoredWatermarkOverlay;
