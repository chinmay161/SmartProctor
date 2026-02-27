import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import QuestionPalette from './components/QuestionPalette';
import ExamTimer from './components/ExamTimer';
import SecurityMonitor from './components/SecurityMonitor';
import QuestionDisplay from './components/QuestionDisplay';
import SubmitConfirmationModal from './components/SubmitConfirmationModal';

const ExamPortal = () => {
  const navigate = useNavigate();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [examDataState, setExamDataState] = useState(null);
  const [answers, setAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState(new Set());
  const [showPalette, setShowPalette] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [violations, setViolations] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Mock exam data (fallback)
  const examData = {
    title: 'Mathematics Final Exam',
    course: 'Advanced Calculus - MATH 301',
    duration: 120, // minutes
    totalMarks: 100,
    questions: [
      {
        id: 1,
        type: 'multiple-choice',
        question: 'What is the derivative of f(x) = x² + 3x + 2?',
        options: [
          { id: 'a', text: '2x + 3' },
          { id: 'b', text: 'x + 3' },
          { id: 'c', text: '2x + 2' },
          { id: 'd', text: 'x² + 3' }
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

  const sourceExam = examDataState || examData;
  const currentQuestion = sourceExam?.questions?.[currentQuestionIndex];
  const totalQuestions = sourceExam?.questions?.length;

  useEffect(() => {
    let mounted = true;
    const fetchExam = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const examId = params.get('examId') || params.get('id');
        const sessionId = params.get('sessionId');

        if (sessionId) {
          const resp = await import('../../services/httpClient').then(m => m.apiGet(`/api/sessions/${sessionId}`));
          if (!mounted) return;
          if (resp?.exam) setExamDataState(resp.exam);
          else if (resp?.questions) setExamDataState({ ...resp, questions: resp.questions });
        } else if (examId) {
          const resp = await import('../../services/httpClient').then(m => m.apiGet(`/api/exams/${examId}`));
          if (!mounted) return;
          setExamDataState(resp);
        } else {
          const resp = await import('../../services/httpClient').then(m => m.apiGet('/api/exams/current'));
          if (!mounted) return;
          setExamDataState(resp);
        }
      } catch (err) {
        setExamDataState(null);
      }
    };

    fetchExam();
    return () => { mounted = false; };
  }, []);

  // Auto-save functionality
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      console.log('Auto-saving answers...', answers);
    }, 30000); // Auto-save every 30 seconds

    return () => clearInterval(autoSaveInterval);
  }, [answers]);

  // Fullscreen enforcement
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

  // Prevent right-click and copy-paste
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

  // Tab switch detection
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
    setViolations(prev => [...prev, newViolation]);
  };

  const handleAnswerChange = (questionId, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleMarkForReview = () => {
    setMarkedForReview(prev => {
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
    setShowSubmitModal(true);
  };

  const handleConfirmSubmit = () => {
    console.log('Exam submitted:', { answers, violations });
    navigate('/student-dashboard');
  };

  const enterFullscreen = () => {
    document.documentElement?.requestFullscreen?.();
  };

  const getQuestionStatus = (questionId) => {
    if (answers?.[questionId]) return 'answered';
    if (markedForReview?.has(questionId)) return 'review';
    return 'unanswered';
  };

  const answeredCount = Object.keys(answers)?.length;
  const reviewCount = markedForReview?.size;
  const unansweredCount = totalQuestions - answeredCount;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with Timer and Controls */}
      <div className="bg-card border-b border-border px-4 py-3 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Icon name="FileText" size={24} className="text-primary" />
            <div>
              <h1 className="text-base md:text-lg font-heading font-semibold text-foreground">
                {examData?.title}
              </h1>
              <p className="text-xs text-muted-foreground">{examData?.course}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <ExamTimer duration={examData?.duration} onTimeUp={handleSubmit} />
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
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Question Display Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
            {/* Progress Indicator */}
              <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  Question {currentQuestionIndex + 1} of {totalQuestions}
                </span>
                <span className="text-sm text-muted-foreground">
                  {currentQuestion?.marks} {currentQuestion?.marks === 1 ? 'mark' : 'marks'}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
                />
              </div>
            </div>

            {/* Question Content */}
            <QuestionDisplay
              question={currentQuestion}
              answer={answers?.[currentQuestion?.id]}
              onAnswerChange={(answer) => handleAnswerChange(currentQuestion?.id, answer)}
            />

            {/* Navigation Controls */}
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

            {/* Keyboard Shortcuts Info */}
            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <strong>Keyboard Shortcuts:</strong> Arrow Left (Previous) • Arrow Right (Next) • M (Mark for Review)
              </p>
            </div>
          </div>
        </div>

        {/* Question Palette Sidebar (Desktop) */}
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
      {/* Mobile Question Palette Overlay */}
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
      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <SubmitConfirmationModal
          answeredCount={answeredCount}
          unansweredCount={unansweredCount}
          reviewCount={reviewCount}
          totalQuestions={totalQuestions}
          onConfirm={handleConfirmSubmit}
          onCancel={() => setShowSubmitModal(false)}
        />
      )}
    </div>
  );
};

export default ExamPortal;