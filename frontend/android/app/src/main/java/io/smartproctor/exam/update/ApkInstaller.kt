package io.smartproctor.exam.update

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import io.smartproctor.exam.update.models.SignatureVerificationResult
import java.io.File

/**
 * Handles package verification, cryptographic signature comparison, and launching the Android Package Installer.
 */
class ApkInstaller(
    private val context: Context,
    val signatureVerifier: ApkSignatureVerifier = ApkSignatureVerifier()
) {
    companion object {
        private const val TAG = "ApkInstaller"
        const val APK_MIME_TYPE = "application/vnd.android.package-archive"
        const val REQUEST_CODE_UNKNOWN_SOURCES = 1001
    }

    /**
     * Outcome of preparing and launching an APK installation.
     */
    sealed class InstallResult {
        object Success : InstallResult()
        object PermissionNeeded : InstallResult()
        data class SignatureMismatch(
            val installedFingerprint: String,
            val candidateFingerprint: String
        ) : InstallResult()
        data class Error(val message: String, val cause: Throwable? = null) : InstallResult()
    }

    /**
     * Checks if the app has permission to install unknown apps (Android 8.0+).
     */
    fun canInstallUnknownApps(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    /**
     * Directs the user to System Settings to toggle "Allow from this source".
     */
    fun openUnknownAppSourcesSettings(activity: Activity? = null) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                Log.i(TAG, "[Install] Directing user to ACTION_MANAGE_UNKNOWN_APP_SOURCES settings")
                if (activity != null) {
                    activity.startActivityForResult(intent, REQUEST_CODE_UNKNOWN_SOURCES)
                } else {
                    context.startActivity(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "[Install] Failed to open unknown app sources settings", e)
            }
        }
    }

    /**
     * Validates package metadata, verifies identical signing certificates, and launches the Android Package Installer.
     *
     * @param apkFile Downloaded candidate APK.
     * @param activity Optional activity context for starting the installer activity.
     */
    fun installApk(apkFile: File, activity: Activity? = null): InstallResult {
        Log.i(TAG, "[Install] Beginning pre-installation verification for: ${apkFile.absolutePath}")

        // 1. File existence and extension validation
        if (!apkFile.exists() || apkFile.length() == 0L) {
            val err = "Installation failed: APK file does not exist or is empty."
            Log.e(TAG, "[Install] $err")
            return InstallResult.Error(err)
        }

        if (!apkFile.name.endsWith(".apk", ignoreCase = true)) {
            val err = "Installation aborted: File does not have .apk extension."
            Log.e(TAG, "[Install] $err")
            return InstallResult.Error(err)
        }

        // 2. Package archive validity and package name validation
        val packageInfo = try {
            context.packageManager.getPackageArchiveInfo(apkFile.absolutePath, 0)
        } catch (e: Exception) {
            Log.e(TAG, "[Install] Could not parse package archive info", e)
            null
        }

        if (packageInfo == null) {
            val err = "Corrupted APK: Android system was unable to parse package info."
            Log.e(TAG, "[Install] $err")
            return InstallResult.Error(err)
        }

        if (packageInfo.packageName != context.packageName) {
            val err = "Security violation: APK package '${packageInfo.packageName}' does not match installed application '${context.packageName}'."
            Log.e(TAG, "[Install] $err")
            return InstallResult.Error(err)
        }

        // 3. Cryptographic signing certificate verification (Highest Priority)
        val sigResult = signatureVerifier.verifyApkSignature(context, apkFile)
        when (sigResult) {
            is SignatureVerificationResult.Success -> {
                Log.i(TAG, "[Install] Cryptographic certificate check passed (Fingerprint: ${sigResult.fingerprintSha256})")
            }
            is SignatureVerificationResult.Mismatch -> {
                Log.e(TAG, "[Install] BLOCKED: Certificate mismatch! Installed=[${sigResult.installedFingerprint}], Downloaded=[${sigResult.candidateFingerprint}]")
                return InstallResult.SignatureMismatch(sigResult.installedFingerprint, sigResult.candidateFingerprint)
            }
            is SignatureVerificationResult.Error -> {
                Log.e(TAG, "[Install] BLOCKED: Certificate inspection error: ${sigResult.message}")
                return InstallResult.Error("Signing certificate validation failed: ${sigResult.message}", sigResult.cause)
            }
        }

        // 4. Unknown sources installation permission check (Android 8.0+)
        if (!canInstallUnknownApps()) {
            Log.w(TAG, "[Install] Permission required: ACTION_MANAGE_UNKNOWN_APP_SOURCES")
            openUnknownAppSourcesSettings(activity)
            return InstallResult.PermissionNeeded
        }

        // 5. Generate FileProvider URI and launch system Package Installer
        return try {
            val authority = "${context.packageName}.fileprovider"
            val contentUri = FileProvider.getUriForFile(context, authority, apkFile)

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, APK_MIME_TYPE)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }

            Log.i(TAG, "[Install] Launching system Package Installer intent with URI: $contentUri")
            if (activity != null) {
                activity.startActivity(installIntent)
            } else {
                context.startActivity(installIntent)
            }

            InstallResult.Success
        } catch (e: Exception) {
            Log.e(TAG, "[Install] Failed to launch package installer", e)
            InstallResult.Error("Failed to launch package installer: ${e.localizedMessage}", e)
        }
    }
}
