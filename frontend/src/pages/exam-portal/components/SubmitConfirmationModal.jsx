import React from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const SubmitConfirmationModal = ({
  answeredCount,
  unansweredCount,
  reviewCount,
  totalQuestions,
  submitting = false,
  submitError = '',
  onConfirm,
  onCancel
}) => {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto min-h-dvh">
      <div className="bg-card border border-border rounded-xl sm:rounded-2xl shadow-2xl max-w-md w-full my-auto overflow-hidden">
        <div className="p-4 sm:p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-warning/20 rounded-full flex items-center justify-center shrink-0">
              <Icon name="AlertTriangle" size={22} className="text-warning" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg font-semibold text-foreground truncate">Submit Exam?</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">Review your answers before submitting</p>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <div className="p-3 sm:p-4 bg-muted/50 rounded-lg">
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="p-1 sm:p-2">
                  <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Total Questions</p>
                  <p className="text-xl sm:text-2xl font-bold text-foreground">{totalQuestions}</p>
                </div>
                <div className="p-1 sm:p-2">
                  <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Answered</p>
                  <p className="text-xl sm:text-2xl font-bold text-success">{answeredCount}</p>
                </div>
                <div className="p-1 sm:p-2">
                  <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Unanswered</p>
                  <p className="text-xl sm:text-2xl font-bold text-error">{unansweredCount}</p>
                </div>
                <div className="p-1 sm:p-2">
                  <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Marked for Review</p>
                  <p className="text-xl sm:text-2xl font-bold text-warning">{reviewCount}</p>
                </div>
              </div>
            </div>

            {unansweredCount > 0 && (
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
                <div className="flex items-start space-x-2">
                  <Icon name="AlertCircle" size={16} className="text-warning mt-0.5 shrink-0" />
                  <p className="text-xs text-warning">
                    You have {unansweredCount} unanswered question{unansweredCount > 1 ? 's' : ''}. Are you sure you want to submit?
                  </p>
                </div>
              </div>
            )}

            <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
              <div className="flex items-start space-x-2">
                <Icon name="Info" size={16} className="text-error mt-0.5 shrink-0" />
                <p className="text-xs text-error">
                  Once submitted, you cannot change your answers. This action is final.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={onCancel}
              disabled={submitting}
              className="touch-target"
            >
              Go Back
            </Button>
            <Button
              variant="success"
              fullWidth
              iconName="CheckCircle"
              onClick={onConfirm}
              loading={submitting}
              disabled={submitting}
              className="touch-target"
            >
              Submit Exam
            </Button>
          </div>
          {submitError && (
            <p className="mt-3 text-xs text-error">{submitError}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubmitConfirmationModal;
