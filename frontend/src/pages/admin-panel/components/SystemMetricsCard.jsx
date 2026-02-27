import React from 'react';
import Icon from '../../../components/AppIcon';

const SystemMetricsCard = ({ 
  title, 
  value, 
  change, 
  changeType = 'positive', 
  icon, 
  iconColor = 'text-primary',
  iconBg = 'bg-primary/20',
  trend = []
}) => {
  const changeColor = changeType === 'positive' ? 'text-success' : 
                     changeType === 'negative'? 'text-error' : 'text-muted-foreground';

  return (
    <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md transition-smooth hover:shadow-lg">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <h3 className="text-2xl md:text-3xl font-heading font-semibold text-foreground">
            {value}
          </h3>
        </div>
        <div className={`w-12 h-12 ${iconBg} rounded-lg flex items-center justify-center shrink-0`}>
          <Icon name={icon} size={24} className={iconColor} />
        </div>
      </div>
      {change && (
        <div className="flex items-center space-x-2">
          <Icon 
            name={changeType === 'positive' ? 'TrendingUp' : changeType === 'negative' ? 'TrendingDown' : 'Minus'} 
            size={16} 
            className={changeColor} 
          />
          <span className={`text-sm font-medium ${changeColor}`}>
            {change}
          </span>
          <span className="text-xs text-muted-foreground">vs last month</span>
        </div>
      )}
      {trend?.length > 0 && (
        <div className="mt-4 flex items-end space-x-1 h-8">
          {trend?.map((value, index) => (
            <div
              key={index}
              className="flex-1 bg-primary/30 rounded-t transition-smooth hover:bg-primary/50"
              style={{ height: `${value}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SystemMetricsCard;