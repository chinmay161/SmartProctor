import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import QuestionPalette from './components/QuestionPalette';
import ExamTimer from './components/ExamTimer';
import SecurityMonitor from './components/SecurityMonitor';
import QuestionDisplay from './components/QuestionDisplay';
import SubmitConfirmationModal from './components/SubmitConfirmationModal';
import { authAwareCall } from '../../services/authAwareCall';

const fallbackExamData = {
  title: 'Mathematics Final Exam',
  course: 'Advanced Calculus - MATH 301',
  duration: 120,
  totalMarks: 100,
  questions: [
    {
      id: 1,
      type: 'multiple-choice',
      question: 'What is the derivative of f(x) = x^2 + 3x + 2?',
      options: [
        { id: 'a', text: '2x + 3' },
        { id: 'b', text: 'x + 3' },
        { id: 'c', text: '2x + 2' },
        { id: 'd', text: 'x^2 + 3' }
      ],
      marks: 2
    },
    {
      id: 2,
      type: 'true-false',
      question: 'The integral of 1/x is ln|x| + C. True or False?',
      marks: 1
    },
    {
      id: 3,
      type: 'fill-blank',
      question: 'The limit of (sin x)/x as x approaches 0 is _____.',
      marks: 2
    },
    {
      id: 4,
      type: 'essay',
      question: 'Explain the Fundamental Theorem of Calculus and provide an example of its application.',
      marks: 5
    },
    {
      id: 5,
      type: 'multiple-choice',
      question: 'Which of the following is NOT a method of integration?',
      options: [
        { id: 'a', text: 'Substitution' },
        { id: 'b', text: 'Integration by parts' },
        { id: 'c', text: 'Differentiation' },
        { id: 'd', text: 'Partial fractions' }
      ],
      marks: 2
    }
  ]
};

const normalizeQuestionType = (rawType) => {
  const type = String(rawType || '').trim().toLowerCase();
  if (type === 'mcq' || type === 'multiple-choice' || type === 'multiple_choice') return 'multiple-choice';
  if (type === 'true-false' || type === 'true_false' || type === 'boolean') return 'true-false';
  if (type === 'fill-blank' || type === 'fill_blank' || type === 'fill in the blank') return 'fill-blank';
  if (type === 'subjective' || type === 'long-answer') return 'essay';
  return type || 'essay';
};

const mapApiQuestionToPortal = (question, fallbackIndex) => {
  const normalizedType = normalizeQuestionType(question?.type);
  const rawOptions = Array.isArray(question?.options) ? question.options : [];
  const options = normalizedType === 'multiple-choice'
    ? rawOptions.map((option, idx) => ({
      id: String.fromCharCode(97 + idx),
      text: typeof option === 'string' ? option : option?.text || '',
    }))
    : undefined;

  return {
    id: question?.id || `q-${fallbackIndex + 1}`,
    type: normalizedType,
    question: question?.questionText || question?.text || `Question ${fallbackIndex + 1}`,
    options,
    marks: Number(question?.marks) > 0 ? Number(question.marks) : 1,
  };
};

