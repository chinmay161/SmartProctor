import React, { useState, useEffect, useRef } from 'react';
import Icon from '../AppIcon';

const STORAGE_KEY = 'sp:notifications';

const DEFAULT_NOTIFICATIONS = [
  {
    id: 'notif-1',
    type: 'system',
    title: 'Platform Ready',
    message: 'Client-side MediaPipe vision and YAMNet neural audio are loaded.',
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    read: false,
    priority: 'low',
  },
  {
    id: 'notif-2',
    type: 'exam',
    title: 'Hardware Readiness',
    message: 'You can test your webcam and microphone from the dashboard before your exam.',
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    read: true,
    priority: 'medium',
  },
];

const NotificationCenter = ({ userRole = 'student' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    return DEFAULT_NOTIFICATIONS;
  });

  const notificationRef = useRef(null);
  const unreadCount = notifications?.filter((n) => !n?.read)?.length || 0;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch {
      // ignore
    }
  }, [notifications]);

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
        return { name: 'AlertTriangle', color: 'text-destructive', bg: 'bg-destructive/20' };
      case 'system':
        return { name: 'Settings', color: 'text-blue-500', bg: 'bg-blue-500/20' };
      case 'success':
        return { name: 'CheckCircle', color: 'text-emerald-500', bg: 'bg-emerald-500/20' };
      default:
        return { name: 'Bell', color: 'text-muted-foreground', bg: 'bg-muted' };
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'critical':
        return { label: 'Critical', color: 'bg-destructive text-destructive-foreground' };
      case 'high':
        return { label: 'High', color: 'bg-warning text-warning-foreground' };
      case 'medium':
        return { label: 'Medium', color: 'bg-primary/10 text-primary' };
      case 'low':
        return { label: 'Info', color: 'bg-muted text-muted-foreground' };
      default:
        return null;
    }
  };

  const formatTimestamp = (timestamp) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const markAsRead = (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <div className="relative" ref={notificationRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="View notifications"
        aria-expanded={isOpen}
        className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <Icon name="Bell" size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          <div className="p-3.5 border-b border-border flex items-center justify-between bg-muted/20">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-xs text-primary hover:underline font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-muted/60 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Icon name="CheckCircle" size={24} className="text-emerald-500" />
                </div>
                <p className="text-sm font-medium text-foreground">You're all caught up!</p>
                <p className="text-xs text-muted-foreground mt-1">No new notifications</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const iconConfig = getNotificationIcon(notification.type);
                const priorityBadge = getPriorityBadge(notification.priority);

                return (
                  <div
                    key={notification.id}
                    className={`p-3.5 hover:bg-muted/40 transition-colors cursor-pointer flex items-start gap-3 ${
                      !notification.read ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => markAsRead(notification.id)}
                  >
                    <div
                      className={`w-8 h-8 ${iconConfig.bg} rounded-lg flex items-center justify-center shrink-0 mt-0.5`}
                    >
                      <Icon name={iconConfig.name} size={16} className={iconConfig.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className="text-xs font-semibold text-foreground truncate">
                          {notification.title}
                        </h4>
                        {!notification.read && (
                          <span className="w-2 h-2 bg-primary rounded-full shrink-0"></span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5 leading-relaxed">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{formatTimestamp(notification.timestamp)}</span>
                        {priorityBadge && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${priorityBadge.color}`}>
                            {priorityBadge.label}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                      className="text-muted-foreground hover:text-destructive transition p-1"
                      aria-label="Delete notification"
                    >
                      <Icon name="X" size={13} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-2.5 border-t border-border flex items-center justify-end bg-muted/20">
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-muted-foreground hover:text-destructive transition px-2 py-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
