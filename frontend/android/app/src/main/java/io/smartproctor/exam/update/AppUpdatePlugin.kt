package io.smartproctor.exam.update

import com.getcapacitor.JSObject
import com.getcapacitor.Logger
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import io.smartproctor.exam.update.models.UpdateCheckResult

/**
 * Capacitor bridge plugin exposing native in-app updates to the frontend web environment.
 */
@CapacitorPlugin(name = "AppUpdate")
class AppUpdatePlugin : Plugin() {

    companion object {
        private const val TAG = "AppUpdatePlugin"
    }

    private lateinit var updateManager: UpdateManager

    override fun load() {
        super.load()
        val ctx = context
        updateManager = UpdateManager.getInstance(ctx)

        val activity = activity
        if (activity != null) {
            updateManager.attachActivity(activity)
            // Schedule background version check on launch (asynchronously after splash screen)
            updateManager.scheduleLaunchCheck(activity, delayMs = updateManager.getRepository().releaseService.config.launchCheckDelayMs)
            Logger.info(TAG, "AppUpdatePlugin loaded and scheduled launch check")
        }
    }

    override fun handleOnResume() {
        super.handleOnResume()
        val activity = activity
        if (activity != null) {
            updateManager.attachActivity(activity)
            // If user just enabled unknown app sources, resume pending installation
            updateManager.resumePendingInstallIfAllowed()
        }
    }

    override fun handleOnDestroy() {
        val activity = activity
        if (activity != null) {
            updateManager.detachActivity(activity)
        }
        super.handleOnDestroy()
    }

    /**
     * JavaScript callable method to check for updates.
     * Options:
     *   manual: Boolean (default true when invoked manually)
     */
    @PluginMethod
    fun checkForUpdate(call: PluginCall) {
        val manual = call.getBoolean("manual", true) ?: true

        val repo = updateManager.getRepository()
        val currentVersionName = repo.getInstalledVersionName()
        val currentVersionCode = repo.getInstalledVersionCode()

        updateManager.checkForUpdates(isManual = manual) { result ->
            val res = JSObject()
            res.put("currentVersion", currentVersionName)
            res.put("currentVersionCode", currentVersionCode)

            when (result) {
                is UpdateCheckResult.Available -> {
                    res.put("available", true)
                    res.put("latestVersion", result.release.versionName)
                    res.put("latestVersionCode", result.release.versionCode ?: 0L)
                    res.put("tagName", result.release.tagName)
                    res.put("releaseNotes", result.release.releaseNotes)
                    res.put("apkUrl", result.release.apkAsset.downloadUrl)
                    res.put("apkSize", result.release.apkAsset.sizeBytes)
                    call.resolve(res)
                }
                is UpdateCheckResult.UpToDate -> {
                    res.put("available", false)
                    res.put("latestVersion", currentVersionName)
                    res.put("isCached", result.isCached)
                    call.resolve(res)
                }
                is UpdateCheckResult.RateLimited -> {
                    res.put("available", false)
                    res.put("rateLimited", true)
                    res.put("resetEpoch", result.resetEpochSeconds)
                    call.resolve(res)
                }
                is UpdateCheckResult.Offline -> {
                    res.put("available", false)
                    res.put("offline", true)
                    call.resolve(res)
                }
                is UpdateCheckResult.Error -> {
                    res.put("available", false)
                    res.put("error", result.message)
                    call.reject(result.message, result.cause?.message ?: result.message)
                }
            }
        }
    }

    /**
     * Triggers downloading and installing the cached available release.
     */
    @PluginMethod
    fun downloadAndInstall(call: PluginCall) {
        val repo = updateManager.getRepository()
        val release = repo.cachedAvailableRelease

        if (release == null) {
            call.reject("No update release currently available to download.")
            return
        }

        updateManager.downloadAndInstall(release, activity)
        val res = JSObject()
        res.put("success", true)
        res.put("message", "Download enqueued")
        call.resolve(res)
    }

    /**
     * Returns the installed application version and code.
     */
    @PluginMethod
    fun getAppVersion(call: PluginCall) {
        val repo = updateManager.getRepository()
        val res = JSObject()
        res.put("versionName", repo.getInstalledVersionName())
        res.put("versionCode", repo.getInstalledVersionCode())
        res.put("platform", "android")
        call.resolve(res)
    }

    /**
     * Directly opens the Unknown App Sources settings screen.
     */
    @PluginMethod
    fun openUnknownSourcesSettings(call: PluginCall) {
        val installer = updateManager.getInstaller()
        installer.openUnknownAppSourcesSettings(activity)
        call.resolve(JSObject().apply { put("success", true) })
    }
}
