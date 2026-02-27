import React, { useState, useEffect } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const SecurityMonitoring = () => {
  const [selectedAlert, setSelectedAlert] = useState(null);

  const [violationTrends, setViolationTrends] = useState([
    { month: 'Aug', count: 45 },
    { month: 'Sep', count: 52 },
    { month: 'Oct', count: 38 },
    { month: 'Nov', count: 61 },
    { month: 'Dec', count: 48 },
    { month: 'Jan', count: 55 }
  ]);

  const [suspiciousActivities, setSuspiciousActivities] = useState([]);
  const [accessLogs, setAccessLogs] = useState([]);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const violations = await import('../../../services/httpClient').then(m => m.apiGet('/violations'));
        if (!mounted) return;
        // violations may be array
        setSuspiciousActivities(violations || []);
      } catch (err) {
        setSuspiciousActivities([]);
      }

      try {
        const logs = await import('../../../services/httpClient').then(m => m.apiGet('/admin/audit-logs'));
        if (!mounted) return;
        setAccessLogs(logs?.items || logs || []);
      } catch (err) {
        setAccessLogs([]);
      }
    };

    fetchData();
    return () => { mounted = false; };
  }, []);

  const getSeverityConfig = (severity) => {
    switch (severity) {
      case 'critical':
        return { color: 'text-error', bg: 'bg-error/20', label: 'Critical' };
      case 'high':
        return { color: 'text-warning', bg: 'bg-warning/20', label: 'High' };
      case 'medium':
        return { color: 'text-accent', bg: 'bg-accent/20', label: 'Medium' };
      case 'low':
        return { color: 'text-success', bg: 'bg-success/20', label: 'Low' };
      default:
        return { color: 'text-muted-foreground', bg: 'bg-muted', label: 'Unknown' };
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date?.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const maxCount = Math.max(...violationTrends?.map(t => t?.count));

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-error/20 rounded-lg flex items-center justify-center">
            <Icon name="TrendingUp" size={20} className="text-error" />
          </div>
          <div>
            <h3 className="text-lg font-heading font-semibold text-foreground">Violation Trends</h3>
            <p className="text-sm text-muted-foreground">Monthly violation statistics across all institutions</p>
          </div>
        </div>

        <div className="flex items-end justify-between space-x-2 h-48">
          {violationTrends?.map((trend, index) => (
            <div key={index} className="flex-1 flex flex-col items-center space-y-2">
              <div className="w-full flex flex-col justify-end h-40">
                <div
                  className="w-full bg-error/30 rounded-t-lg transition-smooth hover:bg-error/50 cursor-pointer"
                  style={{ height: `${(trend?.count / maxCount) * 100}%` }}
                  title={`${trend?.count} violations`}
                />
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-foreground">{trend?.count}</p>
                <p className="text-xs text-muted-foreground">{trend?.month}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden">
        <div className="p-4 md:p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-warning/20 rounded-lg flex items-center justify-center">
                <Icon name="AlertTriangle" size={20} className="text-warning" />
              </div>
              <div>
                <h3 className="text-lg font-heading font-semibold text-foreground">Suspicious Activities</h3>
                <p className="text-sm text-muted-foreground">Real-time alerts and violation notifications</p>
              </div>
            </div>
            <Button variant="outline" size="sm" iconName="RefreshCw">
              Refresh
            </Button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {suspiciousActivities?.map((activity) => {
            const severityConfig = getSeverityConfig(activity?.severity);

            return (
              <div
                key={activity?.id}
                className="p-4 hover:bg-muted/30 transition-smooth cursor-pointer"
                onClick={() => setSelectedAlert(activity)}
              >
                <div className="flex items-start justify-between space-x-4">
                  <div className="flex items-start space-x-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 ${severityConfig?.bg} rounded-lg flex items-center justify-center shrink-0`}>
                      <Icon name="AlertCircle" size={20} className={severityConfig?.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="text-sm font-medium text-foreground">{activity?.type}</h4>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${severityConfig?.bg} ${severityConfig?.color}`}>
                          {severityConfig?.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{activity?.details}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center space-x-1">
                          <Icon name="User" size={12} />
                          <span>{activity?.user} ({activity?.userId})</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Icon name="FileText" size={12} />
                          <span>{activity?.examTitle}</span>
                        </span>
                        <span className="flex items-center space-x-1 font-caption">
                          <Icon name="Clock" size={12} />
                          <span>{formatTimestamp(activity?.timestamp)}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <Button variant="outline" size="sm">
                      Review
                    </Button>
                    <Button variant="destructive" size="sm">
                      Flag
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden">
        <div className="p-4 md:p-6 border-b border-border">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
              <Icon name="Shield" size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-heading font-semibold text-foreground">System Access Logs</h3>
              <p className="text-sm text-muted-foreground">Detailed audit trail of administrative actions</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Target
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  IP Address
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accessLogs?.map((log) => (
                <tr key={log?.id} className="hover:bg-muted/30 transition-smooth">
                  <td className="px-4 py-4">
                    <p className="text-sm text-foreground">{log?.user}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-foreground">{log?.action}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-muted-foreground">{log?.target}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-muted-foreground font-caption">
                      {formatTimestamp(log?.timestamp)}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-muted-foreground font-data">{log?.ipAddress}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-xs font-medium ${
                      log?.status === 'success' ?'bg-success/20 text-success' :'bg-error/20 text-error'
                    }`}>
                      <Icon name={log?.status === 'success' ? 'CheckCircle' : 'XCircle'} size={12} />
                      <span className="capitalize">{log?.status}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SecurityMonitoring;