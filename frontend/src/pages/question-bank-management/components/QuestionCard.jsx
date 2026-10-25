import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const formatCreatedDate = (dateVal) => {
  if (!dateVal) return 'N/A';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return String(dateVal);
  }
};

const formatCreatedTime = (dateVal) => {
  if (!dateVal) return '';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
};

const formatAvgTime = (seconds, usageCount = 0) => {
  if (usageCount === 0 && (!seconds || seconds === 0)) return '—';
  if (!seconds || seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
};

const QuestionCard = ({ question, onEdit, onDuplicate, onDelete, onPreview }) => {
  const [isExpanded, setIsExpanded] = useState(false);

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

  const getDifficultyConfig = (difficulty) => {
    switch (difficulty) {
      case 'easy':
        return { label: 'Easy', color: 'bg-success/20 text-success' };
      case 'medium':
        return { label: 'Medium', color: 'bg-accent/20 text-accent' };
      case 'hard':
        return { label: 'Hard', color: 'bg-error/20 text-error' };
      default:
        return { label: 'Unknown', color: 'bg-muted text-muted-foreground' };
    }
  };

  const typeConfig = getTypeConfig(question?.type);
  const difficultyConfig = getDifficultyConfig(question?.difficulty);

  const createdDateStr = question?.createdDate || question?.created_at;

  return (
    <div className="bg-card border border-border rounded-lg shadow-md hover:shadow-lg transition-smooth overflow-hidden">
      <div className="p-4 md:p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <div className={`w-10 h-10 md:w-12 md:h-12 ${typeConfig?.bg} rounded-lg flex items-center justify-center shrink-0`}>
              <Icon name={typeConfig?.icon} size={20} className={typeConfig?.color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${typeConfig?.bg} ${typeConfig?.color}`}>
                  {typeConfig?.label}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${difficultyConfig?.color}`}>
                  {difficultyConfig?.label}
                </span>
                {question?.tags?.map((tag, index) => (
                  <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
              <p className={`text-sm md:text-base text-foreground font-medium ${!isExpanded ? 'line-clamp-2' : ''}`}>
                {question?.questionText}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-smooth shrink-0 ml-2"
          >
            <Icon name={isExpanded ? 'ChevronUp' : 'ChevronDown'} size={20} />
          </button>
        </div>

        {isExpanded && (
          <div className="mb-4 p-4 bg-muted/30 rounded-lg space-y-3">
            {question?.type === 'mcq' && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Options:</p>
                {question?.options?.map((option, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      option?.isCorrect ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {String.fromCharCode(65 + index)}
                    </div>
                    <span className="text-sm text-foreground">{option?.text}</span>
                    {option?.isCorrect && (
                      <Icon name="CheckCircle" size={16} className="text-success" />
                    )}
                  </div>
                ))}
              </div>
            )}
            {question?.type === 'true-false' && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Correct Answer:</p>
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 bg-success rounded-full flex items-center justify-center">
                    <Icon name="Check" size={14} className="text-success-foreground" />
                  </div>
                  <span className="text-sm text-foreground font-medium">{question?.correctAnswer}</span>
                </div>
              </div>
            )}
            {question?.type === 'fill-blank' && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Accepted Answers:</p>
                <div className="flex flex-wrap gap-2">
                  {question?.acceptedAnswers?.map((answer, index) => (
                    <span key={index} className="px-3 py-1 bg-success/20 text-success text-sm rounded-md font-data">
                      {answer}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {question?.explanation && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Explanation:</p>
                <p className="text-sm text-foreground">{question?.explanation}</p>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
          <div className="flex items-center space-x-2">
            <Icon name="Eye" size={16} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Used</p>
              <p className="text-sm font-data font-semibold text-foreground">{question?.usageCount || 0}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Icon name="TrendingUp" size={16} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Avg Score</p>
              <p className="text-sm font-data font-semibold text-foreground">
                {question?.usageCount === 0 && (!question?.avgScore || question?.avgScore === 0) ? '—' : `${question?.avgScore || 0}%`}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Icon name="Clock" size={16} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Avg Time</p>
              <p className="text-sm font-data font-semibold text-foreground">
                {formatAvgTime(question?.avgTime, question?.usageCount)}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Icon name="Calendar" size={16} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm font-data font-semibold text-foreground truncate">
                {formatCreatedDate(createdDateStr)}
              </p>
              {formatCreatedTime(createdDateStr) && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {formatCreatedTime(createdDateStr)}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            iconName="Eye"
            iconPosition="left"
            onClick={() => onPreview(question)}
          >
            Preview
          </Button>
          <Button
            variant="default"
            size="sm"
            iconName="Edit"
            iconPosition="left"
            onClick={() => onEdit(question)}
          >
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            iconName="Copy"
            iconPosition="left"
            onClick={() => onDuplicate(question)}
          >
            Duplicate
          </Button>
          <Button
            variant="destructive"
            size="sm"
            iconName="Trash2"
            iconPosition="left"
            onClick={() => onDelete(question)}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuestionCard;
