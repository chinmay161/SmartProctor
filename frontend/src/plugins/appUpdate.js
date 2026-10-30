import { registerPlugin, WebPlugin } from '@capacitor/core';

const CURRENT_VERSION = '1.1.0';
const CURRENT_VERSION_CODE = 2;

/**
 * Web fallback implementation of AppUpdate for browser preview & testing.
 */
class AppUpdateWeb extends WebPlugin {
  constructor() {
    super();
    this._owner = 'chinmay161';
    this._repo = 'SmartProctor';
    this._cachedETag = null;
    this._lastCheckTime = 0;
  }

  /**
   * Checks GitHub Releases API directly for web clients with ETag and draft/prerelease handling.
   */
  async checkForUpdate(options = {}) {
    const isManual = options?.manual ?? true;
    const now = Date.now();

    // 12-hour frequency gating for automatic background checks
    if (!isManual && now - this._lastCheckTime < 12 * 60 * 60 * 1000) {
      return {
        available: false,
        isCached: true,
        currentVersion: CURRENT_VERSION,
        currentVersionCode: CURRENT_VERSION_CODE,
      };
    }

    try {
      const headers = {
        Accept: 'application/vnd.github.v3+json',
      };
      if (this._cachedETag) {
        headers['If-None-Match'] = this._cachedETag;
      }

      const response = await fetch(
        `https://api.github.com/repos/${this._owner}/${this._repo}/releases/latest`,
        { headers }
      );

      this._lastCheckTime = now;

      if (response.status === 304) {
        return {
          available: false,
          isCached: true,
          currentVersion: CURRENT_VERSION,
          currentVersionCode: CURRENT_VERSION_CODE,
          latestVersion: CURRENT_VERSION,
        };
      }

      if (response.status === 404) {
        return {
          available: false,
          currentVersion: CURRENT_VERSION,
          currentVersionCode: CURRENT_VERSION_CODE,
          latestVersion: CURRENT_VERSION,
          message: 'No releases found on GitHub repository.',
        };
      }

      if (response.status === 403) {
        return {
          available: false,
          rateLimited: true,
          currentVersion: CURRENT_VERSION,
          currentVersionCode: CURRENT_VERSION_CODE,
          message: 'GitHub API rate limit reached. Please try again later.',
        };
      }

      if (!response.ok) {
        throw new Error(`GitHub API returned HTTP ${response.status}`);
      }

      const etag = response.headers?.get?.('ETag');
      if (etag) {
        this._cachedETag = etag;
      }

      const data = await response.json();

      // Ignore drafts and pre-releases
      if (data.draft || data.prerelease) {
        return {
          available: false,
          currentVersion: CURRENT_VERSION,
          currentVersionCode: CURRENT_VERSION_CODE,
          message: 'Latest release is a draft or pre-release; ignored.',
        };
      }

      const tagName = data.tag_name || '';
      const cleanLatestVersion = tagName.replace(/^v/i, '').split('-')[0].split('+')[0];

      // Prioritize release APK > universal APK > normal APK, exclude debug/test
      const eligibleAssets = (data.assets || []).filter((asset) => {
        const name = (asset.name || '').toLowerCase();
        return name.endsWith('.apk') && !name.includes('debug') && !name.includes('test');
      });

      const apkAsset = eligibleAssets.sort((a, b) => {
        const scoreA = (a.name.toLowerCase().includes('release') ? 2 : 0) + (a.name.toLowerCase().includes('universal') ? 1 : 0);
        const scoreB = (b.name.toLowerCase().includes('release') ? 2 : 0) + (b.name.toLowerCase().includes('universal') ? 1 : 0);
        return scoreB - scoreA;
      })[0];

      const available = Boolean(apkAsset && cleanLatestVersion !== CURRENT_VERSION);

      return {
        available,
        currentVersion: CURRENT_VERSION,
        currentVersionCode: CURRENT_VERSION_CODE,
        latestVersion: cleanLatestVersion || CURRENT_VERSION,
        tagName: tagName,
        releaseNotes: data.body || 'No release notes provided.',
        apkUrl: apkAsset?.browser_download_url || null,
        apkSize: apkAsset?.size || 0,
      };
    } catch (err) {
      if (isManual) {
        throw err;
      }
      return {
        available: false,
        currentVersion: CURRENT_VERSION,
        currentVersionCode: CURRENT_VERSION_CODE,
        error: err.message,
      };
    }
  }

  async downloadAndInstall() {
    return {
      success: false,
      message: 'Direct APK installation is not supported in a desktop web browser.',
    };
  }

  async getAppVersion() {
    return {
      versionName: CURRENT_VERSION,
      versionCode: CURRENT_VERSION_CODE,
      platform: 'web',
    };
  }

  async openUnknownSourcesSettings() {
    return { success: false };
  }
}

export const AppUpdate = registerPlugin('AppUpdate', {
  web: () => new AppUpdateWeb(),
});

export default AppUpdate;
