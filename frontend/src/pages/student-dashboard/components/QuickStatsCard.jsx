import React from 'react';
import Icon from '../../../components/AppIcon';

const QuickStatsCard = ({ stats }) => {
  const statItems = [
    {
      label: 'Total Exams',
      value: stats?.totalExams,
      icon: 'FileText',
      color: 'text-primary',
      bgColor: 'bg-primary/20'
    },
    {
      label: 'Completed',
      value: stats?.completedExams,
      icon: 'CheckCircle',
      color: 'text-success',
      bgColor: 'bg-success/20'
    },
    {
      label: 'Upcoming',
      value: stats?.upcomingExams,
      icon: 'Clock',
      color: 'text-accent',
      bgColor: 'bg-accent/20'
    },
    {
      label: 'Average Score',
      value: `${stats?.averageScore}%`,
      icon: 'TrendingUp',
      color: 'text-success',
      bgColor: 'bg-success/20'
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statItems?.map((item, index) => (
        <div
          key={index}
          className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md hover:shadow-lg transition-smooth"
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`w-10 h-10 md:w-12 md:h-12 ${item?.bgColor} rounded-lg flex items-center justify-center`}>
              <Icon name={item?.icon} size={20} className={item?.color} />
            </div>
          </div>
          <p className="text-2xl md:text-3xl font-heading font-bold text-foreground mb-1">
            {item?.value}
          </p>
          <p className="text-xs md:text-sm text-muted-foreground">{item?.label}</p>
        </div>
      ))}
    </div>
  );
};

export default QuickStatsCard;