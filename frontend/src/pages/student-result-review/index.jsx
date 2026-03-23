import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { authAwareCall } from '../../services/authAwareCall';
import Button from '../../components/ui/Button';

const renderValue = (value) => {
  if (value == null) return 'No answer submitted';
  if (typeof value === 'string') return value.trim() ? value : 'No answer submitted';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const renderAnswerValue = (question, value) => {
  const base = renderValue(value);
  const options = Array.isArray(question?.options) ? question.options : [];
  const raw = typeof value === 'string' ? value.trim() : '';

  if (!raw || options.length === 0) return base;

  const normalized = raw.toLowerCase();
  const indexedOption = options.find((option, index) => {
    const optionId = String(option?.id ?? String.fromCharCode(97 + index)).trim().toLowerCase();
    const optionText = String(option?.text ?? option ?? '').trim().toLowerCase();
    return normalized === optionId || normalized === optionText;
  });

  if (!indexedOption) return base;

  const optionIndex = options.indexOf(indexedOption);
  const optionId = String(indexedOption?.id ?? String.fromCharCode(97 + optionIndex)).toUpperCase();
  const optionText = String(indexedOption?.text ?? indexedOption ?? '').trim();
  return optionText ? `${optionId}. ${optionText}` : optionId;
};

const StudentResultReviewPage = () => {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);

  const callApi = ({ path, method = 'GET', body = null }) =>
    authAwareCall({
      path,
      method,
      body,
      auth0Authenticated,
      getAccessTokenSilently,
      auth0Audience,
    });

  useEffect(() => {
    document.title = 'Result Review - SmartProctor';
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadReview = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await callApi({
          path: `/results/${encodeURIComponent(examId)}/review`,
          method: 'GET',
        });
        if (mounted) {
          setReview(data || null);
        }
      } catch (err) {
        if (mounted) {
          setError(err?.detail || err?.message || 'Failed to load result review');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    if (examId) {
      void loadReview();
    }
    return () => {
      mounted = false;
    };
  }, [examId, auth0Authenticated]);

  return (
    <main className="pt-20 pb-8">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-heading font-semibold text-foreground">
              Result Review
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {review ? `${review.exam_title} - your submitted answers` : 'Review your answers and grading'}
            </p>
          </div>
          <Button variant="outline" iconName="ArrowLeft" onClick={() => navigate('/student-dashboard')}>
            Back to Dashboard
          </Button>
        </div>

        {loading && (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading result review...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {!loading && review && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap gap-4 items-center justify-between">
              <div className="text-sm text-foreground">
                <span className="font-medium">Status:</span> {review.status}
                <span className="mx-3 text-muted-foreground">|</span>
                <span className="font-medium">Score:</span> {review.score ?? 0} / {review.max_score_total ?? 0}
              </div>
            </div>

            {(review.questions || []).map((question, idx) => {
              const studentAnswer = renderAnswerValue(question, question.student_answer);
              const correctAnswer = renderAnswerValue(question, question.correct_answer);
              const answerWrong = Boolean(
                question.is_objective
                && question.student_answer != null
                && question.final_score !== question.max_marks
              );

              return (
                <div key={`${question.question_id}-${idx}`} className="bg-card border border-border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between gap-3">
                    <h2 className="text-base font-semibold text-foreground">
                      Q{idx + 1}. {question.question_text}
                    </h2>
                    <span className="text-xs text-muted-foreground">{question.max_marks} marks</span>
                  </div>

                  <div className="text-sm text-muted-foreground">Type: {question.question_type}</div>
                  <div className="text-sm text-foreground">
                    <span className="font-medium">Your answer:</span> {studentAnswer}
                  </div>
                  {question.is_objective && (
                    <div className="text-sm text-foreground">
                      <span className="font-medium">Correct answer:</span> {correctAnswer}
                    </div>
                  )}
                  {question.explanation && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
                      <span className="font-medium">Explanation:</span> {question.explanation}
                    </div>
                  )}
                  {answerWrong && (
                    <div className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                      This answer was marked incorrect.
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="text-sm text-foreground">
                      <span className="font-medium">Auto:</span> {question.auto_score ?? 'N/A'}
                    </div>
                    <div className="text-sm text-foreground">
                      <span className="font-medium">Manual:</span> {question.manual_score ?? 'N/A'}
                    </div>
                    <div className="text-sm text-foreground">
                      <span className="font-medium">Final:</span> {question.final_score ?? 'N/A'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
};

export default StudentResultReviewPage;
