import { apiRequest } from '../../services/api';
import { useAuth0 } from '@auth0/auth0-react';

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

const supportedTimezones = new Set([
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Kolkata',
  'Asia/Tokyo',
]);

const getDefaultExamTimezone = () => {
  try {
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (supportedTimezones.has(browserTimezone)) {
      return browserTimezone;
    }
  } catch {
    // Fall back to the existing default if browser timezone detection is unavailable.
  }
  return 'America/New_York';
};

const defaultExamData = {
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
  timezone: getDefaultExamTimezone(),
  allowLateSubmission: false,
  gracePeriod: '',
  latePenalty: '',
  publishImmediately: false,
  sendReminders: true,
  enableWebcam: true,
  enableScreenRecording: true,
  browserLockdown: true,
  detectTabSwitch: true,
  enableProctoredWatermark: false,
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
};

const getDatePartsInTimeZone = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const valueOf = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: valueOf('year'),
    month: valueOf('month'),
    day: valueOf('day'),
    hour: valueOf('hour'),
    minute: valueOf('minute'),
    second: valueOf('second'),
  };
};

const formatDateForInputInTimeZone = (isoString, timeZone) => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const parts = getDatePartsInTimeZone(date, timeZone);
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
};

const formatTimeForInputInTimeZone = (isoString, timeZone) => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const parts = getDatePartsInTimeZone(date, timeZone);
  return `${parts.hour.toString().padStart(2, '0')}:${parts.minute.toString().padStart(2, '0')}`;
};

const zonedLocalDateTimeToUtcIso = (dateString, timeString, timeZone) => {
  const [year, month, day] = String(dateString || '').split('-').map(Number);
  const [hour, minute] = String(timeString || '').split(':').map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  const targetWallTimeUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = targetWallTimeUtc;

  // Iteratively solve timezone offset for the requested wall-clock time.
  for (let i = 0; i < 4; i += 1) {
    const parts = getDatePartsInTimeZone(new Date(guess), timeZone);
    const wallTimeFromGuessUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const diff = targetWallTimeUtc - wallTimeFromGuessUtc;
    guess += diff;
    if (diff === 0) break;
  }

  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
};

