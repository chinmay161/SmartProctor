import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes as RouterRoutes, Route } from "react-router-dom";
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute';
import { DashboardSkeleton } from './components/ui/Skeleton';
import NativeAuthHandler from './components/auth/NativeAuthHandler';

// Lazy-loaded route components for chunk splitting
const LandingPage = lazy(() => import('./pages/landing'));
const Login = lazy(() => import('./pages/login'));
const Signup = lazy(() => import('./pages/signup'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AdminPanel = lazy(() => import('./pages/admin-panel'));
const QuestionBankManagement = lazy(() => import('./pages/question-bank-management'));
const ExamCreation = lazy(() => import('./pages/exam-creation'));
const StudentDashboard = lazy(() => import('./pages/student-dashboard'));
const StudentResultReviewPage = lazy(() => import('./pages/student-result-review'));
const TeacherDashboard = lazy(() => import('./pages/teacher-dashboard'));
const TeacherExamAnalyticsPage = lazy(() => import('./pages/teacher-exam-analytics'));
const TeacherAttemptReviewPage = lazy(() => import('./pages/teacher-attempt-review'));
const TeacherViolationReportPage = lazy(() => import('./pages/teacher-violation-report'));
const ExamPortal = lazy(() => import('./pages/exam-portal'));
const TeacherMonitoringPage = lazy(() => import('./pages/exam-monitoring'));
const HeadPoseDiagnosticPage = lazy(() => import('./pages/headpose-diagnostic'));
const AppSpikeBenchmark = lazy(() => import('./pages/app-spike'));
const ExamLockSpikePage = lazy(() => import('./pages/app-spike/ExamLockSpikePage'));
const UseWebVersionPage = lazy(() => import('./pages/native-guard/UseWebVersionPage'));

const isAppSpike = import.meta.env.VITE_APP_SPIKE === 'true' || import.meta.env.DEV;

const Routes = () => {
  return (
    <BrowserRouter>
      <NativeAuthHandler />
      <ErrorBoundary>
        <ScrollToTop />
        <Suspense fallback={<DashboardSkeleton />}>
          <RouterRoutes>
            {/* Native Guard Route */}
            <Route
              path="/use-web-version"
              element={<UseWebVersionPage />}
            />

            {/* App Spike & Lockdown Benchmark */}
            {isAppSpike && (
              <>
                <Route
                  path="/app-spike"
                  element={<AppSpikeBenchmark />}
                />
                <Route
                  path="/app-spike/lock"
                  element={<ExamLockSpikePage />}
                />
              </>
            )}

            {/* Public Routes */}
            <Route
              path="/"
              element={<PublicRoute component={LandingPage} />}
            />
            <Route 
              path="/login" 
              element={<PublicRoute component={Login} redirectPath="/student-dashboard" />} 
            />
            <Route 
              path="/signup" 
              element={<PublicRoute component={Signup} redirectPath="/student-dashboard" />} 
            />

            {/* Diagnostic Observability Platform Routes */}
            <Route 
              path="/debug/headpose" 
              element={<HeadPoseDiagnosticPage />} 
            />

            {/* Protected Routes - Student */}
            <Route
              path="/student-dashboard"
              element={<ProtectedRoute component={StudentDashboard} requiredRoles={['student']} />}
            />
            <Route
              path="/student-dashboard/results/:examId"
              element={<ProtectedRoute component={StudentResultReviewPage} requiredRoles={['student']} />}
            />
            <Route
              path="/exam-portal"
              element={<ProtectedRoute component={ExamPortal} requiredRoles={['student']} />}
            />

            {/* Protected Routes - Teacher/Instructor */}
            <Route
              path="/teacher-dashboard"
              element={<ProtectedRoute component={TeacherDashboard} requiredRoles={['teacher']} />}
            />
            <Route
              path="/teacher-dashboard/completed/:examId/analytics"
              element={<ProtectedRoute component={TeacherExamAnalyticsPage} requiredRoles={['teacher']} />}
            />
            <Route
              path="/teacher-dashboard/completed/:examId/attempts/:attemptId/review"
              element={<ProtectedRoute component={TeacherAttemptReviewPage} requiredRoles={['teacher']} />}
            />
            <Route
              path="/teacher-dashboard/completed/:examId/violation-report"
              element={<ProtectedRoute component={TeacherViolationReportPage} requiredRoles={['teacher']} />}
            />
            <Route
              path="/exam-monitoring/:examId"
              element={<ProtectedRoute component={TeacherMonitoringPage} requiredRoles={['teacher']} />}
            />

            <Route
              path="/exam-creation"
              element={<ProtectedRoute component={ExamCreation} requiredRoles={['teacher']} />}
            />
            <Route
              path="/question-bank-management"
              element={<ProtectedRoute component={QuestionBankManagement} requiredRoles={['teacher']} />}
            />

            {/* Protected Routes - Admin */}
            <Route
              path="/admin-panel"
              element={<ProtectedRoute component={AdminPanel} requiredRoles={['admin']} />}
            />

            {/* 404 - Not Found */}
            <Route path="*" element={<NotFound />} />
          </RouterRoutes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default Routes;
