import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processAppUrl } from '../../utils/platform';

describe('processAppUrl', () => {
  let mockHandleRedirectCallback;
  let mockNavigate;
  let mockCloseBrowser;

  beforeEach(() => {
    mockHandleRedirectCallback = vi.fn();
    mockNavigate = vi.fn();
    mockCloseBrowser = vi.fn().mockResolvedValue(undefined);
  });

  it('does nothing when url is null or undefined', async () => {
    await processAppUrl(null, {
      handleRedirectCallback: mockHandleRedirectCallback,
      navigate: mockNavigate,
      closeBrowser: mockCloseBrowser,
    });

    expect(mockHandleRedirectCallback).not.toHaveBeenCalled();
    expect(mockCloseBrowser).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('handles Auth0 callback with state and code, closes browser, and navigates to returnTo', async () => {
    mockHandleRedirectCallback.mockResolvedValue({
      appState: { returnTo: '/admin-panel' },
    });

    const url =
      'io.smartproctor.exam://tenant.auth0.com/capacitor/io.smartproctor.exam/callback?code=xyz123&state=state456';

    await processAppUrl(url, {
      handleRedirectCallback: mockHandleRedirectCallback,
      navigate: mockNavigate,
      closeBrowser: mockCloseBrowser,
    });

    expect(mockHandleRedirectCallback).toHaveBeenCalledWith(url);
    expect(mockCloseBrowser).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/admin-panel', { replace: true });
  });

  it('defaults to /student-dashboard when appState.returnTo is not provided', async () => {
    mockHandleRedirectCallback.mockResolvedValue({});

    const url =
      'io.smartproctor.exam://tenant.auth0.com/capacitor/io.smartproctor.exam/callback?code=xyz123&state=state456';

    await processAppUrl(url, {
      handleRedirectCallback: mockHandleRedirectCallback,
      navigate: mockNavigate,
      closeBrowser: mockCloseBrowser,
    });

    expect(mockHandleRedirectCallback).toHaveBeenCalledWith(url);
    expect(mockCloseBrowser).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/student-dashboard', { replace: true });
  });

  it('handles Auth0 callback with state and error', async () => {
    mockHandleRedirectCallback.mockRejectedValue(new Error('Access denied'));

    const url =
      'io.smartproctor.exam://tenant.auth0.com/capacitor/io.smartproctor.exam/callback?error=access_denied&error_description=User+cancelled&state=state456';

    await processAppUrl(url, {
      handleRedirectCallback: mockHandleRedirectCallback,
      navigate: mockNavigate,
      closeBrowser: mockCloseBrowser,
    });

    expect(mockHandleRedirectCallback).toHaveBeenCalledWith(url);
    expect(mockCloseBrowser).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/student-dashboard', { replace: true });
  });

  it('handles logout callback URL by closing browser and navigating to /login', async () => {
    const url =
      'io.smartproctor.exam://tenant.auth0.com/capacitor/io.smartproctor.exam/callback';

    await processAppUrl(url, {
      handleRedirectCallback: mockHandleRedirectCallback,
      navigate: mockNavigate,
      closeBrowser: mockCloseBrowser,
    });

    expect(mockHandleRedirectCallback).not.toHaveBeenCalled();
    expect(mockCloseBrowser).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('ignores non-Auth0 deep links', async () => {
    const url = 'io.smartproctor.exam://custom-feature/view?id=99';

    await processAppUrl(url, {
      handleRedirectCallback: mockHandleRedirectCallback,
      navigate: mockNavigate,
      closeBrowser: mockCloseBrowser,
    });

    expect(mockHandleRedirectCallback).not.toHaveBeenCalled();
    expect(mockCloseBrowser).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
