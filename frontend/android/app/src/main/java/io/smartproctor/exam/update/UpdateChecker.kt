package io.smartproctor.exam.update

import android.util.Log
import io.smartproctor.exam.update.models.ReleaseInfo
import io.smartproctor.exam.update.models.UpdateCheckResult

/**
 * Compares GitHub release metadata against the currently installed application version.
 *
 * Implements robust semantic versioning (SemVer) with fallback to internal Android [versionCode].
 */
class UpdateChecker {

    companion object {
        private const val TAG = "UpdateChecker"
    }

    /**
     * Determines whether [release] is newer than the currently installed application.
     *
     * @param release Metadata of the candidate GitHub release.
     * @param installedVersionName Installed application versionName (e.g. "1.0.0").
     * @param installedVersionCode Installed application versionCode (e.g. 1L).
     * @return [UpdateCheckResult.Available] if release is newer, otherwise [UpdateCheckResult.UpToDate].
     */
    fun checkVersion(
        release: ReleaseInfo,
        installedVersionName: String,
        installedVersionCode: Long
    ): UpdateCheckResult {
        val cleanInstalledName = cleanVersionString(installedVersionName)
        val cleanReleaseName = cleanVersionString(release.versionName)

        // 1. Primary check: If release defines a numeric versionCode, compare numeric codes
        if (release.versionCode != null && installedVersionCode > 0) {
            return if (release.versionCode > installedVersionCode) {
                Log.i(TAG, "[UpdateCheck] New version detected by versionCode: release=${release.versionCode} > installed=$installedVersionCode")
                UpdateCheckResult.Available(release, installedVersionName, installedVersionCode)
            } else {
                Log.i(TAG, "[UpdateCheck] App is up to date by versionCode: release=${release.versionCode} <= installed=$installedVersionCode")
                UpdateCheckResult.UpToDate(installedVersionName, installedVersionCode)
            }
        }

        // 2. Secondary check: Compare semantic version names (e.g. "1.3.0" vs "1.0.0")
        val comparison = compareVersions(cleanReleaseName, cleanInstalledName)
        return if (comparison > 0) {
            Log.i(TAG, "[UpdateCheck] New version detected by SemVer: release=$cleanReleaseName > installed=$cleanInstalledName")
            UpdateCheckResult.Available(release, installedVersionName, installedVersionCode)
        } else {
            Log.i(TAG, "[UpdateCheck] App is up to date by SemVer: release=$cleanReleaseName <= installed=$cleanInstalledName")
            UpdateCheckResult.UpToDate(installedVersionName, installedVersionCode)
        }
    }

    /**
     * Compares two semantic version strings numerically by component (e.g. "1.3.0" vs "1.2.10").
     *
     * Handles variable length components (e.g. "1.0" vs "1.0.0.1"), pre-release suffixes ("-rc1"),
     * and malformed inputs safely.
     *
     * @return Positive integer if [v1] > [v2], 0 if equal, negative integer if [v1] < [v2].
     */
    fun compareVersions(v1: String, v2: String): Int {
        val parts1 = splitVersionParts(v1)
        val parts2 = splitVersionParts(v2)

        val maxLength = maxOf(parts1.size, parts2.size)
        for (i in 0 until maxLength) {
            val num1 = parts1.getOrElse(i) { 0 }
            val num2 = parts2.getOrElse(i) { 0 }

            if (num1 != num2) {
                return num1.compareTo(num2)
            }
        }
        return 0
    }

    /**
     * Splits version string into a list of integer components.
     * E.g. "v1.3.0-rc1+42" -> [1, 3, 0]
     */
    fun splitVersionParts(version: String): List<Int> {
        val clean = version.trim()
            .removePrefix("v")
            .removePrefix("V")
            .split("-")[0]
            .split("+")[0]

        val parts = clean.split(".")
            .mapNotNull { it.trim().toIntOrNull() }

        return if (parts.isNotEmpty()) parts else listOf(0)
    }

    /**
     * Normalizes a version string by stripping leading 'v'/'V' and trailing whitespace.
     */
    fun cleanVersionString(version: String): String {
        return version.trim().removePrefix("v").removePrefix("V")
    }
}
