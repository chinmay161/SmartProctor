import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const CompletedExamCard = ({ exam }) => {
  const navigate = useNavigate();

  const getGradeDistribution = () => {
    const total = exam?.gradeDistribution?.A + exam?.gradeDistribution?.B + exam?.gradeDistribution?.C + exam?.gradeDistribution?.D + exam?.gradeDistribution?.F;
    return [
      { grade: 'A', count: exam?.gradeDistribution?.A, percentage: (exam?.gradeDistribution?.A / total * 100)?.toFixed(0), color: 'bg-success' },
      { grade: 'B', count: exam?.gradeDistribution?.B, percentage: (exam?.gradeDistribution?.B / total * 100)?.toFixed(0), color: 'bg-primary' },
      { grade: 'C', count: exam?.gradeDistribution?.C, percentage: (exam?.gradeDistribution?.C / total * 100)?.toFixed(0), color: 'bg-accent' },
      { grade: 'D', count: exam?.gradeDistribution?.D, percentage: (exam?.gradeDistribution?.D / total * 100)?.toFixed(0), color: 'bg-warning' },
      { grade: 'F', count: exam?.gradeDistribution?.F, percentage: (exam?.gradeDistribution?.F / total * 100)?.toFixed(0), color: 'bg-error' }
    ];
  };

  return (
    <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden transition-smooth hover:shadow-lg">
      <div className="p-4 md:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-base md:text-lg font-heading font-semibold text-foreground">{exam?.title}</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-success/20 text-success ml-2 shrink-0">
                <Icon name="CheckCircle" size={14} className="mr-1" />
                Completed
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm text-muted-foreground">
              <div className="flex items-center space-x-1.5">
                <Icon name="Calendar" size={16} />
                <span>{exam?.completedDate}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Icon name="Users" size={16} />
                <span>{exam?.submittedCount}/{exam?.totalStudents} submitted</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Icon name="TrendingUp" size={16} />
                <span>Avg: {exam?.averageScore}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Icon name="Award" size={16} className="text-success" />
              <span className="text-xs text-muted-foreground">Highest</span>
            </div>
            <p className="text-base md:text-lg font-data font-semibold text-foreground">{exam?.highestScore}%</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Icon name="TrendingDown" size={16} className="text-error" />
              <span className="text-xs text-muted-foreground">Lowest</span>
            </div>
            <p className="text-base md:text-lg font-data font-semibold text-foreground">{exam?.lowestScore}%</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Icon name="AlertTriangle" size={16} className="text-warning" />
              <span className="text-xs text-muted-foreground">Violations</span>
            </div>
            <p className="text-base md:text-lg font-data font-semibold text-foreground">{exam?.totalViolations}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Icon name="Clock" size={16} className="text-primary" />
              <span className="text-xs text-muted-foreground">Avg Time</span>
            </div>
            <p className="text-xs md:text-sm font-medium text-foreground">{exam?.averageTime}</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs md:text-sm font-medium text-foreground">Grade Distribution</span>
          </div>
          <div className="space-y-2">
            {getGradeDistribution()?.map((item) => (
              <div key={item?.grade} className="flex items-center space-x-3">
                <span className="text-xs font-medium text-foreground w-6">{item?.grade}</span>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full ${item?.color} transition-smooth`}
                    style={{ width: `${item?.percentage}%` }}
                  ></div>
                </div>
                <span className="text-xs text-muted-foreground w-12 text-right">{item?.count} ({item?.percentage}%)</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            iconName="BarChart"
            iconPosition="left"
            className="flex-1"
          >
            View Analytics
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconName="FileText"
            iconPosition="left"
            className="flex-1"
          >
            Violation Report
          </Button>
          <Button
            variant="default"
            size="sm"
            iconName="Download"
            iconPosition="left"
            className="flex-1"
          >
            Export Results
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CompletedExamCard;