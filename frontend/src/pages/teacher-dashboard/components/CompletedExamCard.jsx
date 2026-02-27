import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const CompletedExamCard = ({ exam, onReleaseResults, releasing = false }) => {
  const navigate = useNavigate();
  const submittedCount = exam?.submitted_count ?? 0;
  const attemptCount = exam?.attempt_count ?? 0;
  const evaluatedCount = exam?.evaluated_count ?? 0;
  const averageScore = exam?.average_score_percent;
  const totalViolations = exam?.violation_count ?? 0;
  const completedDate = exam?.end_time
    ? new Date(exam.end_time).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'N/A';
  const alreadyReleased = Boolean(exam?.results_visible);

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
                <span>{completedDate}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Icon name="Users" size={16} />
                <span>{submittedCount}/{attemptCount} submitted</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Icon name="TrendingUp" size={16} />
                <span>Avg: {averageScore == null ? 'N/A' : `${averageScore}%`}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Icon name="ClipboardCheck" size={16} className="text-success" />
              <span className="text-xs text-muted-foreground">Evaluated</span>
            </div>
            <p className="text-base md:text-lg font-data font-semibold text-foreground">{evaluatedCount}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Icon name="FileCheck2" size={16} className="text-primary" />
              <span className="text-xs text-muted-foreground">Results</span>
            </div>
            <p className="text-base md:text-lg font-data font-semibold text-foreground">
              {alreadyReleased ? 'Released' : 'Not Released'}
            </p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Icon name="AlertTriangle" size={16} className="text-warning" />
              <span className="text-xs text-muted-foreground">Violations</span>
            </div>
            <p className="text-base md:text-lg font-data font-semibold text-foreground">{totalViolations}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Icon name="Clock" size={16} className="text-primary" />
              <span className="text-xs text-muted-foreground">Attempts</span>
            </div>
            <p className="text-xs md:text-sm font-medium text-foreground">{attemptCount}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            iconName="BarChart"
            iconPosition="left"
            onClick={() => navigate(`/teacher-dashboard/completed/${encodeURIComponent(exam?.id)}/analytics`)}
            className="flex-1"
          >
            View Analytics
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconName="FileText"
            iconPosition="left"
            onClick={() => navigate(`/teacher-dashboard/completed/${encodeURIComponent(exam?.id)}/violation-report`)}
            className="flex-1"
          >
            Violation Report
          </Button>
          <Button
            variant="default"
            size="sm"
            iconName={alreadyReleased ? 'CheckCircle2' : 'Send'}
            iconPosition="left"
            className="flex-1"
            disabled={alreadyReleased || releasing}
            loading={releasing}
            onClick={() => onReleaseResults?.(exam)}
          >
            {alreadyReleased ? 'Results Released' : 'Release Results'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CompletedExamCard;
