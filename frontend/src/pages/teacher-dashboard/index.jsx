import React, { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { useLogout } from '../../context/SessionContext';
import RoleBasedHeader from '../../components/ui/RoleBasedHeader';
import SecurityBadgeDisplay from '../../components/ui/SecurityBadgeDisplay';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import ActiveExamCard from './components/ActiveExamCard';
import ScheduledExamCard from './components/ScheduledExamCard';
import CompletedExamCard from './components/CompletedExamCard';
import StatisticsPanel from './components/StatisticsPanel';
import QuickActionsPanel from './components/QuickActionsPanel';
import { apiRequest } from '../../services/api';
import { apiDelete, apiGet, apiPost, apiPut } from '../../services/httpClient';

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('scheduled');
  const { logout } = useLogout();
  const { isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [activeExams, setActiveExams] = useState([]);
  const [scheduledExams, setScheduledExams] = useState([]);
  const [completedExams, setCompletedExams] = useState([]);
  const [statistics, setStatistics] = useState({});

  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingScheduled, setLoadingScheduled] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingExam, setDeletingExam] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState(null);
  const [releasingResults, setReleasingResults] = useState(false);

  const callApi = async (path, method = 'GET', body = null) => {
    if (auth0Authenticated) {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: auth0Audience,
        },
      });
      return apiRequest(path, method, body, token);
    }

    if (method === 'GET') return apiGet(path);
    if (method === 'POST') return apiPost(path, body);
    if (method === 'PUT') return apiPut(path, body);
    if (method === 'DELETE') return apiDelete(path);
    return apiRequest(path, method, body);
  };

  const tabs = [
    { id: 'active', label: 'Active Exams', icon: 'PlayCircle', count: activeExams.length },
    { id: 'scheduled', label: 'Scheduled Exams', icon: 'Calendar', count: scheduledExams.length },
    { id: 'completed', label: 'Completed Exams', icon: 'CheckCircle', count: completedExams.length },
  ];

  const fetchExams = async () => {
    try {
      setLoadingScheduled(true);
      const exams = await callApi('/exams/', 'GET');
      const arr = Array.isArray(exams) ? exams : [];
      setActiveExams(arr.filter((e) => e?.status === 'ACTIVE'));
      setScheduledExams(arr.filter((e) => e?.status === 'SCHEDULED'));
      setCompletedExams(arr.filter((e) => e?.status === 'ENDED'));
      setErrorMessage('');
    } catch (error) {
      setActiveExams([]);
      setScheduledExams([]);
      setCompletedExams([]);
      setErrorMessage(error?.detail || error?.message || 'Failed to load exams');
    } finally {
      setLoadingScheduled(false);
    }
  };

  useEffect(() => {
    document.title = 'Teacher Dashboard - SmartProctor';
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchDashboard = async () => {
      await fetchExams();

      if (!mounted) return;
      setStatistics({});
    };

    fetchDashboard();
    return () => {
      mounted = false;
    };
  }, [auth0Authenticated]);

  const openCreateWizard = () => navigate('/exam-creation');
  const openEditWizard = (exam) => navigate(`/exam-creation?edit=${encodeURIComponent(exam.id)}`);

  const confirmDelete = (exam) => {
    setDeleteTarget(exam);
    setReleaseTarget(null);
    setErrorMessage('');
    setStatusMessage('');
  };

  const confirmRelease = (exam) => {
    setReleaseTarget(exam);
    setDeleteTarget(null);
    setErrorMessage('');
    setStatusMessage('');
  };

  const deleteExam = async () => {
    if (!deleteTarget) return;
    setDeletingExam(true);
    try {
      await callApi(`/exams/${deleteTarget.id}`, 'DELETE');
      setStatusMessage('Exam deleted successfully');
      setDeleteTarget(null);
      await fetchExams();
    } catch (error) {
      setErrorMessage(error?.detail || error?.message || 'Failed to delete exam');
    } finally {
      setDeletingExam(false);
    }
  };

  const releaseResults = async () => {
    if (!releaseTarget) return;
    setReleasingResults(true);
    try {
      const response = await callApi(`/exams/${releaseTarget.id}/publish-results`, 'PATCH');
      setCompletedExams((prev) =>
        prev.map((item) =>
          item?.id === releaseTarget?.id ? { ...item, results_visible: true } : item
        )
      );
      if (response?.already_released) {
        setStatusMessage('Results were already released');
      } else {
        setStatusMessage('Results released to students');
      }
      setReleaseTarget(null);
    } catch (error) {
      setErrorMessage(error?.detail || error?.message || 'Failed to release results');
    } finally {
      setReleasingResults(false);
    }
  };

  return (
    <>
      <RoleBasedHeader userRole="teacher" onLogout={async () => { await logout(false); }} />

      <main className="pt-20 pb-8">
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 lg:px-8">
          <div className="mb-6 md:mb-8">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-heading font-semibold text-foreground mb-2">
              Teacher Dashboard
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Monitor active exams, manage schedules, and review assessment results
            </p>
          </div>

          {statusMessage && (
            <div className="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
              {statusMessage}
            </div>
          )}
          {errorMessage && (
            <div className="mb-4 rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 lg:gap-8">
            <div className="lg:col-span-8 xl:col-span-9 space-y-4 md:space-y-6">
              <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden">
                <div className="border-b border-border overflow-x-auto">
                  <div className="flex items-center min-w-max">
                    {tabs?.map((tab) => (
                      <button
                        key={tab?.id}
                        onClick={() => setActiveTab(tab?.id)}
                        className={`flex items-center space-x-2 px-4 md:px-6 py-3 md:py-4 text-sm md:text-base font-medium transition-smooth border-b-2 shrink-0 ${
                          activeTab === tab?.id
                            ? 'border-primary text-primary bg-primary/5'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                      >
                        <Icon name={tab?.icon} size={18} />
                        <span>{tab?.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            activeTab === tab?.id
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {tab?.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 md:p-6">
                  {activeTab === 'active' && (
                    <div className="space-y-4 md:space-y-6">
                      {activeExams.length === 0 ? (
                        <div className="text-center py-12 md:py-16">
                          <div className="w-16 h-16 md:w-20 md:h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icon name="PlayCircle" size={32} className="text-muted-foreground" />
                          </div>
                          <h3 className="text-base md:text-lg font-heading font-semibold text-foreground mb-2">
                            No Active Exams
                          </h3>
                          <p className="text-sm md:text-base text-muted-foreground">
                            There are no exams currently in progress
                          </p>
                        </div>
                      ) : (
                        activeExams.map((exam) => <ActiveExamCard key={exam?.id} exam={exam} />)
                      )}
                    </div>
                  )}

                  {activeTab === 'scheduled' && (
                    <div className="space-y-4 md:space-y-6">
                      <div className="flex items-center justify-end">
                        <Button onClick={openCreateWizard} iconName="Plus" size="sm">
                          Create Exam
                        </Button>
                      </div>

                      {loadingScheduled ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">Loading exams...</div>
                      ) : scheduledExams.length === 0 ? (
                        <div className="text-center py-12 md:py-16">
                          <div className="w-16 h-16 md:w-20 md:h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icon name="Calendar" size={32} className="text-muted-foreground" />
                          </div>
                          <h3 className="text-base md:text-lg font-heading font-semibold text-foreground mb-2">
                            No Scheduled Exams
                          </h3>
                          <p className="text-sm md:text-base text-muted-foreground">
                            Create your first exam to get started
                          </p>
                        </div>
                      ) : (
                        scheduledExams.map((exam) => (
                          <ScheduledExamCard
                            key={exam?.id}
                            exam={exam}
                            onEdit={openEditWizard}
                            onDelete={confirmDelete}
                          />
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'completed' && (
                    <div className="space-y-4 md:space-y-6">
                      {completedExams.length === 0 ? (
                        <div className="text-center py-12 md:py-16">
                          <div className="w-16 h-16 md:w-20 md:h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icon name="CheckCircle" size={32} className="text-muted-foreground" />
                          </div>
                          <h3 className="text-base md:text-lg font-heading font-semibold text-foreground mb-2">
                            No Completed Exams
                          </h3>
                          <p className="text-sm md:text-base text-muted-foreground">
                            Completed exams will appear here
                          </p>
                        </div>
                      ) : (
                        completedExams.map((exam) => (
                          <CompletedExamCard
                            key={exam?.id}
                            exam={exam}
                            onReleaseResults={confirmRelease}
                            releasing={releasingResults && releaseTarget?.id === exam?.id}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 xl:col-span-3 space-y-4 md:space-y-6">
              <QuickActionsPanel onCreateExam={openCreateWizard} />
              <StatisticsPanel statistics={statistics || {}} />
            </div>
          </div>
        </div>
      </main>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => (!deletingExam ? setDeleteTarget(null) : null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Delete Exam</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Delete <span className="font-medium text-foreground">{deleteTarget.title}</span>? This cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deletingExam}>
                  Cancel
                </Button>
                <Button type="button" variant="danger" loading={deletingExam} onClick={deleteExam}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {releaseTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => (!releasingResults ? setReleaseTarget(null) : null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Release Results</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Release results for <span className="font-medium text-foreground">{releaseTarget.title}</span>?
              </p>
              <p className="text-xs text-warning">
                Students will be able to view declared scores. You can release even if some attempts are not evaluated.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setReleaseTarget(null)} disabled={releasingResults}>
                  Cancel
                </Button>
                <Button type="button" variant="default" loading={releasingResults} onClick={releaseResults}>
                  Release
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SecurityBadgeDisplay variant="footer" />
    </>
  );
};

export default TeacherDashboard;
