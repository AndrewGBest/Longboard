import { describe, expect, it } from 'vitest';
import {
  blockReason,
  blockedMessage,
  certificatePageUrl,
  isCertificateError,
  describeBlockedUrl,
  isLoadFailure,
  noticePageUrl,
  offlinePageUrl,
  startingPageUrl,
  retryDelaySeconds,
} from '../src/main/navigation';

const live = { automation: false };
const auto = { automation: true };

describe('blockReason', () => {
  it('lets any web address through', () => {
    expect(blockReason('https://www.example.com/', live)).toBeNull();
    expect(blockReason('http://example.org/page?x=1', live)).toBeNull();
    expect(blockReason('http://127.0.0.1:8080/fixture.html', auto)).toBeNull();
    expect(blockReason('about:blank', live)).toBeNull();
  });

  it('refuses everything that is not a web address, in every mode', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<p>x', 'chrome://settings', 'devtools://devtools/x', 'blob:https://example.com/1', 'ftp://example.com/', 'view-source:https://example.com/', 'about:config', 'not a url', '']) {
      expect(blockReason(url, live), url).toBe('not-web');
      expect(blockReason(url, auto), url).toBe('not-web');
    }
  });

  it('refuses an address that carries a user name or password', () => {
    expect(blockReason('https://user:pw@www.example.com/', live)).toBe('credentials');
    expect(blockReason('https://www.example.com@evil.example/', live)).toBe('credentials');
  });

  it('refuses spend-looking pages only under automation', () => {
    const url = 'https://www.example.com/signup/plans?ref_=abc';
    expect(blockReason(url, live)).toBeNull();
    expect(blockReason(url, auto)).toBe('automation-spend');
    // A page of offers may be looked at (the owner's decision, 2026-11-21).
    expect(blockReason('https://www.example.com/offers/landing?ref_=abc', auto)).toBeNull();
    expect(blockReason('https://example.com/checkout', auto)).toBe('automation-spend');
  });
});

describe('describeBlockedUrl', () => {
  it('keeps host and path, drops query, fragment and credentials', () => {
    expect(describeBlockedUrl('https://user:pw@www.example.com/offers/landing?token=SECRET#frag')).toBe(
      'www.example.com/offers/landing',
    );
  });

  it('shows the scheme when it is not https, since that may be the reason', () => {
    expect(describeBlockedUrl('http://www.example.com/home?x=1')).toBe('http://www.example.com/home');
  });

  it('truncates long paths', () => {
    const out = describeBlockedUrl(`https://example.com/${'a'.repeat(300)}`);
    expect(out.length).toBeLessThanOrEqual(81);
    expect(out.endsWith('…')).toBe(true);
  });

  it('never echoes an unparseable address', () => {
    expect(describeBlockedUrl('javascript:alert("SECRET")')).not.toContain('SECRET');
    expect(describeBlockedUrl('::::')).toBe('(unreadable address)');
  });
});

describe('blockedMessage', () => {
  it('has a distinct message per reason', () => {
    expect(blockedMessage('not-web')).toMatch(/web addresses/i);
    expect(blockedMessage('credentials')).toMatch(/password/i);
    expect(blockedMessage('automation-spend')).toMatch(/automation/i);
  });
});

describe('noticePageUrl', () => {
  const decode = (url: string): string => decodeURIComponent(url.slice(url.indexOf(',') + 1));

  it('is a self-contained data: page with no scripts or remote resources', () => {
    const url = noticePageUrl('automation-spend', 'https://www.example.com/offers/landing?token=SECRET');
    expect(url.startsWith('data:text/html;charset=utf-8,')).toBe(true);
    const page = decode(url);
    expect(page).toContain('www.example.com/offers/landing');
    expect(page).toContain('--automation');
    expect(page).toContain('Ctrl+Q');
    expect(page).not.toContain('SECRET');
    expect(page).not.toMatch(/<script|src=|href=|url\(/i);
  });

  it('escapes markup in the blocked address', () => {
    const page = decode(noticePageUrl('credentials', 'https://example.com/<img onerror=x>/"&'));
    expect(page).not.toMatch(/<img/i);
  });

  it('does not mention automation for an ordinary refusal', () => {
    expect(decode(noticePageUrl('not-web', 'file:///etc/passwd'))).not.toContain('--automation');
    expect(decode(noticePageUrl('not-web', 'file:///etc/passwd'))).toContain('web addresses');
  });
});

describe('load failures', () => {
  const decode = (url: string): string => decodeURIComponent(url.slice(url.indexOf(',') + 1));

  it('treats network errors as failures, but not cancelled navigations or the notice pages themselves', () => {
    expect(isLoadFailure(-106, 'https://www.example.com/')).toBe(true);
    expect(isLoadFailure(-105, 'https://www.example.com/x')).toBe(true);
    expect(isLoadFailure(-3, 'https://www.example.com/')).toBe(false);
    expect(isLoadFailure(0, 'https://www.example.com/')).toBe(false);
    expect(isLoadFailure(-106, 'data:text/html,x')).toBe(false);
    expect(isLoadFailure(-106, 'about:blank')).toBe(false);
  });

  it('retries quickly at first and then every half minute', () => {
    expect([1, 2, 3, 6, 7, 50].map(retryDelaySeconds)).toEqual([5, 10, 15, 30, 30, 30]);
    expect(retryDelaySeconds(0)).toBe(5);
  });

  it('shows a self-contained page that says what happened and that it will retry', () => {
    const page = decode(offlinePageUrl('ERR_INTERNET_DISCONNECTED', 10));
    expect(page).toContain('Cannot reach this site');
    expect(page).toContain('ERR_INTERNET_DISCONNECTED');
    expect(page).toContain('10 seconds');
    expect(page).toContain('Ctrl+Q');
    expect(page).not.toMatch(/<script|src=|href=|url\(/i);
  });

  it('cleans the reported description', () => {
    const page = decode(offlinePageUrl('<img onerror=x> "&', 5));
    expect(page).not.toMatch(/<img|onerror=x>/i);
    expect(decode(offlinePageUrl('', 5))).toContain('no details');
  });
});

describe('certificate errors', () => {
  it('knows the certificate range of error codes', () => {
    expect([-200, -201, -202, -207, -299].every(isCertificateError)).toBe(true);
    expect([-199, -300, -106, -3, 0].some(isCertificateError)).toBe(false);
  });

  it('shows a page that offers no way through', () => {
    const page = decodeURIComponent(certificatePageUrl('ERR_CERT_AUTHORITY_INVALID'));
    expect(page).toContain('not secure');
    expect(page).toContain('ERR_CERT_AUTHORITY_INVALID');
    expect(page).not.toMatch(/<script|src=|href=|url\(|<button|<a /i);
  });
});

describe('starting page', () => {
  it('says the app is starting and why it may take a moment', () => {
    const page = decodeURIComponent(startingPageUrl());
    expect(page).toContain('Starting');
    expect(page).toContain('first run');
  });
});

