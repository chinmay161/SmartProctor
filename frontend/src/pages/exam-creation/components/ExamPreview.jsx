import React, { useState, useEffect } from 'react';

import Icon from '../../../components/AppIcon';

const ExamPreview = ({ formData, selectedQuestions }) => {
  const [activeTab, setActiveTab] = useState('overview');

  const [remoteQuestions, setRemoteQuestions] = useState(null);

  // removed inline mockQuestions; backend will supply question details

  const getSecurityFeatures = () => {
    const features = [];
    if (formData?.enableWebcam) features?.push('Webcam Monitoring');
    if (formData?.enableScreenRecording) features?.push('Screen Recording');
    if (formData?.browserLockdown) features?.push('Browser Lockdown');
    if (formData?.detectTabSwitch) features?.push('Tab Switch Detection');
    return features;
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'FileText' },
    { id: 'questions', label: 'Questions', icon: 'List' },
    { id: 'security', label: 'Security', icon: 'Shield' }
  ];

  useEffect(() => {
    let mounted = true;
    const fetchSelected = async () => {
      if (!selectedQuestions || selectedQuestions.length === 0) return;
      try {
        // Attempt to fetch question details for selected IDs
        const resp = await import('../../../services/httpClient').then(m => Promise.all(
          selectedQuestions.map(id => m.apiGet(`/api/questions/${id}`))
        ));
        if (!mounted) return;
        setRemoteQuestions(resp);
      } catch (err) {
        setRemoteQuestions(null);
      }
    };

    fetchSelected();
    return () => { mounted = false; };
  }, [selectedQuestions]);

  return (
    <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden">
      <div className="bg-primary/10 border-b border-border p-6">
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
            <Icon name="Eye" size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-heading font-semibold text-foreground">Exam Preview</h2>
            <p className="text-sm text-muted-foreground">Review how students will see this exam</p>
          </div>
        </div>
      </div>
      <div className="border-b border-border">
        <div className="flex overflow-x-auto">
          {tabs?.map((tab) => (
            <button
              key={tab?.id}
              onClick={() => setActiveTab(tab?.id)}
              className={`flex items-center space-x-2 px-6 py-4 text-sm font-medium transition-smooth whitespace-nowrap ${
                activeTab === tab?.id
                  ? 'text-primary border-b-2 border-primary bg-primary/5' :'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <Icon name={tab?.icon} size={18} />
              <span>{tab?.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="p-6 md:p-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl md:text-3xl font-heading font-semibold text-foreground mb-2">
                {formData?.title || 'Untitled Exam'}
              </h3>
              <p className="text-sm text-muted-foreground">{formData?.instructions || 'No instructions provided'}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Icon name="Clock" size={18} className="text-primary" />
                  <span className="text-xs text-muted-foreground">Duration</span>
                </div>
                <p className="text-lg font-semibold text-foreground">{formData?.duration || 0} min</p>
              </div>

              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Icon name="FileText" size={18} className="text-success" />
                  <span className="text-xs text-muted-foreground">Questions</span>
                </div>
                <p className="text-lg font-semibold text-foreground">{selectedQuestions?.length}</p>
              </div>

              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Icon name="Award" size={18} className="text-accent" />
                  <span className="text-xs text-muted-foreground">Total Marks</span>
                </div>
                <p className="text-lg font-semibold text-foreground">{formData?.totalMarks || 0}</p>
              </div>

              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Icon name="Target" size={18} className="text-error" />
                  <span className="text-xs text-muted-foreground">Passing Marks</span>
                </div>
                <p className="text-lg font-semibold text-foreground">{formData?.passingMarks || 0}</p>
              </div>
            </div>

            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
              <h4 className="text-sm font-medium text-foreground mb-3 flex items-center space-x-2">
                <Icon name="AlertCircle" size={18} className="text-warning" />
                <span>Important Instructions</span>
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start space-x-2">
                  <Icon name="Check" size={16} className="text-success shrink-0 mt-0.5" />
                  <span>Ensure stable internet connection throughout the exam</span>
                </li>
                <li className="flex items-start space-x-2">
                  <Icon name="Check" size={16} className="text-success shrink-0 mt-0.5" />
                  <span>Keep your webcam and microphone enabled at all times</span>
                </li>
                <li className="flex items-start space-x-2">
                  <Icon name="Check" size={16} className="text-success shrink-0 mt-0.5" />
                  <span>Do not switch tabs or minimize the browser window</span>
                </li>
                <li className="flex items-start space-x-2">
                  <Icon name="Check" size={16} className="text-success shrink-0 mt-0.5" />
                  <span>Exam will auto-submit when time expires</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="space-y-4">
            {(remoteQuestions || [])?.map((question, index) => (
              <div key={question?.id} className="bg-muted/30 border border-border rounded-lg p-4 md:p-6">
                <div className="flex items-start space-x-3 mb-4">
                  <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-primary">{index + 1}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm md:text-base text-foreground mb-2">{question?.text}</p>
                    {question?.type === 'mcq' && (
                      <div className="space-y-2 mt-4">
                        {question?.options?.map((option, idx) => (
                          <div key={idx} className="flex items-center space-x-3 p-3 bg-card border border-border rounded-lg hover:border-primary/50 transition-smooth cursor-pointer">
                            <div className="w-5 h-5 border-2 border-muted-foreground rounded-full"></div>
                            <span className="text-sm text-foreground">{option}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {question?.type === 'fill-blank' && (
                      <div className="mt-4">
                        <input
                          type="text"
                          placeholder="Type your answer here..."
                          className="w-full px-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          disabled
                        />
                      </div>
                    )}
                    {question?.type === 'true-false' && (
                      <div className="flex space-x-4 mt-4">
                        <div className="flex items-center space-x-3 p-3 bg-card border border-border rounded-lg hover:border-primary/50 transition-smooth cursor-pointer">
                          <div className="w-5 h-5 border-2 border-muted-foreground rounded-full"></div>
                          <span className="text-sm text-foreground">True</span>
                        </div>
                        <div className="flex items-center space-x-3 p-3 bg-card border border-border rounded-lg hover:border-primary/50 transition-smooth cursor-pointer">
                          <div className="w-5 h-5 border-2 border-muted-foreground rounded-full"></div>
                          <span className="text-sm text-foreground">False</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {selectedQuestions?.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon name="FileQuestion" size={32} className="text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No questions selected yet</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="bg-error/10 border border-error/30 rounded-lg p-6">
              <h4 className="text-sm font-medium text-foreground mb-4 flex items-center space-x-2">
                <Icon name="Shield" size={18} className="text-error" />
                <span>Active Security Measures</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {getSecurityFeatures()?.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 bg-card rounded-lg">
                    <Icon name="CheckCircle" size={18} className="text-success" />
                    <span className="text-sm text-foreground">{feature}</span>
                  </div>
                ))}
                {getSecurityFeatures()?.length === 0 && (
                  <div className="col-span-2 text-center py-4">
                    <p className="text-sm text-muted-foreground">No security features enabled</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-muted/30 rounded-lg p-6">
              <h4 className="text-sm font-medium text-foreground mb-4">Violation Policy</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Violation Threshold</span>
                  <span className="text-sm font-semibold text-foreground">{formData?.violationThreshold || 0} violations</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Action on Threshold</span>
                  <span className="text-sm font-semibold text-foreground capitalize">{formData?.violationAction || 'Not set'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Question Randomization</span>
                  <span className="text-sm font-semibold text-foreground">{formData?.randomizeQuestions ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
            </div>

            <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 flex items-start space-x-3">
              <Icon name="Info" size={20} className="text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-foreground font-medium mb-1">Student Notification</p>
                <p className="text-xs text-muted-foreground">
                  Students will be informed about all active proctoring measures before starting the exam. They must provide consent to proceed.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamPreview;