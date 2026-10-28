package io.smartproctor.exam.update

import io.smartproctor.exam.update.models.ReleaseAsset
import io.smartproctor.exam.update.models.ReleaseInfo
import io.smartproctor.exam.update.models.SignatureVerificationResult
import io.smartproctor.exam.update.models.UpdateCheckResult
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

class UpdateUnitTest {

    private val checker = UpdateChecker()
    private val service = GitHubReleaseService(UpdateConfig.DEFAULT)
    private val signatureVerifier = ApkSignatureVerifier()
    private val dialogHelper = UpdateDialog()

    // =========================================================================
    // 1. Version Comparison & Edge Cases
    // =========================================================================

    @Test
    fun testSemanticVersionComparison() {
        // Newer versions
        assertTrue(checker.compareVersions("1.3.0", "1.0.0") > 0)
        assertTrue(checker.compareVersions("1.10.0", "1.9.0") > 0)
        assertTrue(checker.compareVersions("1.0.1", "1.0.0") > 0)
        assertTrue(checker.compareVersions("2.0.0", "1.99.99") > 0)

        // Equal versions
        assertEquals(0, checker.compareVersions("1.0.0", "1.0.0"))
        assertEquals(0, checker.compareVersions("1.2.0", "1.2"))

        // Older versions
        assertTrue(checker.compareVersions("1.0.0", "1.2.0") < 0)
        assertTrue(checker.compareVersions("0.9.5", "1.0.0") < 0)
    }

    @Test
    fun testVersionComparisonEdgeCasesAndMalformedStrings() {
        // Variable component lengths
        assertTrue(checker.compareVersions("1.0.0.1", "1.0.0") > 0)
        assertTrue(checker.compareVersions("1.0", "1.0.0.0") == 0)
        assertTrue(checker.compareVersions("1.2.3.4", "1.2.3.5") < 0)

        // Pre-release and build tags
        assertEquals(0, checker.compareVersions("v1.3.0-rc1", "1.3.0"))
        assertEquals(0, checker.compareVersions("1.3.0+build.42", "1.3.0"))

        // Malformed strings should not crash and evaluate safely
        val parts1 = checker.splitVersionParts("abc")
        assertEquals(listOf(0), parts1)

        val parts2 = checker.splitVersionParts("v..1")
        assertEquals(listOf(1), parts2)

        val parts3 = checker.splitVersionParts("")
        assertEquals(listOf(0), parts3)

        assertEquals(0, checker.compareVersions("invalid", "invalid"))
        assertTrue(checker.compareVersions("1.0.0", "invalid") > 0)
    }

    @Test
    fun testCheckVersionWithVersionName() {
        val release = ReleaseInfo(
            tagName = "v1.3.0",
            versionName = "1.3.0",
            versionCode = null,
            releaseNotes = "• Improved proctoring\n• Bug fixes",
            apkAsset = ReleaseAsset("SmartProctor-v1.3.0.apk", "https://github.com/chinmay161/SmartProctor/releases/download/v1.3.0/app.apk")
        )

        val result1 = checker.checkVersion(release, installedVersionName = "1.0.0", installedVersionCode = 1L)
        assertTrue("Expected Available for 1.3.0 > 1.0.0", result1 is UpdateCheckResult.Available)

        val result2 = checker.checkVersion(release, installedVersionName = "1.3.0", installedVersionCode = 2L)
        assertTrue("Expected UpToDate for 1.3.0 == 1.3.0", result2 is UpdateCheckResult.UpToDate)

        val result3 = checker.checkVersion(release, installedVersionName = "2.0.0", installedVersionCode = 5L)
        assertTrue("Expected UpToDate for 1.3.0 < 2.0.0", result3 is UpdateCheckResult.UpToDate)
    }

