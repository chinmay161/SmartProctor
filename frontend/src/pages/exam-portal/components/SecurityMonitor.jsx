import React from 'react';
import Icon from '../../../components/AppIcon';

const SecurityMonitor = ({ violations }) => {
  return (
    <div className="p-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Security Monitor</h3>
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs text-muted-foreground">Active</span>
        </div>
      </div>

      {/* Webcam Status */}
      <div className="mb-4 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center space-x-2 mb-2">
          <Icon name="Camera" size={16} className="text-success" />
          <span className="text-xs font-medium text-foreground">Webcam Monitoring</span>
        </div>
        <div className="aspect-video bg-black rounded overflow-hidden flex items-center justify-center">
          <Icon name="Camera" size={32} className="text-muted-foreground" />
        </div>
      </div>

      {/* Violations Log */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground">Violations</span>
          <span className={`text-xs font-semibold ${
            violations?.length === 0 ? 'text-success' : 'text-error'
          }`}>
            {violations?.length}
          </span>
        </div>
        {violations?.length === 0 ? (
          <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
            <div className="flex items-center space-x-2">
              <Icon name="CheckCircle" size={16} className="text-success" />
              <span className="text-xs text-success">No violations detected</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {violations?.slice(-5)?.reverse()?.map((violation) => (
              <div
                key={violation?.id}
                className="p-2 bg-error/10 border border-error/20 rounded text-xs"
              >
                <div className="flex items-start space-x-2">
                  <Icon name="AlertTriangle" size={14} className="text-error mt-0.5" />
                  <div className="flex-1">
                    <p className="text-error font-medium">{violation?.message}</p>
                    <p className="text-muted-foreground text-[10px] mt-1">
                      {violation?.timestamp?.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Security Features */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs font-medium text-foreground mb-2">Active Security</p>
        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <Icon name="Shield" size={12} className="text-success" />
            <span>Browser lockdown</span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <Icon name="Eye" size={12} className="text-success" />
            <span>Screen recording</span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <Icon name="Ban" size={12} className="text-success" />
            <span>Copy-paste disabled</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityMonitor;