import React, { useState, useEffect } from 'react';
import Icon from '../AppIcon';

const ExamStatusIndicator = ({ 
  examTitle = 'Mathematics Final Exam',
  examDate = '2026-01-25',
  examTime = '10:00 AM',
  status = 'upcoming',
  duration = 120,
  violationCount = 0,
  connectionStatus = 'connected',
  userRole = 'student'
}) => {
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (status === 'in-progress' && duration) {
      const endTime = Date.now() + duration * 60 * 1000;
      
      const timer = setInterval(() => {
        const remaining = Math.max(0, endTime - Date.now());
        setTimeRemaining(remaining);
        
        if (remaining === 0) {
          clearInterval(timer);
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [status, duration]);

  const formatTimeRemaining = (ms) => {
    if (!ms) return '00:00:00';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours?.toString()?.padStart(2, '0')}:${minutes?.toString()?.padStart(2, '0')}:${seconds?.toString()?.padStart(2, '0')}`;
  };

  const getStatusConfig = () => {
    switch (status) {
      case 'upcoming':
        return {
          icon: 'Clock',
          color: 'text-accent',
          bgColor: 'bg-accent/20',
          label: 'Upcoming',
          description: `Scheduled for ${examDate} at ${examTime}`
        };
      case 'in-progress':
        return {
          icon: 'PlayCircle',
          color: 'text-success',
          bgColor: 'bg-success/20',
          label: 'In Progress',
          description: `Time remaining: ${formatTimeRemaining(timeRemaining)}`
        };
      case 'completed':
        return {
          icon: 'CheckCircle',
          color: 'text-success',
          bgColor: 'bg-success/20',
          label: 'Completed',
          description: 'Exam submitted successfully'
        };
      case 'missed':
        return {
          icon: 'XCircle',
          color: 'text-error',
          bgColor: 'bg-error/20',
          label: 'Missed',
          description: 'Exam window has closed'
        };
      default:
        return {
          icon: 'AlertCircle',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
          label: 'Unknown',
          description: 'Status unavailable'
        };
    }
  };

  const getConnectionConfig = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          icon: 'Wifi',
          color: 'text-success',
          label: 'Connected'
        };
      case 'unstable':
        return {
          icon: 'WifiOff',
          color: 'text-warning',
          label: 'Unstable'
        };
      case 'disconnected':
        return {
          icon: 'WifiOff',
          color: 'text-error',
          label: 'Disconnected'
        };
      default:
        return {
          icon: 'Wifi',
          color: 'text-muted-foreground',
          label: 'Unknown'
        };
    }
  };

  const statusConfig = getStatusConfig();
  const connectionConfig = getConnectionConfig();

  return (
    <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden transition-smooth hover:shadow-lg">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start space-x-4 flex-1">
            <div className={`w-12 h-12 ${statusConfig?.bgColor} rounded-lg flex items-center justify-center shrink-0`}>
              <Icon name={statusConfig?.icon} size={24} className={statusConfig?.color} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-heading font-semibold text-foreground mb-1">{examTitle}</h3>
              <div className="flex items-center space-x-2 mb-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${statusConfig?.bgColor} ${statusConfig?.color}`}>
                  {statusConfig?.label}
                </span>
                {status === 'in-progress' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-primary/20 text-primary">
                    Live
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{statusConfig?.description}</p>
            </div>
          </div>
          
          {status === 'in-progress' && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-smooth"
            >
              <Icon name={isExpanded ? 'ChevronUp' : 'ChevronDown'} size={20} />
            </button>
          )}
        </div>

        {status === 'in-progress' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center space-x-3">
                <Icon name="Timer" size={20} className="text-primary" />
                <span className="text-sm font-medium text-foreground">Time Remaining</span>
              </div>
              <span className="text-2xl font-data font-semibold text-primary">
                {formatTimeRemaining(timeRemaining)}
              </span>
            </div>

            {isExpanded && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Icon name={connectionConfig?.icon} size={18} className={connectionConfig?.color} />
                    <span className="text-sm text-muted-foreground">Connection Status</span>
                  </div>
                  <span className={`text-sm font-medium ${connectionConfig?.color}`}>
                    {connectionConfig?.label}
                  </span>
                </div>

                {userRole === 'teacher' && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Icon name="AlertTriangle" size={18} className={violationCount > 0 ? 'text-warning' : 'text-muted-foreground'} />
                      <span className="text-sm text-muted-foreground">Violations Detected</span>
                    </div>
                    <span className={`text-sm font-medium font-data ${violationCount > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                      {violationCount}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Icon name="Video" size={18} className="text-success" />
                    <span className="text-sm text-muted-foreground">Camera Status</span>
                  </div>
                  <span className="text-sm font-medium text-success">Active</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Icon name="Monitor" size={18} className="text-success" />
                    <span className="text-sm text-muted-foreground">Screen Recording</span>
                  </div>
                  <span className="text-sm font-medium text-success">Active</span>
                </div>
              </div>
            )}
          </div>
        )}

        {status === 'upcoming' && (
          <div className="mt-4 flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Icon name="Clock" size={16} />
              <span>Duration: {duration} minutes</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Icon name="FileText" size={16} />
              <span>50 Questions</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamStatusIndicator;
