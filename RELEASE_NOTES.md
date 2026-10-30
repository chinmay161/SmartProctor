# SmartProctor Release Notes - v1.1.0

## Release Overview
**Version:** 1.1.0  
**Android Version Code:** 2  
**Date:** October 30, 2026  

SmartProctor v1.1.0 introduces production-ready native exam lockdown for Android devices, new proctoring violation detection, DND pre-exam gate verification, and desktop redirection improvements for teacher/admin roles.

---

## What's New in v1.1.0

### 1. Native Mobile Exam Lockdown (`ExamLock` Plugin)
- **Screen Pinning Integration**: Locks the exam app to the device screen using Android's `startLockTask` with async polling and confirmation handling (`pinningStarted` / `pinningFailed` with a 20 s threshold).
- **Screenshot & Task Switcher Blocking**: `enableSecure` applies `FLAG_SECURE` to block screenshots, screen recording, and system recents previews during exams.
- **Screen Keep-Awake**: Added `keepAwake(enabled)` toggling `FLAG_KEEP_SCREEN_ON` so device displays do not sleep during proctored sessions.
- **Reliable Pin-Exit Detection**: Detects unpin gestures cleanly, ensuring unpin events are reported only after an active pin was confirmed.
- **Back Button Interception**: Traps Android back gestures during active exams with `App.addListener('backButton')` and alerts students via a warning toast (`"Back is disabled during the exam"`).

### 2. Pre-Exam Lockdown Gates (Native Only)
- **Step 3(a) Silence Interruptions (Do Not Disturb)**: Checks Android interruption filter before locking. If filter is `ALL` (1), blocks progress with clear instructions to turn on DND; polls every 2 s and supports a "Check again" trigger. For unknown status, provides a required self-confirmation fallback.
- **Step 3(b) Screen Lock**: Directly enables secure mode, engages keep-awake, and pins the screen. Provides clear retry guidance and aborts safely to the web version after 3 failed attempts with flight-recorder telemetry (`pinning_unavailable`).
- **Resumed Attempts Gate**: Re-executes DND and screen lock verification whenever an exam is resumed after an app restart or process kill.

### 3. Mid-Exam Interruption Handling & Input Locking
- **Full-Screen Pinning Interruption Sheet**: If a student exits screen pinning mid-exam (or receives a call), a modal blocking sheet (`"Screen pinning stopped. Turn it back on to continue."`) overlays the viewport.
- **Input & Navigation Lock**: Exam question options, palette selection, and next/prev actions are disabled while screen pinning is exited. The timer and proctoring watchdog continue running.
- **DND State Re-Check**: Re-evaluates DND status on app resume and window focus return; logs `dnd_off` telemetry if silenced mode was toggled off.

### 4. New Violation Types & Grace Rules
Added 4 new violation types end-to-end across frontend severity mapping, backend scoring, database logging, WebSocket broadcasting, and teacher review timelines:
- `PIN_EXITED` (Major, 25 pt deduction): Fires immediately when screen pinning is dropped; tracks seconds outside the pin upon restoration.
- `APP_BACKGROUNDED` (Major, 20 pt deduction): Evaluates when the app is paused $\ge$ 2 seconds; includes away duration in alert message and telemetry.
- `FOCUS_LOST` (Minor, 15 pt deduction): Fires if window focus is lost for $\ge$ 2 seconds or 3+ times in a 30-second window.
- `MULTI_WINDOW` (Major, 20 pt deduction): Triggers immediately if split-screen mode is detected.

### 5. Universal Exit Cleanup
`releaseNativeLockdown()` (`stopPinning`, `disableSecure`, `keepAwake(false)`) is executed reliably across all exit paths:
- Student submission confirmation
- Teacher forced submission / proctor termination
- Exam timer expiration (`onTimeUp`)
- React Error Boundary catching an unhandled exception
- Component unmounting
- Session logout
- Shows post-exam guidance: *"You can now turn Do Not Disturb off."*

### 6. Native Guard & Desktop URL Redirection
- When teachers or administrators log in via the mobile app, the native guard page directs them to the desktop web portal.
- Default link updated from local development host to production: `https://smart-proctor-zeta.vercel.app/teacher-dashboard`.
- Added **Open in Browser** button alongside one-tap URL clipboard copying.

---

## Upgrade & Verification Summary
- **Frontend Vitest Suite**: 25 test files, 264/264 unit & contract tests passing.
- **Backend Pytest Suite**: 38/38 penalty scoring tests passing.
- **ESLint**: 0 errors across all modified and new files.
- **Builds**: Vite production bundle and Capacitor Android sync passing with exit code 0.
