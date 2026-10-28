package io.smartproctor.exam.update

import android.app.Activity
import android.os.Build
import android.text.Html
import android.text.Spanned
import android.text.method.LinkMovementMethod
import android.view.LayoutInflater
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import io.smartproctor.exam.R
import io.smartproctor.exam.update.models.ReleaseInfo
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Creates polished Material Design dialogs for in-app updates.
 *
 * Implements HTML/Markdown release notes rendering, security warning dialogs,
 * rate limit notices, and lifecycle-safe window attachment checks.
 */
class UpdateDialog {

    companion object {
        private var activeDialog: AlertDialog? = null

        /**
         * Dismisses any currently visible update dialog to prevent leaking window tokens.
         */
        fun dismissActiveDialog() {
            activeDialog?.let {
                if (it.isShowing) {
                    try {
                        it.dismiss()
                    } catch (_: Exception) {
                    }
                }
            }
            activeDialog = null
        }
    }

    /**
     * Shows the "Update Available" Material dialog.
     */
    fun showUpdateAvailable(
        activity: Activity,
        release: ReleaseInfo,
        onUpdateNow: () -> Unit,
        onLater: () -> Unit
    ) {
        if (activity.isFinishing || activity.isDestroyed) return

        activity.runOnUiThread {
            if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
            dismissActiveDialog()

            val view = LayoutInflater.from(activity).inflate(R.layout.dialog_update_available, null)
            val tvVersion = view.findViewById<TextView>(R.id.tvUpdateVersion)
            val tvNotes = view.findViewById<TextView>(R.id.tvReleaseNotes)

            tvVersion.text = "Version ${release.versionName}"
            tvNotes.text = renderMarkdown(release.releaseNotes)
            tvNotes.movementMethod = LinkMovementMethod.getInstance()

            val dialog = MaterialAlertDialogBuilder(activity)
                .setTitle("Update Available")
                .setView(view)
                .setCancelable(true)
                .setPositiveButton("Update Now") { d, _ ->
                    d.dismiss()
                    onUpdateNow()
                }
                .setNegativeButton("Later") { d, _ ->
                    d.dismiss()
                    onLater()
                }
                .setOnCancelListener {
                    onLater()
                }
                .create()

            activeDialog = dialog
            dialog.show()
        }
    }

    /**
     * Shows a "You're up to date" dialog for manual checks.
     */
    fun showUpToDate(
        activity: Activity,
        currentVersion: String
    ) {
        if (activity.isFinishing || activity.isDestroyed) return

        activity.runOnUiThread {
            if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
            dismissActiveDialog()

            val dialog = MaterialAlertDialogBuilder(activity)
                .setTitle("Up to Date")
                .setMessage("SmartProctor is currently running the latest available version (v$currentVersion).")
                .setPositiveButton("OK") { d, _ -> d.dismiss() }
                .create()

            activeDialog = dialog
            dialog.show()
        }
    }

    /**
     * Shows a security alert dialog when the candidate APK signature does not match the installed app.
     */
    fun showSignatureMismatchError(
        activity: Activity,
        installedCert: String,
        candidateCert: String
    ) {
        if (activity.isFinishing || activity.isDestroyed) return

        activity.runOnUiThread {
            if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
            dismissActiveDialog()

            val dialog = MaterialAlertDialogBuilder(activity)
                .setTitle("Security Alert: Signature Mismatch")
                .setMessage(
                    "The downloaded update is signed with an untrusted or non-matching certificate.\n\n" +
                    "To protect your device and test data integrity, installation has been blocked.\n\n" +
                    "Installed SHA-256:\n${installedCert.take(32)}...\n\n" +
                    "Downloaded SHA-256:\n${candidateCert.take(32)}..."
                )
                .setPositiveButton("Dismiss") { d, _ -> d.dismiss() }
                .create()

            activeDialog = dialog
            dialog.show()
        }
    }

