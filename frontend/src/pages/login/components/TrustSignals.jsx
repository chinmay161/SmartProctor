import React from 'react';
import Icon from '../../../components/AppIcon';

const TrustSignals = () => {
  const trustBadges = [
    {
      icon: 'Shield',
      label: 'SSL Secured',
      description: '256-bit encryption',
      color: 'text-success'
    },
    {
      icon: 'Lock',
      label: 'FERPA Compliant',
      description: 'Educational privacy',
      color: 'text-primary'
    },
    {
      icon: 'Award',
      label: 'SOC 2 Certified',
      description: 'Security standards',
      color: 'text-accent'
    }
  ];

  return (
    <div className="mt-8 md:mt-12">
      <div className="text-center mb-4 md:mb-6">
        <p className="text-xs md:text-sm text-muted-foreground font-medium">
          Trusted by 500+ Educational Institutions Worldwide
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {trustBadges?.map((badge, index) => (
          <div
            key={index}
            className="flex flex-col items-center text-center p-4 md:p-5 bg-card border border-border rounded-lg transition-smooth hover:shadow-md"
          >
            <div className={`w-12 h-12 md:w-14 md:h-14 ${badge?.color?.replace('text-', 'bg-')}/20 rounded-lg flex items-center justify-center mb-3`}>
              <Icon name={badge?.icon} size={24} className={badge?.color} />
            </div>
            <h3 className="text-sm md:text-base font-medium text-foreground mb-1">
              {badge?.label}
            </h3>
            <p className="text-xs text-muted-foreground">{badge?.description}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 md:mt-8 flex flex-wrap items-center justify-center gap-4 md:gap-6 text-xs md:text-sm text-muted-foreground">
        <div className="flex items-center space-x-2">
          <Icon name="CheckCircle" size={16} className="text-success" />
          <span>99.9% Uptime</span>
        </div>
        <div className="flex items-center space-x-2">
          <Icon name="Users" size={16} className="text-primary" />
          <span>50K+ Active Users</span>
        </div>
        <div className="flex items-center space-x-2">
          <Icon name="Globe" size={16} className="text-accent" />
          <span>24/7 Support</span>
        </div>
      </div>
    </div>
  );
};

export default TrustSignals;