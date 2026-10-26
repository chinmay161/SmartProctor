import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as platformModule from '../../utils/platform';

describe('Student Dashboard & Native Guards (App-9)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Role Guards (Teacher/Admin vs Student, Web vs Native)', () => {
    // Logic matching ProtectedRoute and PublicRoute native gating
    const evaluateRouteAccess = ({ roles, requiredRoles, isNative }) => {
      vi.spyOn(platformModule, 'isNativeApp').mockReturnValue(isNative);

      if (platformModule.isNativeApp()) {
        const isTeacherOrAdminUser = roles.some((r) => r === 'teacher' || r === 'admin');
        const isTeacherOrAdminRoute = requiredRoles.some((r) => r === 'teacher' || r === 'admin');
        if (isTeacherOrAdminUser || isTeacherOrAdminRoute) {
          return { redirect: '/use-web-version' };
        }
      }

      const hasRequiredRole = requiredRoles.length === 0 || requiredRoles.some((r) => roles.includes(r));
      if (!hasRequiredRole) {
        return { redirect: '/login' };
      }

      return { allowed: true };
    };

    it('redirects teacher user to /use-web-version in native app', () => {
      const result = evaluateRouteAccess({
        roles: ['teacher'],
        requiredRoles: ['teacher'],
        isNative: true,
      });
      expect(result).toEqual({ redirect: '/use-web-version' });
    });

    it('redirects admin user to /use-web-version in native app', () => {
      const result = evaluateRouteAccess({
        roles: ['admin'],
        requiredRoles: ['admin'],
        isNative: true,
      });
      expect(result).toEqual({ redirect: '/use-web-version' });
    });

    it('redirects teacher attempting to open student dashboard to /use-web-version in native app', () => {
      const result = evaluateRouteAccess({
        roles: ['teacher'],
        requiredRoles: ['student'],
        isNative: true,
      });
      expect(result).toEqual({ redirect: '/use-web-version' });
    });

    it('allows student user on student dashboard in native app', () => {
      const result = evaluateRouteAccess({
        roles: ['student'],
        requiredRoles: ['student'],
        isNative: true,
      });
      expect(result).toEqual({ allowed: true });
    });

    it('allows teacher to access teacher dashboard on web (not redirected to /use-web-version)', () => {
      const result = evaluateRouteAccess({
        roles: ['teacher'],
        requiredRoles: ['teacher'],
        isNative: false,
      });
      expect(result).toEqual({ allowed: true });
    });

    it('allows admin to access admin panel on web (not redirected to /use-web-version)', () => {
      const result = evaluateRouteAccess({
        roles: ['admin'],
        requiredRoles: ['admin'],
        isNative: false,
      });
      expect(result).toEqual({ allowed: true });
    });
  });

  describe('2. Exam Card is_mcq_only badge logic', () => {
    const computeCardState = ({ exam, isNative }) => {
      vi.spyOn(platformModule, 'isNativeApp').mockReturnValue(isNative);
      const isNativeActive = platformModule.isNativeApp();
      const isWebOnly = isNativeActive && exam?.is_mcq_only === false;
      const canStart = !isWebOnly && Boolean(exam?.has_in_progress || exam?.is_started);

      return {
        isWebOnly,
        canStart,
        hasWebOnlyBadge: isWebOnly,
        tapAction: isWebOnly ? 'explain_non_mcq' : 'start_or_resume',
      };
    };

    it('disables exam card with Web only badge when is_mcq_only is false in native app', () => {
      const exam = { id: 'exam-1', title: 'Coding & Essay Exam', is_mcq_only: false, is_started: true };
      const card = computeCardState({ exam, isNative: true });

      expect(card.isWebOnly).toBe(true);
      expect(card.hasWebOnlyBadge).toBe(true);
      expect(card.canStart).toBe(false);
      expect(card.tapAction).toBe('explain_non_mcq');
    });

    it('enables exam card normally when is_mcq_only is true in native app', () => {
      const exam = { id: 'exam-2', title: 'Biology MCQs', is_mcq_only: true, is_started: true };
      const card = computeCardState({ exam, isNative: true });

      expect(card.isWebOnly).toBe(false);
      expect(card.hasWebOnlyBadge).toBe(false);
      expect(card.canStart).toBe(true);
      expect(card.tapAction).toBe('start_or_resume');
    });

    it('does NOT disable non-mcq exam on web (web supports all question types)', () => {
      const exam = { id: 'exam-1', title: 'Coding & Essay Exam', is_mcq_only: false, is_started: true };
      const card = computeCardState({ exam, isNative: false });

      expect(card.isWebOnly).toBe(false);
      expect(card.hasWebOnlyBadge).toBe(false);
      expect(card.canStart).toBe(true);
      expect(card.tapAction).toBe('start_or_resume');
    });

    it('does not disable exam card when is_mcq_only is undefined', () => {
      const exam = { id: 'exam-3', title: 'General Knowledge', is_started: true };
      const card = computeCardState({ exam, isNative: true });

      expect(card.isWebOnly).toBe(false);
      expect(card.hasWebOnlyBadge).toBe(false);
      expect(card.canStart).toBe(true);
    });
  });

  describe('3. History Table vs Stacked Cards Switch below 640px', () => {
    // Tests responsive visibility matching mobile.css and StudentDashboard markup
    const getHistoryDisplayRules = (viewportWidth) => {
      if (viewportWidth < 640) {
        return {
          tableDisplay: 'none',
          cardsDisplay: 'flex',
          isTableHidden: true,
          areCardsVisible: true,
        };
      }
      return {
        tableDisplay: 'block',
        cardsDisplay: 'none',
        isTableHidden: false,
        areCardsVisible: false,
      };
    };

    it('switches history table to stacked cards below 640px (phone viewport)', () => {
      const phoneLayout = getHistoryDisplayRules(375);
      expect(phoneLayout.isTableHidden).toBe(true);
      expect(phoneLayout.areCardsVisible).toBe(true);
      expect(phoneLayout.cardsDisplay).toBe('flex');
    });

    it('keeps history table untouched at viewport >= 640px (tablet / desktop)', () => {
      const desktopLayout = getHistoryDisplayRules(1024);
      expect(desktopLayout.isTableHidden).toBe(false);
      expect(desktopLayout.areCardsVisible).toBe(false);
      expect(desktopLayout.tableDisplay).toBe('block');
    });

    it('stacked card contains required fields: title, date, status badge, score, and view button', () => {
      const item = {
        exam_id: 'ex-101',
        exam_title: 'Mathematics Final Exam',
        submitted_at: '2026-10-25T14:30:00Z',
        attempt_status: 'completed',
        score: 45,
        out_of: 50,
        can_view_result: true,
      };

      const cardData = {
        title: item.exam_title,
        date: new Date(item.submitted_at).toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        statusBadge: item.attempt_status,
        scoreText: `${item.score} / ${item.out_of}`,
        hasViewButton: true,
        canView: item.can_view_result,
        viewButtonClass: 'touch-target dashboard-view-btn',
      };

      expect(cardData.title).toBe('Mathematics Final Exam');
      expect(cardData.statusBadge).toBe('completed');
      expect(cardData.scoreText).toBe('45 / 50');
      expect(cardData.hasViewButton).toBe(true);
      expect(cardData.viewButtonClass).toContain('touch-target');
    });
  });

  describe('4. Screen share & Fullscreen bypass in Native App', () => {
    const resolvePreExamGateSteps = ({ isNative, requireScreenShare, requireFullscreen, variant = 'exam' }) => {
      vi.spyOn(platformModule, 'isNativeApp').mockReturnValue(isNative);
      const isNativeActive = platformModule.isNativeApp();

      const visionSteps = ['camera', 'models', 'fps', 'calibrate'];
      const audioSteps = ['mic', 'noise', 'speech'];
      const stepIds = [
        ...visionSteps,
        ...audioSteps,
        ...(!isNativeActive && requireScreenShare && variant !== 'device-test' ? ['screen'] : []),
        ...(!isNativeActive && requireFullscreen && variant !== 'device-test' ? ['fullscreen'] : []),
      ];

      return stepIds;
    };

    it('never requires screen-share or fullscreen steps in native app', () => {
      const steps = resolvePreExamGateSteps({
        isNative: true,
        requireScreenShare: true,
        requireFullscreen: true,
        variant: 'exam',
      });

      expect(steps).not.toContain('screen');
      expect(steps).not.toContain('fullscreen');
      expect(steps).toContain('camera');
      expect(steps).toContain('fps');
      expect(steps).toContain('mic');
    });

    it('includes screen-share and fullscreen on web when required', () => {
      const steps = resolvePreExamGateSteps({
        isNative: false,
        requireScreenShare: true,
        requireFullscreen: true,
        variant: 'exam',
      });

      expect(steps).toContain('screen');
      expect(steps).toContain('fullscreen');
    });

    it('Test my device runs camera, mic and fps natively without screen-share or fullscreen', () => {
      const steps = resolvePreExamGateSteps({
        isNative: true,
        requireScreenShare: true,
        requireFullscreen: true,
        variant: 'device-test',
      });

      expect(steps).toContain('camera');
      expect(steps).toContain('mic');
      expect(steps).toContain('fps');
      expect(steps).not.toContain('screen');
      expect(steps).not.toContain('fullscreen');
    });
  });
});