    @Test
    fun testCheckVersionWithVersionCode() {
        val release = ReleaseInfo(
            tagName = "v1.3.0",
            versionName = "1.3.0",
            versionCode = 5L,
            releaseNotes = "New features",
            apkAsset = ReleaseAsset("app.apk", "https://github.com/chinmay161/SmartProctor/releases/download/v1.3.0/app.apk")
        )

        // Newer code
        val res1 = checker.checkVersion(release, installedVersionName = "1.3.0", installedVersionCode = 4L)
        assertTrue("Expected Available when release versionCode 5 > installed 4", res1 is UpdateCheckResult.Available)

        // Same code
        val res2 = checker.checkVersion(release, installedVersionName = "1.3.0", installedVersionCode = 5L)
        assertTrue("Expected UpToDate when release versionCode 5 == installed 5", res2 is UpdateCheckResult.UpToDate)

        // Older code
        val res3 = checker.checkVersion(release, installedVersionName = "1.3.0", installedVersionCode = 6L)
        assertTrue("Expected UpToDate when release versionCode 5 < installed 6", res3 is UpdateCheckResult.UpToDate)
    }

    // =========================================================================
    // 2. GitHub JSON Parsing, Drafts & Pre-releases
    // =========================================================================

    @Test
    fun testInvalidGitHubJsonThrowsException() {
        try {
            service.parseReleaseJson("")
            fail("Expected IllegalArgumentException for empty JSON")
        } catch (_: IllegalArgumentException) {}

        try {
            service.parseReleaseJson("{}")
            fail("Expected IllegalArgumentException for JSON missing tag_name")
        } catch (_: IllegalArgumentException) {}
    }

    @Test
    fun testReleaseWithoutApkThrowsException() {
        val jsonWithoutApk = """
            {
                "tag_name": "v1.3.0",
                "body": "Release without APK",
                "assets": [
                    {
                        "name": "source.zip",
                        "browser_download_url": "https://github.com/chinmay161/SmartProctor/releases/download/v1.3.0/source.zip"
                    },
                    {
                        "name": "release-notes.txt",
                        "browser_download_url": "https://github.com/chinmay161/SmartProctor/releases/download/v1.3.0/notes.txt"
                    }
                ]
            }
        """.trimIndent()

        try {
            service.parseReleaseJson(jsonWithoutApk)
            fail("Expected IllegalStateException for release without APK")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("no valid") == true || e.message?.contains("does not contain") == true)
        }
    }

    @Test
    fun testPrereleaseAndDraftAreIgnored() {
        val draftJson = """
            {
                "tag_name": "v1.3.0",
                "draft": true,
                "prerelease": false,
                "assets": [{"name": "app.apk", "browser_download_url": "https://github.com/chinmay161/SmartProctor/releases/download/v1.3.0/app.apk"}]
            }
        """.trimIndent()

        try {
            service.parseReleaseJson(draftJson)
            fail("Expected draft release to be ignored")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("draft") == true)
        }

        val prereleaseJson = """
            {
                "tag_name": "v1.3.0-beta",
                "draft": false,
                "prerelease": true,
                "assets": [{"name": "app.apk", "browser_download_url": "https://github.com/chinmay161/SmartProctor/releases/download/v1.3.0/app.apk"}]
            }
        """.trimIndent()

        try {
            service.parseReleaseJson(prereleaseJson)
            fail("Expected pre-release to be ignored")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("pre-release") == true)
        }
    }

    // =========================================================================
    // 3. Deterministic APK Asset Selection & Filtering
    // =========================================================================

    @Test
    fun testDeterministicApkAssetSelection() {
        val assetsJson = JSONArray("""
            [
                {
                    "name": "app-debug.apk",
                    "browser_download_url": "https://github.com/chinmay161/SmartProctor/releases/download/v1.3.0/app-debug.apk"
                },
                {
                    "name": "app-test.apk",
                    "browser_download_url": "https://github.com/chinmay161/SmartProctor/releases/download/v1.3.0/app-test.apk"
                },
                {
                    "name": "SmartProctor-v1.3.0.apk",
                    "browser_download_url": "https://github.com/chinmay161/SmartProctor/releases/download/v1.3.0/SmartProctor-v1.3.0.apk"
                },
                {
                    "name": "SmartProctor-v1.3.0-universal.apk",
                    "browser_download_url": "https://github.com/chinmay161/SmartProctor/releases/download/v1.3.0/SmartProctor-v1.3.0-universal.apk"
                },
                {
                    "name": "SmartProctor-v1.3.0-release.apk",
                    "browser_download_url": "https://github.com/chinmay161/SmartProctor/releases/download/v1.3.0/SmartProctor-v1.3.0-release.apk"
                }
            ]
        """.trimIndent())

        val best = service.selectBestApkAsset(assetsJson)
        // Must select the Release APK first according to preference ranking
        assertEquals("SmartProctor-v1.3.0-release.apk", best?.name)

        // Disallowed assets (debug, test) must be rejected
        assertTrue(service.isDisallowedApk("app-debug.apk"))
        assertTrue(service.isDisallowedApk("app-test.apk"))
        assertTrue(service.isDisallowedApk("SmartProctor-x86-debug.apk"))
        assertFalse(service.isDisallowedApk("SmartProctor-v1.3.0-release.apk"))
    }

    // =========================================================================
    // 4. Security: Domain Whitelist & Cryptographic Signatures
    // =========================================================================

    @Test
    fun testValidDownloadUrlSecurity() {
        // Trusted GitHub release domains
        assertTrue(service.isValidDownloadUrl("https://github.com/chinmay161/SmartProctor/releases/download/v1.3.0/app.apk"))
        assertTrue(service.isValidDownloadUrl("https://objects.githubusercontent.com/github-production-release-asset-2e65be/123/456.apk"))

        // Untrusted / malicious domains
        assertFalse(service.isValidDownloadUrl("https://malicious-site.com/SmartProctor.apk"))
        assertFalse(service.isValidDownloadUrl("http://github.com.attacker.com/app.apk"))
        assertFalse(service.isValidDownloadUrl("http://untrusted.org/app.apk"))
    }

    @Test
    fun testCryptographicSignatureVerification() {
        val certA = byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8)
        val certACopy = byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8)
        val certB = byteArrayOf(9, 8, 7, 6, 5, 4, 3, 2)

        // Matching certificates
        val successResult = signatureVerifier.verifyCertificates(listOf(certA), listOf(certACopy))
        assertTrue("Expected Success when certificates match", successResult is SignatureVerificationResult.Success)

        // Mismatched certificates
        val mismatchResult = signatureVerifier.verifyCertificates(listOf(certA), listOf(certB))
        assertTrue("Expected Mismatch when certificates differ", mismatchResult is SignatureVerificationResult.Mismatch)

        // Empty certificates
        val errorResult = signatureVerifier.verifyCertificates(emptyList(), listOf(certB))
        assertTrue("Expected Error for empty installed certs", errorResult is SignatureVerificationResult.Error)

        // Fingerprint SHA-256 calculation format
        val fp = ApkSignatureVerifier.computeSha256Fingerprint(certA)
        assertTrue(fp.contains(":"))
        assertEquals(32 * 3 - 1, fp.length) // 32 hex bytes formatted as XX:XX:...
    }

    // =========================================================================
    // 5. Configuration & Markdown Notes
    // =========================================================================

    @Test
    fun testDefaultConfig() {
        val config = UpdateConfig.DEFAULT
        assertEquals("chinmay161", config.owner)
        assertEquals("SmartProctor", config.repo)
        assertEquals(12L * 60L * 60L * 1000L, config.checkIntervalMs)
        assertFalse(config.allowPrerelease)
        assertFalse(config.allowDraft)
    }

    @Test
    fun testMarkdownReleaseNotesRendering() {
        val raw = """
            ### Improvements
            * Improved AI facial tracking
            * **Faster** analysis engine
            - Link: [Docs](https://example.com)
        """.trimIndent()

        val rendered = dialogHelper.formatMarkdownToHtml(raw)
        assertTrue(rendered.contains("Improvements"))
        assertTrue(rendered.contains("&bull;") && rendered.contains("Faster"))
    }
}
