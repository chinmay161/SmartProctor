import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { authAwareCall } from '../../services/authAwareCall';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';

const TeacherExamAnalyticsPage = () => {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [attempts, setAttempts] = useState([]);

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
    document.title = 'Completed Exam Analytics - SmartProctor';
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadAnalytics = async () => {
      setLoading(true);
      setError('');
      try {
        const [data, attemptData] = await Promise.all([
          callApi({
            path: `/exams/${encodeURIComponent(examId)}/analytics`,
            method: 'GET',
          }),
          callApi({
            path: `/exams/${encodeURIComponent(examId)}/attempts`,
            method: 'GET',
          }),
        ]);
        if (mounted) {
          setAnalytics(data || null);
          setAttempts(Array.isArray(attemptData) ? attemptData : []);
        }
      } catch (err) {
        if (mounted) setError(err?.detail || err?.message || 'Failed to load analytics');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (examId) loadAnalytics();
    return () => {
      mounted = false;
    };
  }, [examId, auth0Authenticated]);

  const openAttemptReview = (attempt) => {
    if (!attempt?.attempt_id) return;
    navigate(`/teacher-dashboard/completed/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(attempt.attempt_id)}/review`);
  };

  const gradeDistribution = analytics?.grade_distribution || { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const gradeItems = [
    { grade: 'A', count: gradeDistribution.A, color: 'bg-success' },
    { grade: 'B', count: gradeDistribution.B, color: 'bg-primary' },
    { grade: 'C', count: gradeDistribution.C, color: 'bg-accent' },
    { grade: 'D', count: gradeDistribution.D, color: 'bg-warning' },
    { grade: 'F', count: gradeDistribution.F, color: 'bg-error' },
  ];
  const totalGraded = gradeItems.reduce((acc, item) => acc + (item.count || 0), 0);

  return (
    <main className="pt-20 pb-8">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-heading font-semibold text-foreground">
              Completed Exam Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {analytics?.title || 'Exam analytics and participation summary'}
            </p>
          </div>
          <Button variant="outline" iconName="ArrowLeft" onClick={() => navigate('/teacher-dashboard')}>
            Back to Teacher Dashboard
          </Button>
        </div>

        {loading && (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading analytics...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {!loading && !error && analytics && !analytics.analytics_available && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <div className="w-14 h-14 bg-muted rounded-full mx-auto mb-3 flex items-center justify-center">
              <Icon name="BarChart3" size={26} className="text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Analytics Not Available Yet</h2>
            <p className="text-sm text-muted-foreground">
              Analytics will appear after attempts are submitted.
            </p>
          </div>
        )}

        {!loading && !error && analytics && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Attempts" value={analytics.attempt_count} icon="Users" />
              <StatCard label="Submitted" value={analytics.submitted_count} icon="FileCheck2" />
              <StatCard label="Evaluated" value={analytics.evaluated_count} icon="ClipboardCheck" />
              <StatCard label="Not Started" value={analytics.not_started_count} icon="CircleOff" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard
                label="Average Score"
                value={analytics.average_score_percent == null ? 'N/A' : `${analytics.average_score_percent}%`}
                icon="TrendingUp"
              />
              <StatCard
                label="Highest Score"
                value={analytics.highest_score_percent == null ? 'N/A' : `${analytics.highest_score_percent}%`}
                icon="Award"
              />
              <StatCard
                label="Lowest Score"
                value={analytics.lowest_score_percent == null ? 'N/A' : `${analytics.lowest_score_percent}%`}
                icon="TrendingDown"
              />
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h2 className="text-sm md:text-base font-semibold text-foreground mb-3">Grade Distribution</h2>
              <div className="space-y-2">
                {gradeItems.map((item) => {
                  const pct = totalGraded > 0 ? Math.round((item.count / totalGraded) * 100) : 0;
                  return (
                    <div key={item.grade} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-foreground w-6">{item.grade}</span>
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div className={`h-full ${item.color}`} style={{ width: `${pct}%` }}></div>
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">{item.count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard label="Total Violations" value={analytics.total_violations} icon="AlertTriangle" />
              <StatCard
                label="Avg Completion Time"
                value={analytics.average_completion_minutes == null ? 'N/A' : `${analytics.average_completion_minutes} min`}
                icon="Clock3"
              />
              <StatCard
                label="Results Status"
                value={analytics.results_visible ? 'Released' : 'Not Released'}
                icon={analytics.results_visible ? 'CheckCircle2' : 'Lock'}
              />
            </div>

            <div className="bg-card border border-border rounded-lg overflow-x-auto">
              <div className="p-4 border-b border-border">
                <h2 className="text-sm md:text-base font-semibold text-foreground">Attempt Review</h2>
                <p className="text-xs text-muted-foreground mt-1">Review each attempt to inspect auto-grading and complete manual grading.</p>
              </div>
              {!attempts.length ? (
                <div className="p-6 text-sm text-muted-foreground">No attempts found for this exam.</div>
              ) : (
                <table className="w-full min-w-[780px]">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Student</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Score</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Violations</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((attempt) => (
                      <tr key={attempt.attempt_id} className="border-b border-border/60 last:border-b-0">
                        <td className="px-4 py-3 text-sm text-foreground">{attempt.student_id}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{attempt.status}</td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {attempt.score == null
                            ? 'N/A'
                            : `${attempt.score}${attempt.max_score_total ? ` / ${attempt.max_score_total}` : ''}`}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">{attempt.violation_count ?? 0}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => openAttemptReview(attempt)}
                          >
                            {attempt.status === 'EVALUATED' ? 'View' : 'Review'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

const StatCard = ({ label, value, icon }) => (
  <div className="bg-card border border-border rounded-lg p-4">
    <div className="flex items-center gap-2 mb-1">
      <Icon name={icon} size={16} className="text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
    <div className="text-lg md:text-xl font-semibold text-foreground">{value}</div>
  </div>
);

export default TeacherExamAnalyticsPage;
