import React from 'react';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Button from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';

const FilterPanel = ({ filters, onFilterChange, onClearFilters }) => {
  const subjectOptions = [
    { value: 'all', label: 'All Subjects' },
    { value: 'mathematics', label: 'Mathematics' },
    { value: 'physics', label: 'Physics' },
    { value: 'chemistry', label: 'Chemistry' },
    { value: 'biology', label: 'Biology' },
    { value: 'computer-science', label: 'Computer Science' },
    { value: 'english', label: 'English' },
    { value: 'history', label: 'History' }
  ];

  const difficultyOptions = [
    { value: 'all', label: 'All Difficulties' },
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' }
  ];

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'mcq', label: 'Multiple Choice' },
    { value: 'true-false', label: 'True/False' },
    { value: 'fill-blank', label: 'Fill in Blank' },
    { value: 'essay', label: 'Essay' }
  ];

  const sortOptions = [
    { value: 'recent', label: 'Most Recent' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'most-used', label: 'Most Used' },
    { value: 'highest-score', label: 'Highest Avg Score' },
    { value: 'lowest-score', label: 'Lowest Avg Score' }
  ];

  return (
    <div className="bg-card border border-border rounded-lg shadow-md p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base md:text-lg font-heading font-semibold text-foreground flex items-center space-x-2">
          <Icon name="Filter" size={20} className="text-primary" />
          <span>Filters</span>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          iconName="X"
          iconPosition="left"
          onClick={onClearFilters}
        >
          Clear
        </Button>
      </div>
      <div className="space-y-4">
        <Input
          type="search"
          label="Search Questions"
          placeholder="Search by question text or tags..."
          value={filters?.searchQuery}
          onChange={(e) => onFilterChange('searchQuery', e?.target?.value)}
        />

        <Select
          label="Subject"
          options={subjectOptions}
          value={filters?.subject}
          onChange={(value) => onFilterChange('subject', value)}
        />

        <Select
          label="Difficulty Level"
          options={difficultyOptions}
          value={filters?.difficulty}
          onChange={(value) => onFilterChange('difficulty', value)}
        />

        <Select
          label="Question Type"
          options={typeOptions}
          value={filters?.type}
          onChange={(value) => onFilterChange('type', value)}
        />

        <Select
          label="Sort By"
          options={sortOptions}
          value={filters?.sortBy}
          onChange={(value) => onFilterChange('sortBy', value)}
        />

        <div className="space-y-3 pt-2 border-t border-border">
          <p className="text-sm font-medium text-foreground">Additional Filters</p>
          <Checkbox
            label="Show only unused questions"
            checked={filters?.onlyUnused}
            onChange={(e) => onFilterChange('onlyUnused', e?.target?.checked)}
          />
          <Checkbox
            label="Show questions with low performance"
            description="Average score below 60%"
            checked={filters?.lowPerformance}
            onChange={(e) => onFilterChange('lowPerformance', e?.target?.checked)}
          />
          <Checkbox
            label="Show questions with images"
            checked={filters?.hasImages}
            onChange={(e) => onFilterChange('hasImages', e?.target?.checked)}
          />
          <Checkbox
            label="Show questions with explanations"
            checked={filters?.hasExplanations}
            onChange={(e) => onFilterChange('hasExplanations', e?.target?.checked)}
          />
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;