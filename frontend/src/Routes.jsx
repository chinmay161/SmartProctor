import React from "react";
import { BrowserRouter, Routes as RouterRoutes, Route } from "react-router-dom";
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute';
import NotFound from './pages/NotFound';
import AdminPanel from './pages/admin-panel';
import Login from './pages/login';
import Signup from './pages/signup';
import QuestionBankManagement from './pages/question-bank-management';
import ExamCreation from './pages/exam-creation';
import StudentDashboard from './pages/student-dashboard';
import TeacherDashboard from './pages/teacher-dashboard';
import TeacherExamAnalyticsPage from './pages/teacher-exam-analytics';
import TeacherAttemptReviewPage from './pages/teacher-attempt-review';
import TeacherViolationReportPage from './pages/teacher-violation-report';
import ExamPortal from './pages/exam-portal';

const Routes = () => {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ScrollToTop />
        <RouterRoutes>
          {/* Public Routes */}
          <Route 
            path="/" 
            element={<PublicRoute component={Login} redirectPath="/student-dashboard" />} 
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
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default Routes;