const getMinimumEndByDuration = ({ startDate, startTime, duration, timezone }) => {
  const durationMinutes = Number(duration);
  if (!startDate || !startTime || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  try {
    const startIso = zonedLocalDateTimeToUtcIso(startDate, startTime, timezone || defaultExamData.timezone);
    if (!startIso) return null;

    const minimumEnd = new Date(startIso);
    minimumEnd.setUTCMinutes(minimumEnd.getUTCMinutes() + durationMinutes);

    return {
      endDate: formatDateForInputInTimeZone(minimumEnd.toISOString(), timezone || defaultExamData.timezone),
      endTime: formatTimeForInputInTimeZone(minimumEnd.toISOString(), timezone || defaultExamData.timezone),
      endIso: minimumEnd.toISOString(),
    };
  } catch {
    return null;
  }
};

const isScheduleBefore = (leftDate, leftTime, rightDate, rightTime) => {
  if (!leftDate || !leftTime || !rightDate || !rightTime) return false;
  return `${leftDate}T${leftTime}` < `${rightDate}T${rightTime}`;
};

const getScheduleRangeError = ({ startDate, startTime, endDate, endTime, timezone, duration }) => {
  if (!startDate || !startTime || !endDate || !endTime) return null;

  const minimumEnd = getMinimumEndByDuration({ startDate, startTime, duration, timezone });
  if (minimumEnd && isScheduleBefore(endDate, endTime, minimumEnd.endDate, minimumEnd.endTime)) {
    const durationMinutes = Number(duration);
    return `End time must be at least ${durationMinutes} minutes after start time`;
  }

  return null;
};

const normalizeScheduleFromDuration = (nextData, previousData) => {
  const minimumEnd = getMinimumEndByDuration(nextData);
  if (!minimumEnd) return nextData;

  const startChanged =
    previousData?.startDate !== nextData.startDate ||
    previousData?.startTime !== nextData.startTime ||
    previousData?.duration !== nextData.duration ||
    previousData?.timezone !== nextData.timezone;

  const endMissing = !nextData.endDate || !nextData.endTime;
  const endTooEarly = isScheduleBefore(nextData.endDate, nextData.endTime, minimumEnd.endDate, minimumEnd.endTime);

  if (startChanged || endMissing || endTooEarly) {
    return {
      ...nextData,
      endDate: minimumEnd.endDate,
      endTime: minimumEnd.endTime,
    };
  }

  return nextData;
};

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const ExamCreation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editExamId = searchParams.get('edit');
  const templateExamId = searchParams.get('template');
  const [currentExamId, setCurrentExamId] = useState(editExamId);
  const [isTemplateMode, setIsTemplateMode] = useState(false);

  const [currentStep, setCurrentStep] = useState(0);
  const { logout } = useLogout();
  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingExam, setIsLoadingExam] = useState(Boolean(editExamId));

  const [examData, setExamData] = useState(defaultExamData);
  const minimumEnd = getMinimumEndByDuration(examData);

  const handleExamDataChange = (nextData) => {
    setExamData((previousData) => normalizeScheduleFromDuration(nextData, previousData));
  };

  useEffect(() => {
    setCurrentExamId(editExamId);
  }, [editExamId]);

  const steps = [
    { id: 'details', label: 'Exam Details', icon: 'FileText' },
    { id: 'scheduling', label: 'Scheduling', icon: 'Calendar' },
    { id: 'questions', label: 'Questions', icon: 'List' },
    { id: 'security', label: 'Security', icon: 'Shield' },
    { id: 'advanced', label: 'Advanced', icon: 'Settings' },
    { id: 'preview', label: 'Preview', icon: 'Eye' }
  ];

  const { getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const getToken = async () => {
    return getAccessTokenSilently({
      authorizationParams: {
        audience: auth0Audience,
      },
    });
  };

  useEffect(() => {
    let mounted = true;

    const loadExamForEdit = async () => {
      const sourceExamId = currentExamId || templateExamId;
      if (!sourceExamId) return;

      try {
        setIsLoadingExam(true);
        const token = await getToken();
        const exam = await apiRequest(`/exams/${sourceExamId}`, 'GET', null, token);

        if (!mounted) return;

        const wizardConfig = exam?.wizard_config || {};
        const merged = {
          ...defaultExamData,
          ...wizardConfig,
          title: exam?.title || wizardConfig?.title || '',
          duration: exam?.duration_minutes ? String(exam.duration_minutes) : (wizardConfig?.duration || ''),
          instructions: exam?.description || wizardConfig?.instructions || '',
        };
        const scheduleTimezone = merged?.timezone || defaultExamData.timezone;

        // Populate scheduling fields from existing exam datetimes
        if (exam?.start_time) {
          merged.startDate = formatDateForInputInTimeZone(exam.start_time, scheduleTimezone);
          merged.startTime = formatTimeForInputInTimeZone(exam.start_time, scheduleTimezone);
        }
        if (exam?.end_time) {
          merged.endDate = formatDateForInputInTimeZone(exam.end_time, scheduleTimezone);
          merged.endTime = formatTimeForInputInTimeZone(exam.end_time, scheduleTimezone);
        }

        setExamData(merged);
        setSelectedQuestions(Array.isArray(exam?.question_ids) ? exam.question_ids : []);
        setIsTemplateMode(Boolean(exam?.is_template));
      } catch (err) {
        if (!mounted) return;
        setBanner({ type: 'error', text: err?.detail || err?.message || 'Failed to load exam for editing' });
      } finally {
        if (mounted) setIsLoadingExam(false);
      }
    };

    loadExamForEdit();
    return () => { mounted = false; };
  }, [currentExamId, templateExamId]);

  const validateStep = (step) => {
    const newErrors = getValidationErrorsForStep(step);
    setErrors(newErrors);
    return Object.keys(newErrors)?.length === 0;
  };

  const getValidationErrorsForStep = (step) => {
    const nextErrors = {};

    if (step === 0) {
      if (!examData?.title) nextErrors.title = 'Exam title is required';
      if (!examData?.course) nextErrors.course = 'Course selection is required';
      if (!examData?.duration) nextErrors.duration = 'Duration is required';
      if (!examData?.maxAttempts) nextErrors.maxAttempts = 'Maximum attempts is required';
      if (!examData?.totalMarks) nextErrors.totalMarks = 'Total marks is required';
      if (!examData?.passingMarks) nextErrors.passingMarks = 'Passing marks is required';
      if (!examData?.difficulty) nextErrors.difficulty = 'Difficulty level is required';
    }

    if (step === 1) {
      if (!examData?.startDate) nextErrors.startDate = 'Start date is required';
      if (!examData?.startTime) nextErrors.startTime = 'Start time is required';
      if (!examData?.endDate) nextErrors.endDate = 'End date is required';
      if (!examData?.endTime) nextErrors.endTime = 'End time is required';
      if (!examData?.timezone) nextErrors.timezone = 'Timezone is required';

      const scheduleError = getScheduleRangeError(examData);
      if (scheduleError) {
        nextErrors.endTime = scheduleError;
      }
    }

    if (step === 2) {
      if (selectedQuestions?.length === 0) {
        nextErrors.questions = 'Please select at least one question';
      }
    }

    if (step === 3) {
      if (!examData?.violationThreshold) nextErrors.violationThreshold = 'Violation threshold is required';
      if (!examData?.violationAction) nextErrors.violationAction = 'Violation action is required';
    }

    if (step === 4) {
      if (!examData?.gradingMethod) nextErrors.gradingMethod = 'Grading method is required';
      if (!examData?.resultVisibility) nextErrors.resultVisibility = 'Result visibility is required';
    }

    return nextErrors;
  };

  const validateAllSteps = () => {
    const combinedErrors = {};
    let firstInvalidStep = null;

    for (let step = 0; step < steps.length - 1; step += 1) {
      const stepErrors = getValidationErrorsForStep(step);
      if (Object.keys(stepErrors).length > 0 && firstInvalidStep === null) {
        firstInvalidStep = step;
      }
      Object.assign(combinedErrors, stepErrors);
    }

    setErrors(combinedErrors);
    return {
      isValid: firstInvalidStep === null,
      firstInvalidStep,
    };
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < steps?.length - 1) {
        setCurrentStep(currentStep + 1);
        scrollToTop();
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      scrollToTop();
    }
  };

  const handleStepClick = (stepIndex) => {
    if (stepIndex <= currentStep) {
      setCurrentStep(stepIndex);
      scrollToTop();
    }
  };

  const buildPayload = () => {
    const isDraft = !examData.startDate || !examData.startTime || !examData.endDate || !examData.endTime;
    const duration = Number(examData.duration);
    const payload = {
      title: examData.title.trim(),
      description: examData.instructions?.trim() || null,
      duration_minutes: Number.isFinite(duration) && duration > 0 ? duration : null,
      question_ids: selectedQuestions,
      is_draft: isDraft,
      wizard_config: {
        ...examData,
      },
    };

    // If scheduling fields are provided, include top-level start_time/end_time
    if (examData.startDate && examData.startTime && examData.endDate && examData.endTime) {
      try {
        const timezone = examData.timezone || defaultExamData.timezone;
        const startIso = zonedLocalDateTimeToUtcIso(examData.startDate, examData.startTime, timezone);
        const endIso = zonedLocalDateTimeToUtcIso(examData.endDate, examData.endTime, timezone);
        if (startIso && endIso) {
          payload.start_time = startIso;
          payload.end_time = endIso;
        }
      } catch {
        // ignore invalid dates; backend will validate
      }
    }

    return payload;
  };

  const saveExam = async ({ navigateAfterSave = false, isDraftOverride = null, isTemplateOverride = null } = {}) => {
    setBanner(null);
    setIsSubmitting(true);

    try {
      const token = await getToken();
      const payload = buildPayload();
      if (typeof isDraftOverride === 'boolean') {
        payload.is_draft = isDraftOverride;
      }
      if (typeof isTemplateOverride === 'boolean') {
        payload.is_template = isTemplateOverride;
      }

      const shouldUpdateExisting = Boolean(currentExamId) && !(isTemplateMode && payload.is_template !== true);

      if (shouldUpdateExisting) {
        await apiRequest(`/exams/${currentExamId}`, 'PUT', payload, token);
      } else {
        const createdExam = await apiRequest('/exams/', 'POST', payload, token);
        if (createdExam?.id) {
          setCurrentExamId(createdExam.id);
          navigate(`/exam-creation?edit=${encodeURIComponent(createdExam.id)}`, { replace: true });
        }
      }

      if (navigateAfterSave) {
        navigate('/teacher-dashboard');
        return;
      }

      setBanner({ type: 'success', text: currentExamId ? 'Exam updated successfully' : 'Exam draft saved successfully' });
    } catch (err) {
      setBanner({ type: 'error', text: err?.detail || err?.message || 'Failed to save exam' });
      scrollToTop();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!validateStep(0)) {
      setCurrentStep(0);
      return;
    }
    await saveExam({ navigateAfterSave: false, isDraftOverride: true, isTemplateOverride: false });
  };

  const handleCreateExam = async () => {
    const { isValid, firstInvalidStep } = validateAllSteps();
    if (!isValid) {
      if (firstInvalidStep !== null) {
        setCurrentStep(firstInvalidStep);
      }
      setBanner({ type: 'error', text: 'Please complete the required fields before creating the exam.' });
      scrollToTop();
      return;
    }
    await saveExam({ navigateAfterSave: true, isDraftOverride: false, isTemplateOverride: false });
  };

  const handleSaveTemplate = async () => {
    if (!validateStep(0)) {
      setCurrentStep(0);
      return;
    }
    await saveExam({ navigateAfterSave: true, isDraftOverride: true, isTemplateOverride: true });
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
        return <ExamDetailsForm formData={examData} onChange={handleExamDataChange} errors={errors} />;
      case 1:
        return (
          <SchedulingConfiguration
            formData={examData}
            onChange={handleExamDataChange}
            errors={errors}
            minEndDate={minimumEnd?.endDate}
            minEndTime={minimumEnd?.endTime}
          />
        );
      case 2:
        return (
          <QuestionBankPanel
            selectedQuestions={selectedQuestions}
            onQuestionsChange={setSelectedQuestions}
            targetTotalMarks={examData?.totalMarks}
          />
        );
      case 3:
        return <SecuritySettings formData={examData} onChange={handleExamDataChange} errors={errors} />;
      case 4:
        return <AdvancedSettings formData={examData} onChange={handleExamDataChange} errors={errors} />;
      case 5:
        return <ExamPreview formData={examData} selectedQuestions={selectedQuestions} />;
      default:
        return null;
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
            <h1 className="text-3xl md:text-4xl font-heading font-semibold text-foreground mb-2">
              {editExamId ? (isTemplateMode ? 'Edit Template' : 'Edit Exam') : templateExamId ? 'Create Exam From Template' : 'Create New Exam'}
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Configure your exam with comprehensive anti-cheating measures and automated grading
            </p>
          </div>

          {banner && (
            <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${banner.type === 'error' ? 'bg-error/10 border border-error/30 text-error' : 'bg-success/10 border border-success/30 text-success'}`}>
              {banner.text}
            </div>
          )}

          {isLoadingExam ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">Loading exam...</div>
          ) : (
            <>
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
                  <Button variant="secondary" onClick={handleSaveTemplate} iconName="Copy" iconPosition="left" loading={isSubmitting}>
                    {currentExamId && isTemplateMode ? 'Update Template' : 'Save as Template'}
                  </Button>
                  <Button variant="outline" onClick={handleSaveDraft} iconName="Save" iconPosition="left" loading={isSubmitting}>
                    Save Draft
                  </Button>
                  {currentStep > 0 && (
                    <Button variant="secondary" onClick={handlePrevious} iconName="ChevronLeft" iconPosition="left" disabled={isSubmitting}>
                      Previous
                    </Button>
                  )}
                </div>

                <div className="flex items-center space-x-3">
                  {currentStep < steps?.length - 1 ? (
                    <Button onClick={handleNext} iconName="ChevronRight" iconPosition="right" disabled={isSubmitting}>
                      Next Step
                    </Button>
                  ) : (
                    <Button onClick={handleCreateExam} variant="success" iconName="Check" iconPosition="left" loading={isSubmitting}>
                      {currentExamId && !isTemplateMode ? 'Update Exam' : 'Create Exam'}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
      <SecurityBadgeDisplay variant="footer" />
    </div>
  );
};

export default ExamCreation;
