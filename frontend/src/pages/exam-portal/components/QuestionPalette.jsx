import React from 'react';


const QuestionPalette = ({
  questions,
  currentIndex,
  answers,
  markedForReview,
  onQuestionSelect,
  answeredCount,
  reviewCount,
  unansweredCount
}) => {
  const getQuestionStatus = (question, index) => {
    if (answers?.[question?.id]) return 'answered';
    if (markedForReview?.has(question?.id)) return 'review';
    return 'unanswered';
  };

  const getStatusColor = (status, isCurrent) => {
    if (isCurrent) return 'bg-primary text-primary-foreground border-primary';
    if (status === 'answered') return 'bg-success/20 text-success border-success/50';
    if (status === 'review') return 'bg-warning/20 text-warning border-warning/50';
    return 'bg-muted text-muted-foreground border-border';
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-foreground mb-4">Question Palette</h3>

      {/* Status Summary */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-success/20 border border-success/50" />
            <span className="text-muted-foreground">Answered</span>
          </div>
          <span className="font-semibold text-foreground">{answeredCount}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-warning/20 border border-warning/50" />
            <span className="text-muted-foreground">Marked for Review</span>
          </div>
          <span className="font-semibold text-foreground">{reviewCount}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-muted border border-border" />
            <span className="text-muted-foreground">Unanswered</span>
          </div>
          <span className="font-semibold text-foreground">{unansweredCount}</span>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="grid grid-cols-5 gap-2">
          {questions?.map((question, index) => {
            const status = getQuestionStatus(question, index);
            const isCurrent = index === currentIndex;
            return (
              <button
                key={question?.id}
                onClick={() => onQuestionSelect(index)}
                className={`aspect-square rounded-lg border-2 flex items-center justify-center text-sm font-semibold transition-all hover:scale-105 ${
                  getStatusColor(status, isCurrent)
                }`}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground mb-2">Legend:</p>
        <div className="space-y-1 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded border-2 border-primary bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold">
              1
            </div>
            <span className="text-muted-foreground">Current</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded border-2 border-success/50 bg-success/20 flex items-center justify-center text-success text-xs font-semibold">
              2
            </div>
            <span className="text-muted-foreground">Answered</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded border-2 border-warning/50 bg-warning/20 flex items-center justify-center text-warning text-xs font-semibold">
              3
            </div>
            <span className="text-muted-foreground">Review</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuestionPalette;