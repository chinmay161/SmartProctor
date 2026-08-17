import React, { useMemo, useState } from 'react';
import Button from '../../../components/ui/Button';
import Icon from '../../../components/AppIcon';

const QuestionImportTemplate = () => {
  const [copied, setCopied] = useState(false);

  const template = useMemo(
    () => JSON.stringify(
      {
        questions: [
          {
            id: 'q101',
            type: 'mcq',
            subject: 'mathematics',
            difficulty: 'easy',
            questionText: 'What is 2 + 2?',
            options: [
              { text: '3', isCorrect: false },
              { text: '4', isCorrect: true },
              { text: '5', isCorrect: false }
            ],
            correctAnswer: '4',
            acceptedAnswers: [],
            explanation: '2 + 2 equals 4.',
            tags: ['arithmetic', 'basics'],
            marks: 1
          },
          {
            id: 'q102',
            type: 'fill-blank',
            subject: 'mathematics',
            difficulty: 'medium',
            questionText: 'The square root of 81 is ____.',
            options: [],
            correctAnswer: '9',
            acceptedAnswers: ['9', 'nine'],
            explanation: '9 x 9 = 81.',
            tags: ['roots'],
            marks: 2
          }
        ]
      },
      null,
      2
    ),
    []
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy question import template', error);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Icon name="FileJson" size={18} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Question Import Format</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Paste or save this structure as a `.json` file, then use Import Questions.
          </p>
          <p className="text-xs text-muted-foreground">
            Supported types: `mcq`, `true-false`, `fill-blank`, `essay`
          </p>
        </div>

        <Button
          variant={copied ? 'success' : 'outline'}
          size="sm"
          iconName={copied ? 'Check' : 'Copy'}
          iconPosition="left"
          onClick={handleCopy}
        >
          {copied ? 'Copied' : 'Copy JSON'}
        </Button>
      </div>

      <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-background p-4 text-xs leading-6 text-foreground">
        <code>{template}</code>
      </pre>
    </div>
  );
};

export default QuestionImportTemplate;
