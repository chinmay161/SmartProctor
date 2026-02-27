import React from 'react';
import Input from '../../../components/ui/Input';

const QuestionDisplay = ({ question, answer, onAnswerChange }) => {
  if (!question) return null;

  const renderMultipleChoice = () => (
    <div className="space-y-3">
      {question?.options?.map((option) => (
        <label
          key={option?.id}
          className="flex items-start space-x-3 p-4 border border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
        >
          <Input
            type="radio"
            name={`question-${question?.id}`}
            value={option?.id}
            checked={answer === option?.id}
            onChange={(e) => onAnswerChange(e?.target?.value)}
            className="mt-1"
          />
          <span className="flex-1 text-sm text-foreground">
            <strong className="mr-2">{option?.id?.toUpperCase()}.</strong>
            {option?.text}
          </span>
        </label>
      ))}
    </div>
  );

  const renderTrueFalse = () => (
    <div className="space-y-3">
      {['true', 'false']?.map((option) => (
        <label
          key={option}
          className="flex items-start space-x-3 p-4 border border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
        >
          <Input
            type="radio"
            name={`question-${question?.id}`}
            value={option}
            checked={answer === option}
            onChange={(e) => onAnswerChange(e?.target?.value)}
            className="mt-1"
          />
          <span className="flex-1 text-sm text-foreground font-medium">
            {option?.charAt(0)?.toUpperCase() + option?.slice(1)}
          </span>
        </label>
      ))}
    </div>
  );

  const renderFillBlank = () => (
    <div>
      <Input
        type="text"
        placeholder="Type your answer here..."
        value={answer || ''}
        onChange={(e) => onAnswerChange(e?.target?.value)}
        className="w-full"
      />
    </div>
  );

  const renderEssay = () => (
    <div>
      <textarea
        placeholder="Type your detailed answer here..."
        value={answer || ''}
        onChange={(e) => onAnswerChange(e?.target?.value)}
        className="w-full min-h-[200px] p-4 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-y"
      />
      <p className="text-xs text-muted-foreground mt-2">
        {answer?.length || 0} characters
      </p>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex-1">
            {question?.question}
          </h2>
        </div>
        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
          <span className="px-2 py-1 bg-primary/20 text-primary rounded">
            {question?.type?.split('-')?.map(word => word?.charAt(0)?.toUpperCase() + word?.slice(1))?.join(' ')}
          </span>
        </div>
      </div>

      <div className="mt-6">
        {question?.type === 'multiple-choice' && renderMultipleChoice()}
        {question?.type === 'true-false' && renderTrueFalse()}
        {question?.type === 'fill-blank' && renderFillBlank()}
        {question?.type === 'essay' && renderEssay()}
      </div>
    </div>
  );
};

export default QuestionDisplay;