package io.smartproctor.exam;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;

@CapacitorPlugin(name = "ExamLock")
public class ExamLockPlugin extends Plugin {

    private static final String TAG = "ExamLockPlugin";
    private static WeakReference<ExamLockPlugin> instanceRef;

    private boolean isPinningPending = false;
    private boolean hasConfirmedPin = false;
    private boolean isActivityForeground = true;
    private static final long PIN_TIMEOUT_MS = 20000;

    private final Handler pollHandler = new Handler(Looper.getMainLooper());
    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            if (isPinningPending || hasConfirmedPin) {
                checkLockTaskState("poll");
                pollHandler.postDelayed(this, 500);
            }
        }
    };

    private final Runnable pinningTimeoutRunnable = new Runnable() {
        @Override
        public void run() {
            if (isPinningPending && !hasConfirmedPin) {
                isPinningPending = false;
                stopPolling();

                JSObject data = new JSObject();
                data.put("timestamp", System.currentTimeMillis());
                data.put("reason", "timeout");
                data.put("timeoutMs", PIN_TIMEOUT_MS);
                notifyListeners("pinningFailed", data);
                Logger.warn(TAG, "pinningFailed event fired after 20s timeout");
            }
        }
    };

    private void startPinningTimeout() {
        pollHandler.removeCallbacks(pinningTimeoutRunnable);
        pollHandler.postDelayed(pinningTimeoutRunnable, PIN_TIMEOUT_MS);
    }

    private void cancelPinningTimeout() {
        pollHandler.removeCallbacks(pinningTimeoutRunnable);
    }

    @Override
    public void load() {
        super.load();
        instanceRef = new WeakReference<>(this);
        Logger.info(TAG, "ExamLockPlugin loaded");

        // Optional Android 14+ screen capture callback (investigative feature)
        registerScreenCaptureCallbackIfSupported();
    }

    public static ExamLockPlugin getInstance() {
        return instanceRef != null ? instanceRef.get() : null;
    }

    // =========================================================================
    // Plugin Methods
    // =========================================================================

    /**
     * enableSecure: Sets WindowManager.LayoutParams.FLAG_SECURE on Activity Window.
     * Prevents screenshots, screen recording capture, and hides content in Recents.
     */
    @PluginMethod
    public void enableSecure(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("secure", true);
                call.resolve(ret);
            } catch (Exception e) {
                Logger.error(TAG, "Failed to enable FLAG_SECURE", e);
                call.reject("Failed to enable FLAG_SECURE: " + e.getMessage(), e);
            }
        });
    }

    /**
     * disableSecure: Clears WindowManager.LayoutParams.FLAG_SECURE on Activity Window.
     */
    @PluginMethod
    public void disableSecure(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("secure", false);
                call.resolve(ret);
            } catch (Exception e) {
                Logger.error(TAG, "Failed to disable FLAG_SECURE", e);
                call.reject("Failed to disable FLAG_SECURE: " + e.getMessage(), e);
            }
        });
    }

    /**
     * keepAwake: Sets or clears WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON.
     */
    @PluginMethod
    public void keepAwake(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        boolean enabled = call.getBoolean("enabled", true);
        activity.runOnUiThread(() -> {
            try {
                if (enabled) {
                    activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("keepAwake", enabled);
                call.resolve(ret);
            } catch (Exception e) {
                Logger.error(TAG, "Failed to toggle FLAG_KEEP_SCREEN_ON", e);
                call.reject("Failed to set keepAwake: " + e.getMessage(), e);
            }
        });
    }

    /**
     * startPinning: Invokes startLockTask() while activity is in foreground.
     * Sets isPinningPending=true; reports pin exit only if a previous poll
     * confirmed lockTaskMode != none after startPinning. Fires pinningStarted
     * upon first confirmed pin, or pinningFailed if not confirmed within 20s.
     */
    @PluginMethod
    public void startPinning(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        if (!isActivityForeground || activity.isFinishing()) {
            call.reject("Cannot start pinning: Activity must be in the foreground");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                cancelPinningTimeout();
                stopPolling();

                activity.startLockTask();
                isPinningPending = true;
                hasConfirmedPin = false;

                startPinningTimeout();
                startPolling();
                checkLockTaskState("startPinning");

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("lockTaskMode", getLockTaskModeString());
                ret.put("lockTaskModeCode", getLockTaskModeCode());
                call.resolve(ret);
            } catch (Exception e) {
                Logger.error(TAG, "startLockTask failed", e);
                call.reject("Failed to start lock task: " + e.getMessage(), e);
            }
        });
    }

    /**
     * stopPinning: Invokes stopLockTask() and ceases polling.
     */
    @PluginMethod
    public void stopPinning(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                cancelPinningTimeout();
                isPinningPending = false;
                hasConfirmedPin = false;
                stopPolling();
                activity.stopLockTask();

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("lockTaskMode", getLockTaskModeString());
                ret.put("lockTaskModeCode", getLockTaskModeCode());
                call.resolve(ret);
            } catch (Exception e) {
                Logger.error(TAG, "stopLockTask failed", e);
                call.reject("Failed to stop lock task: " + e.getMessage(), e);
            }
        });
    }

    /**
     * getState: Returns { secure, lockTaskMode, inMultiWindow, inPip, interruptionFilter }.
     */
    @PluginMethod
    public void getState(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        JSObject state = getSnapshotState(activity);
        call.resolve(state);
    }

    // =========================================================================
    // State Query Helpers
    // =========================================================================

    public JSObject getSnapshotState(Activity activity) {
        JSObject state = new JSObject();

        // 1. secure: FLAG_SECURE
        int flags = activity.getWindow().getAttributes().flags;
        boolean secure = (flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
        state.put("secure", secure);

        // 1b. keepAwake: FLAG_KEEP_SCREEN_ON
        boolean keepAwake = (flags & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) != 0;
        state.put("keepAwake", keepAwake);

        // 2. lockTaskMode: from ActivityManager.getLockTaskModeState()
        int modeCode = getLockTaskModeCode();
        state.put("lockTaskMode", getLockTaskModeString(modeCode));
        state.put("lockTaskModeCode", modeCode);

        // 3. inMultiWindow
        boolean inMultiWindow = activity.isInMultiWindowMode();
        state.put("inMultiWindow", inMultiWindow);

        // 4. inPip
        boolean inPip = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            inPip = activity.isInPictureInPictureMode();
        }
        state.put("inPip", inPip);

        // 5. interruptionFilter
        NotificationManager nm = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
        int filter = nm != null ? nm.getCurrentInterruptionFilter() : -1;
        state.put("interruptionFilter", filter);
        state.put("interruptionFilterName", getInterruptionFilterName(filter));

        return state;
    }

    public int getLockTaskModeCode() {
        Activity activity = getActivity();
        if (activity == null) return ActivityManager.LOCK_TASK_MODE_NONE;
        ActivityManager am = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
        if (am == null) return ActivityManager.LOCK_TASK_MODE_NONE;
        return am.getLockTaskModeState();
    }

    public String getLockTaskModeString() {
        return getLockTaskModeString(getLockTaskModeCode());
    }

    public String getLockTaskModeString(int modeCode) {
        switch (modeCode) {
            case ActivityManager.LOCK_TASK_MODE_PINNED:
                return "pinned";
            case ActivityManager.LOCK_TASK_MODE_LOCKED:
                return "locked";
            case ActivityManager.LOCK_TASK_MODE_NONE:
            default:
                return "none";
        }
    }

    private String getInterruptionFilterName(int filter) {
        switch (filter) {
            case NotificationManager.INTERRUPTION_FILTER_ALL:
                return "ALL";
            case NotificationManager.INTERRUPTION_FILTER_PRIORITY:
                return "PRIORITY";
            case NotificationManager.INTERRUPTION_FILTER_NONE:
                return "NONE";
            case NotificationManager.INTERRUPTION_FILTER_ALARMS:
                return "ALARMS";
            case NotificationManager.INTERRUPTION_FILTER_UNKNOWN:
            default:
                return "UNKNOWN";
        }
    }

    // =========================================================================
    // Lock Task Polling & Event Detection
    // =========================================================================

    private void startPolling() {
        pollHandler.removeCallbacks(pollRunnable);
        pollHandler.postDelayed(pollRunnable, 500);
    }

    private void stopPolling() {
        pollHandler.removeCallbacks(pollRunnable);
    }

    private void checkLockTaskState(String source) {
        int mode = getLockTaskModeCode();

        if (isPinningPending) {
            if (mode != ActivityManager.LOCK_TASK_MODE_NONE) {
                isPinningPending = false;
                hasConfirmedPin = true;
                cancelPinningTimeout();

                JSObject data = new JSObject();
                data.put("timestamp", System.currentTimeMillis());
                data.put("lockTaskMode", getLockTaskModeString(mode));
                data.put("lockTaskModeCode", mode);
                data.put("source", source);
                notifyListeners("pinningStarted", data);
                Logger.info(TAG, "pinningStarted event fired (source=" + source + ", mode=" + mode + ")");
            }
            return;
        }

        if (hasConfirmedPin) {
            if (mode == ActivityManager.LOCK_TASK_MODE_NONE) {
                hasConfirmedPin = false;
                stopPolling();

                JSObject data = new JSObject();
                data.put("timestamp", System.currentTimeMillis());
                data.put("source", source);
                data.put("lockTaskMode", "none");
                data.put("lockTaskModeCode", ActivityManager.LOCK_TASK_MODE_NONE);
                notifyListeners("pinningExited", data);
                Logger.warn(TAG, "pinningExited event fired (source=" + source + ")");
            }
        }
    }

    // =========================================================================
    // Lifecycle & Activity Callbacks
    // =========================================================================

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        isActivityForeground = false;

        JSObject data = new JSObject();
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("activityPaused", data);
        Logger.info(TAG, "activityPaused event fired");
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        isActivityForeground = true;

        JSObject data = new JSObject();
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("activityResumed", data);
        Logger.info(TAG, "activityResumed event fired");

        if (isPinningPending || hasConfirmedPin) {
            checkLockTaskState("resume");
        }
    }

    @Override
    protected void handleOnDestroy() {
        cancelPinningTimeout();
        stopPolling();
        super.handleOnDestroy();
    }

    public void onWindowFocusChanged(boolean hasFocus) {
        JSObject data = new JSObject();
        data.put("hasFocus", hasFocus);
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("windowFocusChanged", data);
        Logger.info(TAG, "windowFocusChanged event fired: hasFocus=" + hasFocus);

        if (isPinningPending || hasConfirmedPin) {
            checkLockTaskState("windowFocus");
        }
    }

    public void onMultiWindowModeChanged(boolean inMultiWindow) {
        JSObject data = new JSObject();
        data.put("inMultiWindow", inMultiWindow);
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("multiWindowChanged", data);
        Logger.info(TAG, "multiWindowChanged event fired: inMultiWindow=" + inMultiWindow);
    }

    // =========================================================================
    // Android 14+ Screen Capture Investigation Hook
    // =========================================================================

    private void registerScreenCaptureCallbackIfSupported() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            Activity activity = getActivity();
            if (activity != null) {
                try {
                    activity.registerScreenCaptureCallback(
                        activity.getMainExecutor(),
                        new Activity.ScreenCaptureCallback() {
                            @Override
                            public void onScreenCaptured() {
                                JSObject data = new JSObject();
                                data.put("timestamp", System.currentTimeMillis());
                                notifyListeners("screenCaptured", data);
                                Logger.warn(TAG, "Android 14+ ScreenCaptureCallback triggered");
                            }
                        }
                    );
                    Logger.info(TAG, "Android 14+ ScreenCaptureCallback registered");
                } catch (Throwable t) {
                    Logger.warn(TAG, "Could not register ScreenCaptureCallback: " + t.getMessage());
                }
            }
        }
    }
}
