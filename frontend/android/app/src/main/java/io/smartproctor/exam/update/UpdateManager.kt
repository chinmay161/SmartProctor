package io.smartproctor.exam.update

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import io.smartproctor.exam.update.models.ReleaseInfo
import io.smartproctor.exam.update.models.UpdateCheckResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File
import java.lang.ref.WeakReference

/**
 * High-level coordinator managing the in-app update lifecycle.
 *
 * Coordinates asynchronous version checks, rate limit handling, DownloadManager jobs,
 * cryptographic signature validation, and Material Design UI dialog interactions.
 */
class UpdateManager private constructor(context: Context) {

    companion object {
        private const val TAG = "UpdateManager"

        @Volatile
        private var instance: UpdateManager? = null

        fun getInstance(context: Context): UpdateManager {
            return instance ?: synchronized(this) {
                instance ?: UpdateManager(context.applicationContext).also { instance = it }
            }
        }
    }

    private val applicationContext = context.applicationContext
    private val repository = UpdateRepository.getInstance(applicationContext)
    private val downloader = ApkDownloader(applicationContext)
    private val installer = ApkInstaller(applicationContext)
    private val dialogHelper = UpdateDialog()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var currentActivityRef: WeakReference<Activity>? = null

    // Cache the downloaded APK file in case user needs to grant permission in Settings first
    private var pendingInstallFile: File? = null

    /**
     * Binds the active activity using a [WeakReference] to display UI dialogs safely without leaks.
     */
    fun attachActivity(activity: Activity) {
        currentActivityRef = WeakReference(activity)
    }

    /**
     * Detaches the activity when destroyed, dismissing any active dialogs.
     */
    fun detachActivity(activity: Activity) {
        if (currentActivityRef?.get() == activity) {
            currentActivityRef = null
            UpdateDialog.dismissActiveDialog()
        }
    }

    /**
     * Starts an update check.
     *
     * @param isManual True if initiated by the user (e.g. from Settings), false if automatic on launch.
     * @param onComplete Optional callback reporting the check result.
     */
    fun checkForUpdates(
        isManual: Boolean = false,
        onComplete: ((UpdateCheckResult) -> Unit)? = null
    ) {
        scope.launch {
            Log.i(TAG, "[UpdateManager] Starting update check (isManual=$isManual)...")
            val result = repository.checkForUpdate(isManual = isManual)

            val activity = currentActivityRef?.get()
            val isActivityValid = activity != null && (!activity.isFinishing && !activity.isDestroyed)

            when (result) {
                is UpdateCheckResult.Available -> {
                    Log.i(TAG, "[UpdateManager] Update available: ${result.release.versionName}")
                    if (isActivityValid) {
                        dialogHelper.showUpdateAvailable(
                            activity = activity!!,
                            release = result.release,
                            onUpdateNow = {
                                downloadAndInstall(result.release, activity)
                            },
                            onLater = {
                                repository.markDeferred()
                            }
                        )
                    }
                }
                is UpdateCheckResult.UpToDate -> {
                    Log.i(TAG, "[UpdateManager] App is up to date: ${result.currentVersionName} (isCached=${result.isCached})")
                    if (isManual && isActivityValid) {
                        dialogHelper.showUpToDate(activity!!, result.currentVersionName)
                    }
                }
                is UpdateCheckResult.RateLimited -> {
                    Log.w(TAG, "[UpdateManager] GitHub API rate limit active. Reset epoch: ${result.resetEpochSeconds}")
                    if (isManual && isActivityValid) {
                        dialogHelper.showRateLimitNotice(activity!!, result.resetEpochSeconds)
                    }
                }
                is UpdateCheckResult.Offline -> {
                    Log.i(TAG, "[UpdateManager] Device is offline. Automatic check skipped.")
                    if (isManual && isActivityValid) {
                        dialogHelper.showError(
                            activity = activity!!,
                            message = "No internet connection detected. Please connect to a network and try again."
                        )
                    }
                }
                is UpdateCheckResult.Error -> {
                    Log.w(TAG, "[UpdateManager] Update check error: ${result.message}")
                    if (isManual && isActivityValid) {
                        dialogHelper.showError(
                            activity = activity!!,
                            message = result.message,
                            onRetry = { checkForUpdates(isManual = true, onComplete = onComplete) }
                        )
                    }
                }
            }

            onComplete?.invoke(result)
        }
    }

