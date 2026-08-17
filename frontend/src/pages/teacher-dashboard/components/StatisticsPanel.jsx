import React from 'react';
import Icon from '../../../components/AppIcon';

const StatisticsPanel = ({ statistics }) => {
  return (
    <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <h2 className="text-base md:text-lg font-heading font-semibold text-foreground">Semester Statistics</h2>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">Current Academic Period</p>
      </div>
      <div className="p-4 md:p-6 space-y-4">
        <div className="bg-primary/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                <Icon name="FileText" size={20} className="text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">Total Exams</span>
            </div>
            <span className="text-2xl md:text-3xl font-data font-bold text-primary">{statistics?.totalExams}</span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <Icon name="TrendingUp" size={14} className="text-success" />
            <span>+12% from last semester</span>
          </div>
        </div>

        <div className="bg-success/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center">
                <Icon name="Users" size={20} className="text-success" />
              </div>
              <span className="text-sm font-medium text-foreground">Total Students</span>
            </div>
            <span className="text-2xl md:text-3xl font-data font-bold text-success">{statistics?.totalStudents}</span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <Icon name="TrendingUp" size={14} className="text-success" />
            <span>+8% enrollment increase</span>
          </div>
        </div>

        <div className="bg-accent/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-accent/20 rounded-lg flex items-center justify-center">
                <Icon name="BarChart" size={20} className="text-accent" />
              </div>
              <span className="text-sm font-medium text-foreground">Average Score</span>
            </div>
            <span className="text-2xl md:text-3xl font-data font-bold text-accent">{statistics?.averageScore}%</span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <Icon name="TrendingUp" size={14} className="text-success" />
            <span>+3.5% improvement</span>
          </div>
        </div>

        <div className="bg-warning/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-warning/20 rounded-lg flex items-center justify-center">
                <Icon name="AlertTriangle" size={20} className="text-warning" />
              </div>
              <span className="text-sm font-medium text-foreground">Total Violations</span>
            </div>
            <span className="text-2xl md:text-3xl font-data font-bold text-warning">{statistics?.totalViolations}</span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <Icon name="TrendingDown" size={14} className="text-success" />
            <span>-15% from last semester</span>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-heading font-semibold text-foreground mb-3">Violation Breakdown</h3>
          <div className="space-y-3">
            {statistics?.violationBreakdown?.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <Icon name={item?.icon} size={16} className="text-muted-foreground shrink-0" />
                  <span className="text-xs md:text-sm text-muted-foreground truncate">{item?.type}</span>
                </div>
                <span className="text-xs md:text-sm font-data font-semibold text-foreground ml-2">{item?.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <button className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-smooth hover:bg-primary/90 flex items-center justify-center space-x-2">
            <Icon name="Download" size={18} />
            <span>Export Full Report</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default StatisticsPanel;