import React from 'react';
import { Checkbox, CheckboxGroup } from '../../../components/ui/Checkbox';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Icon from '../../../components/AppIcon';

const AdvancedSettings = ({ formData, onChange, errors }) => {
  const gradingMethodOptions = [
    { value: 'automatic', label: 'Automatic (Objective Questions Only)' },
    { value: 'manual', label: 'Manual Review Required' },
    { value: 'hybrid', label: 'Hybrid (Auto + Manual)' }
  ];

  const resultVisibilityOptions = [
    { value: 'immediate', label: 'Immediately After Submission' },
    { value: 'scheduled', label: 'On Scheduled Date' },
    { value: 'manual', label: 'Manual Release by Instructor' }
  ];

  const handleInputChange = (field, value) => {
    onChange({ ...formData, [field]: value });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-md">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
          <Icon name="Settings" size={20} className="text-primary" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl font-heading font-semibold text-foreground">Advanced Settings</h2>
          <p className="text-sm text-muted-foreground">Configure grading, accessibility, and result distribution</p>
        </div>
      </div>
      <div className="space-y-6">
        <div className="bg-muted/30 border border-border rounded-lg p-4 md:p-6">
          <h3 className="text-sm font-medium text-foreground mb-4 flex items-center space-x-2">
            <Icon name="Award" size={18} className="text-success" />
            <span>Grading Configuration</span>
          </h3>
          <div className="space-y-4">
            <Select
              label="Grading Method"
              placeholder="Select grading method"
              options={gradingMethodOptions}
              value={formData?.gradingMethod}
              onChange={(value) => handleInputChange('gradingMethod', value)}
              error={errors?.gradingMethod}
              required
              description="How exam answers will be evaluated"
            />

            <Checkbox
              label="Enable negative marking"
              description="Deduct marks for incorrect answers"
              checked={formData?.negativeMarking}
              onChange={(e) => handleInputChange('negativeMarking', e?.target?.checked)}
            />

            {formData?.negativeMarking && (
              <div className="ml-8">
                <Input
                  label="Negative Marks Per Question"
                  type="number"
                  placeholder="0.25"
                  value={formData?.negativeMarksValue}
                  onChange={(e) => handleInputChange('negativeMarksValue', e?.target?.value)}
                  min="0"
                  step="0.25"
                  description="Marks to deduct for each wrong answer"
                />
              </div>
            )}

            <Checkbox
              label="Partial marking"
              description="Award partial credit for partially correct answers"
              checked={formData?.partialMarking}
              onChange={(e) => handleInputChange('partialMarking', e?.target?.checked)}
            />
          </div>
        </div>

        <div className="bg-muted/30 border border-border rounded-lg p-4 md:p-6">
          <h3 className="text-sm font-medium text-foreground mb-4 flex items-center space-x-2">
            <Icon name="Eye" size={18} className="text-accent" />
            <span>Result Distribution</span>
          </h3>
          <div className="space-y-4">
            <Select
              label="Result Visibility"
              placeholder="Select visibility option"
              options={resultVisibilityOptions}
              value={formData?.resultVisibility}
              onChange={(value) => handleInputChange('resultVisibility', value)}
              error={errors?.resultVisibility}
              required
              description="When students can view their results"
            />

            {formData?.resultVisibility === 'scheduled' && (
              <div className="ml-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Result Release Date"
                  type="date"
                  value={formData?.resultReleaseDate}
                  onChange={(e) => handleInputChange('resultReleaseDate', e?.target?.value)}
                  min={new Date()?.toISOString()?.split('T')?.[0]}
                />
                <Input
                  label="Result Release Time"
                  type="time"
                  value={formData?.resultReleaseTime}
                  onChange={(e) => handleInputChange('resultReleaseTime', e?.target?.value)}
                />
              </div>
            )}

            <CheckboxGroup label="Show in Results">
              <Checkbox
                label="Show correct answers"
                description="Display correct answers after submission"
                checked={formData?.showCorrectAnswers}
                onChange={(e) => handleInputChange('showCorrectAnswers', e?.target?.checked)}
              />
              <Checkbox
                label="Show detailed feedback"
                description="Provide explanations for each question"
                checked={formData?.showFeedback}
                onChange={(e) => handleInputChange('showFeedback', e?.target?.checked)}
              />
              <Checkbox
                label="Show score breakdown"
                description="Display marks for each section/question"
                checked={formData?.showScoreBreakdown}
                onChange={(e) => handleInputChange('showScoreBreakdown', e?.target?.checked)}
              />
            </CheckboxGroup>
          </div>
        </div>

        <div className="bg-muted/30 border border-border rounded-lg p-4 md:p-6">
          <h3 className="text-sm font-medium text-foreground mb-4 flex items-center space-x-2">
            <Icon name="Users" size={18} className="text-primary" />
            <span>Accessibility & Accommodations</span>
          </h3>
          <div className="space-y-4">
            <Checkbox
              label="Allow time extensions"
              description="Permit additional time for students with accommodations"
              checked={formData?.allowTimeExtensions}
              onChange={(e) => handleInputChange('allowTimeExtensions', e?.target?.checked)}
            />

            {formData?.allowTimeExtensions && (
              <div className="ml-8">
                <Input
                  label="Maximum Extension (minutes)"
                  type="number"
                  placeholder="30"
                  value={formData?.maxExtension}
                  onChange={(e) => handleInputChange('maxExtension', e?.target?.value)}
                  min="1"
                  max="120"
                  description="Maximum additional time allowed"
                />
              </div>
            )}

            <Checkbox
              label="Enable screen reader support"
              description="Optimize exam interface for screen readers"
              checked={formData?.screenReaderSupport}
              onChange={(e) => handleInputChange('screenReaderSupport', e?.target?.checked)}
            />

            <Checkbox
              label="Allow breaks"
              description="Permit students to pause and resume exam"
              checked={formData?.allowBreaks}
              onChange={(e) => handleInputChange('allowBreaks', e?.target?.checked)}
            />

            {formData?.allowBreaks && (
              <div className="ml-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Maximum Breaks"
                  type="number"
                  placeholder="2"
                  value={formData?.maxBreaks}
                  onChange={(e) => handleInputChange('maxBreaks', e?.target?.value)}
                  min="1"
                  max="5"
                />
                <Input
                  label="Break Duration (minutes)"
                  type="number"
                  placeholder="5"
                  value={formData?.breakDuration}
                  onChange={(e) => handleInputChange('breakDuration', e?.target?.value)}
                  min="1"
                  max="15"
                />
              </div>
            )}
          </div>
        </div>

        <div className="bg-success/10 border border-success/30 rounded-lg p-4 flex items-start space-x-3">
          <Icon name="CheckCircle" size={20} className="text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium mb-1">Configuration Complete</p>
            <p className="text-xs text-muted-foreground">
              Review all settings before creating the exam. You can modify these settings later from the exam management dashboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedSettings;