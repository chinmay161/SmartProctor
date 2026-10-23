import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
import {
  HIDDEN_VIDEO_STYLE,
  INFERENCE_MODE,
  fpsCheckStore,
  useVisionProctoring,
} from '../../components/proctoring/useVisionProctoring';
import { severityForViolation } from '../../utils/violationSeverity';
import {
  clearUnloading,
  markUnloading,
  shouldSuppressViolation,
} from '../../utils/proctoringSuppression';
import { SCREEN_SHARE_HELP, shareEntireScreen } from '../../components/proctoring/screenShare';
import { requestExamFullscreen } from '../../components/proctoring/fullscreen';

// Only camera exams need the gate UI, so it ships in its own chunk.
const PreExamGate = lazy(() => import('../../components/proctoring/PreExamGate'));

const CAMERA_WIZARD_FLAGS =['enableWebcam', 'detectMultipleFaces', 'detectNoFace', 'detectMobilePhone'];
const wizardRequiresCamera = (cfg) => CAMERA_WIZARD_FLAGS.some((flag) => Boolean(cfg?.[flag]));

const VISION_MESSAGES = {
  NO_FACE: 'No face detected',
  MULTIPLE_FACES: 'Multiple faces detected',
  PHONE_DETECTED: 'Phone detected',
  BOOK_DETECTED: 'Book detected',
  LOOKING_AWAY: 'Looking away from the screen',
  NO_BLINK: 'No blinking detected',
  CAMERA_FROZEN: 'Camera image frozen or covered',
  CAMERA_DISCONNECTED: 'Camera disconnected',
  VOICE_DETECTED: 'Voice detected',
  MIC_DISCONNECTED: 'Microphone disconnected',
};

// Same per-detector switches the server pipeline honours.
const isVisionViolationEnabled = (type, cfg) => {
  if (type === 'NO_FACE') return Boolean(cfg?.detectNoFace);
  if (type === 'MULTIPLE_FACES') return Boolean(cfg?.detectMultipleFaces);
  if (type === 'PHONE_DETECTED' || type === 'BOOK_DETECTED') return Boolean(cfg?.detectMobilePhone);
  if (type === 'VOICE_DETECTED' || type === 'MIC_DISCONNECTED') return Boolean(cfg?.audioMonitoring);
  return true;
};

