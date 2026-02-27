import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/AppIcon';


const QuickActionsPanel = () => {
  const navigate = useNavigate();

  const quickActions = [
    {
      icon: 'FilePlus',
      label: 'Create New Exam',
      description: 'Set up a new assessment',
      color: 'text-primary',
      bg: 'bg-primary/20',
      action: () => navigate('/exam-creation')
    },
    {
      icon: 'Database',
      label: 'Question Bank',
      description: 'Manage question library',
      color: 'text-success',
      bg: 'bg-success/20',
      action: () => navigate('/question-bank-management')
    },
    {
      icon: 'Copy',
      label: 'Exam Templates',
      description: 'Use saved templates',
      color: 'text-accent',
      bg: 'bg-accent/20',
      action: () => {}
    },
    {
      icon: 'Users',
      label: 'Student Management',
      description: 'Manage enrollments',
      color: 'text-warning',
      bg: 'bg-warning/20',
      action: () => {}
    }
  ];

  return (
    <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <h2 className="text-base md:text-lg font-heading font-semibold text-foreground">Quick Actions</h2>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">Frequently used tools</p>
      </div>
      <div className="p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickActions?.map((action, index) => (
            <button
              key={index}
              onClick={action?.action}
              className="flex items-start space-x-3 p-4 bg-muted/30 rounded-lg transition-smooth hover:bg-muted/50 hover:shadow-md text-left"
            >
              <div className={`w-12 h-12 ${action?.bg} rounded-lg flex items-center justify-center shrink-0`}>
                <Icon name={action?.icon} size={24} className={action?.color} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground mb-1">{action?.label}</h3>
                <p className="text-xs text-muted-foreground">{action?.description}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-border">
          <h3 className="text-sm font-heading font-semibold text-foreground mb-3">Recent Activity</h3>
          <div className="space-y-3">
            <div className="flex items-start space-x-3 p-3 bg-muted/30 rounded-lg">
              <div className="w-8 h-8 bg-success/20 rounded-full flex items-center justify-center shrink-0">
                <Icon name="CheckCircle" size={16} className="text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs md:text-sm text-foreground font-medium">Physics Midterm graded</p>
                <p className="text-xs text-muted-foreground mt-0.5">2 hours ago</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-muted/30 rounded-lg">
              <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                <Icon name="FilePlus" size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs md:text-sm text-foreground font-medium">New exam created</p>
                <p className="text-xs text-muted-foreground mt-0.5">5 hours ago</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-muted/30 rounded-lg">
              <div className="w-8 h-8 bg-accent/20 rounded-full flex items-center justify-center shrink-0">
                <Icon name="Database" size={16} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs md:text-sm text-foreground font-medium">Question bank updated</p>
                <p className="text-xs text-muted-foreground mt-0.5">1 day ago</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickActionsPanel;