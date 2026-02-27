import React from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const NotificationAlert = ({ notification, onDismiss }) => {
  const getAlertConfig = () => {
    switch (notification?.type) {
      case 'exam':
        return {
          icon: 'Calendar',
          bgColor: 'bg-primary/10',
          borderColor: 'border-primary',
          iconColor: 'text-primary'
        };
      case 'result':
        return {
          icon: 'Award',
          bgColor: 'bg-success/10',
          borderColor: 'border-success',
          iconColor: 'text-success'
        };
      case 'warning':
        return {
          icon: 'AlertTriangle',
          bgColor: 'bg-warning/10',
          borderColor: 'border-warning',
          iconColor: 'text-warning'
        };
      case 'info':
        return {
          icon: 'Info',
          bgColor: 'bg-accent/10',
          borderColor: 'border-accent',
          iconColor: 'text-accent'
        };
      default:
        return {
          icon: 'Bell',
          bgColor: 'bg-muted',
          borderColor: 'border-border',
          iconColor: 'text-muted-foreground'
        };
    }
  };

  const config = getAlertConfig();

  return (
    <div className={`${config?.bgColor} border-l-4 ${config?.borderColor} rounded-lg p-4 shadow-md`}>
      <div className="flex items-start space-x-3">
        <div className={`w-10 h-10 ${config?.bgColor} rounded-lg flex items-center justify-center shrink-0`}>
          <Icon name={config?.icon} size={20} className={config?.iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm md:text-base font-medium text-foreground mb-1">
            {notification?.title}
          </h4>
          <p className="text-xs md:text-sm text-muted-foreground mb-3">
            {notification?.message}
          </p>
          {notification?.action && (
            <Button variant="ghost" size="sm" iconName="ArrowRight" iconPosition="right">
              {notification?.action}
            </Button>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(notification?.id)}
            className="p-1 text-muted-foreground hover:text-foreground transition-smooth"
          >
            <Icon name="X" size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

export default NotificationAlert;