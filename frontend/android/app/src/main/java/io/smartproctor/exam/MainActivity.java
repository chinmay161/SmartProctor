package io.smartproctor.exam;

import android.content.res.Configuration;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

import io.smartproctor.exam.update.AppUpdatePlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ExamLockPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        ExamLockPlugin plugin = getExamLockPlugin();
        if (plugin != null) {
            plugin.onWindowFocusChanged(hasFocus);
        }
    }

    @Override
    public void onMultiWindowModeChanged(boolean isInMultiWindowMode, Configuration newConfig) {
        super.onMultiWindowModeChanged(isInMultiWindowMode, newConfig);
        ExamLockPlugin plugin = getExamLockPlugin();
        if (plugin != null) {
            plugin.onMultiWindowModeChanged(isInMultiWindowMode);
        }
    }

    private ExamLockPlugin getExamLockPlugin() {
        ExamLockPlugin instance = ExamLockPlugin.getInstance();
        if (instance != null) {
            return instance;
        }
        if (getBridge() != null) {
            PluginHandle handle = getBridge().getPlugin("ExamLock");
            if (handle != null) {
                return (ExamLockPlugin) handle.getInstance();
            }
        }
        return null;
    }
}
