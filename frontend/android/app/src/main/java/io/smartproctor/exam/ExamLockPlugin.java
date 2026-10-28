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

    private boolean isExamPinned = false;
    private boolean isActivityForeground = true;

    private final Handler pollHandler = new Handler(Looper.getMainLooper());
    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            if (isExamPinned) {
                checkLockTaskState("poll");
                pollHandler.postDelayed(this, 500);
            }
        }
    };

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
     * startPinning: Invokes startLockTask() while activity is in foreground.
     * Starts 500ms polling for lock task mode transitions.
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
                activity.startLockTask();
                isExamPinned = true;
                startPolling();

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
                activity.stopLockTask();
                isExamPinned = false;
                stopPolling();

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
        if (!isExamPinned) return;
        int mode = getLockTaskModeCode();
        if (mode == ActivityManager.LOCK_TASK_MODE_NONE) {
            isExamPinned = false;
            stopPolling();

            JSObject data = new JSObject();
            data.put("timestamp", System.currentTimeMillis());
            data.put("source", source);
            data.put("lockTaskMode", "none");
            notifyListeners("pinningExited", data);
            Logger.warn(TAG, "pinningExited event fired (source=" + source + ")");
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

        if (isExamPinned) {
            checkLockTaskState("resume");
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopPolling();
        super.handleOnDestroy();
    }

    public void onWindowFocusChanged(boolean hasFocus) {
        JSObject data = new JSObject();
        data.put("hasFocus", hasFocus);
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("windowFocusChanged", data);
        Logger.info(TAG, "windowFocusChanged event fired: hasFocus=" + hasFocus);

        if (isExamPinned) {
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
