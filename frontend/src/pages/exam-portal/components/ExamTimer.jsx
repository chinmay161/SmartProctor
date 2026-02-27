import React, { useState, useEffect } from 'react';
import Icon from '../../../components/AppIcon';

const ExamTimer = ({ duration, onTimeUp }) => {
  const [timeRemaining, setTimeRemaining] = useState(duration * 60); // Convert minutes to seconds

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onTimeUp?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onTimeUp]);

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