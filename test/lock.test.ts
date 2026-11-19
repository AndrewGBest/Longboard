import { describe, expect, it } from 'vitest';
import { homeSites, isPin, onHomeSite, parseLock, waitAfter } from '../src/shared/lock';
import { checkPin, makeLock } from '../src/main/lock';
import { blockReason, blockedMessage, noticePageUrl } from '../src/main/navigation';

describe('the PIN', () => {
  it('is four digits and nothing else', () => {
    expect(isPin('0420')).toBe(true);
    for (const bad of ['', '123', '12345', '12a4', ' 123', '١٢٣٤', 1234, null, undefined]) expect(isPin(bad)).toBe(false);
  });
  it('is kept only as a salted hash, and checked against it', () => {
    const lock = makeLock('0420', true);
    expect(JSON.stringify(lock)).not.toContain('0420');
    expect(checkPin(lock, '0420')).toBe(true);
    expect(checkPin(lock, '0421')).toBe(false);
    expect(checkPin(lock, '')).toBe(false);
    expect(checkPin(lock, undefined)).toBe(false);
    // The same PIN set twice does not hash the same.
    expect(makeLock('0420', true).hash).not.toBe(lock.hash);
  });
  it('survives the file and refuses a broken one', () => {
    const lock = makeLock('7391', false);
    expect(parseLock(JSON.parse(JSON.stringify(lock)))).toEqual(lock);
    expect(parseLock({ ...lock, homeOnly: 'yes' })!.homeOnly).toBe(false);
    for (const bad of [null, 5, {}, { salt: 'xyz', hash: lock.hash }, { salt: lock.salt }, { salt: lock.salt, hash: '1234' }]) expect(parseLock(bad)).toBeNull();
  });
  it('makes guessing slow: free at first, then a wait that grows', () => {
    expect([0, 1, 2].map(waitAfter)).toEqual([0, 0, 0]);
    expect(waitAfter(3)).toBe(30_000);
    expect(waitAfter(5)).toBeGreaterThan(waitAfter(4));
    expect(waitAfter(50)).toBe(30 * 60_000);
  });
});

describe('only the sites on Home', () => {
  const sites = homeSites([{ url: 'https://www.video.example/watch' }, { url: 'https://news.example/' }, { url: 'https://news.example/other' }, { url: 'not an address' }]);
  it('are the sites of the apps and saved pages, once each', () => {
    expect(sites).toEqual(['video.example', 'news.example']);
  });
  it('open, with anything under them', () => {
    expect(onHomeSite('https://video.example/x', sites)).toBe(true);
    expect(onHomeSite('https://www.video.example/x', sites)).toBe(true);
    expect(onHomeSite('http://player.video.example/x', sites)).toBe(true);
  });
  it('and nothing else does, look-alikes included', () => {
    for (const url of ['https://other.example/', 'https://notvideo.example/', 'https://video.example.evil.test/', 'https://example/', 'about:blank', 'nonsense']) expect(onHomeSite(url, sites)).toBe(false);
    expect(onHomeSite('https://video.example/', [])).toBe(false);
  });
  it('is a reason a page is not opened, said in plain words', () => {
    const opts = { automation: false, onlySites: sites };
    expect(blockReason('https://other.example/', opts)).toBe('locked');
    expect(blockReason('https://news.example/story', opts)).toBeNull();
    expect(blockReason('https://other.example/', { automation: false, onlySites: null })).toBeNull();
    expect(blockReason('https://other.example/', { automation: false })).toBeNull();
    expect(blockedMessage('locked')).toMatch(/only the sites on Home/);
    expect(decodeURIComponent(noticePageUrl('locked', 'https://other.example/a?token=1'))).toMatch(/is locked.*other\.example\/a/s);
  });
});
