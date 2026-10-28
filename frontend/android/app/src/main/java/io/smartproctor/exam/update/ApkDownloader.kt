package io.smartproctor.exam.update

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.Log
import androidx.core.content.ContextCompat
import io.smartproctor.exam.update.models.ReleaseInfo
import java.io.File

/**
 * Handles downloading APK updates using Android DownloadManager.
 *
 * Implements download deduplication (resuming existing pending/running downloads),
 * automatic cleanup of stale SmartProctor APK binaries, and system notification integration.
 */
class ApkDownloader(
    private val context: Context
) {
    companion object {
        private const val TAG = "ApkDownloader"
        private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
    }

    private val downloadManager: DownloadManager by lazy {
        context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    }

    private var activeDownloadId: Long = -1L
    private var downloadReceiver: BroadcastReceiver? = null

    /**
     * Listener callback for download progress & completion.
     */
    interface DownloadCallback {
        fun onDownloadStarted(downloadId: Long)
        fun onDownloadComplete(downloadId: Long, apkFile: File)
        fun onDownloadFailed(downloadId: Long, reason: String)
    }

    /**
     * Enqueues an APK download via Android's DownloadManager, or resumes monitoring an existing active download.
     */
    fun startDownload(release: ReleaseInfo, callback: DownloadCallback? = null): Long {
        val asset = release.apkAsset
        val downloadUri = Uri.parse(asset.downloadUrl)

        // Security check: Verify that the asset has .apk extension
        if (!asset.name.endsWith(".apk", ignoreCase = true)) {
            val err = "Download aborted: Asset '${asset.name}' is not an APK file."
            Log.e(TAG, "[Download] $err")
            callback?.onDownloadFailed(-1L, err)
            return -1L
        }

        val fileName = sanitizeFileName("SmartProctor-${release.tagName}.apk")
        val destinationDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            ?: File(context.filesDir, "downloads").apply { mkdirs() }
        val destinationFile = File(destinationDir, fileName)

        // 1. Check if this exact release APK is already downloaded and intact
        val existingCompletedId = findCompletedDownload(downloadUri, destinationFile)
        if (existingCompletedId != null && destinationFile.exists() && destinationFile.length() > 0) {
            Log.i(TAG, "[Download] Existing completed APK found at ${destinationFile.absolutePath} (ID: $existingCompletedId). Skipping download.")
            activeDownloadId = existingCompletedId
            callback?.onDownloadComplete(existingCompletedId, destinationFile)
            return existingCompletedId
        }

        // 2. Check if a download for this URI is currently pending or active in DownloadManager
        val existingActiveId = findActiveDownload(downloadUri)
        if (existingActiveId != null) {
            Log.i(TAG, "[Download] Existing active download found (ID: $existingActiveId). Resuming monitoring.")
            activeDownloadId = existingActiveId
            callback?.onDownloadStarted(existingActiveId)
            registerCompletionReceiver(existingActiveId, destinationFile, callback)
            return existingActiveId
        }

        // 3. Clean up older stale SmartProctor APK files to prevent storage accumulation
        cleanupOldDownloads(destinationFile)

        Log.i(TAG, "[Download] Enqueuing new download for: ${asset.downloadUrl} -> ${destinationFile.absolutePath}")

        val request = DownloadManager.Request(downloadUri).apply {
            setTitle("SmartProctor Update ${release.tagName}")
            setDescription("Downloading latest version ${release.versionName}...")
            setMimeType(APK_MIME_TYPE)
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setAllowedOverMetered(true)
            setAllowedOverRoaming(true)
            setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
        }

        val downloadId = try {
            downloadManager.enqueue(request)
        } catch (e: Exception) {
            Log.e(TAG, "[Download] Failed to enqueue download: ${e.message}", e)
            callback?.onDownloadFailed(-1L, "Failed to start download: ${e.localizedMessage}")
            return -1L
        }

        activeDownloadId = downloadId
        Log.i(TAG, "[Download] Download started successfully with ID: $downloadId")
        callback?.onDownloadStarted(downloadId)

        registerCompletionReceiver(downloadId, destinationFile, callback)
        return downloadId
    }

    /**
     * Searches DownloadManager for an active (running/pending/paused) download matching [targetUri].
     */
    fun findActiveDownload(targetUri: Uri): Long? {
        val query = DownloadManager.Query().setFilterByStatus(
            DownloadManager.STATUS_RUNNING or DownloadManager.STATUS_PENDING or DownloadManager.STATUS_PAUSED
        )
        var cursor: Cursor? = null
        try {
            cursor = downloadManager.query(query)
            if (cursor != null) {
                val uriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_URI)
                val idIndex = cursor.getColumnIndex(DownloadManager.COLUMN_ID)
                while (cursor.moveToNext()) {
                    if (uriIndex != -1 && idIndex != -1) {
                        val currentUri = cursor.getString(uriIndex)
                        if (currentUri == targetUri.toString()) {
                            return cursor.getLong(idIndex)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[Download] Error querying active downloads: ${e.message}")
        } finally {
            cursor?.close()
        }
        return null
    }

    /**
     * Searches DownloadManager for a successful download record matching [targetUri].
     */
    fun findCompletedDownload(targetUri: Uri, destinationFile: File): Long? {
        if (!destinationFile.exists() || destinationFile.length() == 0L) return null

        val query = DownloadManager.Query().setFilterByStatus(DownloadManager.STATUS_SUCCESSFUL)
        var cursor: Cursor? = null
        try {
            cursor = downloadManager.query(query)
            if (cursor != null) {
                val uriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_URI)
                val idIndex = cursor.getColumnIndex(DownloadManager.COLUMN_ID)
                while (cursor.moveToNext()) {
                    if (uriIndex != -1 && idIndex != -1) {
                        val currentUri = cursor.getString(uriIndex)
                        if (currentUri == targetUri.toString()) {
                            return cursor.getLong(idIndex)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[Download] Error querying completed downloads: ${e.message}")
        } finally {
            cursor?.close()
        }
        return null
    }

    /**
     * Removes older SmartProctor APK downloads from the destination directory to reclaim storage.
     * Preserves [excludeFile] so the current or active download is not affected.
     */
    fun cleanupOldDownloads(excludeFile: File? = null) {
        val destinationDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return
        val apkFiles = destinationDir.listFiles { file ->
            file.isFile &&
            file.name.startsWith("SmartProctor", ignoreCase = true) &&
            file.name.endsWith(".apk", ignoreCase = true) &&
            (excludeFile == null || file.absolutePath != excludeFile.absolutePath)
        } ?: return

        for (file in apkFiles) {
            try {
                val deleted = file.delete()
                Log.i(TAG, "[Cleanup] Deleted stale APK: ${file.name} (success=$deleted)")
            } catch (e: Exception) {
                Log.w(TAG, "[Cleanup] Failed to delete stale APK: ${file.name}", e)
            }
        }
    }

    /**
     * Cancels the active download and unregisters system receivers.
     */
    fun cancelDownload() {
        if (activeDownloadId != -1L) {
            try {
                downloadManager.remove(activeDownloadId)
                Log.i(TAG, "[Download] Cancelled active download: $activeDownloadId")
            } catch (e: Exception) {
                Log.w(TAG, "[Download] Error removing download $activeDownloadId", e)
            }
            activeDownloadId = -1L
        }
        unregisterReceiver()
    }

    private fun registerCompletionReceiver(
        targetDownloadId: Long,
        targetFile: File,
        callback: DownloadCallback?
    ) {
        unregisterReceiver()

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(recvContext: Context?, intent: Intent?) {
                if (DownloadManager.ACTION_DOWNLOAD_COMPLETE == intent?.action) {
                    val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
                    if (id == targetDownloadId) {
                        handleDownloadComplete(targetDownloadId, targetFile, callback)
                        unregisterReceiver()
                    }
                }
            }
        }

        downloadReceiver = receiver
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.registerReceiver(
                context,
                receiver,
                filter,
                ContextCompat.RECEIVER_EXPORTED
            )
        } else {
            context.registerReceiver(receiver, filter)
        }
    }

    private fun handleDownloadComplete(
        downloadId: Long,
        fallbackFile: File,
        callback: DownloadCallback?
    ) {
        val query = DownloadManager.Query().setFilterById(downloadId)
        val cursor = downloadManager.query(query)

        try {
            if (cursor != null && cursor.moveToFirst()) {
                val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                val status = if (statusIndex != -1) cursor.getInt(statusIndex) else -1

                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    val localUriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)
                    val localUriString = if (localUriIndex != -1) cursor.getString(localUriIndex) else null

                    val downloadedFile = if (localUriString != null) {
                        val fileUri = Uri.parse(localUriString)
                        val path = fileUri.path
                        if (path != null && File(path).exists()) {
                            File(path)
                        } else {
                            fallbackFile
                        }
                    } else {
                        fallbackFile
                    }

                    if (downloadedFile.exists() && downloadedFile.length() > 0) {
                        Log.i(TAG, "[Download] Completed successfully: ${downloadedFile.absolutePath} (${downloadedFile.length()} bytes)")
                        callback?.onDownloadComplete(downloadId, downloadedFile)
                    } else {
                        val err = "Downloaded file does not exist or is empty."
                        Log.e(TAG, "[Download] $err")
                        callback?.onDownloadFailed(downloadId, err)
                    }
                } else {
                    val reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
                    val reason = if (reasonIndex != -1) cursor.getInt(reasonIndex) else -1
                    val err = "Download failed with status: $status, reason: $reason"
                    Log.e(TAG, "[Download] $err")
                    callback?.onDownloadFailed(downloadId, err)
                }
            } else {
                if (fallbackFile.exists() && fallbackFile.length() > 0) {
                    callback?.onDownloadComplete(downloadId, fallbackFile)
                } else {
                    callback?.onDownloadFailed(downloadId, "Download record not found in system manager.")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "[Download] Error handling completion: ${e.message}", e)
            callback?.onDownloadFailed(downloadId, "Error checking download status: ${e.localizedMessage}")
        } finally {
            cursor?.close()
        }
    }

    private fun unregisterReceiver() {
        downloadReceiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (_: Exception) {
            }
            downloadReceiver = null
        }
    }

    private fun sanitizeFileName(name: String): String {
        return name.replace(Regex("[^a-zA-Z0-9._-]"), "_")
    }
}
