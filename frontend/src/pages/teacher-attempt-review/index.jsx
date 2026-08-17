import React, { useEffect, useMemo, useState } from 'react';
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

const TeacherAttemptReviewPage = () => {
  const navigate = useNavigate();
  const { examId, attemptId } = useParams();
  const { isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);
  const [enableRegrade, setEnableRegrade] = useState(false);
  const [drafts, setDrafts] = useState({});

  const callApi = ({ path, method = 'GET', body = null }) =>
    authAwareCall({
      path,
      method,
      body,
      auth0Authenticated,
      getAccessTokenSilently,
      auth0Audience,
    });

  const loadReview = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await callApi({
        path: `/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(attemptId)}`,
        method: 'GET',
      });
      setReview(data || null);
      setDrafts({});
      setEnableRegrade(false);
    } catch (err) {
      setError(err?.detail || err?.message || 'Failed to load attempt review');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'Attempt Review - SmartProctor';
  }, []);

  useEffect(() => {
    if (examId && attemptId) {
      void loadReview();
    }
  }, [examId, attemptId, auth0Authenticated]);

  const readOnly = useMemo(() => {
    if (!review) return true;
    return Boolean(review.read_only) && !enableRegrade;
  }, [review, enableRegrade]);

  const updateDraft = (questionId, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {}),
        [field]: value,
      },
    }));
  };

  const saveGrades = async () => {
    if (!review || readOnly) return;
    const questionScores = [];

    for (const question of review.questions || []) {
      const draft = drafts?.[question.question_id];
      if (!draft) continue;

      const maxMarks = Number(question.max_marks || 0);
      const hasManual = draft.manual !== '' && draft.manual != null;
      const hasOverride = draft.override !== '' && draft.override != null;

      if (!hasManual && !hasOverride) continue;

      const manualNum = hasManual ? Number(draft.manual) : null;
      const overrideNum = hasOverride ? Number(draft.override) : null;

      if ((hasManual && (!Number.isFinite(manualNum) || manualNum < 0 || manualNum > maxMarks))
        || (hasOverride && (!Number.isFinite(overrideNum) || overrideNum < 0 || overrideNum > maxMarks))) {
        setError(`Invalid score for question "${question.question_text}".`);
        return;
      }

      questionScores.push({
        question_id: question.question_id,
        manual_score: hasManual ? Math.round(manualNum) : null,
        override_score: hasOverride ? Math.round(overrideNum) : null,
      });
    }

    setSaving(true);
    setError('');
    try {
      await callApi({
        path: `/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(attemptId)}/grade`,
        method: 'PATCH',
        body: {
          expected_grading_version: review.grading_version,
          question_scores: questionScores,
        },
      });
      await loadReview();
    } catch (err) {
      setError(err?.detail || err?.message || 'Failed to save grades');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="pt-20 pb-8">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-heading font-semibold text-foreground">
              Attempt Review
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {review ? `${review.exam_title} - ${review.student_id}` : 'Review and grade submitted responses'}
            </p>
          </div>
          <Button variant="outline" iconName="ArrowLeft" onClick={() => navigate(`/teacher-dashboard/completed/${encodeURIComponent(examId)}/analytics`)}>
            Back to Analytics
          </Button>
        </div>

        {loading && (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading attempt...
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
              <div className="flex items-center gap-2">
                {review.read_only && (
                  <Button variant="outline" size="sm" onClick={() => setEnableRegrade((prev) => !prev)}>
                    {enableRegrade ? 'Disable Re-grade' : 'Enable Re-grade'}
                  </Button>
                )}
                <Button size="sm" loading={saving} disabled={readOnly} onClick={saveGrades}>
                  Save Grades
                </Button>
              </div>
            </div>

            {(review.questions || []).map((question, idx) => {
              const draft = drafts?.[question.question_id] || {};
              const isObjective = Boolean(question.is_objective);
              const currentManual = draft.manual ?? '';
              const currentOverride = draft.override ?? '';
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
                    <span className="font-medium">Student answer:</span> {renderValue(question.student_answer)}
                  </div>
                  {isObjective && (
                    <div className="text-sm text-foreground">
                      <span className="font-medium">Correct answer:</span> {renderValue(question.correct_answer)}
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {!isObjective && (
                      <label className="text-sm text-foreground">
                        Manual score
                        <input
                          type="number"
                          min="0"
                          max={question.max_marks}
                          step="1"
                          disabled={readOnly}
                          value={currentManual}
                          onChange={(e) => updateDraft(question.question_id, 'manual', e.target.value)}
                          className="w-full mt-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                          placeholder="Enter score"
                        />
                      </label>
                    )}
                    {isObjective && (
                      <label className="text-sm text-foreground">
                        Override score (optional)
                        <input
                          type="number"
                          min="0"
                          max={question.max_marks}
                          step="1"
                          disabled={readOnly}
                          value={currentOverride}
                          onChange={(e) => updateDraft(question.question_id, 'override', e.target.value)}
                          className="w-full mt-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                          placeholder="Override auto score"
                        />
                      </label>
                    )}
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

export default TeacherAttemptReviewPage;