    /**
     * Downloads and initiates installation for the provided release.
     */
    fun downloadAndInstall(release: ReleaseInfo, activity: Activity? = null) {
        val act = activity ?: currentActivityRef?.get()
        act?.let {
            Toast.makeText(it, "Downloading SmartProctor update in background...", Toast.LENGTH_SHORT).show()
        }

        downloader.startDownload(release, object : ApkDownloader.DownloadCallback {
            override fun onDownloadStarted(downloadId: Long) {
                Log.i(TAG, "[UpdateManager] Download started / resumed with ID: $downloadId")
            }

            override fun onDownloadComplete(downloadId: Long, apkFile: File) {
                Log.i(TAG, "[UpdateManager] Download finished for ID: $downloadId -> ${apkFile.absolutePath}")
                pendingInstallFile = apkFile
                executeInstall(apkFile)
            }

            override fun onDownloadFailed(downloadId: Long, reason: String) {
                Log.e(TAG, "[UpdateManager] Download failed for ID $downloadId: $reason")
                val curActivity = currentActivityRef?.get()
                if (curActivity != null && (!curActivity.isFinishing && !curActivity.isDestroyed)) {
                    dialogHelper.showError(
                        activity = curActivity,
                        message = "Could not download update: $reason",
                        onRetry = { downloadAndInstall(release, curActivity) }
                    )
                }
            }
        })
    }

    /**
     * Verifies cryptographic signatures and invokes the Android Package Installer.
     */
    fun executeInstall(apkFile: File) {
        val activity = currentActivityRef?.get()
        val installResult = installer.installApk(apkFile, activity)

        when (installResult) {
            is ApkInstaller.InstallResult.Success -> {
                Log.i(TAG, "[UpdateManager] Package installer launched successfully")
                // Clean up any stale older APKs while keeping the active one
                downloader.cleanupOldDownloads(excludeFile = apkFile)
            }
            is ApkInstaller.InstallResult.SignatureMismatch -> {
                Log.e(TAG, "[UpdateManager] SECURITY ALERT: Signature mismatch! Aborting installation.")
                pendingInstallFile = null
                // Delete untrusted file immediately
                try {
                    apkFile.delete()
                } catch (_: Exception) {}

                activity?.let { act ->
                    dialogHelper.showSignatureMismatchError(
                        activity = act,
                        installedCert = installResult.installedFingerprint,
                        candidateCert = installResult.candidateFingerprint
                    )
                }
            }
            is ApkInstaller.InstallResult.PermissionNeeded -> {
                Log.w(TAG, "[UpdateManager] Permission required: ACTION_MANAGE_UNKNOWN_APP_SOURCES")
                activity?.let { act ->
                    dialogHelper.showUnknownSourcesPrompt(
                        activity = act,
                        onConfirm = {
                            installer.openUnknownAppSourcesSettings(act)
                        },
                        onCancel = {
                            Log.d(TAG, "[UpdateManager] User declined to grant unknown app sources permission")
                        }
                    )
                }
            }
            is ApkInstaller.InstallResult.Error -> {
                Log.e(TAG, "[UpdateManager] Installation preparation failed: ${installResult.message}")
                activity?.let { act ->
                    dialogHelper.showError(act, installResult.message)
                }
            }
        }
    }

    /**
     * Resumes pending installation once the user returns after granting the unknown sources permission.
     */
    fun resumePendingInstallIfAllowed() {
        val file = pendingInstallFile ?: return
        if (installer.canInstallUnknownApps()) {
            Log.i(TAG, "[UpdateManager] Resuming pending installation after permission grant")
            pendingInstallFile = null
            executeInstall(file)
        }
    }

    /**
     * Schedules a background check upon application launch after splash delay.
     */
    fun scheduleLaunchCheck(activity: Activity, delayMs: Long = 2500L) {
        attachActivity(activity)
        Handler(Looper.getMainLooper()).postDelayed({
            if (!repository.hasUserDeferredInSession) {
                checkForUpdates(isManual = false)
            }
        }, delayMs)
    }

    fun getRepository(): UpdateRepository = repository
    fun getDownloader(): ApkDownloader = downloader
    fun getInstaller(): ApkInstaller = installer
}