const ExamPortal = () => {
  const navigate = useNavigate();
  const { isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [examDataState, setExamDataState] = useState(null);
  const [loadWarning, setLoadWarning] = useState('');
  const [examBlocked, setExamBlocked] = useState('');
  const [examId, setExamId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [attemptId, setAttemptId] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [answers, setAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState(new Set());
  const [showPalette, setShowPalette] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [violations, setViolations] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pendingSavesRef = useRef({});

  const sourceExam = examDataState || fallbackExamData;
  const currentQuestion = sourceExam?.questions?.[currentQuestionIndex];
  const totalQuestions = sourceExam?.questions?.length || 0;

  const callApi = (path, method = 'GET', body = null, fallbackPaths = []) =>
    authAwareCall({
      path,
      method,
      body,
      auth0Authenticated,
      getAccessTokenSilently,
      auth0Audience,
      fallbackPaths,
    });

  const flushPendingAnswers = async () => {
    if (!attemptId) return;
    const pendingEntries = Object.entries(pendingSavesRef.current);
    if (pendingEntries.length === 0) return;

    pendingSavesRef.current = {};
    await Promise.all(
      pendingEntries.map(async ([questionId, answer]) => {
        try {
          await callApi(`/attempts/${encodeURIComponent(attemptId)}/save-answer`, 'POST', {
            question_id: String(questionId),
            answer,
          });
        } catch {
          pendingSavesRef.current[questionId] = answer;
        }
      })
    );
  };

  useEffect(() => {
    let mounted = true;

    const fetchExam = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const examIdFromUrl = params.get('examId') || params.get('id');
        const sessionIdFromUrl = params.get('sessionId');
        setExamId(examIdFromUrl);
        setSessionId(sessionIdFromUrl);

        if (sessionIdFromUrl) {
          try {
            const session = await callApi(`/sessions/${sessionIdFromUrl}`, 'GET');
            if (mounted && session?.attempt_id) {
              setAttemptId(session.attempt_id);
            }
          } catch {
            if (mounted) {
              setLoadWarning('Session details are unavailable. Trying to resume from attempt data.');
            }
          }
        }

        if (examIdFromUrl) {
          const exam = await callApi(`/exams/${examIdFromUrl}`, 'GET');
          if (!mounted) return;

          const questionIds = Array.isArray(exam?.question_ids) ? exam.question_ids : [];
          let liveQuestions = [];
          if (questionIds.length > 0) {
            const responses = await Promise.all(
              questionIds.map(async (questionId) => {
                try {
                  return await callApi(`/api/questions/${encodeURIComponent(questionId)}`, 'GET');
                } catch {
                  return null;
                }
              })
            );
            liveQuestions = responses
              .filter(Boolean)
              .map((q, idx) => mapApiQuestionToPortal(q, idx));
          }

          const hasLiveQuestions = liveQuestions.length > 0;
          setExamDataState({
            ...fallbackExamData,
            ...exam,
            duration: exam?.duration_minutes || fallbackExamData.duration,
            questions: hasLiveQuestions ? liveQuestions : fallbackExamData.questions,
          });

          try {
            const resume = await callApi(`/attempts/${encodeURIComponent(examIdFromUrl)}/resume`, 'GET');
            if (!mounted) return;
            if (resume?.attempt_id) {
              setAttemptId(resume.attempt_id);
            }
            if (Number.isFinite(resume?.duration_remaining_seconds)) {
              setRemainingSeconds(Math.max(0, Math.floor(resume.duration_remaining_seconds)));
            }

            const restoredAnswers = {};
            if (Array.isArray(resume?.saved_answers)) {
              resume.saved_answers.forEach((saved) => {
                if (saved?.question_id) {
                  restoredAnswers[String(saved.question_id)] = saved.answer;
                }
              });
            }
            setAnswers(restoredAnswers);
          } catch (error) {
            if (!mounted) return;
            const status = error?.status || error?.status_code || error?.response?.status;
            const detail = error?.detail || error?.message || '';
            const lower = String(detail).toLowerCase();
            if (status === 403 || status === 404 || lower.includes('not found') || lower.includes('not resumable') || lower.includes('expired')) {
              setExamBlocked('This exam attempt cannot be resumed. Return to dashboard and start from the assigned entry flow.');
              return;
            }
            setLoadWarning('Could not load attempt progress. You may continue, but previous progress may be unavailable.');
          }

          if (questionIds.length === 0) {
            setLoadWarning('No questions are attached to this exam yet. Showing sample questions.');
          } else if (!hasLiveQuestions) {
            setLoadWarning('Could not load question details. Showing sample questions with exam metadata.');
          } else if (liveQuestions.length < questionIds.length) {
            setLoadWarning('Some question details could not be loaded. Loaded available live questions.');
          } else {
            setLoadWarning('');
          }
          return;
        }

        if (mounted) {
          setExamDataState(null);
          setLoadWarning('Exam ID was not provided. Showing fallback exam.');
        }
      } catch {
        if (mounted) {
          setExamDataState(null);
          setLoadWarning('Could not load exam data from backend. Showing fallback exam.');
        }
      }
    };

    fetchExam();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      void flushPendingAnswers();
    }, 5000);

    return () => {
      clearInterval(autoSaveInterval);
      void flushPendingAnswers();
    };
  }, [attemptId]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) {
        addViolation('Exited fullscreen mode');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const preventContextMenu = (e) => {
      e?.preventDefault();
      addViolation('Attempted right-click');
    };

    const preventCopy = (e) => {
      e?.preventDefault();
      addViolation('Attempted copy');
    };

    document.addEventListener('contextmenu', preventContextMenu);
    document.addEventListener('copy', preventCopy);
    document.addEventListener('cut', preventCopy);

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('copy', preventCopy);
      document.removeEventListener('cut', preventCopy);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        addViolation('Tab switched or window minimized');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const addViolation = (message) => {
    const newViolation = {
      id: Date.now(),
      message,
      timestamp: new Date()
    };
    setViolations((prev) => [...prev, newViolation]);

    if (sessionId) {
      const lower = String(message || '').toLowerCase();
      const severity = lower.includes('fullscreen') ? 'major' : (lower.includes('tab') ? 'major' : 'minor');
      void callApi(
        `/sessions/session/${encodeURIComponent(sessionId)}/violation?severity=${encodeURIComponent(severity)}&count=1`,
        'POST'
      ).catch(() => {});
    }
  };

  const handleAnswerChange = (questionId, answer) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: answer
    }));
    if (questionId) {
      pendingSavesRef.current[String(questionId)] = answer;
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const handleMarkForReview = () => {
    setMarkedForReview((prev) => {
      const newSet = new Set(prev);
      if (newSet?.has(currentQuestion?.id)) {
        newSet?.delete(currentQuestion?.id);
      } else {
        newSet?.add(currentQuestion?.id);
      }
      return newSet;
    });
  };

  const handleQuestionSelect = (index) => {
    setCurrentQuestionIndex(index);
    setShowPalette(false);
  };

  const handleSubmit = () => {
    setSubmitError('');
    setShowSubmitModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      await flushPendingAnswers();
      if (sessionId) {
        await callApi(`/sessions/session/${encodeURIComponent(sessionId)}/end`, 'POST');
      } else if (attemptId) {
        await callApi(`/attempts/${encodeURIComponent(attemptId)}/submit`, 'POST');
      } else {
        throw new Error('Attempt details are missing. Please return to dashboard and restart the exam.');
      }
      setShowSubmitModal(false);
      navigate('/student-dashboard');
    } catch (error) {
      setSubmitError(error?.detail || error?.message || 'Failed to submit exam. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const enterFullscreen = () => {
    document.documentElement?.requestFullscreen?.();
  };

  const answeredCount = Object.keys(answers)?.length;
  const reviewCount = markedForReview?.size;
  const unansweredCount = totalQuestions - answeredCount;
  const durationMinutesForTimer = examId
    ? (examDataState?.duration_minutes ?? examDataState?.duration ?? 0)
    : (sourceExam?.duration_minutes ?? sourceExam?.duration);

  if (examBlocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-card border border-border rounded-lg p-6 shadow-md">
          <h1 className="text-lg font-semibold text-foreground mb-2">Unable to Resume Exam</h1>
          <p className="text-sm text-muted-foreground mb-4">{examBlocked}</p>
          <Button onClick={() => navigate('/student-dashboard')} className="w-full">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-card border-b border-border px-4 py-3 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Icon name="FileText" size={24} className="text-primary" />
            <div>
              <h1 className="text-base md:text-lg font-heading font-semibold text-foreground">{sourceExam?.title}</h1>
              <p className="text-xs text-muted-foreground">{sourceExam?.course}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <ExamTimer
              initialSeconds={remainingSeconds}
              durationMinutes={durationMinutesForTimer}
              onTimeUp={handleSubmit}
            />
            {!isFullscreen && (
              <Button
                variant="outline"
                size="sm"
                iconName="Maximize"
                onClick={enterFullscreen}
                className="hidden md:flex"
              >
                Fullscreen
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              iconName="List"
              onClick={() => setShowPalette(!showPalette)}
              className="md:hidden"
            >
              Questions
            </Button>
          </div>
        </div>
      </div>

      {loadWarning && (
        <div className="bg-warning/15 border-b border-warning/30 px-4 py-2 text-xs text-warning">
          {loadWarning}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  Question {Math.min(currentQuestionIndex + 1, totalQuestions)} of {totalQuestions}
                </span>
                <span className="text-sm text-muted-foreground">
                  {currentQuestion?.marks} {currentQuestion?.marks === 1 ? 'mark' : 'marks'}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${totalQuestions ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0}%` }}
                />
              </div>
            </div>

            <QuestionDisplay
              question={currentQuestion}
              answer={answers?.[currentQuestion?.id]}
              onAnswerChange={(answer) => handleAnswerChange(currentQuestion?.id, answer)}
            />

            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  iconName="ChevronLeft"
                  onClick={handlePrevious}
                  disabled={currentQuestionIndex === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  iconName="Flag"
                  onClick={handleMarkForReview}
                  className={markedForReview?.has(currentQuestion?.id) ? 'bg-warning/20' : ''}
                >
                  {markedForReview?.has(currentQuestion?.id) ? 'Unmark' : 'Mark for Review'}
                </Button>
              </div>
              <div className="flex gap-2">
                {currentQuestionIndex < totalQuestions - 1 ? (
                  <Button
                    variant="default"
                    iconName="ChevronRight"
                    iconPosition="right"
                    onClick={handleNext}
                    fullWidth
                    className="sm:w-auto"
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    variant="success"
                    iconName="CheckCircle"
                    onClick={handleSubmit}
                    fullWidth
                    className="sm:w-auto"
                  >
                    Submit Exam
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <strong>Keyboard Shortcuts:</strong> Arrow Left (Previous) | Arrow Right (Next) | M (Mark for Review)
              </p>
            </div>
          </div>
        </div>

        <div className="hidden lg:block w-80 border-l border-border bg-card overflow-y-auto">
          <QuestionPalette
            questions={sourceExam?.questions}
            currentIndex={currentQuestionIndex}
            answers={answers}
            markedForReview={markedForReview}
            onQuestionSelect={handleQuestionSelect}
            answeredCount={answeredCount}
            reviewCount={reviewCount}
            unansweredCount={unansweredCount}
          />
          <SecurityMonitor violations={violations} />
        </div>
      </div>

      {showPalette && (
        <div className="fixed inset-0 bg-black/50 z-50 lg:hidden" onClick={() => setShowPalette(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-card shadow-xl overflow-y-auto" onClick={(e) => e?.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Questions</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowPalette(false)}>
                <Icon name="X" size={20} />
              </Button>
            </div>
            <QuestionPalette
              questions={sourceExam?.questions}
              currentIndex={currentQuestionIndex}
              answers={answers}
              markedForReview={markedForReview}
              onQuestionSelect={handleQuestionSelect}
              answeredCount={answeredCount}
              reviewCount={reviewCount}
              unansweredCount={unansweredCount}
            />
            <SecurityMonitor violations={violations} />
          </div>
        </div>
      )}

      {showSubmitModal && (
        <SubmitConfirmationModal
          answeredCount={answeredCount}
          unansweredCount={unansweredCount}
          reviewCount={reviewCount}
          totalQuestions={totalQuestions}
          submitting={isSubmitting}
          submitError={submitError}
          onConfirm={handleConfirmSubmit}
          onCancel={() => setShowSubmitModal(false)}
        />
      )}
    </div>
  );
};

export default ExamPortal;
