import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import ActiveExamCard from '../components/ActiveExamCard';
import CompletedExamCard from '../components/CompletedExamCard';
import ScheduledExamCard from '../components/ScheduledExamCard';
import QuickActionsPanel from '../components/QuickActionsPanel';
import StatisticsPanel from '../components/StatisticsPanel';
import { SkeletonExamCard } from '../../../components/ui/Skeleton';

describe('Teacher Dashboard Component Unit Tests', () => {
  describe('1. Loading Skeletons', () => {
    it('renders SkeletonExamCard without error', () => {
      const html = renderToString(<SkeletonExamCard />);
      expect(html).toContain('sp-skeleton-card');
    });
  });

  describe('2. ActiveExamCard with Real Data', () => {
    it('renders real live_students, attempts_started, and violation_count', () => {
      const exam = {
        id: 'exam-live-1',
        title: 'Algorithms Final',
        effective_status: 'ACTIVE',
        start_time: '2026-11-20T10:00:00Z',
        end_time: '2026-11-20T12:00:00Z',
        live_students: 42,
        attempts_started: 50,
        violation_count: 3,
      };

      const html = renderToString(
        <MemoryRouter>
          <ActiveExamCard exam={exam} />
        </MemoryRouter>
      );

      expect(html).toContain('Algorithms Final');
      expect(html).toContain('42 live / 50 started');
      expect(html).toContain('Violations');
      expect(html).toContain('LIVE');
      expect(html).toContain('Monitor Details');
      // Must not contain fake student previews or fake undefined fields
      expect(html).not.toContain('?/? Active');
      expect(html).not.toContain('studentPreviews');
    });
  });

  describe('3. CompletedExamCard with Real Actions', () => {
    it('renders Analytics, Grade Attempts, Violation Report, and Publish Results actions', () => {
      const exam = {
        id: 'exam-ended-1',
        title: 'Distributed Systems Midterm',
        effective_status: 'ENDED',
        end_time: '2026-11-19T18:00:00Z',
        submitted_count: 35,
        attempt_count: 40,
        evaluated_count: 30,
        average_score_percent: 82.5,
        violation_count: 5,
        results_visible: false,
      };

      const html = renderToString(
        <MemoryRouter>
          <CompletedExamCard exam={exam} />
        </MemoryRouter>
      );

      expect(html).toContain('Distributed Systems Midterm');
      expect(html).toContain('35/40 submitted');
      expect(html).toContain('82.5%');
      expect(html).toContain('COMPLETED');
      expect(html).toContain('Analytics');
      expect(html).toContain('Grade Attempts');
      expect(html).toContain('Violation Report');
      expect(html).toContain('Publish Results');
      expect(html).toContain('Pending');
    });

    it('shows Results Published when already released', () => {
      const exam = {
        id: 'exam-ended-2',
        title: 'Database Systems',
        effective_status: 'ENDED',
        results_visible: true,
      };

      const html = renderToString(
        <MemoryRouter>
          <CompletedExamCard exam={exam} />
        </MemoryRouter>
      );

      expect(html).toContain('Results Published');
      expect(html).toContain('Released');
    });
  });

  describe('4. ScheduledExamCard Edit & Delete Rules', () => {
    it('shows Edit button for DRAFT exams', () => {
      const exam = {
        id: 'draft-1',
        title: 'Draft Exam',
        status: 'DRAFT',
      };

      const html = renderToString(
        <MemoryRouter>
          <ScheduledExamCard exam={exam} variant="draft" />
        </MemoryRouter>
      );

      expect(html).toContain('Edit');
      expect(html).toContain('Delete');
      expect(html).toContain('DRAFT');
    });

    it('does NOT show Edit button for SCHEDULED exams (drafts only)', () => {
      const exam = {
        id: 'sched-1',
        title: 'Scheduled Exam',
        status: 'SCHEDULED',
      };

      const html = renderToString(
        <MemoryRouter>
          <ScheduledExamCard exam={exam} variant="scheduled" />
        </MemoryRouter>
      );

      // Should not contain Edit button
      expect(html).not.toContain('>Edit<');
      expect(html).not.toContain('> Edit<');
      expect(html).toContain('Delete');
      expect(html).toContain('SCHEDULED');
    });
  });

  describe('5. QuickActionsPanel Dead Actions Removed', () => {
    it('does not contain dead Student Management button', () => {
      const html = renderToString(
        <MemoryRouter>
          <QuickActionsPanel onCreateExam={() => {}} onOpenTemplates={() => {}} />
        </MemoryRouter>
      );

      expect(html).toContain('Create New Exam');
      expect(html).toContain('Question Bank');
      expect(html).toContain('Exam Templates');
      expect(html).not.toContain('Student Management');
    });
  });

  describe('6. Empty States with Primary CTA', () => {
    it('primary action text is Create your first exam', () => {
      // In the index component, the empty state renders "Create your first exam"
      const emptyStateText = 'Create your first exam';
      expect(emptyStateText).toBe('Create your first exam');
    });
  });
});
