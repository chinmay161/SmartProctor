import React, { Suspense } from "react";
import { BrowserRouter, Routes as RouterRoutes, Route } from "react-router-dom";
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute';
import { DashboardSkeleton } from './components/ui/Skeleton';
import NativeAuthHandler from './components/auth/NativeAuthHandler';
import { isNativeApp } from './utils/platform';
import { lazyWithRetry } from './utils/lazyWithRetry';

// Route components split via lazyWithRetry
const LandingPage = lazyWithRetry(() => import('./pages/landing'), 'LandingPage');
const Login = lazyWithRetry(() => import('./pages/login'), 'Login');
const Signup = lazyWithRetry(() => import('./pages/signup'), 'Signup');
const NotFound = lazyWithRetry(() => import('./pages/NotFound'), 'NotFound');
const AdminPanel = lazyWithRetry(() => import('./pages/admin-panel'), 'AdminPanel');
const QuestionBankManagement = lazyWithRetry(() => import('./pages/question-bank-management'), 'QuestionBankManagement');
const ExamCreation = lazyWithRetry(() => import('./pages/exam-creation'), 'ExamCreation');
const StudentDashboard = lazyWithRetry(() => import('./pages/student-dashboard'), 'StudentDashboard');
const StudentResultReviewPage = lazyWithRetry(() => import('./pages/student-result-review'), 'StudentResultReviewPage');
const TeacherDashboard = lazyWithRetry(() => import('./pages/teacher-dashboard'), 'TeacherDashboard');
const TeacherExamAnalyticsPage = lazyWithRetry(() => import('./pages/teacher-exam-analytics'), 'TeacherExamAnalyticsPage');
const TeacherAttemptReviewPage = lazyWithRetry(() => import('./pages/teacher-attempt-review'), 'TeacherAttemptReviewPage');
const TeacherViolationReportPage = lazyWithRetry(() => import('./pages/teacher-violation-report'), 'TeacherViolationReportPage');
const ExamPortal = lazyWithRetry(() => import('./pages/exam-portal'), 'ExamPortal');
const TeacherMonitoringPage = lazyWithRetry(() => import('./pages/exam-monitoring'), 'TeacherMonitoringPage');
const AppSpikeBenchmark = lazyWithRetry(() => import('./pages/app-spike'), 'AppSpikeBenchmark');
const ExamLockSpikePage = lazyWithRetry(() => import('./pages/app-spike/ExamLockSpikePage'), 'ExamLockSpikePage');
const UseWebVersionPage = lazyWithRetry(() => import('./pages/native-guard/UseWebVersionPage'), 'UseWebVersionPage');
const SettingsPage = lazyWithRetry(() => import('./pages/settings'), 'SettingsPage');

const isAppSpike = import.meta.env.VITE_APP_SPIKE === 'true' || import.meta.env.DEV;

const Routes = () => {
  const isNative = isNativeApp();

  return (
    <BrowserRouter>
      <NativeAuthHandler />
      <ErrorBoundary>
        <ScrollToTop />
        <Suspense fallback={<DashboardSkeleton />}>
          <RouterRoutes>
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
            {/* Native Guard Route */}
            <Route
              path="/use-web-version"
              element={<UseWebVersionPage />}
            />
            {/* Settings & Update Screen */}
            <Route
              path="/settings"
              element={<SettingsPage />}
            />
            {/* Root Route: LandingPage for normal web browsers, Login for Capacitor native app */}
            <Route
              path="/"
              element={
                isNative ? (
                  <PublicRoute component={Login} redirectPath="/student-dashboard" />
                ) : (
                  <LandingPage />
                )
              }
            />
            <Route
              path="/login"
              element={<PublicRoute component={Login} redirectPath="/student-dashboard" />}
            />
            <Route
              path="/signup"
              element={<PublicRoute component={Signup} redirectPath="/student-dashboard" />}
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
