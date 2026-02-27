import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import { Checkbox } from '../../../components/ui/Checkbox';

const CreateQuestionModal = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    type: 'mcq',
    subject: 'mathematics',
    difficulty: 'medium',
    questionText: '',
    options: [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false }
    ],
    correctAnswer: '',
    acceptedAnswers: [''],
    explanation: '',
    tags: []
  });

  const typeOptions = [
    { value: 'mcq', label: 'Multiple Choice' },
    { value: 'true-false', label: 'True/False' },
    { value: 'fill-blank', label: 'Fill in Blank' },
    { value: 'essay', label: 'Essay' }
  ];

  const subjectOptions = [
    { value: 'mathematics', label: 'Mathematics' },
    { value: 'physics', label: 'Physics' },
    { value: 'chemistry', label: 'Chemistry' },
    { value: 'biology', label: 'Biology' },
    { value: 'computer-science', label: 'Computer Science' }
  ];

  const difficultyOptions = [
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' }
  ];

  const handleOptionChange = (index, value) => {
    const newOptions = [...formData?.options];
    newOptions[index].text = value;
    setFormData({ ...formData, options: newOptions });
  };

  const handleCorrectOptionChange = (index) => {
    const newOptions = formData?.options?.map((opt, i) => ({
      ...opt,
      isCorrect: i === index
    }));
    setFormData({ ...formData, options: newOptions });
  };

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-1200 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 md:p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
              <Icon name="FilePlus" size={20} className="text-primary" />
            </div>
            <h2 className="text-lg md:text-xl font-heading font-semibold text-foreground">Create New Question</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-smooth"
          >
            <Icon name="X" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Question Type"
              required
              options={typeOptions}
              value={formData?.type}
              onChange={(value) => setFormData({ ...formData, type: value })}
            />
            <Select
              label="Subject"
              required
              options={subjectOptions}
              value={formData?.subject}
              onChange={(value) => setFormData({ ...formData, subject: value })}
            />
            <Select
              label="Difficulty"
              required
              options={difficultyOptions}
              value={formData?.difficulty}
              onChange={(value) => setFormData({ ...formData, difficulty: value })}
            />
          </div>

          <Input
            type="text"
            label="Question Text"
            placeholder="Enter your question here..."
            required
            value={formData?.questionText}
            onChange={(e) => setFormData({ ...formData, questionText: e?.target?.value })}
          />

          {formData?.type === 'mcq' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-foreground">Answer Options</p>
              {formData?.options?.map((option, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <Checkbox
                    checked={option?.isCorrect}
                    onChange={() => handleCorrectOptionChange(index)}
                  />
                  <div className="flex-1">
                    <Input
                      type="text"
                      placeholder={`Option ${String.fromCharCode(65 + index)}`}
                      value={option?.text}
                      onChange={(e) => handleOptionChange(index, e?.target?.value)}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Check the box next to the correct answer</p>
            </div>
          )}

          {formData?.type === 'true-false' && (
            <Select
              label="Correct Answer"
              required
              options={[
                { value: 'True', label: 'True' },
                { value: 'False', label: 'False' }
              ]}
              value={formData?.correctAnswer}
              onChange={(value) => setFormData({ ...formData, correctAnswer: value })}
            />
          )}

          {formData?.type === 'fill-blank' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Accepted Answers</p>
              {formData?.acceptedAnswers?.map((answer, index) => (
                <Input
                  key={index}
                  type="text"
                  placeholder={`Accepted answer ${index + 1}`}
                  value={answer}
                  onChange={(e) => {
                    const newAnswers = [...formData?.acceptedAnswers];
                    newAnswers[index] = e?.target?.value;
                    setFormData({ ...formData, acceptedAnswers: newAnswers });
                  }}
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                iconName="Plus"
                iconPosition="left"
                onClick={() => setFormData({ ...formData, acceptedAnswers: [...formData?.acceptedAnswers, ''] })}
              >
                Add Another Answer
              </Button>
            </div>
          )}

          <Input
            type="text"
            label="Explanation (Optional)"
            placeholder="Provide an explanation for the correct answer..."
            value={formData?.explanation}
            onChange={(e) => setFormData({ ...formData, explanation: e?.target?.value })}
          />

          <Input
            type="text"
            label="Tags (Optional)"
            placeholder="Enter tags separated by commas"
            description="e.g., algebra, equations, midterm"
          />
        </div>

        <div className="p-4 md:p-6 border-t border-border flex flex-col md:flex-row justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleSave}>
            Create Question
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateQuestionModal;