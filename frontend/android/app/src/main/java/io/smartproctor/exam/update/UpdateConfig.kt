package io.smartproctor.exam.update

/**
 * Configuration holder for SmartProctor in-app update checks and distribution.
 *
 * All network timeouts, rate limit settings, check intervals, security domains,
 * and asset selection filters are consolidated here to prevent hardcoded values elsewhere.
 *
 * @property owner GitHub repository owner or organization name (e.g. "chinmay161").
 * @property repo GitHub repository name (e.g. "SmartProctor").
 * @property checkIntervalMs Minimum duration in milliseconds between automatic launch checks (default: 12 hours).
 * @property launchCheckDelayMs Milliseconds to wait after application initialization before background check.
 * @property connectTimeoutMs Network connection timeout in milliseconds for GitHub API requests.
 * @property readTimeoutMs Network socket read timeout in milliseconds for GitHub API requests.
 * @property retryCount Number of transient network retry attempts.
 * @property trustedHosts Whitelist of domain names permitted for APK downloads and API endpoints.
 * @property preferredApkPatterns Ordered list of regex patterns used to score and select the best APK asset.
 * @property disallowedApkPatterns List of regex patterns for APK assets that must never be installed (debug/test).
 * @property allowPrerelease Whether pre-release versions should be considered for updates (default: false).
 * @property allowDraft Whether draft releases should be considered for updates (default: false).
 */
data class UpdateConfig(
    val owner: String = DEFAULT_OWNER,
    val repo: String = DEFAULT_REPO,
    val checkIntervalMs: Long = DEFAULT_CHECK_INTERVAL_MS,
    val launchCheckDelayMs: Long = DEFAULT_LAUNCH_DELAY_MS,
    val connectTimeoutMs: Int = DEFAULT_CONNECT_TIMEOUT_MS,
    val readTimeoutMs: Int = DEFAULT_READ_TIMEOUT_MS,
    val retryCount: Int = DEFAULT_RETRY_COUNT,
    val trustedHosts: Set<String> = DEFAULT_TRUSTED_HOSTS,
    val preferredApkPatterns: List<Regex> = DEFAULT_PREFERRED_PATTERNS,
    val disallowedApkPatterns: List<Regex> = DEFAULT_DISALLOWED_PATTERNS,
    val allowPrerelease: Boolean = false,
    val allowDraft: Boolean = false
) {
    companion object {
        const val DEFAULT_OWNER = "chinmay161"
        const val DEFAULT_REPO = "SmartProctor"

        /** 12 hours in milliseconds between automatic launch checks */
        const val DEFAULT_CHECK_INTERVAL_MS = 12L * 60L * 60L * 1000L

        const val DEFAULT_LAUNCH_DELAY_MS = 2500L
        const val DEFAULT_CONNECT_TIMEOUT_MS = 15000
        const val DEFAULT_READ_TIMEOUT_MS = 20000
        const val DEFAULT_RETRY_COUNT = 3

        /**
         * Whitelist of trusted domains for GitHub releases and APK asset hosting.
         */
        val DEFAULT_TRUSTED_HOSTS: Set<String> = setOf(
            "github.com",
            "objects.githubusercontent.com",
            "github-releases.githubusercontent.com",
            "api.github.com"
        )

        /**
         * Deterministic asset preference order:
         * 1. Release APK (contains "release" without debug)
         * 2. Universal APK (contains "universal")
         */
        val DEFAULT_PREFERRED_PATTERNS: List<Regex> = listOf(
            Regex("(?i)release"),
            Regex("(?i)universal")
        )

        /**
         * APK assets that must never be installed in production:
         * - Debug builds
         * - Test builds
         * - x86 debug builds
         */
        val DEFAULT_DISALLOWED_PATTERNS: List<Regex> = listOf(
            Regex("(?i)debug"),
            Regex("(?i)test"),
            Regex("(?i)x86.*debug")
        )

        val DEFAULT = UpdateConfig()
    }
}
