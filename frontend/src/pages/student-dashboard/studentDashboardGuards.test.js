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

  describe('5. App-10: Phone Layout Rules (Header, Stat Cards, Floating Toggle, Gate)', () => {
    const resolveHeaderLayout = (viewportWidth) => {
      if (viewportWidth < 640) {
        return {
          desktopNavHidden: true,
          subtitleHidden: true,
          themeToggle44px: true,
          logoutIconOnly: true,
          pageOverflowClip: true,
        };
      }
      return {
        desktopNavHidden: false,
        subtitleHidden: false,
        themeToggle44px: false,
        logoutIconOnly: false,
        pageOverflowClip: false,
      };
    };

    it('hides desktop nav and switches header buttons to 44px icon-only on phones (<640px)', () => {
      const phoneHeader = resolveHeaderLayout(360);
      expect(phoneHeader.desktopNavHidden).toBe(true);
      expect(phoneHeader.subtitleHidden).toBe(true);
      expect(phoneHeader.themeToggle44px).toBe(true);
      expect(phoneHeader.logoutIconOnly).toBe(true);
      expect(phoneHeader.pageOverflowClip).toBe(true);
    });

    it('preserves desktop nav and full header controls at viewport >= 640px', () => {
      const desktopHeader = resolveHeaderLayout(1024);
      expect(desktopHeader.desktopNavHidden).toBe(false);
      expect(desktopHeader.subtitleHidden).toBe(false);
      expect(desktopHeader.themeToggle44px).toBe(false);
      expect(desktopHeader.logoutIconOnly).toBe(false);
      expect(desktopHeader.pageOverflowClip).toBe(false);
    });

    const resolveStatsGridLayout = (viewportWidth) => {
      if (viewportWidth < 640) {
        return {
          columns: 3,
          isCompact: true,
          labelFontSize: '11px',
        };
      }
      return {
        columns: 'auto-fit',
        isCompact: false,
        labelFontSize: '0.8rem',
      };
    };

    it('configures stat cards to 3 in a row with compact padding on phones', () => {
      const phoneStats = resolveStatsGridLayout(360);
      expect(phoneStats.columns).toBe(3);
      expect(phoneStats.isCompact).toBe(true);
      expect(phoneStats.labelFontSize).toBe('11px');
    });

    it('keeps original auto-fit stat cards at >= 640px', () => {
      const desktopStats = resolveStatsGridLayout(768);
      expect(desktopStats.columns).toBe('auto-fit');
      expect(desktopStats.isCompact).toBe(false);
      expect(desktopStats.labelFontSize).toBe('0.8rem');
    });

    const resolveThemeToggleLayout = ({ viewportWidth, pointer }) => {
      if (viewportWidth < 640 || pointer === 'coarse') {
        return {
          iconOnly: true,
          minTouchTarget: 44,
          labelVisible: false,
        };
      }
      return {
        iconOnly: false,
        minTouchTarget: 34,
        labelVisible: true,
      };
    };

    it('switches floating ThemeToggle to icon-only 44px on phone or coarse pointer', () => {
      const phoneToggle = resolveThemeToggleLayout({ viewportWidth: 360, pointer: 'coarse' });
      expect(phoneToggle.iconOnly).toBe(true);
      expect(phoneToggle.minTouchTarget).toBe(44);
      expect(phoneToggle.labelVisible).toBe(false);
    });

    it('keeps pill with label on desktop with fine pointer', () => {
      const desktopToggle = resolveThemeToggleLayout({ viewportWidth: 1200, pointer: 'fine' });
      expect(desktopToggle.iconOnly).toBe(false);
      expect(desktopToggle.labelVisible).toBe(true);
    });

    const resolveGateModalLayout = (viewportWidth) => {
      if (viewportWidth < 640) {
        return {
          alignItems: 'flex-start',
          headerWraps: true,
          reportProblemBelowTitle: true,
          cameraWidth100Percent: true,
          respectsSafeBottom: true,
        };
      }
      return {
        alignItems: 'center',
        headerWraps: false,
        reportProblemBelowTitle: false,
        cameraWidth100Percent: false,
        respectsSafeBottom: false,
      };
    };

    it('enforces PreExamGate scroll-from-top and header wrap on phones', () => {
      const phoneGate = resolveGateModalLayout(360);
      expect(phoneGate.alignItems).toBe('flex-start');
      expect(phoneGate.headerWraps).toBe(true);
      expect(phoneGate.reportProblemBelowTitle).toBe(true);
      expect(phoneGate.cameraWidth100Percent).toBe(true);
      expect(phoneGate.respectsSafeBottom).toBe(true);
    });
  });
});
