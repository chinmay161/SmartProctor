import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Select from '../../../components/ui/Select';
import Input from '../../../components/ui/Input';

const ReportsSection = () => {
  const [dateRange, setDateRange] = useState('last-30-days');
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [reportType, setReportType] = useState('overview');

  const dateRangeOptions = [
    { value: 'today', label: 'Today' },
    { value: 'last-7-days', label: 'Last 7 Days' },
    { value: 'last-30-days', label: 'Last 30 Days' },
    { value: 'last-90-days', label: 'Last 90 Days' },
    { value: 'custom', label: 'Custom Range' }
  ];

  const institutionOptions = [
    { value: 'all', label: 'All Institutions' },
    { value: 'mit', label: 'MIT' },
    { value: 'stanford', label: 'Stanford University' },
    { value: 'harvard', label: 'Harvard University' },
    { value: 'yale', label: 'Yale University' }
  ];

  const reportTypeOptions = [
    { value: 'overview', label: 'System Overview' },
    { value: 'violations', label: 'Violation Reports' },
    { value: 'performance', label: 'Performance Analytics' },
    { value: 'user-activity', label: 'User Activity' }
  ];

  const reports = [
    {
      id: 1,
      title: 'Monthly System Performance Report',
      description: 'Comprehensive analysis of system performance metrics for January 2026',
      date: '2026-01-20',
      type: 'Performance',
      size: '2.4 MB',
      format: 'PDF'
    },
    {
      id: 2,
      title: 'Violation Trends Analysis',
      description: 'Detailed breakdown of violation patterns across all institutions',
      date: '2026-01-19',
      type: 'Security',
      size: '1.8 MB',
      format: 'Excel'
    },
    {
      id: 3,
      title: 'User Activity Summary',
      description: 'Active users, exam participation, and engagement metrics',
      date: '2026-01-18',
      type: 'Analytics',
      size: '3.1 MB',
      format: 'PDF'
    },
    {
      id: 4,
      title: 'Institution Comparison Report',
      description: 'Comparative analysis of exam performance across institutions',
      date: '2026-01-17',
      type: 'Analytics',
      size: '2.7 MB',
      format: 'Excel'
    }
  ];

  const getReportIcon = (format) => {
    switch (format) {
      case 'PDF':
        return { name: 'FileText', color: 'text-error' };
      case 'Excel':
        return { name: 'FileSpreadsheet', color: 'text-success' };
      default:
        return { name: 'File', color: 'text-muted-foreground' };
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
            <Icon name="BarChart3" size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-heading font-semibold text-foreground">Report Filters</h3>
            <p className="text-sm text-muted-foreground">Customize your analytics and export data</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Select
            label="Date Range"
            options={dateRangeOptions}
            value={dateRange}
            onChange={setDateRange}
          />

          <Select
            label="Institution"
            options={institutionOptions}
            value={institutionFilter}
            onChange={setInstitutionFilter}
          />

          <Select
            label="Report Type"
            options={reportTypeOptions}
            value={reportType}
            onChange={setReportType}
          />
        </div>

        {dateRange === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Input
              label="Start Date"
              type="date"
            />
            <Input
              label="End Date"
              type="date"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button variant="default" iconName="Download">
            Export PDF
          </Button>
          <Button variant="outline" iconName="FileSpreadsheet">
            Export Excel
          </Button>
          <Button variant="outline" iconName="FileJson">
            Export JSON
          </Button>
        </div>
      </div>
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-heading font-semibold text-foreground">Generated Reports</h3>
            <p className="text-sm text-muted-foreground">Download previously generated reports</p>
          </div>
          <Button variant="default" size="sm" iconName="RefreshCw">
            Refresh
          </Button>
        </div>

        <div className="space-y-3">
          {reports?.map((report) => {
            const iconConfig = getReportIcon(report?.format);

            return (
              <div
                key={report?.id}
                className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-smooth"
              >
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                  <div className={`w-12 h-12 ${iconConfig?.color?.replace('text-', 'bg-')}/20 rounded-lg flex items-center justify-center shrink-0`}>
                    <Icon name={iconConfig?.name} size={24} className={iconConfig?.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-foreground mb-1">{report?.title}</h4>
                    <p className="text-xs text-muted-foreground mb-2">{report?.description}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center space-x-1">
                        <Icon name="Calendar" size={12} />
                        <span>{new Date(report.date)?.toLocaleDateString()}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Icon name="Tag" size={12} />
                        <span>{report?.type}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Icon name="HardDrive" size={12} />
                        <span>{report?.size}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0 ml-4">
                  <Button variant="outline" size="sm" iconName="Download">
                    Download
                  </Button>
                  <button className="p-2 text-muted-foreground hover:text-error hover:bg-error/10 rounded transition-smooth">
                    <Icon name="Trash2" size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4 shadow-md">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
              <Icon name="FileText" size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-2xl font-heading font-semibold text-foreground">1,247</p>
              <p className="text-xs text-muted-foreground">Total Exams</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 shadow-md">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center">
              <Icon name="Users" size={20} className="text-success" />
            </div>
            <div>
              <p className="text-2xl font-heading font-semibold text-foreground">15,892</p>
              <p className="text-xs text-muted-foreground">Active Students</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 shadow-md">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-warning/20 rounded-lg flex items-center justify-center">
              <Icon name="AlertTriangle" size={20} className="text-warning" />
            </div>
            <div>
              <p className="text-2xl font-heading font-semibold text-foreground">342</p>
              <p className="text-xs text-muted-foreground">Total Violations</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 shadow-md">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-accent/20 rounded-lg flex items-center justify-center">
              <Icon name="TrendingUp" size={20} className="text-accent" />
            </div>
            <div>
              <p className="text-2xl font-heading font-semibold text-foreground">98.7%</p>
              <p className="text-xs text-muted-foreground">System Uptime</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsSection;