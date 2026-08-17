import React from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const QuestionPreviewModal = ({ question, onClose }) => {
  if (!question) return null;

  const getTypeConfig = (type) => {
    switch (type) {
      case 'mcq':
        return { icon: 'ListChecks', label: 'Multiple Choice', color: 'text-primary', bg: 'bg-primary/20' };
      case 'true-false':
        return { icon: 'ToggleLeft', label: 'True/False', color: 'text-success', bg: 'bg-success/20' };
      case 'fill-blank':
        return { icon: 'Edit3', label: 'Fill in Blank', color: 'text-accent', bg: 'bg-accent/20' };
      case 'essay':
        return { icon: 'FileText', label: 'Essay', color: 'text-warning', bg: 'bg-warning/20' };
      default:
        return { icon: 'HelpCircle', label: 'Unknown', color: 'text-muted-foreground', bg: 'bg-muted' };
    }
  };

  const typeConfig = getTypeConfig(question?.type);

  return (
    <div className="fixed inset-0 z-1200 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 md:p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 ${typeConfig?.bg} rounded-lg flex items-center justify-center`}>
              <Icon name={typeConfig?.icon} size={20} className={typeConfig?.color} />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-heading font-semibold text-foreground">Question Preview</h2>
              <p className="text-xs md:text-sm text-muted-foreground">{typeConfig?.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-smooth"
          >
            <Icon name="X" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Question</p>
            <p className="text-base md:text-lg text-foreground font-medium">{question?.questionText}</p>
          </div>

          {question?.type === 'mcq' && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Options</p>
              <div className="space-y-3">
                {question?.options?.map((option, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border-2 transition-smooth ${
                      option?.isCorrect
                        ? 'border-success bg-success/10' :'border-border bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        option?.isCorrect ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
                      }`}>
                        {String.fromCharCode(65 + index)}
                      </div>
                      <span className="text-sm md:text-base text-foreground flex-1">{option?.text}</span>
                      {option?.isCorrect && (
                        <Icon name="CheckCircle" size={20} className="text-success" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {question?.type === 'true-false' && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Correct Answer</p>
              <div className="p-4 rounded-lg border-2 border-success bg-success/10">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-success rounded-full flex items-center justify-center">
                    <Icon name="Check" size={16} className="text-success-foreground" />
                  </div>
                  <span className="text-base md:text-lg text-foreground font-medium">{question?.correctAnswer}</span>
                </div>
              </div>
            </div>
          )}

          {question?.type === 'fill-blank' && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Accepted Answers</p>
              <div className="flex flex-wrap gap-2">
                {question?.acceptedAnswers?.map((answer, index) => (
                  <span key={index} className="px-4 py-2 bg-success/20 text-success text-sm md:text-base rounded-lg font-data">
                    {answer}
                  </span>
                ))}
              </div>
            </div>
          )}

          {question?.explanation && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Explanation</p>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-sm md:text-base text-foreground">{question?.explanation}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Difficulty</p>
              <p className="text-sm font-medium text-foreground capitalize">{question?.difficulty}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Times Used</p>
              <p className="text-sm font-medium text-foreground font-data">{question?.usageCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Avg Score</p>
              <p className="text-sm font-medium text-foreground font-data">{question?.avgScore}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Avg Time</p>
              <p className="text-sm font-medium text-foreground font-data">{question?.avgTime}s</p>
            </div>
          </div>

          {question?.tags?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Tags</p>
              <div className="flex flex-wrap gap-2">
                {question?.tags?.map((tag, index) => (
                  <span key={index} className="px-3 py-1 bg-muted text-muted-foreground text-xs rounded-md">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 md:p-6 border-t border-border flex justify-end">
          <Button variant="default" onClick={onClose}>
            Close Preview
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuestionPreviewModal;