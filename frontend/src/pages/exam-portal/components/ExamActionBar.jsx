import React from 'react';
import Button from '../../../components/ui/Button';

/**
 * ExamActionBar: view-only action controls for question navigation & submission.
 * Normal document flow at >= 640px; sticky bottom bar on phones (< 640px)
 * respecting --safe-bottom with 44px+ accessible touch targets.
 */
const ExamActionBar = ({
  currentIndex,
  totalQuestions,
  isMarkedForReview,
  onPrevious,
  onMarkForReview,
  onNext,
  onSubmit,
}) => {
  const isLastQuestion = currentIndex >= totalQuestions - 1;

  return (
    <div className="exam-action-bar mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
      <div className="flex gap-2 flex-1 sm:flex-initial">
        <Button
          variant="outline"
          iconName="ChevronLeft"
          onClick={onPrevious}
          disabled={currentIndex === 0}
          className="flex-1 sm:flex-initial touch-target text-xs sm:text-sm"
        >
          Previous
        </Button>
        <Button
          variant="outline"
          iconName="Flag"
          onClick={onMarkForReview}
          className={`flex-1 sm:flex-initial touch-target text-xs sm:text-sm ${
            isMarkedForReview ? 'bg-warning/20 border-warning text-warning' : ''
          }`}
        >
          {isMarkedForReview ? 'Unmark' : 'Mark for Review'}
        </Button>
      </div>

      <div className="flex gap-2 flex-1 sm:flex-initial">
        {!isLastQuestion ? (
          <Button
            variant="default"
            iconName="ChevronRight"
            iconPosition="right"
            onClick={onNext}
            fullWidth
            className="sm:w-auto touch-target text-xs sm:text-sm"
          >
            Next
          </Button>
        ) : (
          <Button
            variant="success"
            iconName="CheckCircle"
            onClick={onSubmit}
            fullWidth
            className="sm:w-auto touch-target text-xs sm:text-sm"
          >
            Submit Exam
          </Button>
        )}
      </div>
    </div>
  );
};

export default ExamActionBar;
