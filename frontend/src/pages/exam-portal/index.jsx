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
import ProctoredWatermarkOverlay from './components/ProctoredWatermarkOverlay';
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

const hashString = (value) => {
  let hash = 0;
  const input = String(value || '');
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const seededShuffle = (items, seedValue) => {
  const result = [...items];
  let seed = hashString(seedValue) || 1;
  for (let i = result.length - 1; i > 0; i -= 1) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const j = seed % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const applyQuestionSecurity = (questions, config, seedBase) => {
  if (!Array.isArray(questions)) return [];

  const withOptionRules = questions.map((question, questionIndex) => {
    if (question?.type !== 'multiple-choice' || !Array.isArray(question?.options)) return question;
    const options = config?.randomizeAnswers
      ? seededShuffle(question.options, `${seedBase}-${question.id || questionIndex}-answers`)
      : [...question.options];
    return {
      ...question,
      options: options.map((option, optionIndex) => ({
        ...option,
        label: String.fromCharCode(97 + optionIndex),
      })),
    };
  });

  return config?.randomizeQuestions
    ? seededShuffle(withOptionRules, `${seedBase}-questions`)
    : withOptionRules;
};

const mapApiQuestionToPortal = (question, fallbackIndex) => {
  const normalizedType = normalizeQuestionType(question?.type);
  const rawOptions = Array.isArray(question?.options) ? question.options : [];
  const options = normalizedType === 'multiple-choice'
    ? rawOptions.map((option, idx) => ({
      id: `option-${idx + 1}`,
      label: String.fromCharCode(97 + idx),
      value: typeof option === 'string' ? option : option?.text || '',
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
  const {
    isAuthenticated: auth0Authenticated,
    getAccessTokenSilently,
    user: auth0User,
  } = useAuth0();
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
  const [proctorWarning, setProctorWarning] = useState('');
  const pendingSavesRef = useRef({});
  const pendingViolationsRef = useRef([]);
  const violationRetryTimeoutRef = useRef(null);
  const wsRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const securityMonitorRef = useRef(null);
  const examEndedRef = useRef(false);
  const examStatusRef = useRef('active');
  const warningTimeoutRef = useRef(null);
  const hasEnteredFullscreenRef = useRef(false);
  const [examRules, setExamRules] = useState(null);


  const sourceExam = examDataState || fallbackExamData;
  const securityConfig = examRules || sourceExam?.wizard_config || {};
  const currentQuestion = sourceExam?.questions?.[currentQuestionIndex];
  const totalQuestions = sourceExam?.questions?.length || 0;
  const watermarkEnabled = Boolean(
    securityConfig?.enableProctoredWatermark
  );
  const browserLockdownEnabled = Boolean(securityConfig?.browserLockdown);
  const detectTabSwitchEnabled = Boolean(securityConfig?.detectTabSwitch);
  const disableRightClickEnabled = Boolean(securityConfig?.disableRightClick);
  const disableCopyPasteEnabled = Boolean(securityConfig?.disableCopyPaste);
  const violationThreshold = Math.max(1, Number(securityConfig?.violationThreshold) || 6);
  const violationAction = String(securityConfig?.violationAction || 'warn').toLowerCase();
  const watermarkUserLabel =
    auth0User?.email ||
    auth0User?.name ||
    auth0User?.nickname ||
    'Student';

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

  const requestSnapshot = async (activeSessionId, payload) => {
    if (!activeSessionId) return null;
    return callApi(
      `/ai/sessions/${encodeURIComponent(activeSessionId)}/snapshot`,
      'POST',
      payload
    );
  };

  const persistViolation = async (violationPayload) => {
    if (!sessionId || !violationPayload) {
      pendingViolationsRef.current.push(violationPayload);
      return false;
    }

    try {
      await callApi(
        `/sessions/session/${encodeURIComponent(sessionId)}/violation`,
        'POST',
        violationPayload
      );
      return true;
    } catch (error) {
      pendingViolationsRef.current.push(violationPayload);
      if (!violationRetryTimeoutRef.current) {
        violationRetryTimeoutRef.current = setTimeout(async () => {
          violationRetryTimeoutRef.current = null;
          const queued = [...pendingViolationsRef.current];
          pendingViolationsRef.current = [];
          for (const item of queued) {
            await persistViolation(item);
          }
        }, 3000);
      }
      console.error('Failed to persist violation event', error);
      setProctorWarning('Proctoring event sync is retrying. Keep the exam tab open.');
      return false;
    }
  };

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
          const rawExamData = {
            ...fallbackExamData,
            ...exam,
            duration: exam?.duration_minutes || fallbackExamData.duration,
            questions: hasLiveQuestions ? liveQuestions : fallbackExamData.questions,
          };
          if (exam?.wizard_config) {
            try {
              const cfg = typeof exam.wizard_config === 'string' ? JSON.parse(exam.wizard_config) : exam.wizard_config;
              setExamRules(cfg);
              rawExamData.questions = applyQuestionSecurity(
                rawExamData.questions,
                cfg,
                attemptId || sessionIdFromUrl || examIdFromUrl
              );
            } catch(e) {}
          }
          setExamDataState(rawExamData);

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
      if (violationRetryTimeoutRef.current) {
        clearTimeout(violationRetryTimeoutRef.current);
        violationRetryTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!sessionId || pendingViolationsRef.current.length === 0) return;

    const queued = [...pendingViolationsRef.current];
    pendingViolationsRef.current = [];
    void (async () => {
      for (const item of queued) {
        await persistViolation(item);
      }
    })();
  }, [sessionId]);

  const handleConfirmSubmitRef = useRef();

  useEffect(() => {
    if (!sessionId || !auth0Authenticated) return;

    let mounted = true;
    let reconnectTimeout = null;
    const lastTimestamps = new Map();

    const connectWs = async () => {
      try {
        const token = await getAccessTokenSilently({ authorizationParams: { audience: auth0Audience } });
        if (!mounted) return;

        let wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsHost = window.location.host;
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          wsHost = 'localhost:8000';
        } else if (import.meta.env.VITE_API_URL) {
          try {
            const url = new URL(import.meta.env.VITE_API_URL);
            wsHost = url.host;
          } catch (e) {}
        }

        const wsUrl = `${wsProtocol}//${wsHost}/ws/student/${sessionId}?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (ws.readyState === WebSocket.OPEN) {
             ws.send(JSON.stringify({ type: 'SYNC_REQUEST' }));
          }
          if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

          heartbeatIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'HEARTBEAT', timestamp: Date.now() }));
            }
          }, 5000);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.timestamp) {
                const lastTs = lastTimestamps.get('cmd') || 0;
                if (data.timestamp < lastTs) return;
                lastTimestamps.set('cmd', data.timestamp);
            }

            if (data.type === 'WARN_STUDENT') {
              if (examEndedRef.current) return;
              if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
              setProctorWarning(data.message || 'Warning from Proctor: Stay focused');
              warningTimeoutRef.current = setTimeout(() => setProctorWarning(''), 10000);
            } else if (data.type === 'END_EXAM' || data.type === 'FORCE_SUBMIT') {
              if (examEndedRef.current) return;
              examEndedRef.current = true;
              examStatusRef.current = 'ending';
              setProctorWarning('Exam terminated by proctor.');
              if (handleConfirmSubmitRef.current) handleConfirmSubmitRef.current();
            }
          } catch(e) {}
        };

        ws.onclose = (event) => {
          if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
          if (mounted) {
            if (event?.code === 4401 || event?.code === 4403 || event?.code === 4404) {
              console.warn('Student WS closed with authorization/session error.', event.code, event.reason);
              setProctorWarning('Live proctoring connection could not be established for this exam session.');
              return;
            }
            console.warn('Student WS disconnected. Reconnecting in 3s...');
            reconnectTimeout = setTimeout(connectWs, 3000);
          }
        };
      } catch (e) {
        console.error('WS Connection failed', e);
        if (mounted) {
          reconnectTimeout = setTimeout(connectWs, 5000);
        }
      }
    };

    connectWs();

    return () => {
      mounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [sessionId, auth0Authenticated, getAccessTokenSilently, auth0Audience]);



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
    setIsFullscreen(!!document.fullscreenElement);

    const handleFullscreenChange = () => {
      const fullscreenActive = !!document.fullscreenElement;
      setIsFullscreen(fullscreenActive);
      if (fullscreenActive) {
        hasEnteredFullscreenRef.current = true;
      }
      if (
        browserLockdownEnabled &&
        hasEnteredFullscreenRef.current &&
        !fullscreenActive &&
        examStatusRef.current !== 'ending'
      ) {
        addViolation('Exited fullscreen mode', 'FULLSCREEN_EXIT');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [browserLockdownEnabled]);

  useEffect(() => {
    const preventContextMenu = (e) => {
      if (!disableRightClickEnabled) return;
      e?.preventDefault();
      addViolation('Attempted right-click', 'RIGHT_CLICK');
    };

    const preventCopy = (e) => {
      if (!disableCopyPasteEnabled) return;
      e?.preventDefault();
      addViolation('Attempted copy', 'COPY_PASTE');
    };

    const handleKeyDown = (e) => {
      if (!browserLockdownEnabled) return;
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j')) ||
        (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
      ) {
        e.preventDefault();
        addViolation('Attempted to access Developer Tools', 'DEVTOOLS_ACCESS');
      }
    };

    const handleBlur = () => {
      if (detectTabSwitchEnabled && examStatusRef.current !== 'ending') {
        addViolation('Window lost focus (possible tab switch)', 'WINDOW_BLUR');
      }
    };

    let resizeTimer;
    const handleResize = () => {
      if (!browserLockdownEnabled) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (
          hasEnteredFullscreenRef.current &&
          !document.fullscreenElement &&
          examStatusRef.current !== 'ending'
        ) {
          addViolation('Window resized abnormally', 'WINDOW_RESIZE');
        }
      }, 500);
    };

    document.addEventListener('contextmenu', preventContextMenu);
    document.addEventListener('copy', preventCopy);
    document.addEventListener('cut', preventCopy);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('copy', preventCopy);
      document.removeEventListener('cut', preventCopy);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('resize', handleResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [browserLockdownEnabled, detectTabSwitchEnabled, disableCopyPasteEnabled, disableRightClickEnabled]);

  useEffect(() => {
    if (!browserLockdownEnabled || isFullscreen) return;

    const handlePointerDown = () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      void enterFullscreen();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [browserLockdownEnabled, isFullscreen]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (detectTabSwitchEnabled && document.hidden && examStatusRef.current !== 'ending') {
        addViolation('Tab switched or window minimized', 'TAB_SWITCH');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [detectTabSwitchEnabled]);

  const addViolation = (message, type = null, confidence = null) => {
    if (examEndedRef.current) return;
    const event_id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    const newViolation = {
      id: event_id,
      message,
      timestamp: new Date()
    };
    
    // Attempt to capture evidence snapshot
    let snapshotImage = null;
    if (securityMonitorRef.current?.captureImage) {
       snapshotImage = securityMonitorRef.current.captureImage();
    }

    setViolations((prev) => {
      const updated = [...prev, newViolation];
      if (updated.length >= violationThreshold && examStatusRef.current !== 'ending') {
        if (violationAction === 'terminate') {
          examStatusRef.current = 'ending';
          examEndedRef.current = true;
          setProctorWarning(`Exam auto-submitted after reaching ${violationThreshold} violations.`);
          if (handleConfirmSubmitRef.current) handleConfirmSubmitRef.current();
        } else if (updated.length === violationThreshold) {
          const warningText = violationAction === 'flag'
            ? `Exam flagged for review after reaching ${violationThreshold} violations.`
            : `Warning: you have reached the violation threshold of ${violationThreshold}.`;
          setProctorWarning(warningText);
        }
      }
      return updated;
    });

    const lower = String(message || '').toLowerCase();
    const severity = lower.includes('fullscreen') ? 'severe' : (lower.includes('tab') ? 'major' : 'minor');
    const body = {
      type,
      confidence,
      timestamp: new Date().toISOString(),
      severity,
      image: snapshotImage,
      count: 1,
      event_id,
      reason: message,
    };
    void persistViolation(body);
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

  useEffect(() => {
    handleConfirmSubmitRef.current = handleConfirmSubmit;
  }, [handleConfirmSubmit]);


  const enterFullscreen = () => {
    if (!browserLockdownEnabled) return;
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
      {watermarkEnabled && (
        <ProctoredWatermarkOverlay
          examTitle={sourceExam?.title}
          userLabel={watermarkUserLabel}
          sessionId={sessionId || attemptId}
        />
      )}
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
            {browserLockdownEnabled && !isFullscreen && (
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

      {proctorWarning && (
        <div className="bg-destructive/15 border-l-4 border-destructive/80 px-4 py-3 text-sm text-destructive font-semibold flex items-center justify-between shadow-sm z-50 animate-in slide-in-from-top-2">
          <div className="flex items-center">
            <Icon name="AlertTriangle" className="mr-3" size={20} />
            {proctorWarning}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setProctorWarning('')}>
             Dismiss
          </Button>
        </div>
      )}

      {browserLockdownEnabled && !isFullscreen && (
        <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-primary/15 flex items-center justify-center mb-4">
              <Icon name="Maximize" size={26} className="text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">Fullscreen Required</h2>
            <p className="text-sm text-muted-foreground mb-5">
              This exam uses browser lockdown. Enter fullscreen to continue and keep the exam active.
            </p>
            <Button
              variant="default"
              size="lg"
              iconName="Maximize"
              onClick={enterFullscreen}
              className="w-full"
            >
              Enter Fullscreen
            </Button>
          </div>
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
          <SecurityMonitor 
            ref={securityMonitorRef}
            violations={violations} 
            sessionId={sessionId}
            securityConfig={securityConfig}
            onAddViolation={addViolation}
            onRequestSnapshot={requestSnapshot}
          />
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
            <SecurityMonitor 
              ref={securityMonitorRef}
              violations={violations} 
              sessionId={sessionId}
              securityConfig={securityConfig}
              onAddViolation={addViolation}
              onRequestSnapshot={requestSnapshot}
            />
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
