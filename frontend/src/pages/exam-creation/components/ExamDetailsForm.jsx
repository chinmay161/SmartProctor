import React from 'react';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Icon from '../../../components/AppIcon';

const ExamDetailsForm = ({ formData, onChange, errors }) => {
  const courseOptions = [
    { value: 'math-101', label: 'Mathematics 101 - Calculus I' },
    { value: 'cs-201', label: 'Computer Science 201 - Data Structures' },
    { value: 'phy-301', label: 'Physics 301 - Quantum Mechanics' },
    { value: 'eng-102', label: 'English 102 - Literature Analysis' },
    { value: 'bio-205', label: 'Biology 205 - Molecular Biology' }
  ];

  const difficultyOptions = [
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' },
    { value: 'expert', label: 'Expert' }
  ];

  const handleInputChange = (field, value) => {
    onChange({ ...formData, [field]: value });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-md">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
          <Icon name="FileText" size={20} className="text-primary" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl font-heading font-semibold text-foreground">Exam Details</h2>
          <p className="text-sm text-muted-foreground">Configure basic exam information</p>
        </div>
      </div>
      <div className="space-y-6">
        <Input
          label="Exam Title"
          type="text"
          placeholder="e.g., Mathematics Final Exam 2026"
          value={formData?.title}
          onChange={(e) => handleInputChange('title', e?.target?.value)}
          error={errors?.title}
          required
          description="Provide a clear, descriptive title for the exam"
        />

        <Select
          label="Course"
          placeholder="Select course"
          options={courseOptions}
          value={formData?.course}
          onChange={(value) => handleInputChange('course', value)}
          error={errors?.course}
          required
          searchable
          description="Choose the course this exam belongs to"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Duration (minutes)"
            type="number"
            placeholder="120"
            value={formData?.duration}
            onChange={(e) => handleInputChange('duration', e?.target?.value)}
            error={errors?.duration}
            required
            min="1"
            max="480"
            description="Total time allowed for exam completion"
          />

          <Input
            label="Maximum Attempts"
            type="number"
            placeholder="1"
            value={formData?.maxAttempts}
            onChange={(e) => handleInputChange('maxAttempts', e?.target?.value)}
            error={errors?.maxAttempts}
            required
            min="1"
            max="5"
            description="Number of times students can take this exam"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Total Marks"
            type="number"
            placeholder="100"
            value={formData?.totalMarks}
            onChange={(e) => handleInputChange('totalMarks', e?.target?.value)}
            error={errors?.totalMarks}
            required
            min="1"
            description="Maximum marks for this exam"
          />

          <Input
            label="Passing Marks"
            type="number"
            placeholder="40"
            value={formData?.passingMarks}
            onChange={(e) => handleInputChange('passingMarks', e?.target?.value)}
            error={errors?.passingMarks}
            required
            min="1"
            description="Minimum marks required to pass"
          />
        </div>

        <Select
          label="Difficulty Level"
          placeholder="Select difficulty"
          options={difficultyOptions}
          value={formData?.difficulty}
          onChange={(value) => handleInputChange('difficulty', value)}
          error={errors?.difficulty}
          required
          description="Overall difficulty rating for this exam"
        />

        <Input
          label="Instructions"
          type="text"
          placeholder="Enter exam instructions for students"
          value={formData?.instructions}
          onChange={(e) => handleInputChange('instructions', e?.target?.value)}
          description="Special instructions or guidelines for students (optional)"
        />
      </div>
    </div>
  );
};

export default ExamDetailsForm;