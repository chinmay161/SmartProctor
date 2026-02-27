import React from 'react';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import { Checkbox } from '../../../components/ui/Checkbox';
import Icon from '../../../components/AppIcon';

const SchedulingConfiguration = ({ formData, onChange, errors }) => {
  const timezoneOptions = [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'Europe/London', label: 'Greenwich Mean Time (GMT)' },
    { value: 'Asia/Kolkata', label: 'India Standard Time (IST)' },
    { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' }
  ];

  const handleInputChange = (field, value) => {
    onChange({ ...formData, [field]: value });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-md">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-accent/20 rounded-lg flex items-center justify-center">
          <Icon name="Calendar" size={20} className="text-accent" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl font-heading font-semibold text-foreground">Scheduling Configuration</h2>
          <p className="text-sm text-muted-foreground">Set exam date, time, and availability window</p>
        </div>
      </div>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Start Date"
            type="date"
            value={formData?.startDate}
            onChange={(e) => handleInputChange('startDate', e?.target?.value)}
            error={errors?.startDate}
            required
            min={new Date()?.toISOString()?.split('T')?.[0]}
            description="Date when exam becomes available"
          />

          <Input
            label="Start Time"
            type="time"
            value={formData?.startTime}
            onChange={(e) => handleInputChange('startTime', e?.target?.value)}
            error={errors?.startTime}
            required
            description="Time when exam starts"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="End Date"
            type="date"
            value={formData?.endDate}
            onChange={(e) => handleInputChange('endDate', e?.target?.value)}
            error={errors?.endDate}
            required
            min={formData?.startDate || new Date()?.toISOString()?.split('T')?.[0]}
            description="Date when exam window closes"
          />

          <Input
            label="End Time"
            type="time"
            value={formData?.endTime}
            onChange={(e) => handleInputChange('endTime', e?.target?.value)}
            error={errors?.endTime}
            required
            description="Time when exam window closes"
          />
        </div>

        <Select
          label="Timezone"
          placeholder="Select timezone"
          options={timezoneOptions}
          value={formData?.timezone}
          onChange={(value) => handleInputChange('timezone', value)}
          error={errors?.timezone}
          required
          searchable
          description="Timezone for exam scheduling"
        />

        <div className="bg-muted/30 border border-border rounded-lg p-4 md:p-6">
          <h3 className="text-sm font-medium text-foreground mb-4">Availability Options</h3>
          <div className="space-y-4">
            <Checkbox
              label="Allow late submission"
              description="Students can submit after end time with penalty"
              checked={formData?.allowLateSubmission}
              onChange={(e) => handleInputChange('allowLateSubmission', e?.target?.checked)}
            />

            {formData?.allowLateSubmission && (
              <div className="ml-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Grace Period (minutes)"
                  type="number"
                  placeholder="15"
                  value={formData?.gracePeriod}
                  onChange={(e) => handleInputChange('gracePeriod', e?.target?.value)}
                  min="1"
                  max="60"
                />
                <Input
                  label="Late Penalty (%)"
                  type="number"
                  placeholder="10"
                  value={formData?.latePenalty}
                  onChange={(e) => handleInputChange('latePenalty', e?.target?.value)}
                  min="0"
                  max="100"
                />
              </div>
            )}

            <Checkbox
              label="Publish results immediately"
              description="Show results to students after submission"
              checked={formData?.publishImmediately}
              onChange={(e) => handleInputChange('publishImmediately', e?.target?.checked)}
            />

            <Checkbox
              label="Send reminder notifications"
              description="Email students 24 hours before exam"
              checked={formData?.sendReminders}
              onChange={(e) => handleInputChange('sendReminders', e?.target?.checked)}
            />
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start space-x-3">
          <Icon name="Info" size={20} className="text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium mb-1">Scheduling Tips</p>
            <p className="text-xs text-muted-foreground">
              Ensure adequate time between start and end dates for students in different timezones. Consider adding buffer time for technical issues.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchedulingConfiguration;