import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import { Checkbox } from '../../../components/ui/Checkbox';

const SystemSettingsPanel = () => {
  const [examDuration, setExamDuration] = useState('120');
  const [maxAttempts, setMaxAttempts] = useState('3');
  const [violationThreshold, setViolationThreshold] = useState('5');
  const [browserLockdown, setBrowserLockdown] = useState(true);
  const [webcamRequired, setWebcamRequired] = useState(true);
  const [screenRecording, setScreenRecording] = useState(true);
  const [tabSwitchDetection, setTabSwitchDetection] = useState(true);
  const [autoSubmit, setAutoSubmit] = useState(true);

  const timezoneOptions = [
    { value: 'utc', label: 'UTC (Coordinated Universal Time)' },
    { value: 'est', label: 'EST (Eastern Standard Time)' },
    { value: 'pst', label: 'PST (Pacific Standard Time)' },
    { value: 'cst', label: 'CST (Central Standard Time)' },
    { value: 'gmt', label: 'GMT (Greenwich Mean Time)' }
  ];

  const [selectedTimezone, setSelectedTimezone] = useState('utc');

  const handleSaveSettings = () => {
    console.log('Settings saved');
  };

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
            <Icon name="Settings" size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-heading font-semibold text-foreground">Exam Policies</h3>
            <p className="text-sm text-muted-foreground">Configure default exam settings and policies</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Default Exam Duration (minutes)"
            type="number"
            value={examDuration}
            onChange={(e) => setExamDuration(e?.target?.value)}
            description="Default time limit for new exams"
          />

          <Input
            label="Maximum Attempts Allowed"
            type="number"
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(e?.target?.value)}
            description="Number of times students can retake exams"
          />

          <Input
            label="Violation Threshold"
            type="number"
            value={violationThreshold}
            onChange={(e) => setViolationThreshold(e?.target?.value)}
            description="Maximum violations before auto-submission"
          />

          <Select
            label="Default Timezone"
            options={timezoneOptions}
            value={selectedTimezone}
            onChange={setSelectedTimezone}
            description="Timezone for exam scheduling"
          />
        </div>
      </div>
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-error/20 rounded-lg flex items-center justify-center">
            <Icon name="Shield" size={20} className="text-error" />
          </div>
          <div>
            <h3 className="text-lg font-heading font-semibold text-foreground">Security Parameters</h3>
            <p className="text-sm text-muted-foreground">Configure proctoring and security features</p>
          </div>
        </div>

        <div className="space-y-4">
          <Checkbox
            label="Browser Lockdown Mode"
            description="Prevent students from accessing other tabs or applications during exams"
            checked={browserLockdown}
            onChange={(e) => setBrowserLockdown(e?.target?.checked)}
          />

          <Checkbox
            label="Webcam Monitoring Required"
            description="Mandatory webcam access for all exam sessions"
            checked={webcamRequired}
            onChange={(e) => setWebcamRequired(e?.target?.checked)}
          />

          <Checkbox
            label="Screen Recording"
            description="Record student screens throughout exam duration"
            checked={screenRecording}
            onChange={(e) => setScreenRecording(e?.target?.checked)}
          />

          <Checkbox
            label="Tab Switch Detection"
            description="Track and flag when students switch browser tabs"
            checked={tabSwitchDetection}
            onChange={(e) => setTabSwitchDetection(e?.target?.checked)}
          />

          <Checkbox
            label="Auto-Submit on Time Expiry"
            description="Automatically submit exams when time runs out"
            checked={autoSubmit}
            onChange={(e) => setAutoSubmit(e?.target?.checked)}
          />
        </div>
      </div>
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-accent/20 rounded-lg flex items-center justify-center">
            <Icon name="Link" size={20} className="text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-heading font-semibold text-foreground">Integration Management</h3>
            <p className="text-sm text-muted-foreground">Connect with educational platforms and services</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center">
                <Icon name="CheckCircle" size={20} className="text-success" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Canvas LMS</p>
                <p className="text-xs text-muted-foreground">Connected • Last sync: 2 hours ago</p>
              </div>
            </div>
            <Button variant="outline" size="sm">Configure</Button>
          </div>

          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center">
                <Icon name="CheckCircle" size={20} className="text-success" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Blackboard Learn</p>
                <p className="text-xs text-muted-foreground">Connected • Last sync: 5 hours ago</p>
              </div>
            </div>
            <Button variant="outline" size="sm">Configure</Button>
          </div>

          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                <Icon name="Circle" size={20} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Moodle</p>
                <p className="text-xs text-muted-foreground">Not connected</p>
              </div>
            </div>
            <Button variant="default" size="sm">Connect</Button>
          </div>
        </div>
      </div>
      <div className="flex justify-end space-x-3">
        <Button variant="outline">Reset to Defaults</Button>
        <Button variant="default" iconName="Save" onClick={handleSaveSettings}>
          Save Settings
        </Button>
      </div>
    </div>
  );
};

export default SystemSettingsPanel;