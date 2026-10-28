package io.smartproctor.exam.update

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageInfo
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.util.Log
import androidx.core.content.pm.PackageInfoCompat
import io.smartproctor.exam.update.models.ReleaseInfo
import io.smartproctor.exam.update.models.UpdateCheckResult

/**
 * Repository orchestrating update checking, ETag caching, rate limiting, and session state.
 */
class UpdateRepository(
    private val context: Context,
    val releaseService: GitHubReleaseService = GitHubReleaseService(),
    val updateChecker: UpdateChecker = UpdateChecker()
) {
    companion object {
        private const val TAG = "UpdateRepository"
        private const val PREFS_NAME = "smartproctor_updates"

        const val KEY_LAST_CHECK_TIME = "last_check_time"
        const val KEY_CACHED_ETAG = "cached_etag"
        const val KEY_RATE_LIMIT_RESET_EPOCH = "rate_limit_reset_epoch"

        @Volatile
        private var instance: UpdateRepository? = null

        fun getInstance(context: Context): UpdateRepository {
            return instance ?: synchronized(this) {
                instance ?: UpdateRepository(context.applicationContext).also { instance = it }
            }
        }
    }

    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    /**
     * Session-scoped flag to prevent the update dialog from appearing repeatedly
     * during the same app session after the user clicks "Later".
     */
    var hasUserDeferredInSession: Boolean = false
        private set

    /**
     * Caches the latest available release metadata if found.
     */
    var cachedAvailableRelease: ReleaseInfo? = null
        private set

    /**
     * Marks the current session as deferred.
     */
    fun markDeferred() {
        Log.i(TAG, "[UpdateSession] User deferred update prompt for current session")
        hasUserDeferredInSession = true
    }

    /**
     * Resets the session deferral state (e.g. for manual checks from Settings).
     */
    fun resetDeferral() {
        hasUserDeferredInSession = false
    }

    /**
     * Verifies active network connectivity.
     */
    fun isNetworkAvailable(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val activeNet = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(activeNet) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } else {
            @Suppress("DEPRECATION")
            val info = cm.activeNetworkInfo
            @Suppress("DEPRECATION")
            info != null && info.isConnected
        }
    }

    /**
     * Checks for updates against GitHub Releases.
     *
     * Honors:
     * - Minimum frequency interval between automatic checks (default: 12h)
     * - HTTP ETag caching (`If-None-Match` -> `304 Not Modified`)
     * - GitHub rate limit detection (`X-RateLimit-*`)
     * - Network offline state
     * - User session deferrals
     *
     * @param isManual True if initiated by the user (bypasses frequency and deferral gates).
     */
    suspend fun checkForUpdate(isManual: Boolean = false): UpdateCheckResult {
        val currentVersionName = getInstalledVersionName()
        val currentVersionCode = getInstalledVersionCode()
        val now = System.currentTimeMillis()

        // 1. Session deferral check (automatic checks only)
        if (!isManual && hasUserDeferredInSession) {
            Log.d(TAG, "[UpdateCheck] Skipped: user deferred update for current session")
            return UpdateCheckResult.UpToDate(currentVersionName, currentVersionCode, isCached = true)
        }

        // 2. Frequency gate (automatic checks only)
        val lastCheckTime = prefs.getLong(KEY_LAST_CHECK_TIME, 0L)
        val checkInterval = releaseService.config.checkIntervalMs
        if (!isManual && (now - lastCheckTime) < checkInterval) {
            val elapsedMinutes = (now - lastCheckTime) / 60000L
            val intervalMinutes = checkInterval / 60000L
            Log.i(TAG, "[UpdateCheck] Skipped automatic check: last check was ${elapsedMinutes}m ago (interval: ${intervalMinutes}m)")
            return UpdateCheckResult.UpToDate(currentVersionName, currentVersionCode, isCached = true)
        }

        // 3. Rate limit reset check
        val rateLimitResetEpoch = prefs.getLong(KEY_RATE_LIMIT_RESET_EPOCH, 0L)
        val nowEpoch = now / 1000L
        if (nowEpoch < rateLimitResetEpoch) {
            Log.w(TAG, "[UpdateCheck] GitHub API rate limit active until epoch: $rateLimitResetEpoch (remaining: ${rateLimitResetEpoch - nowEpoch}s)")
            return UpdateCheckResult.RateLimited(rateLimitResetEpoch, currentVersionName)
        }

        // 4. Connectivity check
        if (!isNetworkAvailable()) {
            Log.i(TAG, "[UpdateCheck] Device is offline. Skipping network query.")
            return if (isManual) {
                UpdateCheckResult.Error("No internet connection available. Please check your network and try again.")
            } else {
                UpdateCheckResult.Offline(currentVersionName)
            }
        }

        // 5. Query GitHub with cached ETag
        val cachedETag = prefs.getString(KEY_CACHED_ETAG, null)
        val fetchResult = releaseService.fetchLatestRelease(cachedETag)

        return when (fetchResult) {
            is GitHubFetchResult.NotModified -> {
                Log.i(TAG, "[UpdateCheck] 304 Not Modified received: repository release unchanged")
                prefs.edit().putLong(KEY_LAST_CHECK_TIME, now).apply()

                val cachedRelease = cachedAvailableRelease
                if (cachedRelease != null) {
                    updateChecker.checkVersion(cachedRelease, currentVersionName, currentVersionCode)
                } else {
                    UpdateCheckResult.UpToDate(currentVersionName, currentVersionCode, isCached = true)
                }
            }
            is GitHubFetchResult.Success -> {
                Log.i(TAG, "[UpdateCheck] Successfully fetched latest release: ${fetchResult.release.versionName}")
                prefs.edit()
                    .putLong(KEY_LAST_CHECK_TIME, now)
                    .putString(KEY_CACHED_ETAG, fetchResult.eTag)
                    .apply()

                val checkResult = updateChecker.checkVersion(
                    release = fetchResult.release,
                    installedVersionName = currentVersionName,
                    installedVersionCode = currentVersionCode
                )

                if (checkResult is UpdateCheckResult.Available) {
                    cachedAvailableRelease = fetchResult.release
                }

                checkResult
            }
            is GitHubFetchResult.RateLimited -> {
                Log.w(TAG, "[UpdateCheck] GitHub API rate limit encountered. Reset epoch: ${fetchResult.resetEpochSeconds}")
                prefs.edit().putLong(KEY_RATE_LIMIT_RESET_EPOCH, fetchResult.resetEpochSeconds).apply()
                UpdateCheckResult.RateLimited(fetchResult.resetEpochSeconds, currentVersionName)
            }
            is GitHubFetchResult.NotFound -> {
                Log.i(TAG, "[UpdateCheck] No releases published on GitHub repository yet")
                prefs.edit().putLong(KEY_LAST_CHECK_TIME, now).apply()
                UpdateCheckResult.UpToDate(currentVersionName, currentVersionCode)
            }
            is GitHubFetchResult.Error -> {
                Log.w(TAG, "[UpdateCheck] Update check error: ${fetchResult.message}")
                UpdateCheckResult.Error(fetchResult.message, fetchResult.cause)
            }
        }
    }

    /**
     * Returns installed application version name.
     */
    fun getInstalledVersionName(): String {
        return try {
            val pInfo = getPackageInfo()
            pInfo.versionName ?: "1.0.0"
        } catch (e: Exception) {
            Log.w(TAG, "Could not retrieve installed versionName", e)
            "1.0.0"
        }
    }

    /**
     * Returns installed application version code.
     */
    fun getInstalledVersionCode(): Long {
        return try {
            val pInfo = getPackageInfo()
            PackageInfoCompat.getLongVersionCode(pInfo)
        } catch (e: Exception) {
            Log.w(TAG, "Could not retrieve installed versionCode", e)
            1L
        }
    }

    private fun getPackageInfo(): PackageInfo {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getPackageInfo(
                context.packageName,
                android.content.pm.PackageManager.PackageInfoFlags.of(0)
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, 0)
        }
    }
}
