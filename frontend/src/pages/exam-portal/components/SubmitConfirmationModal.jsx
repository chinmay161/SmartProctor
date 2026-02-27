import React from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const SubmitConfirmationModal = ({
  answeredCount,
  unansweredCount,
  reviewCount,
  totalQuestions,
  onConfirm,
  onCancel
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-warning/20 rounded-full flex items-center justify-center">
              <Icon name="AlertTriangle" size={24} className="text-warning" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Submit Exam?</h3>
              <p className="text-sm text-muted-foreground">Review your answers before submitting</p>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Questions</p>
                  <p className="text-2xl font-bold text-foreground">{totalQuestions}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Answered</p>
                  <p className="text-2xl font-bold text-success">{answeredCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Unanswered</p>
                  <p className="text-2xl font-bold text-error">{unansweredCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Marked for Review</p>
                  <p className="text-2xl font-bold text-warning">{reviewCount}</p>
                </div>
              </div>
            </div>

            {unansweredCount > 0 && (
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
                <div className="flex items-start space-x-2">
                  <Icon name="AlertCircle" size={16} className="text-warning mt-0.5" />
                  <p className="text-xs text-warning">
                    You have {unansweredCount} unanswered question{unansweredCount > 1 ? 's' : ''}. Are you sure you want to submit?
                  </p>
                </div>
              </div>
            )}

            <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
              <div className="flex items-start space-x-2">
                <Icon name="Info" size={16} className="text-error mt-0.5" />
                <p className="text-xs text-error">
                  Once submitted, you cannot change your answers. This action is final.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={onCancel}
            >
              Go Back
            </Button>
            <Button
              variant="success"
              fullWidth
              iconName="CheckCircle"
              onClick={onConfirm}
            >
              Submit Exam
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubmitConfirmationModal;