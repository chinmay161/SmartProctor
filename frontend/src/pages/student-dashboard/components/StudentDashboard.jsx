import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useSession, useCurrentUser } from '../../../context/SessionContext';
import { authAwareCall } from '../../../services/authAwareCall';
import { sessionEvents } from '../../../services/tokenStorage';
import Button from '../../../components/ui/Button';

const StudentDashboardExample = () => {
  const navigate = useNavigate();
  const { logout, getTokenTimeRemaining, sessionId } = useSession();
  const { user } = useCurrentUser();
  const {
    user: auth0User,
    isAuthenticated: auth0Authenticated,
    logout: auth0Logout,
    getAccessTokenSilently,
  } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [exams, setExams] = useState([]);
  const [examHistory, setExamHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [historyStatus, setHistoryStatus] = useState('');
  const [tokenWarning, setTokenWarning] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());

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
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setLoadingHistory(true);
        setError(null);
        setHistoryError(null);

        const [availableResponse, historyResponse] = await Promise.all([
          callApi('/exams/available', 'GET'),
          callApi('/attempts/history', 'GET'),
        ]);

        setExams(Array.isArray(availableResponse) ? availableResponse : availableResponse?.exams || []);
        setExamHistory(Array.isArray(historyResponse) ? historyResponse : []);
      } catch (err) {
        const errorMsg = err?.detail || err?.message || 'Failed to load exams';
        setError(errorMsg);
      } finally {
        setLoading(false);
        setLoadingHistory(false);
      }
    };

    loadDashboardData();
  }, []);

  useEffect(() => {
    const checkTokenExpiration = () => {
      const timeRemaining = getTokenTimeRemaining();
      if (timeRemaining && timeRemaining < 300 && timeRemaining > 0) {
        setTokenWarning(true);
      } else {
        setTokenWarning(false);
      }
    };

    const interval = setInterval(checkTokenExpiration, 30000);
    checkTokenExpiration();

    const handleSessionExpired = () => {
      setError('Your session has expired. Please login again.');
    };

    sessionEvents.on('sessionExpired', handleSessionExpired);

    return () => {
      clearInterval(interval);
      sessionEvents.off('sessionExpired', handleSessionExpired);
    };
  }, [getTokenTimeRemaining]);

  useEffect(() => {
    const interval = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await logout(false);
      if (auth0Authenticated) {
        auth0Logout({
          logoutParams: {
            returnTo: `${window.location.origin}/login`,
          },
        });
        return;
      }
      navigate('/login');
    } catch {
      setError('Failed to logout. Please try again.');
    }
  };

  const handleStartExam = async (examId) => {
    try {
      const response = await callApi(`/sessions/${examId}/start`, 'POST', null);
      const sid = response?.session_id || response?.id;
      navigate(`/exam-portal?examId=${encodeURIComponent(examId)}${sid ? `&sessionId=${encodeURIComponent(sid)}` : ''}`);
    } catch (err) {
      setError(err?.detail || err?.message || 'Failed to start exam');
    }
  };

  const handleViewResult = async (historyItem) => {
    try {
      setHistoryStatus('');
      setHistoryError(null);

      if (!historyItem?.can_view_result) {
        setHistoryError('Result not declared yet.');
        return;
      }

      const result = await callApi(`/results/${encodeURIComponent(historyItem.exam_id)}`, 'GET');
      setHistoryStatus(
        `Result for "${historyItem.exam_title}": ${result?.score ?? '-'} / ${historyItem?.out_of ?? 0}`
      );
    } catch (err) {
      setHistoryError(err?.detail || err?.message || 'Failed to load result');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading exams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Student Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {auth0User?.name || auth0User?.nickname || user?.name || 'Student'}!
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground text-right">
              <p>Session: {sessionId?.slice(0, 8)}...</p>
              <p>Expires in: {Math.floor((getTokenTimeRemaining() || 0) / 60)} min</p>
            </div>
            <Button onClick={handleLogout} variant="outline">
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {tokenWarning && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">Session expiring soon</p>
              <p className="text-xs text-yellow-700 dark:text-yellow-500 mt-1">
                Your session will expire in {Math.floor((getTokenTimeRemaining() || 0) / 60)} minutes.
              </p>
            </div>
            <Button size="sm" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm font-medium text-red-800 dark:text-red-400">Error: {error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-xs text-red-700 dark:text-red-500 underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {historyStatus && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm font-medium text-green-800 dark:text-green-400">{historyStatus}</p>
          </div>
        )}
        {historyError && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm font-medium text-red-800 dark:text-red-400">History: {historyError}</p>
          </div>
        )}

        <div className="mb-8 p-6 bg-card border border-border rounded-lg">
          <h2 className="text-lg font-semibold text-foreground mb-4">Your Account</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="text-foreground font-medium">{auth0User?.name || auth0User?.nickname || user?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-foreground font-medium">{auth0User?.email || user?.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Role</p>
              <p className="text-foreground font-medium">{user?.roles?.join(', ') || 'student'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">User ID</p>
              <p className="text-foreground font-medium text-xs font-mono">
                {(auth0User?.sub || user?.id || 'N/A')?.toString()?.slice(0, 12)}
              </p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold text-foreground mb-6">Available Exams ({exams.length})</h2>

          {exams.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-lg">
              <p className="text-muted-foreground">No exams available right now</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {exams.map((exam) => (
                <ExamCard key={exam.id} exam={exam} nowTs={nowTs} onStart={() => handleStartExam(exam.id)} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-bold text-foreground mb-6">Exam History</h2>
          <HistorySection
            loading={loadingHistory}
            history={examHistory}
            onViewResult={handleViewResult}
          />
        </div>
      </main>
    </div>
  );
};

const HistorySection = ({ loading, history, onViewResult }) => {
  if (loading) {
    return (
      <div className="text-center py-8 bg-card border border-border rounded-lg">
        <p className="text-muted-foreground">Loading exam history...</p>
      </div>
    );
  }

  if (!history?.length) {
    return (
      <div className="text-center py-12 bg-card border border-border rounded-lg">
        <p className="text-muted-foreground">No completed exams yet</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Exam</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Submitted</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Score</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Action</th>
          </tr>
        </thead>
        <tbody>
          {history.map((item) => {
            const scoreText = `${item?.score ?? '-'} / ${item?.out_of ?? 0}`;
            return (
              <tr key={`${item.exam_id}-${item.started_at}`} className="border-b border-border/60 last:border-b-0">
                <td className="px-4 py-3 text-sm text-foreground font-medium">{item.exam_title}</td>
                <td className="px-4 py-3 text-sm text-foreground">{item.attempt_status}</td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {item?.submitted_at
                    ? new Date(item.submitted_at).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-foreground font-medium">{scoreText}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant={item?.can_view_result ? 'default' : 'outline'}
                    disabled={!item?.can_view_result}
                    onClick={() => onViewResult(item)}
                  >
                    View Result
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const ExamCard = ({ exam, nowTs, onStart }) => {
  const startTime = exam?.start_time ? new Date(exam.start_time) : null;
  const hasValidStart = Boolean(startTime && !Number.isNaN(startTime.getTime()));
  const canStartExam = !hasValidStart || nowTs >= startTime.getTime();

  return (
    <div className="p-6 bg-card border border-border rounded-lg hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground">{exam.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{exam.description || 'No description available'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Duration</p>
          <p className="text-foreground font-medium">
            {exam.duration_minutes ? `${exam.duration_minutes} min` : 'Not set'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Start Time</p>
          <p className="text-foreground font-medium">
            {hasValidStart
              ? startTime.toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Not scheduled'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Created</p>
          <p className="text-foreground font-medium">
            {exam.created_at ? new Date(exam.created_at).toLocaleDateString() : 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Exam ID</p>
          <p className="text-foreground font-medium text-xs font-mono truncate">{exam.id}</p>
        </div>
      </div>

      <Button
        onClick={onStart}
        className={`w-full ${canStartExam ? '' : 'bg-muted text-muted-foreground border border-border hover:bg-muted disabled:opacity-100'}`}
        disabled={!canStartExam}
      >
        Start Exam
      </Button>
    </div>
  );
};

export default StudentDashboardExample;
