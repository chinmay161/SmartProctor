import React from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import ExamTimer from './ExamTimer';

/**
 * ExamHeader: view-only header for the exam portal.
 * Displays title, course, timer, and question drawer toggle.
 * Compact on phones with --safe-top clearance; desktop layout unchanged.
 */
const ExamHeader = ({
  sourceExam,
  remainingSeconds,
  durationMinutesForTimer,
  onTimeUp,
  onReportProblem,
  showFullscreenBtn = false,
  onEnterFullscreen,
  onTogglePalette,
  isNative = false,
  showNativeLockdownBanner = false,
}) => {
  return (
    <header className="bg-card border-b border-border px-3 sm:px-4 py-2 sm:py-3 sticky top-0 z-40 shadow-md exam-header">
      {showNativeLockdownBanner && (
        <div className="bg-warning/20 border-b border-warning/40 -mx-3 sm:-mx-4 -mt-2 sm:-mt-3 mb-2 px-3 py-1 text-xs font-semibold text-warning flex items-center justify-center gap-1.5">
          <Icon name="AlertTriangle" size={14} className="shrink-0" />
          <span>Native lockdown not active</span>
        </div>
      )}
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Title & course info */}
        <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-1">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary">
            <Icon name="FileText" size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base md:text-lg font-heading font-semibold text-foreground truncate max-w-[150px] xs:max-w-[220px] sm:max-w-md">
              {sourceExam?.title || 'Exam'}
            </h1>
            {sourceExam?.course && (
              <p className="text-[11px] sm:text-xs text-muted-foreground truncate max-w-[150px] xs:max-w-[220px] sm:max-w-md">
                {sourceExam.course}
              </p>
            )}
          </div>
        </div>

        {/* Action controls & timer */}
        <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
          <ExamTimer
            initialSeconds={remainingSeconds}
            durationMinutes={durationMinutesForTimer}
            onTimeUp={onTimeUp}
          />
          <Button
            variant="outline"
            size="sm"
            iconName="AlertCircle"
            onClick={onReportProblem}
            className="text-xs hidden xs:inline-flex touch-target"
            title="Report a problem"
          >
            <span className="hidden sm:inline">Report a problem</span>
          </Button>
          {!isNative && showFullscreenBtn && (
            <Button
              variant="outline"
              size="sm"
              iconName="Maximize"
              onClick={onEnterFullscreen}
              className="hidden md:flex touch-target"
            >
              Fullscreen
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            iconName="List"
            onClick={onTogglePalette}
            className="md:hidden touch-target text-xs sm:text-sm"
          >
            Questions
          </Button>
          {/* Reserved header slot for compact camera chip on phones */}
          <div className="exam-header-camera-slot md:hidden w-[82px] h-[46px] shrink-0 pointer-events-none" aria-hidden="true" />
        </div>
      </div>
    </header>
  );
};

export default ExamHeader;
