import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const UpcomingExamCard = ({ exam }) => {
  const navigate = useNavigate();
  const [timeUntilExam, setTimeUntilExam] = useState(null);

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const examDateTime = new Date(exam.scheduledDateTime);
      const now = new Date();
      const diff = examDateTime - now;

      if (diff <= 0) {
        setTimeUntilExam('Available Now');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeUntilExam(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeUntilExam(`${hours}h ${minutes}m`);
      } else {
        setTimeUntilExam(`${minutes}m`);
      }
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 60000);

    return () => clearInterval(interval);
  }, [exam?.scheduledDateTime]);

  const getStatusConfig = () => {
    const examDateTime = new Date(exam.scheduledDateTime);
    const now = new Date();
    const diff = examDateTime - now;

    if (diff <= 0 && diff > -exam?.duration * 60 * 1000) {
      return {
        label: 'Available Now',
        color: 'bg-success text-success-foreground',
        icon: 'PlayCircle'
      };
    } else if (diff <= 30 * 60 * 1000 && diff > 0) {
      return {
        label: 'Starting Soon',
        color: 'bg-warning text-warning-foreground',
        icon: 'Clock'
      };
    } else {
      return {
        label: 'Scheduled',
        color: 'bg-primary text-primary-foreground',
        icon: 'Calendar'
      };
    }
  };

  const statusConfig = getStatusConfig();
  const canStartExam = timeUntilExam === 'Available Now';

  return (
    <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md hover:shadow-lg transition-smooth">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-base md:text-lg font-heading font-semibold text-foreground mb-2">
            {exam?.title}
          </h3>
          <p className="text-sm text-muted-foreground mb-3">{exam?.course}</p>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${statusConfig?.color}`}>
            <Icon name={statusConfig?.icon} size={14} className="mr-1.5" />
            {statusConfig?.label}
          </span>
        </div>
        <div className="w-12 h-12 md:w-14 md:h-14 bg-primary/20 rounded-lg flex items-center justify-center shrink-0 ml-4">
          <Icon name="FileText" size={24} color="var(--color-primary)" />
        </div>
      </div>
      <div className="space-y-3 mb-4">
        <div className="flex items-center space-x-3 text-sm">
          <Icon name="Calendar" size={16} className="text-muted-foreground" />
          <span className="text-foreground">
            {new Date(exam.scheduledDateTime)?.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </span>
        </div>
        <div className="flex items-center space-x-3 text-sm">
          <Icon name="Clock" size={16} className="text-muted-foreground" />
          <span className="text-foreground">
            {new Date(exam.scheduledDateTime)?.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>
        <div className="flex items-center space-x-3 text-sm">
          <Icon name="Timer" size={16} className="text-muted-foreground" />
          <span className="text-foreground">{exam?.duration} minutes</span>
        </div>
        <div className="flex items-center space-x-3 text-sm">
          <Icon name="FileQuestion" size={16} className="text-muted-foreground" />
          <span className="text-foreground">{exam?.totalQuestions} questions</span>
        </div>
      </div>
      {timeUntilExam && timeUntilExam !== 'Available Now' && (
        <div className="bg-muted/50 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Time until exam:</span>
            <span className="text-base md:text-lg font-data font-semibold text-primary">
              {timeUntilExam}
            </span>
          </div>
        </div>
      )}
      <Button
        variant={canStartExam ? 'default' : 'outline'}
        fullWidth
        iconName={canStartExam ? 'PlayCircle' : 'Info'}
        iconPosition="left"
        disabled={!canStartExam}
      >
        {canStartExam ? 'Start Exam' : 'View Details'}
      </Button>
    </div>
  );
};

export default UpcomingExamCard;