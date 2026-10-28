package io.smartproctor.exam.update

import android.util.Log
import io.smartproctor.exam.update.models.ReleaseAsset
import io.smartproctor.exam.update.models.ReleaseInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/**
 * Result returned by [GitHubReleaseService.fetchLatestRelease].
 */
sealed class GitHubFetchResult {
    data class Success(val release: ReleaseInfo, val eTag: String?) : GitHubFetchResult()
    data class NotModified(val eTag: String?) : GitHubFetchResult()
    data class RateLimited(val resetEpochSeconds: Long) : GitHubFetchResult()
    data class NotFound(val message: String) : GitHubFetchResult()
    data class Error(val message: String, val cause: Throwable? = null) : GitHubFetchResult()
}

/**
 * Service communicating directly with the GitHub Releases API.
 *
 * Implements HTTP ETag caching (`If-None-Match`), rate limit detection (`X-RateLimit-*`),
 * draft/pre-release filtering, and deterministic APK asset prioritization.
 */
class GitHubReleaseService(
    val config: UpdateConfig = UpdateConfig.DEFAULT
) {
    companion object {
        private const val TAG = "GitHubReleaseService"
        const val HEADER_ETAG = "ETag"
        const val HEADER_IF_NONE_MATCH = "If-None-Match"
        const val HEADER_RATE_LIMIT_REMAINING = "X-RateLimit-Remaining"
        const val HEADER_RATE_LIMIT_RESET = "X-RateLimit-Reset"
    }

    /**
     * Queries the latest release asynchronously from GitHub REST API.
     *
     * @param cachedETag Optional ETag from a previous successful fetch for HTTP 304 caching.
     */
    suspend fun fetchLatestRelease(cachedETag: String? = null): GitHubFetchResult = withContext(Dispatchers.IO) {
        val apiUrl = "https://api.github.com/repos/${config.owner}/${config.repo}/releases/latest"
        Log.i(TAG, "[UpdateCheck] Checking latest release at: $apiUrl (cachedETag=${cachedETag ?: "none"})")

        var connection: HttpURLConnection? = null
        try {
            val url = URL(apiUrl)
            connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = config.connectTimeoutMs
                readTimeout = config.readTimeoutMs
                setRequestProperty("Accept", "application/vnd.github.v3+json")
                setRequestProperty("User-Agent", "SmartProctor-Android")
                if (!cachedETag.isNullOrBlank()) {
                    setRequestProperty(HEADER_IF_NONE_MATCH, cachedETag)
                }
                instanceFollowRedirects = true
            }

            // Inspect rate limit headers
            val remainingStr = connection.getHeaderField(HEADER_RATE_LIMIT_REMAINING)
            val resetStr = connection.getHeaderField(HEADER_RATE_LIMIT_RESET)
            val resetEpoch = resetStr?.toLongOrNull() ?: (System.currentTimeMillis() / 1000L + 3600L)

            if (remainingStr != null && remainingStr.toIntOrNull() == 0) {
                Log.w(TAG, "[UpdateCheck] GitHub API rate limit reached (0 remaining). Reset at epoch: $resetEpoch")
                return@withContext GitHubFetchResult.RateLimited(resetEpoch)
            }

            val responseCode = connection.responseCode
            val newETag = connection.getHeaderField(HEADER_ETAG)

            when (responseCode) {
                HttpURLConnection.HTTP_NOT_MODIFIED -> {
                    Log.i(TAG, "[UpdateCheck] Cached response used: HTTP 304 Not Modified (ETag=$newETag)")
                    GitHubFetchResult.NotModified(newETag ?: cachedETag)
                }
                HttpURLConnection.HTTP_OK -> {
                    val responseBody = connection.inputStream.bufferedReader().use(BufferedReader::readText)
                    val releaseInfo = parseReleaseJson(responseBody, newETag)
                    Log.i(TAG, "[UpdateCheck] Retrieved release: tag=${releaseInfo.tagName}, version=${releaseInfo.versionName}, asset=${releaseInfo.apkAsset.name}")
                    GitHubFetchResult.Success(releaseInfo, newETag)
                }
                HttpURLConnection.HTTP_NOT_FOUND -> {
                    val msg = "No release found on GitHub repository (${config.owner}/${config.repo})"
                    Log.w(TAG, "[UpdateCheck] $msg")
                    GitHubFetchResult.NotFound(msg)
                }
                HttpURLConnection.HTTP_FORBIDDEN -> {
                    Log.w(TAG, "[UpdateCheck] HTTP 403 Forbidden received. Rate limit reset epoch: $resetEpoch")
                    GitHubFetchResult.RateLimited(resetEpoch)
                }
                else -> {
                    val err = "GitHub API returned unexpected HTTP $responseCode"
                    Log.e(TAG, "[UpdateCheck] $err")
                    GitHubFetchResult.Error(err)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "[UpdateCheck] Network error querying GitHub: ${e.message}", e)
            GitHubFetchResult.Error(e.localizedMessage ?: "Network connection error", e)
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * Parses a GitHub release response JSON string into a [ReleaseInfo] object.
     * Enforces draft/prerelease rules and deterministic APK asset scoring.
     *
     * @throws IllegalArgumentException if the JSON is malformed.
     * @throws IllegalStateException if the release is a draft/prerelease or contains no eligible APK.
     */
    fun parseReleaseJson(jsonString: String, eTag: String? = null): ReleaseInfo {
        if (jsonString.isBlank()) {
            throw IllegalArgumentException("Release JSON string is empty or blank.")
        }

        val json = JSONObject(jsonString)
        val tagName = json.optString("tag_name", "").trim()
        if (tagName.isEmpty()) {
            throw IllegalArgumentException("Release JSON is missing 'tag_name'.")
        }

        val isDraft = json.optBoolean("draft", false)
        val isPrerelease = json.optBoolean("prerelease", false)

        if (!config.allowDraft && isDraft) {
            throw IllegalStateException("Release '$tagName' is a draft and draft updates are disabled.")
        }
        if (!config.allowPrerelease && isPrerelease) {
            throw IllegalStateException("Release '$tagName' is a pre-release and pre-release updates are disabled.")
        }

        val body = json.optString("body", "").trim()
        val publishedAt = if (json.has("published_at")) json.getString("published_at") else null

        val versionName = extractVersionName(tagName)
        val versionCode = extractVersionCode(tagName, body)

        val assetsArray = json.optJSONArray("assets") ?: JSONArray()
        val apkAsset = selectBestApkAsset(assetsArray)
            ?: throw IllegalStateException("Release '$tagName' contains no valid, non-debug APK asset.")

        return ReleaseInfo(
            tagName = tagName,
            versionName = versionName,
            versionCode = versionCode,
            releaseNotes = if (body.isNotEmpty()) body else "No release notes provided for this version.",
            publishedAt = publishedAt,
            apkAsset = apkAsset,
            isDraft = isDraft,
            isPrerelease = isPrerelease,
            eTag = eTag
        )
    }

    /**
     * Deterministically scores and selects the most appropriate APK asset.
     *
     * Preference ranking:
     * 1. Release APK (matches preferredApkPatterns[0], e.g. "release")
     * 2. Universal APK (matches preferredApkPatterns[1], e.g. "universal")
     * 3. Standard APK
     *
     * Rejects any asset matching [UpdateConfig.disallowedApkPatterns] (debug, test, x86 debug).
     */
    fun selectBestApkAsset(assets: JSONArray): ReleaseAsset? {
        val candidates = mutableListOf<Pair<ReleaseAsset, Int>>()

        for (i in 0 until assets.length()) {
            val asset = assets.optJSONObject(i) ?: continue
            val name = asset.optString("name", "")
            val downloadUrl = asset.optString("browser_download_url", "")
            val size = asset.optLong("size", 0L)
            val contentType = if (asset.has("content_type")) asset.getString("content_type") else null

            // Must end with .apk
            if (!name.endsWith(".apk", ignoreCase = true)) {
                continue
            }

            // Must not match any disallowed patterns (debug, test, x86 debug)
            if (isDisallowedApk(name)) {
                Log.d(TAG, "[AssetSelection] Skipping disallowed asset: $name")
                continue
            }

            // Download URL host must be trusted
            if (!isValidDownloadUrl(downloadUrl)) {
                Log.w(TAG, "[AssetSelection] Skipping APK with untrusted host: $downloadUrl")
                continue
            }

            val score = scoreApkAsset(name)
            candidates.add(ReleaseAsset(name, downloadUrl, size, contentType) to score)
        }

        // Return candidate with the highest score
        return candidates.maxByOrNull { it.second }?.first
    }

    /**
     * Calculates preference score for an APK filename.
     */
    fun scoreApkAsset(name: String): Int {
        var score = 10 // baseline score for normal .apk

        config.preferredApkPatterns.forEachIndexed { index, pattern ->
            if (pattern.containsMatchIn(name)) {
                score += (config.preferredApkPatterns.size - index) * 50
            }
        }
        return score
    }

    /**
     * Checks if an APK asset filename matches any disallowed pattern (debug, test, etc.).
     */
    fun isDisallowedApk(name: String): Boolean {
        return config.disallowedApkPatterns.any { it.containsMatchIn(name) }
    }

    /**
     * Validates that the download URL host belongs to an allowed trusted domain.
     */
    fun isValidDownloadUrl(url: String): Boolean {
        return try {
            val uri = URI(url)
            val host = uri.host?.lowercase() ?: return false
            config.trustedHosts.any { allowed -> host == allowed || host.endsWith(".$allowed") }
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Extracts semantic version name from git tag (e.g. "v1.3.0" -> "1.3.0").
     */
    fun extractVersionName(tagName: String): String {
        return tagName.removePrefix("v").removePrefix("V").split("-")[0].split("+")[0].trim()
    }

    /**
     * Extracts numeric build/version code if present in tag or release notes.
     */
    fun extractVersionCode(tagName: String, body: String): Long? {
        val buildMatch = Regex("""[+-](?:b|build)?(\d+)$""", RegexOption.IGNORE_CASE).find(tagName)
        if (buildMatch != null) {
            return buildMatch.groupValues[1].toLongOrNull()
        }

        val noteMatch = Regex("""(?:versionCode|buildNumber|build):\s*(\d+)""", RegexOption.IGNORE_CASE).find(body)
        if (noteMatch != null) {
            return noteMatch.groupValues[1].toLongOrNull()
        }

        return null
    }
}
