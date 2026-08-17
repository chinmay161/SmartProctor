import React from 'react';
import Icon from '../../../components/AppIcon';

const FeatureHighlights = () => {
  const features = [
    {
      icon: 'Video',
      title: 'Live Proctoring',
      description: 'Real-time webcam monitoring with AI-powered violation detection'
    },
    {
      icon: 'Monitor',
      title: 'Screen Recording',
      description: 'Comprehensive screen capture throughout exam duration'
    },
    {
      icon: 'Shield',
      title: 'Browser Lockdown',
      description: 'Prevent tab switching and unauthorized application access'
    },
    {
      icon: 'BarChart3',
      title: 'Analytics Dashboard',
      description: 'Detailed reports and insights on exam performance'
    }
  ];

  return (
    <div className="hidden lg:flex lg:flex-col lg:justify-center lg:w-1/2 bg-linear-to-br from-primary/10 via-accent/5 to-background p-8 lg:p-12">
      <div className="max-w-xl">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
            <Icon name="GraduationCap" size={28} color="var(--color-primary)" />
          </div>
          <h2 className="text-2xl lg:text-3xl font-heading font-semibold text-foreground">
            SmartProctor
          </h2>
        </div>

        <h3 className="text-3xl lg:text-4xl font-heading font-semibold text-foreground mb-4">
          Secure Online Exam Proctoring
        </h3>
        <p className="text-base lg:text-lg text-muted-foreground mb-8 lg:mb-12">
          Ensure academic integrity with comprehensive anti-cheating measures and real-time monitoring for remote assessments.
        </p>

        <div className="space-y-6">
          {features?.map((feature, index) => (
            <div key={index} className="flex items-start space-x-4 p-4 bg-card/50 rounded-lg border border-border/50 transition-smooth hover:bg-card hover:shadow-md">
              <div className={`w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center shrink-0`}>
                <Icon name={feature?.icon} size={24} color="var(--color-primary)" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-base lg:text-lg font-medium text-foreground mb-1">
                  {feature?.title}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {feature?.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 lg:mt-12 p-6 bg-success/10 border border-success/20 rounded-lg">
          <div className="flex items-start space-x-3">
            <Icon name="Award" size={24} className="text-success shrink-0" />
            <div>
              <h4 className="text-base font-medium text-foreground mb-2">
                Trusted by Leading Institutions
              </h4>
              <p className="text-sm text-muted-foreground">
                Join Harvard, MIT, Stanford, and 500+ other educational institutions using SmartProctor for secure remote assessments.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeatureHighlights;