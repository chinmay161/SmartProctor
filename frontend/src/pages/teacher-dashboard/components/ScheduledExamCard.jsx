import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const ScheduledExamCard = ({ exam }) => {
  const navigate = useNavigate();

  const getTimeUntilExam = () => {
    const now = new Date('2026-01-20T14:35:43');
    const examDate = new Date(exam.scheduledDate);
    const diffMs = examDate - now;
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    if (diffHours > 0) return `${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    return 'Starting soon';
  };

  return (
    <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden transition-smooth hover:shadow-lg">
      <div className="p-4 md:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-base md:text-lg font-heading font-semibold text-foreground">{exam?.title}</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-accent/20 text-accent ml-2 shrink-0">
                Scheduled
              </span>
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mb-3">{exam?.description}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm text-muted-foreground">
              <div className="flex items-center space-x-1.5">
                <Icon name="Calendar" size={16} />
                <span>{exam?.scheduledDate}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Icon name="Clock" size={16} />
                <span>{exam?.duration} minutes</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Icon name="Users" size={16} />
                <span>{exam?.enrolledStudents} enrolled</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Icon name="FileText" size={16} className="text-primary" />
              <span className="text-xs text-muted-foreground">Questions</span>
            </div>
            <p className="text-base md:text-lg font-data font-semibold text-foreground">{exam?.questionCount}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Icon name="Target" size={16} className="text-success" />
              <span className="text-xs text-muted-foreground">Total Marks</span>
            </div>
            <p className="text-base md:text-lg font-data font-semibold text-foreground">{exam?.totalMarks}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Icon name="BarChart" size={16} className="text-accent" />
              <span className="text-xs text-muted-foreground">Difficulty</span>
            </div>
            <p className="text-xs md:text-sm font-medium text-foreground capitalize">{exam?.difficulty}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Icon name="Timer" size={16} className="text-warning" />
              <span className="text-xs text-muted-foreground">Starts In</span>
            </div>
            <p className="text-xs md:text-sm font-medium text-foreground">{getTimeUntilExam()}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            iconName="Edit"
            iconPosition="left"
            onClick={() => navigate(`/exam-creation?edit=${exam?.id}`)}
            className="flex-1"
          >
            Edit Exam
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconName="Users"
            iconPosition="left"
            className="flex-1"
          >
            Manage Students
          </Button>
          <Button
            variant="default"
            size="sm"
            iconName="Play"
            iconPosition="left"
            className="flex-1"
          >
            Start Now
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScheduledExamCard;