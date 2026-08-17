import React from 'react';
import Icon from '../AppIcon';

const SecurityBadgeDisplay = ({ variant = 'footer' }) => {
  const badges = [
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
    },
    {
      icon: 'CheckCircle',
      label: 'WCAG 2.1 AA',
      description: 'Accessibility',
      color: 'text-success'
    }
  ];

  if (variant === 'footer') {
    return (
      <div className="bg-card border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-6">
            <h3 className="text-sm font-heading font-semibold text-foreground mb-2">
              Trusted by Educational Institutions Worldwide
            </h3>
            <p className="text-xs text-muted-foreground">
              Enterprise-grade security and compliance for academic integrity
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {badges?.map((badge, index) => (
              <div
                key={index}
                className="flex flex-col items-center text-center p-4 bg-muted/30 rounded-lg transition-smooth hover:bg-muted/50"
              >
                <div className={`w-12 h-12 ${badge?.color?.replace('text-', 'bg-')}/20 rounded-lg flex items-center justify-center mb-3`}>
                  <Icon name={badge?.icon} size={24} className={badge?.color} />
                </div>
                <h4 className="text-sm font-medium text-foreground mb-1">{badge?.label}</h4>
                <p className="text-xs text-muted-foreground">{badge?.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">
              © 2026 SmartProctor. All rights reserved. | 
              <button className="ml-2 text-primary hover:text-primary/80 transition-smooth">Privacy Policy</button> | 
              <button className="ml-2 text-primary hover:text-primary/80 transition-smooth">Terms of Service</button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-md">
      <h3 className="text-sm font-heading font-semibold text-foreground mb-4">
        Security & Compliance
      </h3>
      <div className="space-y-3">
        {badges?.map((badge, index) => (
          <div
            key={index}
            className="flex items-center space-x-3 p-3 bg-muted/30 rounded-lg transition-smooth hover:bg-muted/50"
          >
            <div className={`w-10 h-10 ${badge?.color?.replace('text-', 'bg-')}/20 rounded-lg flex items-center justify-center shrink-0`}>
              <Icon name={badge?.icon} size={20} className={badge?.color} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-foreground">{badge?.label}</h4>
              <p className="text-xs text-muted-foreground">{badge?.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SecurityBadgeDisplay;