const START_CLICK_KEY = 'sp:startClickedAt';
// Set once the exam is on screen; seeing it again on resume (same tab) means a reload.
const activeAttemptKey = (examId) => `sp:activeAttempt:${examId}`;
// Set right before a reload the app itself asks for (camera-permission banner).
const APP_RELOAD_KEY = 'sp:appInitiatedReload';

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
  const [isLoading, setIsLoading] = useState(true);
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
  const [authReconnecting, setAuthReconnecting] = useState(false);
  const [violationLock, setViolationLock] = useState(null);
  const pendingSavesRef = useRef({});
  const pendingViolationsRef = useRef([]);
  const violationRetryTimeoutRef = useRef(null);
  const violationLockTimeoutRef = useRef(null);
  const wsRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const securityMonitorRef = useRef(null);
  const examEndedRef = useRef(false);
  const examStatusRef = useRef('active');
  const warningTimeoutRef = useRef(null);
  const hasEnteredFullscreenRef = useRef(false);
  const [examRules, setExamRules] = useState(null);
  // loading -> gate (camera exams) -> starting -> ready. The attempt timer starts in 'starting'.
  const [stage, setStage] = useState('loading');
  const [cameraRequired, setCameraRequired] = useState(false);
  const [isResume, setIsResume] = useState(false);
  const pendingExamRef = useRef(null);
  const gateResultRef = useRef(null);
  const beginningRef = useRef(false);
  const visionTelemetryRef = useRef(() => null);
  const [screenStream, setScreenStream] = useState(null);
  const [screenShareLost, setScreenShareLost] = useState(null); // help object when sharing stopped
  const reloadReportedRef = useRef(false);


  const sourceExam = examDataState;
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
  const configuredFreezeMin = Number(securityConfig?.violationFreezeMinSeconds);
  const configuredFreezeMax = Number(securityConfig?.violationFreezeMaxSeconds);
  const violationFreezeMinSeconds = Math.max(
    1,
    Number.isFinite(configuredFreezeMin) ? Math.floor(configuredFreezeMin) : 1
  );
  const violationFreezeMaxSeconds = Math.max(
    violationFreezeMinSeconds,
    Number.isFinite(configuredFreezeMax) ? Math.floor(configuredFreezeMax) : 5
  );
  const watermarkUserLabel =
    auth0User?.email ||
    auth0User?.name ||
    auth0User?.nickname ||
    'Student';

  const [micRequired, setMicRequired] = useState(false);
  const clientVision = (cameraRequired || micRequired) && INFERENCE_MODE === 'client';
  const visionViolationRef = useRef(null);
  const vision = useVisionProctoring({
    detectObjects: Boolean(securityConfig?.detectMobilePhone),
    micRequired,
    onViolation: (event) => visionViolationRef.current?.(event),
  });

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

  const triggerViolationLock = (message) => {
    const durationSeconds = Math.floor(
      Math.random() * (violationFreezeMaxSeconds - violationFreezeMinSeconds + 1)
    ) + violationFreezeMinSeconds;
    const durationMs = durationSeconds * 1000;
    if (violationLockTimeoutRef.current) {
      clearTimeout(violationLockTimeoutRef.current);
      violationLockTimeoutRef.current = null;
    }

    setViolationLock({
      message: message || 'Violation detected. Stay focused on the exam.',
      durationMs,
    });

    violationLockTimeoutRef.current = setTimeout(() => {
      setViolationLock(null);
      violationLockTimeoutRef.current = null;
    }, durationMs);
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

  // Step 1: read-only loading. Nothing here starts the attempt or its timer.
  useEffect(() => {
    let mounted = true;

    const loadExam = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const examIdFromUrl = params.get('examId') || params.get('id');
        setExamId(examIdFromUrl);

        if (!examIdFromUrl) {
          if (mounted) setExamBlocked('Unable to load exam. Please return to your dashboard.');
          return;
        }

        const exam = await callApi(`/exams/${examIdFromUrl}`, 'GET');
        if (!mounted) return;
        if (!exam) {
          setExamBlocked('Unable to load exam. Please return to your dashboard.');
          return;
        }

        let cfg = null;
        if (exam?.wizard_config) {
          try {
            cfg = typeof exam.wizard_config === 'string' ? JSON.parse(exam.wizard_config) : exam.wizard_config;
            setExamRules(cfg);
          } catch {
            cfg = null;
          }
        }

        // Prefetch question content while the student goes through the device check.
        const questionIds = Array.isArray(exam?.question_ids) ? exam.question_ids : [];
        const questionsPromise = Promise.all(
          questionIds.map(async (questionId) => {
            try {
              return await callApi(`/api/questions/${encodeURIComponent(questionId)}`, 'GET');
            } catch {
              return null;
            }
          })
        );

        // Is there an attempt in progress already? (read-only; 404 = fresh start)
        let resumable = false;
        try {
          await callApi(`/attempts/${encodeURIComponent(examIdFromUrl)}/resume`, 'GET');
          resumable = true;
        } catch (error) {
          const status = error?.status || error?.status_code || error?.response?.status;
          const lower = String(error?.detail || error?.message || '').toLowerCase();
          if (status === 403 || lower.includes('not resumable') || lower.includes('expired')) {
            if (mounted) setExamBlocked('This attempt can no longer be resumed. Please return to your dashboard.');
            return;
          }
        }
        if (!mounted) return;

        const requiresCamera = typeof exam?.camera_required === 'boolean'
          ? exam.camera_required
          : wizardRequiresCamera(cfg);
        const requiresMic = typeof exam?.mic_required === 'boolean'
          ? exam.mic_required
          : Boolean(cfg?.audioMonitoring);
        pendingExamRef.current = { exam, cfg, questionIds, questionsPromise };
        setIsResume(resumable);
        setCameraRequired(requiresCamera);
        setMicRequired(requiresMic);
        const needsGate = requiresCamera || requiresMic || Boolean(cfg?.enableScreenRecording) || Boolean(cfg?.browserLockdown);
        setStage(needsGate ? 'gate' : 'starting');
      } catch {
        if (mounted) {
          setExamDataState(null);
          setExamBlocked('Unable to load exam. Please return to your dashboard.');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadExam();
    return () => {
      mounted = false;
      if (violationRetryTimeoutRef.current) {
        clearTimeout(violationRetryTimeoutRef.current);
        violationRetryTimeoutRef.current = null;
      }
      if (violationLockTimeoutRef.current) {
        clearTimeout(violationLockTimeoutRef.current);
        violationLockTimeoutRef.current = null;
      }
    };
  }, []);

  // Step 3: start (or rejoin) the session only after the gate has passed.
  const beginExam = async (gateResult) => {
    const pending = pendingExamRef.current;
    if (!pending || beginningRef.current) return;
    beginningRef.current = true;
    const { exam, cfg, questionIds, questionsPromise } = pending;
    const activeExamId = exam?.id || examId;

    let session;
    try {
      session = await callApi(`/sessions/${encodeURIComponent(activeExamId)}/start`, 'POST');
    } catch (error) {
      setExamBlocked(error?.detail || error?.message || 'Unable to start the exam. Please return to your dashboard.');
      return;
    }
    const newSessionId = session?.session_id || session?.id || null;
    navigate(
      `/exam-portal?examId=${encodeURIComponent(activeExamId)}${newSessionId ? `&sessionId=${encodeURIComponent(newSessionId)}` : ''}`,
      { replace: true }
    );

    if (gateResult && INFERENCE_MODE === 'client') {
      if (gateResult.measure && !gateResult.weakDevice) {
        fpsCheckStore.set(activeExamId, { passed: true, faceFps: gateResult.measure.faceFps, at: Date.now() });
      }
      if (newSessionId) {
        const m = gateResult.measure;
        void callApi(`/sessions/session/${encodeURIComponent(newSessionId)}/system-check`, 'POST', {
          camera_ok: Boolean(gateResult.camera?.ok),
          models_ok: Boolean(gateResult.models?.ok),
          face_fps: m?.faceFps ?? null,
          object_fps: m?.objectFps ?? null,
          face_inference_ms: m?.faceMs ?? null,
          object_inference_ms: m?.objectMs ?? null,
          delegate: gateResult.models?.delegates?.face ?? null,
          inference_mode: INFERENCE_MODE,
          fps_test_skipped: Boolean(gateResult.fpsSkipped),
          resumed: isResume,
          user_agent: navigator.userAgent.slice(0, 500),
          mic_ok: gateResult.mic ? Boolean(gateResult.mic?.ok) : null,
          mic_noise_level: gateResult.mic?.noiseLevel ?? null,
          speech_detected: gateResult.mic ? Boolean(gateResult.mic?.speechDetected) : null,
          noisy_environment: gateResult.mic ? Boolean(gateResult.mic?.noisyEnvironment) : null,
        }).catch((error) => console.warn('Failed to record system check', error));
      }
    }

    let restoredAnswers = {};
    try {
      const resume = await callApi(`/attempts/${encodeURIComponent(activeExamId)}/resume`, 'GET');
      if (resume?.attempt_id) setAttemptId(resume.attempt_id);
      if (Number.isFinite(resume?.duration_remaining_seconds)) {
        setRemainingSeconds(Math.max(0, Math.floor(resume.duration_remaining_seconds)));
      }
      (resume?.saved_answers || []).forEach((saved) => {
        if (saved?.question_id) restoredAnswers[String(saved.question_id)] = saved.answer;
      });
    } catch {
      restoredAnswers = {};
      setLoadWarning('Could not load attempt progress. You may continue, but previous progress may be unavailable.');
    }

    const responses = await questionsPromise;
    const liveQuestions = responses.filter(Boolean).map((q, idx) => mapApiQuestionToPortal(q, idx));
    const questions = cfg
      ? applyQuestionSecurity(liveQuestions, cfg, newSessionId || activeExamId)
      : liveQuestions;

    if (questionIds.length === 0) {
      setLoadWarning('No questions are attached to this exam yet.');
    } else if (liveQuestions.length === 0) {
      setLoadWarning('Could not load question details.');
    } else if (liveQuestions.length < questionIds.length) {
      setLoadWarning('Some question details could not be loaded. Loaded available live questions.');
    }

    if (session?.attempt_id) setAttemptId(session.attempt_id);
    setAnswers(restoredAnswers);
    setSessionId(newSessionId);
    setExamDataState({ ...exam, duration: exam?.duration_minutes || 0, questions });

    if (gateResult?.calibration?.baseline && INFERENCE_MODE === 'client') {
      await vision.start(gateResult.calibration.baseline);
    }
    setStage('ready');

    // Resuming in the same tab where this attempt was already on screen = a reload.
    try {
      const wasActive = sessionStorage.getItem(activeAttemptKey(activeExamId));
      const appReload = sessionStorage.getItem(APP_RELOAD_KEY);
      sessionStorage.removeItem(APP_RELOAD_KEY);
      if (isResume && wasActive && !appReload && !reloadReportedRef.current) {
        reloadReportedRef.current = true;
        addViolation('Page reloaded during the exam', 'PAGE_RELOAD', 1.0);
      }
      sessionStorage.setItem(activeAttemptKey(activeExamId), newSessionId || '1');
    } catch {
      /* storage unavailable: reload detection is best-effort */
    }
  };

  useEffect(() => {
    if (stage === 'starting') void beginExam(gateResultRef.current);
    // beginExam is guarded by beginningRef and only needs to run once per stage change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Reports how long "Start exam" -> first question took (set by the dashboard click).
  useEffect(() => {
    if (stage !== 'ready') return;
    const clickedAt = Number(sessionStorage.getItem(START_CLICK_KEY));
    sessionStorage.removeItem(START_CLICK_KEY);
    requestAnimationFrame(() => {
      const timing = {
        startToFirstQuestionMs: clickedAt ? Date.now() - clickedAt : null,
        gate: gateResultRef.current?.timings || null,
        resumed: isResume,
      };
      window.__spTiming = timing;
      console.info('[timing] Start exam -> first question', timing);
    });
  }, [stage, isResume]);

  // httpClient never redirects to login on this route; it signals token trouble instead.
  // Requests keep their own retry behaviour; this banner only reflects the auth state.
  useEffect(() => {
    const onTokenError = () => setAuthReconnecting(true);
    const onTokenRecovered = () => setAuthReconnecting(false);
    window.addEventListener('auth:token-error', onTokenError);
    window.addEventListener('auth:token-recovered', onTokenRecovered);
    return () => {
      window.removeEventListener('auth:token-error', onTokenError);
      window.removeEventListener('auth:token-recovered', onTokenRecovered);
    };
  }, []);

  useEffect(() => {
    if (isLoading || examBlocked || !sourceExam || !sessionId || pendingViolationsRef.current.length === 0) return;

    const queued = [...pendingViolationsRef.current];
    pendingViolationsRef.current = [];
    void (async () => {
      for (const item of queued) {
        await persistViolation(item);
      }
    })();
  }, [isLoading, examBlocked, sourceExam, sessionId]);

  const handleConfirmSubmitRef = useRef();

  useEffect(() => {
    if (isLoading || examBlocked || !sourceExam || !sessionId || !auth0Authenticated) return;

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
              ws.send(JSON.stringify({ type: 'HEARTBEAT', timestamp: Date.now(), vision: visionTelemetryRef.current() }));
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
    if (isLoading || examBlocked || !sourceExam) return;

    const autoSaveInterval = setInterval(() => {
      void flushPendingAnswers();
    }, 5000);

    return () => {
      clearInterval(autoSaveInterval);
      void flushPendingAnswers();
    };
  }, [isLoading, examBlocked, sourceExam, attemptId]);

  useEffect(() => {
    if (isLoading || examBlocked || !sourceExam) return;

    // The gate's last step usually put us in fullscreen already.
    setIsFullscreen(!!document.fullscreenElement);
    if (document.fullscreenElement) hasEnteredFullscreenRef.current = true;

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
  }, [isLoading, examBlocked, sourceExam, browserLockdownEnabled]);

  useEffect(() => {
    if (isLoading || examBlocked || !sourceExam) return;

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

    const preventPaste = (e) => {
      if (!disableCopyPasteEnabled) return;
      e?.preventDefault();
      addViolation('Attempted paste', 'PASTE_ATTEMPT');
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
    document.addEventListener('paste', preventPaste);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('copy', preventCopy);
      document.removeEventListener('cut', preventCopy);
      document.removeEventListener('paste', preventPaste);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('resize', handleResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [isLoading, examBlocked, sourceExam, browserLockdownEnabled, detectTabSwitchEnabled, disableCopyPasteEnabled, disableRightClickEnabled]);

  // Nothing reports once the page starts unloading (reload / close / navigate away).
  useEffect(() => {
    const onUnload = () => markUnloading();
    const onPageShow = (event) => { if (event.persisted) clearUnloading(); };
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  // The screen stream comes from the gate; if the student stops sharing, record it once
  // and offer to share again (needs a click, like the original share).
  useEffect(() => {
    if (!screenStream) return undefined;
    const [track] = screenStream.getVideoTracks();
    const onEnded = () => {
      setScreenShareLost({ title: 'Screen sharing stopped', steps: ['This exam requires sharing your entire screen. Click "Share entire screen" to continue.'] });
      addViolation('Screen sharing stopped', 'SCREEN_SHARE_STOPPED', 1.0);
    };
    track?.addEventListener('ended', onEnded);
    return () => track?.removeEventListener('ended', onEnded);
    // addViolation is recreated every render; the listener only needs the latest stream
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenStream]);

  useEffect(() => () => {
    screenStream?.getTracks().forEach((t) => t.stop());
  }, [screenStream]);

  const reshareScreen = async () => {
    try {
      const stream = await shareEntireScreen();
      setScreenShareLost(null);
      setScreenStream(stream);
    } catch (error) {
      setScreenShareLost(SCREEN_SHARE_HELP[error.kind] || SCREEN_SHARE_HELP.failed);
    }
  };

  useEffect(() => {
    if (isLoading || examBlocked || !sourceExam || !detectTabSwitchEnabled) return;

    const handleVisibilityChange = () => {
      if (detectTabSwitchEnabled && document.hidden && examStatusRef.current !== 'ending') {
        addViolation('Tab switched or window minimized', 'TAB_SWITCH');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isLoading, examBlocked, sourceExam, detectTabSwitchEnabled]);

  // extras: { image, durationMs, reason } — vision violations carry their own evidence frame.
  const addViolation = (message, type = null, confidence = null, extras = {}) => {
    if (examEndedRef.current) return;
    // App-initiated prompts (camera, screen picker, fullscreen) and page unload are not the student's doing.
    if (shouldSuppressViolation(type)) return;
    triggerViolationLock(message);
    const event_id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    const newViolation = {
      id: event_id,
      message,
      timestamp: new Date()
    };
    
    // Evidence: the vision frame that triggered it, else a current camera frame.
    let snapshotImage = extras.image || null;
    if (!snapshotImage && clientVision && !document.hidden) {
      snapshotImage = vision.captureEvidence();
    } else if (!snapshotImage && securityMonitorRef.current?.captureImage) {
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

    // Vision events carry their own severity (e.g. a prolonged episode is major).
    const severity = extras.severity || severityForViolation(type, message);
    const body = {
      type,
      confidence,
      timestamp: new Date().toISOString(),
      severity,
      image: snapshotImage,
      count: 1,
      event_id,
      reason: extras.reason || message,
      duration_ms: Number.isFinite(extras.durationMs) ? Math.round(extras.durationMs) : null,
    };
    void persistViolation(body);
  };

  visionViolationRef.current = (event) => {
    if (!isVisionViolationEnabled(event.type, securityConfig)) return;
    addViolation(VISION_MESSAGES[event.type] || event.type, event.type, event.confidence, {
      image: event.image,
      durationMs: event.durationMs,
      reason: event.reason,
      severity: event.severity,
    });
  };

  // Vision telemetry for the HEARTBEAT (server watchdog raises PROCTORING_STOPPED from it).
  visionTelemetryRef.current = () => {
    if (!cameraRequired && !micRequired) return { mode: INFERENCE_MODE, running: false, phase: 'disabled' };
    if (INFERENCE_MODE === 'client') {
      return vision.getTelemetry() || { mode: 'client', running: false, phase: stage === 'ready' ? 'idle' : stage };
    }
    const snap = securityMonitorRef.current?.getSnapshotTelemetry?.() || null;
    const ageMs = snap?.lastSnapshotAt ? Date.now() - snap.lastSnapshotAt : null;
    return {
      mode: 'server',
      phase: snap?.active ? 'running' : 'stopped',
      running: Boolean(snap?.active) && ageMs !== null && ageMs < 15000,
      faceFps: null,
      lastInferenceAt: snap?.lastSnapshotAt || null,
      inferenceAgeMs: ageMs,
    };
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


  // Click handler only: the gate and this overlay share requestExamFullscreen().
  const enterFullscreen = () => {
    if (!browserLockdownEnabled) return;
    requestExamFullscreen().catch((error) => console.warn('Fullscreen request was rejected', error));
  };

  const answeredCount = Object.keys(answers)?.length;
  const reviewCount = markedForReview?.size;
  const unansweredCount = totalQuestions - answeredCount;
  const durationMinutesForTimer = examId
    ? (examDataState?.duration_minutes ?? examDataState?.duration ?? 0)
    : (sourceExam?.duration_minutes ?? sourceExam?.duration);

  // Inference video stays mounted at the same position in every branch so the
  // vision controller keeps the same element from the gate into the exam.
  const inferenceVideo = (
    <video ref={vision.videoRef} style={HIDDEN_VIDEO_STYLE} muted playsInline autoPlay aria-hidden="true" />
  );

  if (isLoading) {
    return (
      <>
        {inferenceVideo}
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="text-sm text-muted-foreground">Loading exam...</div>
        </div>
      </>
    );
  }

  if (examBlocked) {
    return (
      <>
        {inferenceVideo}
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-card border border-border rounded-lg p-6 shadow-md text-center">
            <p className="text-sm text-muted-foreground mb-4">{examBlocked}</p>
            <Button onClick={() => navigate('/student-dashboard')} className="w-full">
              Return to Dashboard
            </Button>
          </div>
        </div>
      </>
    );
  }

  if (stage === 'gate') {
    return (
      <>
        {inferenceVideo}
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <PreExamGate
          vision={vision}
          variant={INFERENCE_MODE === 'server' ? 'permission-only' : (isResume ? 'resume' : 'exam')}
          cameraRequired={cameraRequired}
          micRequired={micRequired}
          requireScreenShare={Boolean(securityConfig?.enableScreenRecording)}
          requireFullscreen={browserLockdownEnabled}
          onScreenStream={setScreenStream}
          skipFps={isResume && Boolean(fpsCheckStore.get(examId)?.passed)}
          calibrationMs={isResume ? 2000 : 3000}
          title={isResume ? 'Resume your exam' : 'Before you start'}
          onComplete={(result) => {
            gateResultRef.current = result;
            setStage('starting');
          }}
          onCancel={() => navigate('/student-dashboard')}
        />
        </Suspense>
      </>
    );
  }

  if (stage !== 'ready' || !sourceExam) {
    return (
      <>
        {inferenceVideo}
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="text-sm text-muted-foreground">Starting your exam…</div>
        </div>
      </>
    );
  }

  return (
    <>
    {inferenceVideo}
    <div className="relative isolate min-h-screen bg-background flex flex-col">
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

      {clientVision && vision.cameraStatus.state === 'lost' && (
        <div role="alert" className="bg-destructive/15 border-b border-destructive/30 px-4 py-3 text-sm text-destructive flex flex-wrap items-center justify-between gap-3">
          {vision.cameraStatus.permission === 'denied' ? (
            <>
              <span>
                <strong>Camera access is blocked for this site.</strong> Click the lock icon in the address bar → Site settings →
                Camera → Allow. Proctoring resumes automatically; if your browser asks you to reload, use the button.
              </span>
              <Button size="sm" variant="outline" onClick={() => {
                try { sessionStorage.setItem(APP_RELOAD_KEY, '1'); } catch { /* best-effort */ }
                window.location.reload();
              }}>
                Reload
              </Button>
            </>
          ) : (
            <span>
              <strong>Camera disconnected — reconnecting…</strong> Check that the camera is plugged in, switched on, and not used
              by another app. Your answers are saved.
            </span>
          )}
        </div>
      )}

      {screenShareLost && (
        <div role="alert" className="bg-destructive/15 border-b border-destructive/30 px-4 py-3 text-sm text-destructive flex flex-wrap items-center justify-between gap-3">
          <span><strong>{screenShareLost.title}.</strong> {screenShareLost.steps.join(' ')}</span>
          <Button size="sm" variant="outline" iconName="Monitor" onClick={() => void reshareScreen()}>Share entire screen</Button>
        </div>
      )}

      {authReconnecting && (
        <div role="status" className="bg-warning/15 border-b border-warning/30 px-4 py-2 text-xs text-warning">
          Reconnecting… your answers are kept and will sync once the connection is restored.
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

      {violationLock && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-card border border-destructive/50 rounded-2xl shadow-2xl p-7 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-destructive/15 flex items-center justify-center mb-4">
              <Icon name="AlertTriangle" size={30} className="text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Security Violation Detected</h2>
            <p className="text-base text-destructive font-medium mb-4">{violationLock.message}</p>
            <p className="text-sm text-muted-foreground">
              Exam controls are temporarily locked for {Math.max(1, Math.round(violationLock.durationMs / 1000))} seconds.
            </p>
          </div>
        </div>
      )}


      <div className="relative z-10 flex-1 flex overflow-hidden">
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
            clientVision={clientVision}
            managedStream={clientVision ? vision.stream : null}
            getVisionTelemetry={clientVision ? vision.getTelemetry : null}
            screenStream={screenStream}
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
              clientVision={clientVision}
              managedStream={clientVision ? vision.stream : null}
              getVisionTelemetry={clientVision ? vision.getTelemetry : null}
              screenStream={screenStream}
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
    </>
  );
};

export default ExamPortal;
