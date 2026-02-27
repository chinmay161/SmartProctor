import React from 'react';
import { Checkbox, CheckboxGroup } from '../../../components/ui/Checkbox';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Icon from '../../../components/AppIcon';

const SecuritySettings = ({ formData, onChange, errors }) => {
  const violationActionOptions = [
    { value: 'warn', label: 'Warn Student' },
    { value: 'flag', label: 'Flag for Review' },
    { value: 'terminate', label: 'Terminate Exam' }
  ];

  const handleInputChange = (field, value) => {
    onChange({ ...formData, [field]: value });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-md">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-error/20 rounded-lg flex items-center justify-center">
          <Icon name="Shield" size={20} className="text-error" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl font-heading font-semibold text-foreground">Security Settings</h2>
          <p className="text-sm text-muted-foreground">Configure anti-cheating measures and monitoring</p>
        </div>
      </div>
      <div className="space-y-6">
        <CheckboxGroup label="Proctoring Features">
          <Checkbox
            label="Enable webcam monitoring"
            description="Continuously record student's webcam during exam"
            checked={formData?.enableWebcam}
            onChange={(e) => handleInputChange('enableWebcam', e?.target?.checked)}
          />
          <Checkbox
            label="Enable screen recording"
            description="Record student's screen throughout the exam"
            checked={formData?.enableScreenRecording}
            onChange={(e) => handleInputChange('enableScreenRecording', e?.target?.checked)}
          />
          <Checkbox
            label="Browser lockdown mode"
            description="Prevent access to other tabs and applications"
            checked={formData?.browserLockdown}
            onChange={(e) => handleInputChange('browserLockdown', e?.target?.checked)}
          />
          <Checkbox
            label="Detect tab switching"
            description="Track when students switch to other browser tabs"
            checked={formData?.detectTabSwitch}
            onChange={(e) => handleInputChange('detectTabSwitch', e?.target?.checked)}
          />
        </CheckboxGroup>

        <div className="bg-muted/30 border border-border rounded-lg p-4 md:p-6">
          <h3 className="text-sm font-medium text-foreground mb-4 flex items-center space-x-2">
            <Icon name="AlertTriangle" size={18} className="text-warning" />
            <span>Violation Detection</span>
          </h3>
          <div className="space-y-4">
            <Checkbox
              label="Multiple face detection"
              description="Alert when more than one person is detected"
              checked={formData?.detectMultipleFaces}
              onChange={(e) => handleInputChange('detectMultipleFaces', e?.target?.checked)}
            />
            <Checkbox
              label="No face detection"
              description="Alert when student's face is not visible"
              checked={formData?.detectNoFace}
              onChange={(e) => handleInputChange('detectNoFace', e?.target?.checked)}
            />
            <Checkbox
              label="Mobile phone detection"
              description="Alert when mobile device is detected in frame"
              checked={formData?.detectMobilePhone}
              onChange={(e) => handleInputChange('detectMobilePhone', e?.target?.checked)}
            />
            <Checkbox
              label="Audio monitoring"
              description="Detect suspicious audio patterns or conversations"
              checked={formData?.audioMonitoring}
              onChange={(e) => handleInputChange('audioMonitoring', e?.target?.checked)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Violation Threshold"
            type="number"
            placeholder="3"
            value={formData?.violationThreshold}
            onChange={(e) => handleInputChange('violationThreshold', e?.target?.value)}
            error={errors?.violationThreshold}
            min="1"
            max="10"
            description="Maximum violations before action"
          />

          <Select
            label="Violation Action"
            placeholder="Select action"
            options={violationActionOptions}
            value={formData?.violationAction}
            onChange={(value) => handleInputChange('violationAction', value)}
            error={errors?.violationAction}
            description="Action to take when threshold is reached"
          />
        </div>

        <CheckboxGroup label="Question Security">
          <Checkbox
            label="Randomize question order"
            description="Show questions in random order for each student"
            checked={formData?.randomizeQuestions}
            onChange={(e) => handleInputChange('randomizeQuestions', e?.target?.checked)}
          />
          <Checkbox
            label="Randomize answer options"
            description="Shuffle answer choices for MCQ questions"
            checked={formData?.randomizeAnswers}
            onChange={(e) => handleInputChange('randomizeAnswers', e?.target?.checked)}
          />
          <Checkbox
            label="Disable copy-paste"
            description="Prevent students from copying exam content"
            checked={formData?.disableCopyPaste}
            onChange={(e) => handleInputChange('disableCopyPaste', e?.target?.checked)}
          />
          <Checkbox
            label="Disable right-click"
            description="Prevent right-click context menu access"
            checked={formData?.disableRightClick}
            onChange={(e) => handleInputChange('disableRightClick', e?.target?.checked)}
          />
        </CheckboxGroup>

        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-start space-x-3">
          <Icon name="AlertCircle" size={20} className="text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium mb-1">Security Recommendations</p>
            <p className="text-xs text-muted-foreground">
              Enable webcam monitoring and browser lockdown for high-stakes exams. Ensure students are informed about proctoring measures before the exam begins.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecuritySettings;