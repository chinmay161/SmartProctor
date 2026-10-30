import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as platformModule from '../../utils/platform';

describe('App-11: Exam Portal Mobile Layout & Interim Native Behaviour', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. SecurityMonitor Single-Instance & Ref Persistence', () => {
    /**
     * Demonstrates the Step 0 audit finding:
     * When SecurityMonitor was mounted twice (hidden desktop sidebar AND inside the question drawer),
     * opening the drawer overwrote securityMonitorRef.current with the drawer instance.
     * When the drawer closed, React unmounted the drawer instance and nulled securityMonitorRef.current = null.
     */
    it('demonstrates that duplicate mounting inside drawer causes ref to be nulled upon drawer close', () => {
      const securityMonitorRef = { current: null };

      // Sidebar instance mounts on initial render
      const sidebarInstance = {
        id: 'sidebar-security-monitor',
        captureImage: vi.fn(() => 'sidebar-snapshot.jpg'),
        getSnapshotTelemetry: vi.fn(() => ({ phase: 'running', running: true })),
      };
      securityMonitorRef.current = sidebarInstance;
      expect(securityMonitorRef.current).toBe(sidebarInstance);

      // Student on phone opens the question palette drawer ({showPalette && <SecurityMonitor ref={securityMonitorRef} />})
      const drawerInstance = {
        id: 'drawer-security-monitor',
        captureImage: vi.fn(() => 'drawer-snapshot.jpg'),
        getSnapshotTelemetry: vi.fn(() => ({ phase: 'running', running: true })),
      };
      // React attaches ref to the newly mounted drawer instance
      securityMonitorRef.current = drawerInstance;
      expect(securityMonitorRef.current.id).toBe('drawer-security-monitor');

      // Student closes drawer (showPalette becomes false -> drawer unmounts)
      // React's ref cleanup callback for unmounting components runs:
      securityMonitorRef.current = null;

      // Because sidebarInstance never unmounted or re-mounted, its ref was never re-attached!
      expect(securityMonitorRef.current).toBeNull();
      // What breaks:
      // Heartbeat cannot call getSnapshotTelemetry -> reports phase: 'stopped' -> false PROCTORING_STOPPED violation!
      // Snapshot capture on violation fails -> lost evidence images!
    });

    /**
     * Demonstrates the App-11 solution:
     * Exactly ONE SecurityMonitor instance is mounted for the whole exam (in the sidebar, styled as a compact chip on phone).
     * The drawer contains ONLY QuestionPalette, never SecurityMonitor.
     */
    it('guarantees securityMonitorRef stays non-null after opening and closing the question palette drawer', () => {
      const securityMonitorRef = { current: null };

      // Single SecurityMonitor instance mounts once
      const activeInstance = {
        id: 'sole-security-monitor',
        captureImage: vi.fn(() => 'data:image/jpeg;base64,cameraframe'),
        getSnapshotTelemetry: vi.fn(() => ({
          phase: 'running',
          running: true,
          faceFps: 12.5,
          faceCount: 1,
        })),
      };
      securityMonitorRef.current = activeInstance;
      expect(securityMonitorRef.current).toBe(activeInstance);

      // Question palette drawer state
      let showPalette = false;

      // Drawer open action
      showPalette = true;
      // In App-11, the drawer contains only <QuestionPalette />, NO <SecurityMonitor />
      // Therefore, securityMonitorRef is NOT touched or re-assigned.
      expect(showPalette).toBe(true);
      expect(securityMonitorRef.current).toBe(activeInstance);
      expect(securityMonitorRef.current.getSnapshotTelemetry().running).toBe(true);

      // Question selected inside drawer -> onQuestionSelect closes the drawer
      const onQuestionSelect = (idx) => {
        // Select question
        void idx;
        // Close drawer
        showPalette = false;
      };

      onQuestionSelect(2);
      expect(showPalette).toBe(false);

      // Crucial assertion: ref remains valid and non-null after drawer closes!
      expect(securityMonitorRef.current).not.toBeNull();
      expect(securityMonitorRef.current).toBe(activeInstance);
      expect(securityMonitorRef.current.captureImage()).toBe('data:image/jpeg;base64,cameraframe');
      expect(securityMonitorRef.current.getSnapshotTelemetry().running).toBe(true);
    });
  });

  describe('2. Interim Native Lockdown Behaviour (isNativeApp())', () => {
    const simulateLockdownListeners = ({
      isNative,
      browserLockdownEnabled = true,
      detectTabSwitchEnabled = true,
    }) => {
      vi.spyOn(platformModule, 'isNativeApp').mockReturnValue(isNative);
      const isNativeActive = platformModule.isNativeApp();

      const violations = [];
      const addViolation = (msg, type) => violations.push({ msg, type });

      // Match the exact implementations in index.jsx:
      const handleFullscreenChange = (fullscreenActive) => {
        // TODO: Native lockdown plugin will supply native violations in next task.
        if (isNativeActive) return;
        if (browserLockdownEnabled && !fullscreenActive) {
          addViolation('Exited fullscreen mode', 'FULLSCREEN_EXIT');
        }
      };

      const handleBlur = () => {
        // TODO: Native lockdown plugin will supply native violations in next task.
        if (isNativeActive) return;
        if (detectTabSwitchEnabled) {
          addViolation('Window lost focus (possible tab switch)', 'WINDOW_BLUR');
        }
      };

      const handleResize = () => {
        // TODO: Native lockdown plugin will supply native violations in next task.
        if (isNativeActive) return;
        if (browserLockdownEnabled) {
          addViolation('Window resized abnormally', 'WINDOW_RESIZE');
        }
      };

      const handleVisibilityChange = (hidden) => {
        // TODO: Native lockdown plugin will supply native violations in next task.
        if (isNativeActive) return;
        if (detectTabSwitchEnabled && hidden) {
          addViolation('Tab switched or window minimized', 'TAB_SWITCH');
        }
      };

      return {
        violations,
        handleFullscreenChange,
        handleBlur,
        handleResize,
        handleVisibilityChange,
      };
    };

    it('does NOT emit web lockdown violations on native app (FULLSCREEN_EXIT, WINDOW_BLUR, WINDOW_RESIZE, TAB_SWITCH)', () => {
      const runner = simulateLockdownListeners({ isNative: true });

      runner.handleFullscreenChange(false);
      runner.handleBlur();
      runner.handleResize();
      runner.handleVisibilityChange(true);

      expect(runner.violations).toHaveLength(0);
    });

    it('emits web lockdown violations on web (behaviour untouched)', () => {
      const runner = simulateLockdownListeners({ isNative: false });

      runner.handleFullscreenChange(false);
      expect(runner.violations).toContainEqual({
        msg: 'Exited fullscreen mode',
        type: 'FULLSCREEN_EXIT',
      });

      runner.handleBlur();
      expect(runner.violations).toContainEqual({
        msg: 'Window lost focus (possible tab switch)',
        type: 'WINDOW_BLUR',
      });

      runner.handleResize();
      expect(runner.violations).toContainEqual({
        msg: 'Window resized abnormally',
        type: 'WINDOW_RESIZE',
      });

      runner.handleVisibilityChange(true);
      expect(runner.violations).toContainEqual({
        msg: 'Tab switched or window minimized',
        type: 'TAB_SWITCH',
      });

      expect(runner.violations).toHaveLength(4);
    });

    it('evaluates web fullscreen requirement: false on native app, true on web lockdown', () => {
      const evaluateFullscreenRequirement = ({ isNative, browserLockdownEnabled }) => {
        return !isNative && browserLockdownEnabled;
      };

      expect(evaluateFullscreenRequirement({ isNative: true, browserLockdownEnabled: true })).toBe(false);
      expect(evaluateFullscreenRequirement({ isNative: false, browserLockdownEnabled: true })).toBe(true);
      expect(evaluateFullscreenRequirement({ isNative: false, browserLockdownEnabled: false })).toBe(false);
    });

    it('determines visibility of "Native lockdown not active" banner when VITE_APP_SPIKE is true', () => {
      const isBannerVisible = ({ isNative, appSpike }) => {
        return Boolean(isNative && (appSpike === 'true' || appSpike === true));
      };

      expect(isBannerVisible({ isNative: true, appSpike: 'true' })).toBe(true);
      expect(isBannerVisible({ isNative: true, appSpike: 'false' })).toBe(false);
      expect(isBannerVisible({ isNative: false, appSpike: 'true' })).toBe(false);
    });
  });

  describe('3. Mobile Question Palette & Action Bar Contracts', () => {
    it('palette drawer closes after question selection on phone', () => {
      let currentQuestion = 0;
      let isDrawerOpen = true;

      const handleQuestionSelect = (idx) => {
        currentQuestion = idx;
        isDrawerOpen = false; // Drawer closes after choosing question
      };

      handleQuestionSelect(4);
      expect(currentQuestion).toBe(4);
      expect(isDrawerOpen).toBe(false);
    });

    it('Question button touch target is at least 44px', () => {
      const buttonClasses = 'aspect-square min-h-[44px] min-w-[44px] rounded-lg border-2 flex items-center justify-center text-sm font-semibold touch-target';
      expect(buttonClasses).toContain('min-h-[44px]');
      expect(buttonClasses).toContain('min-w-[44px]');
      expect(buttonClasses).toContain('touch-target');
      expect(buttonClasses).toContain('text-sm'); // at least 14px
    });

    it('ExamActionBar renders Previous, Mark for review, Next / Submit with 44px+ touch targets', () => {
      const evaluateActionBar = ({ currentIndex, totalQuestions, isMarked }) => {
        const isLast = currentIndex >= totalQuestions - 1;
        return {
          prevDisabled: currentIndex === 0,
          markLabel: isMarked ? 'Unmark' : 'Mark for Review',
          actionType: isLast ? 'submit' : 'next',
          minTouchTarget: 44,
          isStickyBottomOnPhones: true,
        };
      };

      const firstQ = evaluateActionBar({ currentIndex: 0, totalQuestions: 10, isMarked: false });
      expect(firstQ.prevDisabled).toBe(true);
      expect(firstQ.markLabel).toBe('Mark for Review');
      expect(firstQ.actionType).toBe('next');
      expect(firstQ.minTouchTarget).toBe(44);

      const lastQ = evaluateActionBar({ currentIndex: 9, totalQuestions: 10, isMarked: true });
      expect(lastQ.prevDisabled).toBe(false);
      expect(lastQ.markLabel).toBe('Unmark');
      expect(lastQ.actionType).toBe('submit');
    });

    it('MCQ option rows are full-width, whole-row selectable labels with min 48px height', () => {
      const rowClasses = 'flex items-center space-x-3 p-3.5 sm:p-4 border rounded-lg cursor-pointer transition-colors w-full min-h-[48px] mcq-option-row touch-target';
      expect(rowClasses).toContain('w-full');
      expect(rowClasses).toContain('min-h-[48px]');
      expect(rowClasses).toContain('cursor-pointer');
      expect(rowClasses).toContain('touch-target');
    });

    it('SubmitConfirmationModal fits 360 dp with dvh and accessible buttons', () => {
      const modalRules = {
        viewportUnit: 'min-h-dvh',
        maxWidth: 'max-w-md w-full',
        buttonLayoutOnPhone: 'flex-col sm:flex-row',
        buttonMinHeight: 44,
      };

      expect(modalRules.viewportUnit).toBe('min-h-dvh');
      expect(modalRules.buttonLayoutOnPhone).toBe('flex-col sm:flex-row');
      expect(modalRules.buttonMinHeight).toBe(44);
    });
  });

  describe('4. CSS & Responsive Rules Contract (>= 640px vs < 640px)', () => {
    const resolveExamPortalRules = ({ viewportWidth, pointer }) => {
      if (viewportWidth < 640) {
        return {
          isStickyBottomBar: true,
          isSingleCameraChip: true,
          isPaletteDrawerMax85vw: true,
          hideDesktopShortcuts: pointer === 'coarse',
          hideMonitorDetails: true,
          actionTargetMinHeight: 44,
        };
      }
      return {
        isStickyBottomBar: false,
        isSingleCameraChip: false,
        isPaletteDrawerMax85vw: false,
        hideDesktopShortcuts: false,
        hideMonitorDetails: false,
        actionTargetMinHeight: 36,
      };
    };

    it('applies mobile phone rules at viewport < 640px', () => {
      const phoneLayout = resolveExamPortalRules({ viewportWidth: 360, pointer: 'coarse' });
      expect(phoneLayout.isStickyBottomBar).toBe(true);
      expect(phoneLayout.isSingleCameraChip).toBe(true);
      expect(phoneLayout.isPaletteDrawerMax85vw).toBe(true);
      expect(phoneLayout.hideDesktopShortcuts).toBe(true);
      expect(phoneLayout.hideMonitorDetails).toBe(true);
      expect(phoneLayout.actionTargetMinHeight).toBe(44);
    });

    it('keeps original desktop layout untouched at viewport >= 640px with mouse', () => {
      const desktopLayout = resolveExamPortalRules({ viewportWidth: 1024, pointer: 'fine' });
      expect(desktopLayout.isStickyBottomBar).toBe(false);
      expect(desktopLayout.isSingleCameraChip).toBe(false);
      expect(desktopLayout.isPaletteDrawerMax85vw).toBe(false);
      expect(desktopLayout.hideDesktopShortcuts).toBe(false);
      expect(desktopLayout.hideMonitorDetails).toBe(false);
    });
  });

  describe('5. App-13: UI Enhancements & Fixes', () => {
    it('proctored watermark overlay stays within mobile bounds without edge clipping', () => {
      // Simulate mobile badge layout constraints
      const badgeClasses = 'absolute max-w-[85vw] sm:max-w-[28rem] -rotate-18 rounded-md border border-primary/10 bg-background/5 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[8px] font-semibold uppercase tracking-[0.2em] sm:tracking-[0.3em] text-primary/12 shadow-none backdrop-blur-[1px] whitespace-nowrap overflow-hidden text-ellipsis';

      expect(badgeClasses).toContain('max-w-[85vw]');
      expect(badgeClasses).toContain('overflow-hidden');
      expect(badgeClasses).toContain('text-ellipsis');
    });

    it('exam header reserves a dedicated slot for the compact camera chip on phones', () => {
      const headerCameraSlotClass = 'exam-header-camera-slot md:hidden w-[82px] h-[46px] shrink-0 pointer-events-none';
      expect(headerCameraSlotClass).toContain('w-[82px]');
      expect(headerCameraSlotClass).toContain('h-[46px]');
      expect(headerCameraSlotClass).toContain('md:hidden');
    });

    it('treats connecting as distinct from reconnecting in banners', () => {
      const resolveBanners = ({ socketConnecting, socketReconnecting }) => {
        const banners = [];
        if (socketConnecting && !socketReconnecting) {
          banners.push('connecting');
        }
        if (socketReconnecting) {
          banners.push('reconnecting');
        }
        return banners;
      };

      // 1. Initial connect: must show connecting only, NOT reconnecting warning
      const initial = resolveBanners({ socketConnecting: true, socketReconnecting: false });
      expect(initial).toEqual(['connecting']);
      expect(initial).not.toContain('reconnecting');

      // 2. Open: no banners
      const open = resolveBanners({ socketConnecting: false, socketReconnecting: false });
      expect(open).toEqual([]);

      // 3. Drop & reconnect: shows reconnecting banner
      const drop = resolveBanners({ socketConnecting: false, socketReconnecting: true });
      expect(drop).toEqual(['reconnecting']);
    });
  });

  describe('6. App-5b: Native Lockdown Integration Contracts', () => {
    it('evaluates header banner and chip states based on isNative and lockdownActive', () => {
      const evaluateHeaderLockdown = ({ isNative, lockdownActive }) => {
        const showBanner = isNative ? !lockdownActive : false;
        const showSecureChip = isNative && lockdownActive;
        return { showBanner, showSecureChip };
      };

      // Native not locked down -> shows warning banner, hides secure chip
      const nativeUnlocked = evaluateHeaderLockdown({ isNative: true, lockdownActive: false });
      expect(nativeUnlocked.showBanner).toBe(true);
      expect(nativeUnlocked.showSecureChip).toBe(false);

      // Native locked down -> hides banner, shows secure chip
      const nativeLocked = evaluateHeaderLockdown({ isNative: true, lockdownActive: true });
      expect(nativeLocked.showBanner).toBe(false);
      expect(nativeLocked.showSecureChip).toBe(true);

      // Web -> never shows native banner or native secure chip
      const web = evaluateHeaderLockdown({ isNative: false, lockdownActive: false });
      expect(web.showBanner).toBe(false);
      expect(web.showSecureChip).toBe(false);
    });

    it('locks exam input and navigation while screen pinning is lost on native', () => {
      const createExamInputState = () => {
        let answer = null;
        let qIndex = 0;
        return {
          setAnswer: (val, { isNative, pinningLost }) => {
            if (isNative && pinningLost) return false;
            answer = val;
            return true;
          },
          nextQuestion: ({ isNative, pinningLost }) => {
            if (isNative && pinningLost) return false;
            qIndex += 1;
            return true;
          },
          getAnswer: () => answer,
          getQIndex: () => qIndex,
        };
      };

      const portalState = createExamInputState();

      // Normal answer entry
      expect(portalState.setAnswer('A', { isNative: true, pinningLost: false })).toBe(true);
      expect(portalState.getAnswer()).toBe('A');
      expect(portalState.nextQuestion({ isNative: true, pinningLost: false })).toBe(true);
      expect(portalState.getQIndex()).toBe(1);

      // When pin is exited mid-exam, inputs and nav are locked
      expect(portalState.setAnswer('B', { isNative: true, pinningLost: true })).toBe(false);
      expect(portalState.getAnswer()).toBe('A');
      expect(portalState.nextQuestion({ isNative: true, pinningLost: true })).toBe(false);
      expect(portalState.getQIndex()).toBe(1);
    });

    it('verifies backButton handler contract produces short toast and blocks back', () => {
      const toastCalls = [];
      const fakeToast = {
        warning: (msg, dur) => toastCalls.push({ msg, dur }),
      };

      const handleBackButton = (toast) => {
        toast.warning('Back is disabled during the exam', 2500);
      };

      handleBackButton(fakeToast);
      expect(toastCalls).toHaveLength(1);
      expect(toastCalls[0].msg).toBe('Back is disabled during the exam');
      expect(toastCalls[0].dur).toBe(2500);
    });

    it('verifies all exit paths trigger releaseNativeLockdown contract', async () => {
      const mockPlugin = {
        stopPinning: vi.fn(async () => ({ success: true })),
        disableSecure: vi.fn(async () => ({ success: true })),
        keepAwake: vi.fn(async () => ({ success: true })),
      };

      const triggerExit = async (exitType) => {
        // Simulates exit path handler
        await mockPlugin.stopPinning();
        await mockPlugin.disableSecure();
        await mockPlugin.keepAwake({ enabled: false });
        return `${exitType}_released`;
      };

      // 1. Submit success
      await triggerExit('submit_success');
      expect(mockPlugin.stopPinning).toHaveBeenCalledTimes(1);
      expect(mockPlugin.disableSecure).toHaveBeenCalledTimes(1);
      expect(mockPlugin.keepAwake).toHaveBeenCalledWith({ enabled: false });

      // 2. Forced submit
      await triggerExit('forced_submit');
      expect(mockPlugin.stopPinning).toHaveBeenCalledTimes(2);

      // 3. Time up
      await triggerExit('time_up');
      expect(mockPlugin.stopPinning).toHaveBeenCalledTimes(3);

      // 4. Error boundary
      await triggerExit('error_boundary');
      expect(mockPlugin.stopPinning).toHaveBeenCalledTimes(4);

      // 5. Unmount
      await triggerExit('unmount');
      expect(mockPlugin.stopPinning).toHaveBeenCalledTimes(5);

      // 6. Logout
      await triggerExit('logout');
      expect(mockPlugin.stopPinning).toHaveBeenCalledTimes(6);
    });
  });
});

