package io.smartproctor.exam.update.models

import java.io.File

/**
 * Details of a downloadable release asset (e.g. an APK file).
 *
 * @property name File name of the asset (e.g. "SmartProctor-v1.3.0.apk").
 * @property downloadUrl Remote HTTPS URL from which the asset binary can be fetched.
 * @property sizeBytes Size of the asset in bytes (0 if unknown).
 * @property contentType MIME content type returned by GitHub (e.g. "application/vnd.android.package-archive").
 */
data class ReleaseAsset(
    val name: String,
    val downloadUrl: String,
    val sizeBytes: Long = 0L,
    val contentType: String? = null
)

/**
 * Metadata for an official GitHub release.
 *
 * @property tagName Git tag name associated with the release (e.g. "v1.3.0").
 * @property versionName Normalized semantic version string (e.g. "1.3.0").
 * @property versionCode Optional internal Android build number extracted from tag or notes.
 * @property releaseNotes Markdown or plain text release notes describing changes in this version.
 * @property publishedAt ISO-8601 timestamp string when the release was published.
 * @property apkAsset Filtered and prioritized APK asset selected for installation.
 * @property isDraft True if this release is marked as a draft on GitHub.
 * @property isPrerelease True if this release is marked as a pre-release on GitHub.
 * @property eTag Cached HTTP ETag header associated with this release snapshot.
 */
data class ReleaseInfo(
    val tagName: String,
    val versionName: String,
    val versionCode: Long? = null,
    val releaseNotes: String,
    val publishedAt: String? = null,
    val apkAsset: ReleaseAsset,
    val isDraft: Boolean = false,
    val isPrerelease: Boolean = false,
    val eTag: String? = null
)

/**
 * Result of comparing installed application version against GitHub releases.
 */
sealed class UpdateCheckResult {
    /**
     * An update is available and ready for download.
     */
    data class Available(
        val release: ReleaseInfo,
        val currentVersionName: String,
        val currentVersionCode: Long
    ) : UpdateCheckResult()

    /**
     * The application is already running the latest version or an update was deferred.
     */
    data class UpToDate(
        val currentVersionName: String,
        val currentVersionCode: Long,
        val isCached: Boolean = false
    ) : UpdateCheckResult()

    /**
     * GitHub API rate limit was encountered. The check should be deferred until [resetEpochSeconds].
     */
    data class RateLimited(
        val resetEpochSeconds: Long,
        val currentVersionName: String
    ) : UpdateCheckResult()

    /**
     * Device is currently offline or unreachable.
     */
    data class Offline(
        val currentVersionName: String
    ) : UpdateCheckResult()

    /**
     * An error occurred while communicating with GitHub or parsing metadata.
     */
    data class Error(
        val message: String,
        val cause: Throwable? = null
    ) : UpdateCheckResult()
}

/**
 * Download state updates during APK retrieval.
 */
sealed class DownloadState {
    object Idle : DownloadState()
    data class Downloading(val progressPercent: Int, val bytesDownloaded: Long, val totalBytes: Long) : DownloadState()
    data class Completed(val downloadId: Long, val file: File) : DownloadState()
    data class Failed(val reason: String, val errorCode: Int? = null) : DownloadState()
}

/**
 * Result of cryptographic APK signing certificate comparison.
 */
sealed class SignatureVerificationResult {
    /**
     * Certificates match identically.
     * @property fingerprintSha256 Hex-formatted SHA-256 fingerprint of the verified certificate.
     */
    data class Success(val fingerprintSha256: String) : SignatureVerificationResult()

    /**
     * Certificates do not match. Installation must be blocked to prevent spoofing.
     */
    data class Mismatch(
        val installedFingerprint: String,
        val candidateFingerprint: String
    ) : SignatureVerificationResult()

    /**
     * Unable to extract or parse certificates from either the installed app or the APK file.
     */
    data class Error(val message: String, val cause: Throwable? = null) : SignatureVerificationResult()
}
