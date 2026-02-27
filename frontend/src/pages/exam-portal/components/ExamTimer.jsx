import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../../components/AppIcon';

const getInitialSeconds = ({ initialSeconds, durationMinutes }) => {
  if (Number.isFinite(initialSeconds) && initialSeconds >= 0) {
    return Math.max(0, Math.floor(initialSeconds));
  }
  if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
    return Math.floor(durationMinutes * 60);
  }
  return 0;
};

const ExamTimer = ({ initialSeconds, durationMinutes, onTimeUp }) => {
  const [timeRemaining, setTimeRemaining] = useState(
    getInitialSeconds({ initialSeconds, durationMinutes })
  );
  const hasFiredTimeUpRef = useRef(false);

  useEffect(() => {
    setTimeRemaining(getInitialSeconds({ initialSeconds, durationMinutes }));
    hasFiredTimeUpRef.current = false;
  }, [initialSeconds, durationMinutes]);

  useEffect(() => {
    if (hasFiredTimeUpRef.current) {
      return undefined;
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          hasFiredTimeUpRef.current = true;
          onTimeUp?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onTimeUp, initialSeconds, durationMinutes]);

  const hours = Math.floor(timeRemaining / 3600);
  const minutes = Math.floor((timeRemaining % 3600) / 60);
  const seconds = timeRemaining % 60;

  const formatTime = (value) => value?.toString()?.padStart(2, '0');

  const getTimerColor = () => {
    if (timeRemaining < 300) return 'text-error'; // Less than 5 minutes
    if (timeRemaining < 900) return 'text-warning'; // Less than 15 minutes
    return 'text-foreground';
  };

  const getTimerBgColor = () => {
    if (timeRemaining < 300) return 'bg-error/20';
    if (timeRemaining < 900) return 'bg-warning/20';
    return 'bg-muted';
  };

  return (
    <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${getTimerBgColor()}`}>
      <Icon name="Clock" size={18} className={getTimerColor()} />
      <div className={`font-mono text-base md:text-lg font-semibold ${getTimerColor()}`}>
        {hours > 0 && `${formatTime(hours)}:`}
        {formatTime(minutes)}:{formatTime(seconds)}
      </div>
    </div>
  );
};

export default ExamTimer;
