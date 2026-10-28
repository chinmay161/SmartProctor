package io.smartproctor.exam.update

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import io.smartproctor.exam.update.models.SignatureVerificationResult
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Arrays
import java.util.jar.JarEntry
import java.util.jar.JarFile

/**
 * Handles cryptographic signature verification of APK files.
 *
 * Enforces that any downloaded update must be signed with the identical certificate
 * as the currently running installed application before package installation can be initiated.
 */
class ApkSignatureVerifier {

    companion object {
        private const val TAG = "ApkSignatureVerifier"

        /**
         * Computes the colon-delimited uppercase hex SHA-256 fingerprint for a raw certificate byte array.
         */
        fun computeSha256Fingerprint(certBytes: ByteArray): String {
            val md = MessageDigest.getInstance("SHA-256")
            val digest = md.digest(certBytes)
            return digest.joinToString(":") { "%02X".format(it) }
        }
    }

    /**
     * Verifies that [apkFile] is signed by the exact same certificate as the installed app.
     *
     * @param context Application context used to query [PackageManager].
     * @param apkFile Downloaded candidate APK file.
     * @return [SignatureVerificationResult.Success] if certificates match, or [SignatureVerificationResult.Mismatch] if they differ.
     */
    fun verifyApkSignature(context: Context, apkFile: File): SignatureVerificationResult {
        Log.i(TAG, "[Security] Verifying signing certificate for candidate APK: ${apkFile.name}")

        val installedSignatures = try {
            getInstalledSignatures(context)
        } catch (e: Exception) {
            Log.e(TAG, "[Security] Failed to read installed app signature", e)
            return SignatureVerificationResult.Error("Could not retrieve installed app signing certificate: ${e.message}", e)
        }

        if (installedSignatures.isEmpty()) {
            val msg = "Installed application has no signing certificates."
            Log.e(TAG, "[Security] $msg")
            return SignatureVerificationResult.Error(msg)
        }

        val apkSignatures = try {
            getArchiveSignatures(context, apkFile)
        } catch (e: Exception) {
            Log.e(TAG, "[Security] Failed to read candidate APK signature", e)
            return SignatureVerificationResult.Error("Could not retrieve candidate APK signing certificate: ${e.message}", e)
        }

        if (apkSignatures.isEmpty()) {
            val msg = "Candidate APK has no signing certificates or is unsigned."
            Log.e(TAG, "[Security] $msg")
            return SignatureVerificationResult.Error(msg)
        }

        return verifyCertificates(installedSignatures, apkSignatures)
    }

    /**
     * Pure verification function comparing two lists of raw certificate byte arrays.
     * Accessible for isolated JVM unit testing.
     */
    fun verifyCertificates(
        installedSignatures: List<ByteArray>,
        candidateSignatures: List<ByteArray>
    ): SignatureVerificationResult {
        if (installedSignatures.isEmpty() || candidateSignatures.isEmpty()) {
            return SignatureVerificationResult.Error("Certificate list is empty.")
        }

        val installedFingerprints = installedSignatures.map { computeSha256Fingerprint(it) }
        val candidateFingerprints = candidateSignatures.map { computeSha256Fingerprint(it) }

        // Check if any candidate signature matches any installed signature (supports certificate rotation)
        var hasMatch = false
        for (inst in installedSignatures) {
            for (cand in candidateSignatures) {
                if (Arrays.equals(inst, cand)) {
                    hasMatch = true
                    break
                }
            }
            if (hasMatch) break
        }

        return if (hasMatch) {
            val primaryFingerprint = candidateFingerprints.first()
            Log.i(TAG, "[Security] APK signature verification SUCCESS (SHA-256: $primaryFingerprint)")
            SignatureVerificationResult.Success(primaryFingerprint)
        } else {
            val instDisplay = installedFingerprints.joinToString(", ")
            val candDisplay = candidateFingerprints.joinToString(", ")
            Log.e(TAG, "[Security] APK signature verification FAILED! Installed: [$instDisplay], Candidate: [$candDisplay]")
            SignatureVerificationResult.Mismatch(instDisplay, candDisplay)
        }
    }

    /**
     * Retrieves raw certificate bytes for the installed SmartProctor application.
     */
    @Suppress("DEPRECATION")
    private fun getInstalledSignatures(context: Context): List<ByteArray> {
        val pm = context.packageManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val pInfo = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            val signingInfo = pInfo.signingInfo ?: return emptyList()
            val sigs = if (signingInfo.hasMultipleSigners()) {
                signingInfo.apkContentsSigners
            } else {
                signingInfo.signingCertificateHistory
            }
            sigs?.map { it.toByteArray() } ?: emptyList()
        } else {
            val pInfo = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
            pInfo.signatures?.map { it.toByteArray() } ?: emptyList()
        }
    }

    /**
     * Extracts raw certificate bytes from an APK archive file.
     * Uses PackageManager first, falling back to direct Jar/Zip certificate parsing.
     */
    @Suppress("DEPRECATION")
    private fun getArchiveSignatures(context: Context, apkFile: File): List<ByteArray> {
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            PackageManager.GET_SIGNATURES
        }

        val archiveInfo = pm.getPackageArchiveInfo(apkFile.absolutePath, flags)
        if (archiveInfo != null) {
            archiveInfo.applicationInfo?.sourceDir = apkFile.absolutePath
            archiveInfo.applicationInfo?.publicSourceDir = apkFile.absolutePath

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val signingInfo = archiveInfo.signingInfo
                if (signingInfo != null) {
                    val sigs = if (signingInfo.hasMultipleSigners()) {
                        signingInfo.apkContentsSigners
                    } else {
                        signingInfo.signingCertificateHistory
                    }
                    if (!sigs.isNullOrEmpty()) {
                        return sigs.map { it.toByteArray() }
                    }
                }
            }

            val fallbackSigs = archiveInfo.signatures
            if (!fallbackSigs.isNullOrEmpty()) {
                return fallbackSigs.map { it.toByteArray() }
            }
        }

        // Direct JAR entry fallback extraction
        return extractCertificatesFromJar(apkFile)
    }

    /**
     * Fallback parser extracting certificates directly from META-INF entries within the APK JAR.
     */
    private fun extractCertificatesFromJar(apkFile: File): List<ByteArray> {
        val certs = mutableListOf<ByteArray>()
        try {
            JarFile(apkFile).use { jarFile ->
                val entries = jarFile.entries()
                val certFactory = CertificateFactory.getInstance("X.509")

                while (entries.hasMoreElements()) {
                    val entry: JarEntry = entries.nextElement()
                    if (entry.isDirectory) continue

                    val name = entry.name.uppercase()
                    if (name.startsWith("META-INF/") && (name.endsWith(".RSA") || name.endsWith(".DSA") || name.endsWith(".EC"))) {
                        jarFile.getInputStream(entry).use { inStream ->
                            try {
                                val parsedCerts = certFactory.generateCertificates(inStream)
                                for (c in parsedCerts) {
                                    if (c is X509Certificate) {
                                        certs.add(c.encoded)
                                    }
                                }
                            } catch (_: Exception) {
                            }
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[Security] Jar entry certificate fallback encountered error: ${e.message}")
        }
        return certs
    }
}
