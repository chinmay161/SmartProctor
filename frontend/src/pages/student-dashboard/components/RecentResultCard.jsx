import React from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const RecentResultCard = ({ result }) => {
  const getScoreColor = (percentage) => {
    if (percentage >= 90) return 'text-success';
    if (percentage >= 75) return 'text-primary';
    if (percentage >= 60) return 'text-accent';
    return 'text-error';
  };

  const getGrade = (percentage) => {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  };

  const percentage = (result?.score / result?.totalMarks) * 100;
  const grade = getGrade(percentage);

  return (
    <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md hover:shadow-lg transition-smooth">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-base md:text-lg font-heading font-semibold text-foreground mb-2">
            {result?.examTitle}
          </h3>
          <p className="text-sm text-muted-foreground mb-3">{result?.course}</p>
        </div>
        <div className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center shrink-0 ml-4 ${
          percentage >= 60 ? 'bg-success/20' : 'bg-error/20'
        }`}>
          <span className={`text-xl md:text-2xl font-heading font-bold ${getScoreColor(percentage)}`}>
            {grade}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Score</p>
          <p className={`text-lg md:text-xl font-data font-semibold ${getScoreColor(percentage)}`}>
            {result?.score}/{result?.totalMarks}
          </p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Percentage</p>
          <p className={`text-lg md:text-xl font-data font-semibold ${getScoreColor(percentage)}`}>
            {percentage?.toFixed(1)}%
          </p>
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Completed on:</span>
          <span className="text-foreground font-medium">
            {new Date(result.completedDate)?.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Time taken:</span>
          <span className="text-foreground font-medium">{result?.timeTaken} minutes</span>
        </div>
        {result?.violations > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Violations:</span>
            <span className="text-warning font-medium flex items-center">
              <Icon name="AlertTriangle" size={14} className="mr-1" />
              {result?.violations}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button variant="outline" fullWidth iconName="Eye" iconPosition="left">
          View Details
        </Button>
        <Button variant="ghost" fullWidth iconName="Download" iconPosition="left">
          Certificate
        </Button>
      </div>
    </div>
  );
};

export default RecentResultCard;