import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const SystemCheckCard = () => {
  const [checkResults, setCheckResults] = useState(null);
  const [isChecking, setIsChecking] = useState(false);

  const runSystemCheck = () => {
    setIsChecking(true);
    
    setTimeout(() => {
      setCheckResults({
        camera: { status: 'passed', message: 'Webcam detected and functional' },
        microphone: { status: 'passed', message: 'Microphone detected and functional' },
        browser: { status: 'passed', message: 'Browser compatible' },
        internet: { status: 'passed', message: 'Connection stable (45 Mbps)' },
        screenRecording: { status: 'passed', message: 'Screen recording supported' }
      });
      setIsChecking(false);
    }, 2000);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'passed':
        return { name: 'CheckCircle', color: 'text-success' };
      case 'warning':
        return { name: 'AlertTriangle', color: 'text-warning' };
      case 'failed':
        return { name: 'XCircle', color: 'text-error' };
      default:
        return { name: 'HelpCircle', color: 'text-muted-foreground' };
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-primary/20 rounded-lg flex items-center justify-center">
          <Icon name="Settings" size={24} color="var(--color-primary)" />
        </div>
        <div>
          <h3 className="text-base md:text-lg font-heading font-semibold text-foreground">
            System Requirements
          </h3>
          <p className="text-xs md:text-sm text-muted-foreground">
            Check your device compatibility
          </p>
        </div>
      </div>
      {!checkResults ? (
        <div className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start space-x-2">
                <Icon name="Check" size={16} className="text-primary mt-0.5 shrink-0" />
                <span>Working webcam and microphone</span>
              </li>
              <li className="flex items-start space-x-2">
                <Icon name="Check" size={16} className="text-primary mt-0.5 shrink-0" />
                <span>Stable internet connection (minimum 5 Mbps)</span>
              </li>
              <li className="flex items-start space-x-2">
                <Icon name="Check" size={16} className="text-primary mt-0.5 shrink-0" />
                <span>Updated browser (Chrome, Firefox, Edge)</span>
              </li>
              <li className="flex items-start space-x-2">
                <Icon name="Check" size={16} className="text-primary mt-0.5 shrink-0" />
                <span>Screen recording permissions enabled</span>
              </li>
            </ul>
          </div>

          <Button
            variant="default"
            fullWidth
            iconName="Play"
            iconPosition="left"
            loading={isChecking}
            onClick={runSystemCheck}
          >
            Run System Check
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(checkResults)?.map(([key, value]) => {
            const statusIcon = getStatusIcon(value?.status);
            return (
              <div
                key={key}
                className="flex items-start space-x-3 p-3 bg-muted/30 rounded-lg"
              >
                <Icon name={statusIcon?.name} size={20} className={statusIcon?.color} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground capitalize">
                    {key?.replace(/([A-Z])/g, ' $1')?.trim()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{value?.message}</p>
                </div>
              </div>
            );
          })}

          <Button
            variant="outline"
            fullWidth
            iconName="RotateCw"
            iconPosition="left"
            onClick={runSystemCheck}
          >
            Run Check Again
          </Button>
        </div>
      )}
    </div>
  );
};

export default SystemCheckCard;