import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/AppIcon';
import Image from '../../../components/AppImage';
import Button from '../../../components/ui/Button';

const ActiveExamCard = ({ exam }) => {
  const navigate = useNavigate();

  const getViolationSeverity = (count) => {
    if (count === 0) return { color: 'text-success', bg: 'bg-success/20', label: 'No Issues' };
    if (count <= 3) return { color: 'text-warning', bg: 'bg-warning/20', label: 'Minor' };
    return { color: 'text-error', bg: 'bg-error/20', label: 'Critical' };
  };

  const severity = getViolationSeverity(exam?.violationCount);

  return (
    <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden transition-smooth hover:shadow-lg">
      <div className="p-4 md:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-base md:text-lg font-heading font-semibold text-foreground">{exam?.title}</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-success/20 text-success ml-2 shrink-0">
                <span className="w-2 h-2 bg-success rounded-full mr-1.5 animate-pulse"></span>
                Live
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm text-muted-foreground">
              <div className="flex items-center space-x-1.5">
                <Icon name="Users" size={16} />
                <span>{exam?.activeStudents}/{exam?.totalStudents} Active</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Icon name="Clock" size={16} />
                <span>{exam?.timeRemaining}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Icon name="Calendar" size={16} />
                <span>{exam?.startTime}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {exam?.studentPreviews?.slice(0, 3)?.map((student) => (
            <div key={student?.id} className="bg-muted/30 rounded-lg p-3 transition-smooth hover:bg-muted/50">
              <div className="flex items-center space-x-3 mb-2">
                <div className="relative shrink-0">
                  <Image
                    src={student?.webcamFeed}
                    alt={student?.webcamFeedAlt}
                    className="w-12 h-12 md:w-14 md:h-14 rounded-lg object-cover"
                  />
                  <div className={`absolute -top-1 -right-1 w-3 h-3 ${student?.status === 'active' ? 'bg-success' : 'bg-error'} rounded-full border-2 border-card`}></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm font-medium text-foreground truncate">{student?.name}</p>
                  <p className="text-xs text-muted-foreground font-caption">{student?.studentId}</p>
                </div>
              </div>
              {student?.violations > 0 && (
                <div className="flex items-center space-x-1.5 text-xs text-warning">
                  <Icon name="AlertTriangle" size={14} />
                  <span>{student?.violations} violation{student?.violations !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-border">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-md ${severity?.bg}`}>
              <Icon name="AlertTriangle" size={16} className={severity?.color} />
              <span className={`text-xs md:text-sm font-medium ${severity?.color}`}>
                {exam?.violationCount} Violations
              </span>
            </div>
            <span className="text-xs md:text-sm text-muted-foreground">{severity?.label}</span>
          </div>
          <Button
            variant="default"
            size="sm"
            iconName="Eye"
            iconPosition="left"
            onClick={() => navigate(`/exam-monitoring/${exam?.id}`)}
            className="w-full sm:w-auto"
          >
            Monitor Details
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ActiveExamCard;