    /**
     * Shows a friendly notice when GitHub rate limiting is active.
     */
    fun showRateLimitNotice(
        activity: Activity,
        resetEpochSeconds: Long
    ) {
        if (activity.isFinishing || activity.isDestroyed) return

        val resetTimeStr = try {
            val date = Date(resetEpochSeconds * 1000L)
            SimpleDateFormat("hh:mm a", Locale.getDefault()).format(date)
        } catch (_: Exception) {
            "a short while"
        }

        activity.runOnUiThread {
            if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
            dismissActiveDialog()

            val dialog = MaterialAlertDialogBuilder(activity)
                .setTitle("Rate Limit Exceeded")
                .setMessage("GitHub update checks are temporarily rate-limited. Please check again after $resetTimeStr.")
                .setPositiveButton("OK") { d, _ -> d.dismiss() }
                .create()

            activeDialog = dialog
            dialog.show()
        }
    }

    /**
     * Shows an error dialog when update checking or downloading fails.
     */
    fun showError(
        activity: Activity,
        message: String,
        onRetry: (() -> Unit)? = null
    ) {
        if (activity.isFinishing || activity.isDestroyed) return

        activity.runOnUiThread {
            if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
            dismissActiveDialog()

            val builder = MaterialAlertDialogBuilder(activity)
                .setTitle("Update Notice")
                .setMessage(message)
                .setPositiveButton("OK") { d, _ -> d.dismiss() }

            if (onRetry != null) {
                builder.setNeutralButton("Retry") { d, _ ->
                    d.dismiss()
                    onRetry()
                }
            }

            val dialog = builder.create()
            activeDialog = dialog
            dialog.show()
        }
    }

    /**
     * Explains the unknown app sources permission requirement before directing to settings.
     */
    fun showUnknownSourcesPrompt(
        activity: Activity,
        onConfirm: () -> Unit,
        onCancel: () -> Unit
    ) {
        if (activity.isFinishing || activity.isDestroyed) return

        activity.runOnUiThread {
            if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
            dismissActiveDialog()

            val dialog = MaterialAlertDialogBuilder(activity)
                .setTitle("Permission Required")
                .setMessage("To install the updated version, SmartProctor needs permission to install unknown apps.\n\nPlease toggle 'Allow from this source' on the next screen.")
                .setPositiveButton("Settings") { d, _ ->
                    d.dismiss()
                    onConfirm()
                }
                .setNegativeButton("Cancel") { d, _ ->
                    d.dismiss()
                    onCancel()
                }
                .setOnCancelListener { onCancel() }
                .create()

            activeDialog = dialog
            dialog.show()
        }
    }

    /**
     * Transforms raw Markdown release notes into formatted HTML string.
     * Handles headings, bullet lists, numbered lists, links, and bold/italic markup.
     */
    fun formatMarkdownToHtml(raw: String): String {
        if (raw.isBlank()) return "• General bug fixes and stability improvements."

        return raw.lines()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .joinToString("<br>") { line ->
                var processed = line
                if (processed.startsWith("#")) {
                    processed = "<b>" + processed.replace(Regex("^#+\\s*"), "") + "</b>"
                } else if (processed.matches(Regex("^[\\*\\-\\+]\\s+.*"))) {
                    processed = "&bull; " + processed.replace(Regex("^[\\*\\-\\+]\\s+"), "")
                }
                processed = processed.replace(Regex("\\*\\*(.*?)\\*\\*"), "<b>$1</b>")
                processed = processed.replace(Regex("(?<!\\*)\\*(?!\\*)(.*?)(?<!\\*)\\*(?!\\*)"), "<i>$1</i>")
                processed = processed.replace(Regex("`(.*?)`"), "<tt>$1</tt>")
                processed = processed.replace(Regex("\\[(.*?)\\]\\((https?://.*?)\\)"), "<a href=\"$2\">$1</a>")
                processed
            }
    }

    /**
     * Renders Markdown as a CharSequence for TextView display.
     */
    fun renderMarkdown(raw: String): CharSequence {
        val formattedHtml = formatMarkdownToHtml(raw)
        return try {
            val spanned = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                Html.fromHtml(formattedHtml, Html.FROM_HTML_MODE_COMPACT)
            } else {
                @Suppress("DEPRECATION")
                Html.fromHtml(formattedHtml)
            }
            spanned ?: formattedHtml
        } catch (_: Exception) {
            formattedHtml
        }
    }
}
