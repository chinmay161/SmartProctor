import React, { useState, useEffect, useRef } from 'react';
import Icon from '../AppIcon';


const NotificationCenter = ({ userRole = 'student' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      type: 'exam',
      title: 'Upcoming Exam Reminder',
      message: 'Mathematics Final Exam starts in 2 hours',
      timestamp: '2026-01-20T12:30:00',
      read: false,
      priority: 'high'
    },
    {
      id: 2,
      type: 'violation',
      title: 'Violation Alert',
      message: 'Multiple face detection in Student ID: 2024-001',
      timestamp: '2026-01-20T11:45:00',
      read: false,
      priority: 'critical'
    },
    {
      id: 3,
      type: 'system',
      title: 'System Update',
      message: 'New proctoring features available',
      timestamp: '2026-01-20T10:00:00',
      read: true,
      priority: 'low'
    },
    {
      id: 4,
      type: 'success',
      title: 'Exam Submitted',
      message: 'Your exam has been successfully submitted',
      timestamp: '2026-01-20T09:30:00',
      read: true,
      priority: 'medium'
    }
  ]);

  const notificationRef = useRef(null);
  const unreadCount = notifications?.filter(n => !n?.read)?.length;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef?.current && !notificationRef?.current?.contains(event?.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'exam':
        return { name: 'FileText', color: 'text-primary', bg: 'bg-primary/20' };
      case 'violation':
        return { name: 'AlertTriangle', color: 'text-error', bg: 'bg-error/20' };
      case 'system':
        return { name: 'Settings', color: 'text-accent', bg: 'bg-accent/20' };
      case 'success':
        return { name: 'CheckCircle', color: 'text-success', bg: 'bg-success/20' };
      default:
        return { name: 'Bell', color: 'text-muted-foreground', bg: 'bg-muted' };
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'critical':
        return { label: 'Critical', color: 'bg-error text-error-foreground' };
      case 'high':
        return { label: 'High', color: 'bg-warning text-warning-foreground' };
      case 'medium':
        return { label: 'Medium', color: 'bg-accent text-accent-foreground' };
      case 'low':
        return { label: 'Low', color: 'bg-muted text-muted-foreground' };
      default:
        return null;
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return date?.toLocaleDateString();
  };

  const markAsRead = (id) => {
    setNotifications(notifications?.map(n => 
      n?.id === id ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(notifications?.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id) => {
    setNotifications(notifications?.filter(n => n?.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <div className="relative" ref={notificationRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-smooth"
      >
        <Icon name="Bell" size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-error text-error-foreground text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-popover border border-border rounded-lg shadow-xl overflow-hidden z-1100">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-heading font-semibold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-primary hover:text-primary/80 transition-smooth"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-128 overflow-y-auto">
            {notifications?.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon name="Bell" size={32} className="text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No notifications</p>
              </div>
            ) : (
              notifications?.map((notification) => {
                const iconConfig = getNotificationIcon(notification?.type);
                const priorityBadge = getPriorityBadge(notification?.priority);

                return (
                  <div
                    key={notification?.id}
                    className={`p-4 border-b border-border hover:bg-muted/50 transition-smooth cursor-pointer ${
                      !notification?.read ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => markAsRead(notification?.id)}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`w-10 h-10 ${iconConfig?.bg} rounded-full flex items-center justify-center shrink-0`}>
                        <Icon name={iconConfig?.name} size={18} className={iconConfig?.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1">
                          <h4 className="text-sm font-medium text-foreground">{notification?.title}</h4>
                          {!notification?.read && (
                            <div className="w-2 h-2 bg-primary rounded-full shrink-0 ml-2 mt-1"></div>
                          )}
                        </div>
                        {priorityBadge && (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${priorityBadge?.color}`}>
                            {priorityBadge?.label}
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground mb-2">{notification?.message}</p>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground font-caption">
                            {formatTimestamp(notification?.timestamp)}
                          </p>
                          <button
                            onClick={(e) => {
                              e?.stopPropagation();
                              deleteNotification(notification?.id);
                            }}
                            className="text-xs text-error hover:text-error/80 transition-smooth"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {notifications?.length > 0 && (
            <div className="p-3 border-t border-border flex items-center justify-between">
              <button
                onClick={clearAll}
                className="text-xs text-error hover:text-error/80 transition-smooth"
              >
                Clear all
              </button>
              <button className="text-xs text-primary hover:text-primary/80 transition-smooth">
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;