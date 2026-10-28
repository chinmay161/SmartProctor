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
import ExamHeader from './components/ExamHeader';
import ExamActionBar from './components/ExamActionBar';
import ExamInterruptionOverlays from './components/ExamInterruptionOverlays';
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
  isSystemPromptGraceActive,
  isUnloading,
  markUnloading,
  PROMPT_SENSITIVE_TYPES,
  shouldSuppressViolation,
} from '../../utils/proctoringSuppression';
import { SCREEN_SHARE_HELP, shareEntireScreen } from '../../components/proctoring/screenShare';
import { requestExamFullscreen } from '../../components/proctoring/fullscreen';
import { isVisionViolationEnabled } from '../../utils/violationSeverity';
import { ReconnectingSocket } from '../../services/reconnectingSocket';
import { setSentrySessionId, setNativeSentryTags } from '../../utils/sentryScrubber';
import flightRecorder from '../../telemetry/flightRecorder';
import { VIOLATION_DROP_REASONS } from '../../telemetry/violationDropReasons';
import ReportProblemModal from '../../components/feedback/ReportProblemModal';
import PilotScenarioPanel from './components/PilotScenarioPanel';
import { isNativeApp } from '../../utils/platform';

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
  const [showReportProblem, setShowReportProblem] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [violations, setViolations] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [proctorWarning, setProctorWarning] = useState('');
  const [authReconnecting, setAuthReconnecting] = useState(false);
  const [socketConnecting, setSocketConnecting] = useState(false);
  const [socketReconnecting, setSocketReconnecting] = useState(false);
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
  const [screenShareBlocked, setScreenShareBlocked] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const reloadReportedRef = useRef(false);


  const sourceExam = examDataState;
  const securityConfig = examRules || sourceExam?.wizard_config || {};
  const isNative = isNativeApp();
  const screenRecordingRequired = !isNative && Boolean(securityConfig?.enableScreenRecording);
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
  const lastEvidenceCaptureTimeRef = useRef(0);
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

  useEffect(() => {
    if (auth0Authenticated && getAccessTokenSilently) {
      flightRecorder.setAccessTokenGetter(() =>
        getAccessTokenSilently({
          authorizationParams: { audience: auth0Audience },
        })
      );
    }
  }, [auth0Authenticated, getAccessTokenSilently, auth0Audience]);

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
      flightRecorder.record('violation', 'violation_dropped', {
        type: violationPayload?.type || 'UNKNOWN',
        reason: VIOLATION_DROP_REASONS.OFFLINE_QUEUED,
      });
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
        const needsGate = requiresCamera || requiresMic || (!isNativeApp() && Boolean(cfg?.enableScreenRecording)) || Boolean(cfg?.browserLockdown);
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
      const currentTraceId = flightRecorder.getTraceId();
      session = await callApi(
        `/sessions/${encodeURIComponent(activeExamId)}/start`,
        'POST',
        { trace_id: currentTraceId }
      );
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
        if (saved?.source_question_id) restoredAnswers[String(saved.source_question_id)] = saved.answer;
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
    setSentrySessionId(newSessionId);
    setNativeSentryTags();
    flightRecorder.setSessionId(newSessionId);
    flightRecorder.setExamId(activeExamId);
    flightRecorder.record('lifecycle', isResume ? 'resume' : 'exam_start', {
      session_id: newSessionId,
      exam_id: activeExamId,
    });
    setExamDataState({ ...exam, duration: exam?.duration_minutes || 0, questions });
    const requiresCamera = typeof exam?.camera_required === 'boolean'
      ? exam.camera_required
      : wizardRequiresCamera(cfg);
    const requiresMic = typeof exam?.mic_required === 'boolean'
      ? exam.mic_required
      : Boolean(cfg?.audioMonitoring);

    if (INFERENCE_MODE === 'client' && (requiresCamera || requiresMic)) {
      await vision.start(gateResult?.calibration?.baseline || { yaw: 0, pitch: 0 });
      if (requiresMic) {
        try {
          const ae = await vision.ensureAudioEngine();
          await ae.start();
          if (ae.resume) await ae.resume();
          if (typeof ae.isRunning === 'function' && !ae.isRunning()) {
            setMicBlocked(true);
          }
        } catch (err) {
          console.warn('[exam-portal] Failed to start audio engine:', err);
          setMicBlocked(true);
        }
      }
    }
    setStage('ready');

    // Resuming in the same tab where this attempt was already on screen = a reload.
    try {
      const wasActive = sessionStorage.getItem(activeAttemptKey(activeExamId));
      const appReload = sessionStorage.getItem(APP_RELOAD_KEY);
      sessionStorage.removeItem(APP_RELOAD_KEY);
      if (isResume && wasActive && !appReload && !reloadReportedRef.current) {
        reloadReportedRef.current = true;
        flightRecorder.record('lifecycle', 'reload_detected', { session_id: newSessionId });
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
    const lastTimestamps = new Map();

    const getWsUrl = async () => {
      const token = await getAccessTokenSilently({ authorizationParams: { audience: auth0Audience } });
      const apiBase = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || 'http://localhost:8000';
      let wsProtocol = 'ws:';
      let wsHost = 'localhost:8000';
      try {
        const parsed = new URL(apiBase, window.location.origin);
        wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
        wsHost = parsed.host;
      } catch {
        wsProtocol = apiBase.startsWith('https') ? 'wss:' : 'ws:';
        wsHost = apiBase.replace(/^https?:\/\//, '').split('/')[0];
      }
      return `${wsProtocol}//${wsHost}/ws/student/${sessionId}?token=${encodeURIComponent(token)}`;
    };

    const socket = new ReconnectingSocket({
      getUrl: getWsUrl,
      onStateChange: (state) => {
        flightRecorder.record('socket', 'socket_state_change', { state });
        if (state === 'reconnecting') {
          flightRecorder.record('socket', 'socket_reconnect_attempt', { state });
        }
        if (!mounted) return;
        if (state === 'open') {
          setSocketConnecting(false);
          setSocketReconnecting(false);
        } else if (state === 'connecting') {
          setSocketConnecting(true);
          setSocketReconnecting(false);
        } else if (state === 'reconnecting') {
          setSocketConnecting(false);
          setSocketReconnecting(true);
        } else if (state === 'failed') {
          setSocketConnecting(false);
          setSocketReconnecting(false);
          setProctorWarning('Live proctoring connection could not be established for this exam session.');
        } else {
          setSocketConnecting(false);
          setSocketReconnecting(false);
        }
      },
      onOpen: (event, rws) => {
        rws.send(JSON.stringify({ type: 'SYNC_REQUEST' }));

        // Immediately send heartbeat with current vision telemetry upon connect/reconnect
        rws.send(JSON.stringify({
          type: 'HEARTBEAT',
          timestamp: Date.now(),
          vision: visionTelemetryRef.current(),
        }));

        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(() => {
          rws.send(JSON.stringify({
            type: 'HEARTBEAT',
            timestamp: Date.now(),
            vision: visionTelemetryRef.current(),
          }));
        }, 5000);
      },
      onMessage: (event) => {
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
        } catch {
          // ignore parse errors
        }
      },
      onClose: () => {
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      },
    });

    wsRef.current = socket;

    return () => {
      mounted = false;
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      socket.close();
      wsRef.current = null;
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
      flightRecorder.record('lifecycle', 'fullscreen_change', { is_fullscreen: fullscreenActive });
      setIsFullscreen(fullscreenActive);
      if (fullscreenActive) {
        hasEnteredFullscreenRef.current = true;
      }
      // TODO: Native lockdown plugin will supply native violations in next task.
      if (isNative) return;
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
  }, [isLoading, examBlocked, sourceExam, browserLockdownEnabled, isNative]);

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
      // TODO: Native lockdown plugin will supply native violations in next task.
      if (isNative) return;
      if (detectTabSwitchEnabled && examStatusRef.current !== 'ending') {
        addViolation('Window lost focus (possible tab switch)', 'WINDOW_BLUR');
      }
    };

    let resizeTimer;
    const handleResize = () => {
      // TODO: Native lockdown plugin will supply native violations in next task.
      if (isNative) return;
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
  }, [isLoading, examBlocked, sourceExam, browserLockdownEnabled, detectTabSwitchEnabled, disableCopyPasteEnabled, disableRightClickEnabled, isNative]);

  // Nothing reports once the page starts unloading (reload / close / navigate away).
  useEffect(() => {
    const onUnload = (event) => {
      markUnloading();
      flightRecorder.record('lifecycle', 'pagehide', { persisted: Boolean(event?.persisted) });
      flightRecorder.flush({ keepalive: true });
    };
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
      if (screenRecordingRequired) {
        setScreenShareBlocked(true);
      }
      setScreenShareLost({ title: 'Screen sharing stopped', steps: ['This exam requires sharing your entire screen. Click "Share entire screen" to continue.'] });
      addViolation('Screen sharing stopped', 'SCREEN_SHARE_STOPPED', 1.0, { severity: 'major' });
    };
    track?.addEventListener('ended', onEnded);
    return () => track?.removeEventListener('ended', onEnded);
    // addViolation is recreated every render; the listener only needs the latest stream
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenStream, screenRecordingRequired]);

  useEffect(() => () => {
    screenStream?.getTracks().forEach((t) => t.stop());
  }, [screenStream]);

  const reshareScreen = async () => {
    try {
      const stream = await shareEntireScreen();
      setScreenShareLost(null);
      setScreenShareBlocked(false);
      setScreenStream(stream);
      if (browserLockdownEnabled && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    } catch (error) {
      setScreenShareLost(SCREEN_SHARE_HELP[error?.kind] || SCREEN_SHARE_HELP.failed);
    }
  };

  useEffect(() => {
    if (isLoading || examBlocked || !sourceExam || !detectTabSwitchEnabled) return;

    const handleVisibilityChange = () => {
      flightRecorder.record('lifecycle', 'visibility', { hidden: document.hidden });
      // TODO: Native lockdown plugin will supply native violations in next task.
      if (isNative) return;
      if (detectTabSwitchEnabled && document.hidden && examStatusRef.current !== 'ending') {
        addViolation('Tab switched or window minimized', 'TAB_SWITCH');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isLoading, examBlocked, sourceExam, detectTabSwitchEnabled, isNative]);

  // Periodic vision fps summary every 30s
  useEffect(() => {
    if (stage !== 'ready') return undefined;
    const interval = setInterval(() => {
      const tel = visionTelemetryRef.current?.();
      if (tel) {
        flightRecorder.record('perf', 'vision_fps_summary', {
          running: Boolean(tel.running),
          phase: tel.phase || null,
          face_mode: tel.faceMode || 'main',
          face_fps: tel.faceFps ?? null,
          achieved_face_fps: tel.achievedFaceFps ?? tel.faceFps ?? null,
          object_fps: tel.objectFps ?? null,
          inference_age_ms: tel.inferenceAgeMs ?? null,
        });
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [stage]);

  // Periodic long-task counts every 30s using PerformanceObserver
  useEffect(() => {
    let count = 0;
    let totalDurationMs = 0;
    let observer = null;
    try {
      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            count += 1;
            totalDurationMs += entry.duration;
          }
        });
        observer.observe({ type: 'longtask', buffered: true });
      }
    } catch {
      // Long tasks observer not supported in this browser
    }

    const interval = setInterval(() => {
      flightRecorder.record('perf', 'long_tasks_summary', {
        count,
        total_duration_ms: Math.round(totalDurationMs),
      });
      count = 0;
      totalDurationMs = 0;
    }, 30000);

    return () => {
      clearInterval(interval);
      observer?.disconnect();
    };
  }, []);

  // Client error reporting to flight recorder
  useEffect(() => {
    const onError = (e) => {
      flightRecorder.record('error', 'client_error', {
        message: e?.message || String(e),
        filename: e?.filename ? String(e.filename).slice(-64) : null,
        lineno: typeof e?.lineno === 'number' ? e.lineno : null,
      });
    };
    window.addEventListener('error', onError);
    return () => window.removeEventListener('error', onError);
  }, []);


  // extras: { image, durationMs, reason } — vision violations carry their own evidence frame.
  const addViolation = (message, type = null, confidence = null, extras = {}) => {
    if (examEndedRef.current) {
      flightRecorder.record('violation', 'violation_dropped', {
        type: type || 'UNKNOWN',
        reason: VIOLATION_DROP_REASONS.EXAM_ENDED,
      });
      return;
    }
    // App-initiated prompts (camera, screen picker, fullscreen) and page unload are not the student's doing.
    if (isUnloading()) {
      flightRecorder.record('violation', 'violation_dropped', {
        type: type || 'UNKNOWN',
        reason: VIOLATION_DROP_REASONS.UNLOADING,
      });
      if (type === 'VOICE_DETECTED' || type === 'MIC_DISCONNECTED') {
        vision?.setVoiceDroppedReason?.('suppressed_by_grace_or_unload');
      }
      return;
    }
    if (PROMPT_SENSITIVE_TYPES.has(type) && isSystemPromptGraceActive()) {
      flightRecorder.record('violation', 'violation_dropped', {
        type: type || 'UNKNOWN',
        reason: VIOLATION_DROP_REASONS.GRACE,
      });
      return;
    }
    if (shouldSuppressViolation(type)) {
      flightRecorder.record('violation', 'violation_dropped', {
        type: type || 'UNKNOWN',
        reason: VIOLATION_DROP_REASONS.GRACE,
      });
      return;
    }
    if (type === 'VOICE_DETECTED') {
      vision?.setVoiceDroppedReason?.(null);
    }
    triggerViolationLock(message);
    const event_id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    const newViolation = {
      id: event_id,
      message,
      timestamp: new Date()
    };
    
    // Evidence: the vision frame that triggered it, else a current camera frame.
    let snapshotImage = extras.image || null;
    let evidenceNotCapturedReason = extras.evidenceReason || extras.evidenceNotCapturedReason || null;

    if (!snapshotImage) {
      const now = Date.now();
      const minIntervalMs = 1000;
      if (lastEvidenceCaptureTimeRef.current && (now - lastEvidenceCaptureTimeRef.current < minIntervalMs)) {
        evidenceNotCapturedReason = evidenceNotCapturedReason || 'rate limit';
      } else {
        let captureResult = null;
        try {
          if (clientVision && !document.hidden && vision?.captureEvidence) {
            captureResult = vision.captureEvidence();
          } else if (securityMonitorRef.current?.captureImage && !document.hidden) {
            captureResult = securityMonitorRef.current.captureImage();
          }
        } catch {
          evidenceNotCapturedReason = 'canvas error';
        }

        if (captureResult) {
          snapshotImage = captureResult;
          lastEvidenceCaptureTimeRef.current = now;
        } else if (!evidenceNotCapturedReason) {
          evidenceNotCapturedReason = 'video not ready';
        }
      }
    } else {
      lastEvidenceCaptureTimeRef.current = Date.now();
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

    if (!snapshotImage) {
      flightRecorder.record('violation', 'evidence_not_captured', {
        type: type || 'UNKNOWN',
        reason: evidenceNotCapturedReason || 'video not ready',
        event_id,
      });
    }

    flightRecorder.record('violation', 'violation_reported', {
      type: type || 'UNKNOWN',
      severity,
      confidence: Number.isFinite(confidence) ? Math.round(confidence * 100) / 100 : null,
      duration_ms: Number.isFinite(extras.durationMs) ? Math.round(extras.durationMs) : null,
      reason: extras.reason || message,
    });

    void persistViolation(body);
  };

  visionViolationRef.current = (event) => {
    if (!isVisionViolationEnabled(event.type, securityConfig)) {
      flightRecorder.record('violation', 'violation_dropped', {
        type: event.type,
        reason: VIOLATION_DROP_REASONS.RULE_DISABLED,
        severity: event.severity,
        confidence: event.confidence,
      });
      if (event.type === 'VOICE_DETECTED' || event.type === 'MIC_DISCONNECTED') {
        vision?.setVoiceDroppedReason?.('disabled_by_wizard_toggle');
      }
      return;
    }
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
    flightRecorder.record('lifecycle', 'submit', {
      session_id: sessionId || null,
      attempt_id: attemptId || null,
    });
    void flightRecorder.flush();

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

      const activeExamId = examId || examDataState?.id || sourceExam?.id;
      let resultData = null;
      try {
        resultData = await callApi(`/results/${encodeURIComponent(activeExamId)}`, 'GET');
      } catch (err) {
        resultData = { errorReason: err?.detail || 'Results are not published yet.' };
      }
      setSubmissionResult({
        examId: activeExamId,
        score: resultData?.score,
        out_of: resultData?.out_of,
        status: resultData?.status,
        is_provisional: resultData?.is_provisional,
        provisional_message: resultData?.provisional_message,
        errorReason: resultData?.errorReason,
      });
    } catch (error) {
      setSubmitError(error?.detail || error?.message || 'Failed to submit exam. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    handleConfirmSubmitRef.current = handleConfirmSubmit;
  }, [handleConfirmSubmit]);


  const handleRetryMic = async () => {
    try {
      const ok = await vision.resumeAudio();
      if (ok) {
        setMicBlocked(false);
      }
    } catch (err) {
      console.warn('[exam-portal] Retry mic failed:', err);
    }
  };

  useEffect(() => {
    if (stage !== 'ready' || !micRequired || INFERENCE_MODE !== 'client') return undefined;
    const interval = setInterval(() => {
      const tel = vision.getTelemetry();
      if (tel?.audio && tel.audio.running === false) {
        setMicBlocked(true);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [stage, micRequired, vision]);

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

  if (submissionResult) {
    const hasScore = submissionResult.score != null;
    return (
      <>
        {inferenceVideo}
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 shadow-xl text-center space-y-6">
            <div className="w-16 h-16 bg-success/15 text-success rounded-full flex items-center justify-center mx-auto">
              <Icon name="CheckCircle" size={36} />
            </div>
            <div>
              <h2 className="text-2xl font-heading font-semibold text-foreground">Exam Submitted!</h2>
              <p className="text-sm text-muted-foreground mt-1">Your responses have been recorded successfully.</p>
            </div>

            {hasScore && (
              <div className="bg-muted/40 border border-border rounded-lg p-5 space-y-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Your Score</span>
                <div className="text-3xl font-bold font-data text-foreground">
                  {submissionResult.score} <span className="text-lg font-normal text-muted-foreground">/ {submissionResult.out_of ?? 0}</span>
                </div>
                {submissionResult.is_provisional && (
                  <div className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium bg-warning/15 text-warning border border-warning/30">
                    {submissionResult.provisional_message || 'Provisional — manual grading pending'}
                  </div>
                )}
              </div>
            )}

            {!hasScore && submissionResult.errorReason && (
              <div className="bg-muted/30 border border-border rounded-lg p-4 text-xs text-muted-foreground">
                {submissionResult.errorReason}
              </div>
            )}

            <div className="space-y-3 pt-2">
              {hasScore && (
                <Button
                  variant="default"
                  fullWidth
                  iconName="Eye"
                  onClick={() => navigate(`/student-dashboard/results/${encodeURIComponent(submissionResult.examId)}`)}
                >
                  View Result
                </Button>
              )}
              <Button
                variant={hasScore ? "outline" : "default"}
                fullWidth
                onClick={() => navigate('/student-dashboard')}
              >
                Return to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

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
          requireScreenShare={!isNativeApp() && Boolean(securityConfig?.enableScreenRecording)}
          requireFullscreen={!isNative && browserLockdownEnabled}
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
    <div className="relative isolate min-h-screen bg-background flex flex-col exam-portal-root">
      {watermarkEnabled && (
        <ProctoredWatermarkOverlay
          examTitle={sourceExam?.title}
          userLabel={watermarkUserLabel}
          sessionId={sessionId || attemptId}
        />
      )}

      <ExamHeader
        sourceExam={sourceExam}
        remainingSeconds={remainingSeconds}
        durationMinutesForTimer={durationMinutesForTimer}
        onTimeUp={handleSubmit}
        onReportProblem={() => setShowReportProblem(true)}
        showFullscreenBtn={browserLockdownEnabled && !isFullscreen}
        onEnterFullscreen={enterFullscreen}
        onTogglePalette={() => setShowPalette(!showPalette)}
        isNative={isNative}
        showNativeLockdownBanner={isNative && (import.meta.env.VITE_APP_SPIKE === 'true' || import.meta.env.VITE_APP_SPIKE === true)}
      />

      <ExamInterruptionOverlays
        loadWarning={loadWarning}
        clientVision={clientVision}
        vision={vision}
        screenRecordingRequired={screenRecordingRequired}
        screenShareBlocked={screenShareBlocked}
        screenShareLost={screenShareLost}
        onReshareScreen={() => void reshareScreen()}
        micRequired={micRequired}
        micBlocked={micBlocked}
        onRetryMic={() => void handleRetryMic()}
        authReconnecting={authReconnecting}
        socketConnecting={socketConnecting}
        socketReconnecting={socketReconnecting}
        proctorWarning={proctorWarning}
        onDismissProctorWarning={() => setProctorWarning('')}
        browserLockdownEnabled={browserLockdownEnabled}
        isFullscreen={isFullscreen}
        onEnterFullscreen={enterFullscreen}
        violationLock={violationLock}
        isNative={isNative}
      />

      <div className="relative z-10 flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto exam-question-scroll-panel">
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

            <ExamActionBar
              currentIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
              isMarkedForReview={markedForReview?.has(currentQuestion?.id)}
              onPrevious={handlePrevious}
              onMarkForReview={handleMarkForReview}
              onNext={handleNext}
              onSubmit={handleSubmit}
            />

            <div className="mt-6 p-4 bg-muted/50 rounded-lg desktop-keyboard-shortcuts">
              <p className="text-xs text-muted-foreground">
                <strong>Keyboard Shortcuts:</strong> Arrow Left (Previous) | Arrow Right (Next) | M (Mark for Review)
              </p>
            </div>
          </div>
        </div>

        <aside className="exam-security-sidebar lg:w-80 lg:border-l lg:border-border lg:bg-card lg:overflow-y-auto">
          <div className="hidden lg:block">
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
          </div>
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
        </aside>
      </div>

      {showPalette && (
        <div className="fixed inset-0 bg-black/50 z-50 lg:hidden" onClick={() => setShowPalette(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-card shadow-xl overflow-y-auto exam-palette-drawer"
            onClick={(e) => e?.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Questions</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowPalette(false)} className="touch-target">
                <Icon name="X" size={20} />
              </Button>
            </div>
            <QuestionPalette
              questions={sourceExam?.questions}
              currentIndex={currentQuestionIndex}
              answers={answers}
              markedForReview={markedForReview}
              onQuestionSelect={(idx) => {
                handleQuestionSelect(idx);
                setShowPalette(false);
              }}
              answeredCount={answeredCount}
              reviewCount={reviewCount}
              unansweredCount={unansweredCount}
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

      {Boolean(sourceExam?.pilot_mode || securityConfig?.pilotMode || securityConfig?.pilot_mode) && (
        <PilotScenarioPanel />
      )}

      {showReportProblem && (
        <ReportProblemModal
          examId={examId || sourceExam?.id}
          sessionId={sessionId}
          onClose={() => setShowReportProblem(false)}
        />
      )}
    </div>
    </>
  );
};

export default ExamPortal;
