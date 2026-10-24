import { describe, it, expect } from 'vitest';
import { scrubUrl, scrubEvent } from './sentryScrubber';

describe('sentryScrubber frontend tests', () => {
  describe('scrubUrl', () => {
    it('preserves URLs without sensitive query strings', () => {
      expect(scrubUrl('https://example.com/api/exams')).toBe('https://example.com/api/exams');
      expect(scrubUrl('https://example.com/api/exams?page=1&limit=20')).toBe(
        'https://example.com/api/exams?page=1&limit=20'
      );
      expect(scrubUrl('')).toBe('');
      expect(scrubUrl(null)).toBe(null);
    });

    it('strips query strings containing token=', () => {
      expect(scrubUrl('https://example.com/ws/student/sess-123?token=jwt.token.secret')).toBe(
        'https://example.com/ws/student/sess-123'
      );
      expect(scrubUrl('https://example.com/ws?mode=live&token=abc')).toBe(
        'https://example.com/ws'
      );
    });

    it('strips query strings containing access_token=', () => {
      expect(scrubUrl('https://example.com/oauth/callback?access_token=token-xyz&scope=all')).toBe(
        'https://example.com/oauth/callback'
      );
    });

    it('strips query strings containing code=', () => {
      expect(scrubUrl('https://example.com/login/callback?code=secret_auth_code')).toBe(
        'https://example.com/login/callback'
      );
    });
  });

  describe('scrubEvent', () => {
    it('drops request.data and scrubs URL and sensitive headers', () => {
      const mockEvent = {
        request: {
          url: 'https://smartproctor.com/ws/student/sess-1?token=my-secret-token',
          queryString: 'token=my-secret-token',
          data: {
            image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
            violationType: 'PHONE_DETECTED',
          },
          headers: {
            Authorization: 'Bearer secret-jwt',
            Cookie: 'auth_session=12345',
            'X-API-Key': 'secret-api-key',
            'Content-Type': 'application/json',
            'X-Request-ID': 'req-987654321',
          },
        },
        breadcrumbs: [
          {
            data: {
              url: 'https://smartproctor.com/api/test?token=breadcrumb-token',
            },
            message: 'GET /api/test?token=breadcrumb-token',
          },
        ],
      };

      const scrubbed = scrubEvent(mockEvent);

      // Data must be completely dropped
      expect(scrubbed.request.data).toBeUndefined();

      // URL query string stripped
      expect(scrubbed.request.url).toBe('https://smartproctor.com/ws/student/sess-1');
      expect(scrubbed.request.queryString).toBe('');

      // Sensitive headers removed
      expect(scrubbed.request.headers.Authorization).toBeUndefined();
      expect(scrubbed.request.headers.Cookie).toBeUndefined();
      expect(scrubbed.request.headers['X-API-Key']).toBeUndefined();
      expect(scrubbed.request.headers['Content-Type']).toBe('application/json');
      expect(scrubbed.request.headers['X-Request-ID']).toBe('req-987654321');

      // Breadcrumb scrubbed
      expect(scrubbed.breadcrumbs[0].data.url).toBe('https://smartproctor.com/api/test');
      expect(scrubbed.breadcrumbs[0].message).toBe('GET /api/test');
    });

    it('handles events without request or breadcrumbs safely', () => {
      const mockEvent = { message: 'Simple error' };
      const scrubbed = scrubEvent(mockEvent);
      expect(scrubbed.message).toBe('Simple error');
      expect(scrubEvent(null)).toBe(null);
    });
  });
});
