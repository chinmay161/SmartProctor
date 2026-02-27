import React, { useState } from 'react';
import Select from '../../../components/ui/Select';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';
import Icon from '../../../components/AppIcon';


const QuestionBankPanel = ({ selectedQuestions, onQuestionsChange }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  const questionTypes = [
    { value: '', label: 'All Types' },
    { value: 'mcq', label: 'Multiple Choice' },
    { value: 'true-false', label: 'True/False' },
    { value: 'fill-blank', label: 'Fill in the Blanks' },
    { value: 'subjective', label: 'Subjective' }
  ];

  const difficultyLevels = [
    { value: '', label: 'All Difficulties' },
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' }
  ];

  const tagOptions = [
    { value: '', label: 'All Tags' },
    { value: 'algebra', label: 'Algebra' },
    { value: 'calculus', label: 'Calculus' },
    { value: 'geometry', label: 'Geometry' },
    { value: 'statistics', label: 'Statistics' }
  ];

  const availableQuestions = [
    {
      id: 'q1',
      text: 'What is the derivative of x² with respect to x?',
      type: 'mcq',
      difficulty: 'easy',
      tags: ['calculus', 'derivatives'],
      marks: 2,
      options: ['2x', 'x', '2', 'x²']
    },
    {
      id: 'q2',
      text: 'Solve the equation: 2x + 5 = 15',
      type: 'fill-blank',
      difficulty: 'easy',
      tags: ['algebra', 'equations'],
      marks: 3
    },
    {
      id: 'q3',
      text: 'The sum of angles in a triangle is always 180 degrees.',
      type: 'true-false',
      difficulty: 'easy',
      tags: ['geometry', 'triangles'],
      marks: 1
    },
    {
      id: 'q4',
      text: 'Explain the fundamental theorem of calculus and its applications.',
      type: 'subjective',
      difficulty: 'hard',
      tags: ['calculus', 'theory'],
      marks: 10
    },
    {
      id: 'q5',
      text: 'Calculate the integral of sin(x) from 0 to π',
      type: 'mcq',
      difficulty: 'medium',
      tags: ['calculus', 'integration'],
      marks: 4,
      options: ['2', '0', '1', 'π']
    },
    {
      id: 'q6',
      text: 'What is the probability of getting heads in a fair coin toss?',
      type: 'mcq',
      difficulty: 'easy',
      tags: ['statistics', 'probability'],
      marks: 2,
      options: ['0.5', '0.25', '1', '0.75']
    }
  ];

  const filteredQuestions = availableQuestions?.filter(q => {
    const matchesSearch = q?.text?.toLowerCase()?.includes(searchQuery?.toLowerCase());
    const matchesType = !selectedType || q?.type === selectedType;
    const matchesDifficulty = !selectedDifficulty || q?.difficulty === selectedDifficulty;
    const matchesTag = !selectedTag || q?.tags?.includes(selectedTag);
    return matchesSearch && matchesType && matchesDifficulty && matchesTag;
  });

  const handleQuestionToggle = (questionId) => {
    if (selectedQuestions?.includes(questionId)) {
      onQuestionsChange(selectedQuestions?.filter(id => id !== questionId));
    } else {
      onQuestionsChange([...selectedQuestions, questionId]);
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'mcq': return 'CheckSquare';
      case 'true-false': return 'ToggleLeft';
      case 'fill-blank': return 'Edit3';
      case 'subjective': return 'FileText';
      default: return 'HelpCircle';
    }
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy': return 'text-success bg-success/20';
      case 'medium': return 'text-accent bg-accent/20';
      case 'hard': return 'text-error bg-error/20';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-md">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center">
          <Icon name="Database" size={20} className="text-success" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg md:text-xl font-heading font-semibold text-foreground">Question Bank</h2>
          <p className="text-sm text-muted-foreground">Select questions from your question bank</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-foreground">{selectedQuestions?.length} Selected</p>
          <p className="text-xs text-muted-foreground">{filteredQuestions?.length} Available</p>
        </div>
      </div>
      <div className="space-y-4 mb-6">
        <Input
          type="search"
          placeholder="Search questions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e?.target?.value)}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            placeholder="Filter by type"
            options={questionTypes}
            value={selectedType}
            onChange={setSelectedType}
          />
          <Select
            placeholder="Filter by difficulty"
            options={difficultyLevels}
            value={selectedDifficulty}
            onChange={setSelectedDifficulty}
          />
          <Select
            placeholder="Filter by tag"
            options={tagOptions}
            value={selectedTag}
            onChange={setSelectedTag}
          />
        </div>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {filteredQuestions?.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="Search" size={32} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No questions found matching your filters</p>
          </div>
        ) : (
          filteredQuestions?.map((question) => (
            <div
              key={question?.id}
              className={`border rounded-lg p-4 transition-smooth cursor-pointer ${
                selectedQuestions?.includes(question?.id)
                  ? 'border-primary bg-primary/5' :'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
              onClick={() => handleQuestionToggle(question?.id)}
            >
              <div className="flex items-start space-x-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedQuestions?.includes(question?.id) ? 'bg-primary' : 'bg-muted'
                }`}>
                  <Icon 
                    name={selectedQuestions?.includes(question?.id) ? 'Check' : getTypeIcon(question?.type)} 
                    size={16} 
                    className={selectedQuestions?.includes(question?.id) ? 'text-primary-foreground' : 'text-muted-foreground'}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground mb-2">{question?.text}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getDifficultyColor(question?.difficulty)}`}>
                      {question?.difficulty}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                      {question?.type}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent">
                      {question?.marks} marks
                    </span>
                    {question?.tags?.map((tag, idx) => (
                      <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-6 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button variant="outline" iconName="Plus" iconPosition="left">
          Create New Question
        </Button>
        <Button variant="outline" iconName="Upload" iconPosition="left">
          Import Questions
        </Button>
      </div>
    </div>
  );
};

export default QuestionBankPanel;