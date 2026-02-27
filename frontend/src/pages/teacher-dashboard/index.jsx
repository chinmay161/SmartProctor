import React, { useState, useEffect } from 'react';
import { useLogout } from '../../context/SessionContext';
import RoleBasedHeader from '../../components/ui/RoleBasedHeader';
import SecurityBadgeDisplay from '../../components/ui/SecurityBadgeDisplay';
import Icon from '../../components/AppIcon';
import ActiveExamCard from './components/ActiveExamCard';
import ScheduledExamCard from './components/ScheduledExamCard';
import CompletedExamCard from './components/CompletedExamCard';
import StatisticsPanel from './components/StatisticsPanel';
import QuickActionsPanel from './components/QuickActionsPanel';

const TeacherDashboard = () => {
  const [activeTab, setActiveTab] = useState('active');
  const { logout } = useLogout();

  const [activeExams, setActiveExams] = useState(null);
    const [scheduledExams, setScheduledExams] = useState([]);
  const [completedExams, setCompletedExams] = useState(null);
  const [statistics, setStatistics] = useState(null);

  // backend-driven: no inline mock datasets

  const tabs = [
    { id: 'active', label: 'Active Exams', icon: 'PlayCircle', count: (activeExams || [])?.length },
    { id: 'scheduled', label: 'Scheduled Exams', icon: 'Calendar', count: (scheduledExams || [])?.length },
    { id: 'completed', label: 'Completed Exams', icon: 'CheckCircle', count: (completedExams || [])?.length }
  ];

  useEffect(() => {
    document.title = 'Teacher Dashboard - SmartProctor';
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchDashboard = async () => {
      try {
        const exams = await import('../../services/httpClient').then(m => m.apiGet('/api/exams'));
        if (!mounted) return;
        setScheduledExams(exams || []);
      } catch (err) {
        setScheduledExams([]);
      }

      try {
        const sessions = await import('../../services/authService').then(m => m.getActiveSessions());
        if (!mounted) return;
        if (sessions && sessions.length) {
          const grouped = {};
          sessions.forEach(s => {
            const key = s.exam_id || s.examId || 'unknown';
            if (!grouped[key]) grouped[key] = { id: key, title: s.exam_title || 'Live Exam', studentPreviews: [] };
            grouped[key].studentPreviews.push({ id: s.session_id || s.id, name: s.user_id || s.student_id || 'Student', status: s.status || 'active', violations: s.violations || 0 });
          });
          setActiveExams(Object.values(grouped));
        } else {
          setActiveExams([]);
        }
      } catch (err) {
        setActiveExams([]);
      }

      try {
        const userId = await import('../../services/authService').then(s => s.getCurrentUserId());
        const resp = await import('../../services/httpClient').then(m => m.apiGet('/api/sessions/user/' + userId + '/all'));
        if (!mounted) return;
        setCompletedExams(resp?.sessions?.slice(0, 5) || []);
      } catch (err) {
        setCompletedExams([]);
      }

      try {
        const stats = await import('../../services/httpClient').then(m => m.apiGet('/api/admin/statistics'));
        if (!mounted) return;
        setStatistics(stats || {});
      } catch (err) {
        setStatistics({});
      }
    };

    fetchDashboard();
    return () => { mounted = false; };
  }, []);

  return (
    <>
        <RoleBasedHeader
          userRole="teacher"
          onLogout={async () => { await logout(false); }}
        />

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
                              ? 'border-primary text-primary bg-primary/5' :'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          }`}
                        >
                          <Icon name={tab?.icon} size={18} />
                          <span>{tab?.label}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            activeTab === tab?.id
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {tab?.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 md:p-6">
                    {activeTab === 'active' && (
                      <div className="space-y-4 md:space-y-6">
                        {(activeExams || [])?.length === 0 ? (
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
                          (activeExams || [])?.map((exam) => (
                            <ActiveExamCard key={exam?.id} exam={exam} />
                          ))
                        )}
                      </div>
                    )}

                    {activeTab === 'scheduled' && (
                      <div className="space-y-4 md:space-y-6">
                        {(scheduledExams || [])?.length === 0 ? (
                          <div className="text-center py-12 md:py-16">
                            <div className="w-16 h-16 md:w-20 md:h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                              <Icon name="Calendar" size={32} className="text-muted-foreground" />
                            </div>
                            <h3 className="text-base md:text-lg font-heading font-semibold text-foreground mb-2">
                              No Scheduled Exams
                            </h3>
                            <p className="text-sm md:text-base text-muted-foreground">
                              You haven't scheduled any upcoming exams
                            </p>
                          </div>
                        ) : (
                          (scheduledExams || [])?.map((exam) => (
                            <ScheduledExamCard key={exam?.id} exam={exam} />
                          ))
                        )}
                      </div>
                    )}

                    {activeTab === 'completed' && (
                      <div className="space-y-4 md:space-y-6">
                        {(completedExams || [])?.length === 0 ? (
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
                          (completedExams || [])?.map((exam) => (
                            <CompletedExamCard key={exam?.id} exam={exam} />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 xl:col-span-3 space-y-4 md:space-y-6">
                <QuickActionsPanel />
                <StatisticsPanel statistics={statistics || {}} />
              </div>
            </div>
          </div>
        </main>

        <SecurityBadgeDisplay variant="footer" />
    </>
  );
};

export default TeacherDashboard;
