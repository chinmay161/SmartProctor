import { apiRequest } from "../../services/api";
import { useAuth0 } from "@auth0/auth0-react";

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogout } from '../../context/SessionContext';
import RoleBasedHeader from '../../components/ui/RoleBasedHeader';
import SecurityBadgeDisplay from '../../components/ui/SecurityBadgeDisplay';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';
import ProgressStepper from './components/ProgressStepper';
import ExamDetailsForm from './components/ExamDetailsForm';
import SchedulingConfiguration from './components/SchedulingConfiguration';
import QuestionBankPanel from './components/QuestionBankPanel';
import SecuritySettings from './components/SecuritySettings';
import AdvancedSettings from './components/AdvancedSettings';
import ExamPreview from './components/ExamPreview';

const ExamCreation = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const { logout } = useLogout();
  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [errors, setErrors] = useState({});

  const [examData, setExamData] = useState({
    title: '',
    course: '',
    duration: '',
    maxAttempts: '1',
    totalMarks: '',
    passingMarks: '',
    difficulty: '',
    instructions: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    timezone: 'America/New_York',
    allowLateSubmission: false,
    gracePeriod: '',
    latePenalty: '',
    publishImmediately: false,
    sendReminders: true,
    enableWebcam: true,
    enableScreenRecording: true,
    browserLockdown: true,
    detectTabSwitch: true,
    detectMultipleFaces: true,
    detectNoFace: true,
    detectMobilePhone: false,
    audioMonitoring: false,
    violationThreshold: '3',
    violationAction: 'warn',
    randomizeQuestions: true,
    randomizeAnswers: true,
    disableCopyPaste: true,
    disableRightClick: true,
    gradingMethod: 'automatic',
    negativeMarking: false,
    negativeMarksValue: '',
    partialMarking: false,
    resultVisibility: 'immediate',
    resultReleaseDate: '',
    resultReleaseTime: '',
    showCorrectAnswers: true,
    showFeedback: true,
    showScoreBreakdown: true,
    allowTimeExtensions: false,
    maxExtension: '',
    screenReaderSupport: true,
    allowBreaks: false,
    maxBreaks: '',
    breakDuration: ''
  });

  const steps = [
    { id: 'details', label: 'Exam Details', icon: 'FileText' },
    { id: 'scheduling', label: 'Scheduling', icon: 'Calendar' },
    { id: 'questions', label: 'Questions', icon: 'List' },
    { id: 'security', label: 'Security', icon: 'Shield' },
    { id: 'advanced', label: 'Advanced', icon: 'Settings' },
    { id: 'preview', label: 'Preview', icon: 'Eye' }
  ];

  const validateStep = (step) => {
    const newErrors = {};

    if (step === 0) {
      if (!examData?.title) newErrors.title = 'Exam title is required';
      if (!examData?.course) newErrors.course = 'Course selection is required';
      if (!examData?.duration) newErrors.duration = 'Duration is required';
      if (!examData?.maxAttempts) newErrors.maxAttempts = 'Maximum attempts is required';
      if (!examData?.totalMarks) newErrors.totalMarks = 'Total marks is required';
      if (!examData?.passingMarks) newErrors.passingMarks = 'Passing marks is required';
      if (!examData?.difficulty) newErrors.difficulty = 'Difficulty level is required';
    }

    if (step === 1) {
      if (!examData?.startDate) newErrors.startDate = 'Start date is required';
      if (!examData?.startTime) newErrors.startTime = 'Start time is required';
      if (!examData?.endDate) newErrors.endDate = 'End date is required';
      if (!examData?.endTime) newErrors.endTime = 'End time is required';
      if (!examData?.timezone) newErrors.timezone = 'Timezone is required';
    }

    if (step === 2) {
      if (selectedQuestions?.length === 0) {
        newErrors.questions = 'Please select at least one question';
      }
    }

    if (step === 3) {
      if (!examData?.violationThreshold) newErrors.violationThreshold = 'Violation threshold is required';
      if (!examData?.violationAction) newErrors.violationAction = 'Violation action is required';
    }

    if (step === 4) {
      if (!examData?.gradingMethod) newErrors.gradingMethod = 'Grading method is required';
      if (!examData?.resultVisibility) newErrors.resultVisibility = 'Result visibility is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors)?.length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < steps?.length - 1) {
        setCurrentStep(currentStep + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleStepClick = (stepIndex) => {
    if (stepIndex <= currentStep) {
      setCurrentStep(stepIndex);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSaveDraft = () => {
    console.log('Saving draft...', examData, selectedQuestions);
    alert('Exam saved as draft successfully!');
  };

  const handleCreateExam = () => {
    if (validateStep(currentStep)) {
      console.log('Creating exam...', examData, selectedQuestions);
      alert('Exam created successfully!');
      navigate('/teacher-dashboard');
    }
  };

  const handleLogout = () => {
    const doLogout = async () => {
      try {
        await logout(false);
      } catch (e) {
        console.error('Logout failed', e);
      } finally {
        navigate('/login');
      }
    };

    doLogout();
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return <ExamDetailsForm formData={examData} onChange={setExamData} errors={errors} />;
      case 1:
        return <SchedulingConfiguration formData={examData} onChange={setExamData} errors={errors} />;
      case 2:
        return <QuestionBankPanel selectedQuestions={selectedQuestions} onQuestionsChange={setSelectedQuestions} />;
      case 3:
        return <SecuritySettings formData={examData} onChange={setExamData} errors={errors} />;
      case 4:
        return <AdvancedSettings formData={examData} onChange={setExamData} errors={errors} />;
      case 5:
        return <ExamPreview formData={examData} selectedQuestions={selectedQuestions} />;
      default:
        return null;
    }
  };

  const { getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const createExam = async (title) => {
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: auth0Audience,
        },
      });

      const exam = await apiRequest(
        `/exams?title=${encodeURIComponent(title)}`,
        "POST",
        null,
        token
      );

      console.log("Exam created:", exam);
      alert("Exam created successfully");
    } catch (err) {
      alert(err.message);
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <RoleBasedHeader userRole="teacher" onLogout={handleLogout} />
      <main className="pt-24 pb-12 px-4 md:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <button
              onClick={() => navigate('/teacher-dashboard')}
              className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-foreground transition-smooth mb-4"
            >
              <Icon name="ArrowLeft" size={16} />
              <span>Back to Dashboard</span>
            </button>
            <h1 className="text-3xl md:text-4xl font-heading font-semibold text-foreground mb-2">Create New Exam</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Configure your exam with comprehensive anti-cheating measures and automated grading
            </p>
          </div>

          <ProgressStepper currentStep={currentStep} steps={steps} onStepClick={handleStepClick} />

          <div className="mb-8">
            {renderStepContent()}
          </div>

          {errors?.questions && currentStep === 2 && (
            <div className="mb-6 bg-error/10 border border-error/30 rounded-lg p-4 flex items-start space-x-3">
              <Icon name="AlertCircle" size={20} className="text-error shrink-0 mt-0.5" />
              <p className="text-sm text-error">{errors?.questions}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card border border-border rounded-lg p-6 shadow-md">
            <div className="flex items-center space-x-3">
              <Button variant="outline" onClick={handleSaveDraft} iconName="Save" iconPosition="left">
                Save Draft
              </Button>
              {currentStep > 0 && (
                <Button variant="secondary" onClick={handlePrevious} iconName="ChevronLeft" iconPosition="left">
                  Previous
                </Button>
              )}
            </div>

            <div className="flex items-center space-x-3">
              {currentStep < steps?.length - 1 ? (
                <Button onClick={handleNext} iconName="ChevronRight" iconPosition="right">
                  Next Step
                </Button>
              ) : (
                <Button onClick={handleCreateExam} variant="success" iconName="Check" iconPosition="left">
                  Create Exam
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
      <SecurityBadgeDisplay variant="footer" />
    </div>
  );
};

export default ExamCreation;
