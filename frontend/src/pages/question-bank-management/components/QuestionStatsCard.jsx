import React from 'react';
import Icon from '../../../components/AppIcon';

const QuestionStatsCard = ({ stats }) => {
  const statItems = [
    {
      icon: 'Database',
      label: 'Total Questions',
      value: stats?.totalQuestions,
      color: 'text-primary',
      bg: 'bg-primary/20'
    },
    {
      icon: 'ListChecks',
      label: 'MCQ Questions',
      value: stats?.mcqCount,
      color: 'text-success',
      bg: 'bg-success/20'
    },
    {
      icon: 'FileText',
      label: 'Essay Questions',
      value: stats?.essayCount,
      color: 'text-accent',
      bg: 'bg-accent/20'
    },
    {
      icon: 'TrendingUp',
      label: 'Avg Performance',
      value: `${stats?.avgPerformance}%`,
      color: 'text-warning',
      bg: 'bg-warning/20'
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      {statItems?.map((item, index) => (
        <div
          key={index}
          className="bg-card border border-border rounded-lg shadow-md p-4 md:p-6 hover:shadow-lg transition-smooth"
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 md:w-12 md:h-12 ${item?.bg} rounded-lg flex items-center justify-center`}>
              <Icon name={item?.icon} size={20} className={item?.color} />
            </div>
          </div>
          <p className="text-2xl md:text-3xl font-data font-bold text-foreground mb-1">
            {item?.value}
          </p>
          <p className="text-xs md:text-sm text-muted-foreground">{item?.label}</p>
        </div>
      ))}
    </div>
  );
};

export default QuestionStatsCard;