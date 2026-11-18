import { describe, expect, it } from 'vitest';
import { DEFAULT_SEARCH, isSearchTemplate, resolveAddress, searchUrl, siteKey, siteName } from '../src/shared/address';

describe('resolveAddress', () => {
  it('returns null for nothing typed', () => {
    expect(resolveAddress('')).toBeNull();
    expect(resolveAddress('   ')).toBeNull();
  });

  it('takes a web address as it is', () => {
    expect(resolveAddress('https://example.com/a?b=c#d')).toBe('https://example.com/a?b=c#d');
    expect(resolveAddress('  http://example.org  ')).toBe('http://example.org/');
    expect(resolveAddress('HTTPS://Example.com')).toBe('https://example.com/');
  });

  it('turns a bare host name into an https address', () => {
    expect(resolveAddress('example.com')).toBe('https://example.com/');
    expect(resolveAddress('www.example.co.uk/path?q=1')).toBe('https://www.example.co.uk/path?q=1');
    expect(resolveAddress('sub.example.com:8443/x')).toBe('https://sub.example.com:8443/x');
  });

  it('uses http for this machine and bare network addresses', () => {
    expect(resolveAddress('localhost:8080')).toBe('http://localhost:8080/');
    expect(resolveAddress('localhost')).toBe('http://localhost/');
    expect(resolveAddress('192.168.1.20/admin')).toBe('http://192.168.1.20/admin');
    expect(resolveAddress('127.0.0.1:3000')).toBe('http://127.0.0.1:3000/');
  });

  it('searches for anything else', () => {
    expect(resolveAddress('cat videos')).toBe('https://www.google.com/search?q=cat%20videos');
    expect(resolveAddress('weather')).toBe('https://www.google.com/search?q=weather');
    expect(resolveAddress('what is 3.5')).toBe('https://www.google.com/search?q=what%20is%203.5');
    expect(resolveAddress('v1.2')).toBe('https://www.google.com/search?q=v1.2');
    expect(resolveAddress('someone@example.com')).toBe('https://www.google.com/search?q=someone%40example.com');
  });

  it('never opens another scheme: it is searched for instead', () => {
    for (const text of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<p>x</p>', 'chrome://settings', 'about:blank']) {
      expect(resolveAddress(text)!.startsWith('https://www.google.com/search?q='), text).toBe(true);
    }
  });

  it('never produces an address with a user name in it', () => {
    expect(resolveAddress('user:pw@example.com')!.startsWith('https://www.google.com/search?q=')).toBe(true);
  });

  it('uses the configured search address, and the built-in one when that is unusable', () => {
    expect(resolveAddress('two words', 'https://search.example/find?text=%s')).toBe('https://search.example/find?text=two%20words');
    expect(resolveAddress('two words', 'http://insecure.example/?q=%s')).toBe(searchUrl('two words', DEFAULT_SEARCH));
  });
});

describe('isSearchTemplate', () => {
  it('needs https and exactly one %s', () => {
    expect(isSearchTemplate('https://search.example/?q=%s')).toBe(true);
    expect(isSearchTemplate('https://search.example/')).toBe(false);
    expect(isSearchTemplate('https://search.example/?q=%s&again=%s')).toBe(false);
    expect(isSearchTemplate('http://search.example/?q=%s')).toBe(false);
    expect(isSearchTemplate('javascript:%s')).toBe(false);
    expect(isSearchTemplate(7)).toBe(false);
  });
});

describe('site names and keys', () => {
  it('drops www and lower-cases', () => {
    expect(siteName('https://WWW.Example.com/x')).toBe('example.com');
    expect(siteKey('https://www.example.com/x?y')).toBe('example.com');
    expect(siteKey('http://127.0.0.1:8080/')).toBe('127.0.0.1');
  });

  it('has no key for anything that is not a web address', () => {
    for (const url of ['file:///x', 'data:text/html,x', 'about:blank', 'nonsense', '']) expect(siteKey(url), url).toBeNull();
    expect(siteName('nonsense')).toBe('');
  });
});
