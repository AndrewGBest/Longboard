import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homeAddress, newPhoneKey, openPhoneMessage, PHONE_PAGE, phoneUrl, sealPhoneMessage, type PhoneMessage } from '../src/shared/phone';
import { PhoneTyping } from '../src/main/phone';

describe('what a phone sends', () => {
  const key = newPhoneKey();
  it('opens with the key it was sealed with, and says one of the few things a phone may say', () => {
    expect(openPhoneMessage(key, sealPhoneMessage(key, 5, { t: 'text', v: 'héllo wörld' })!, 0)).toEqual({ n: 5, message: { t: 'text', v: 'héllo wörld' } });
    expect(openPhoneMessage(key, sealPhoneMessage(key, 6, { t: 'key', v: 'ok' })!, 5)?.message).toEqual({ t: 'key', v: 'ok' });
    expect(openPhoneMessage(key, sealPhoneMessage(key, 7, { t: 'hello' })!, 6)?.message).toEqual({ t: 'hello' });
  });
  it('does not open with another key, or when it has been altered', () => {
    const sealed = sealPhoneMessage(key, 1, { t: 'text', v: 'secret words' })!;
    expect(sealed).not.toContain('secret');
    expect(openPhoneMessage(newPhoneKey(), sealed, 0)).toBeNull();
    const flipped = sealed.slice(0, -2) + (sealed.endsWith('AA') ? 'BB' : 'AA');
    expect(openPhoneMessage(key, flipped, 0)).toBeNull();
    expect(openPhoneMessage(key, 'not sealed at all', 0)).toBeNull();
    expect(openPhoneMessage('short', sealed, 0)).toBeNull();
  });
  it('is not taken twice: a message heard on the network cannot be sent again', () => {
    const sealed = sealPhoneMessage(key, 10, { t: 'key', v: 'ok' })!;
    expect(openPhoneMessage(key, sealed, 9)).not.toBeNull();
    expect(openPhoneMessage(key, sealed, 10)).toBeNull();
  });
  it('is refused when it says anything else', () => {
    const odd = (m: unknown): string => sealPhoneMessage(key, 1, m as PhoneMessage)!;
    for (const m of [{ t: 'key', v: 'F12' }, { t: 'text', v: '' }, { t: 'text', v: 'x'.repeat(2001) }, { t: 'run', v: 'rm' }, { t: 'text', v: 5 }]) expect(openPhoneMessage(key, odd(m), 0)).toBeNull();
  });
});

describe("this machine's address for the phone", () => {
  it('is the home-network one, not the machine talking to itself', () => {
    expect(homeAddress({ lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }], eth0: [{ address: 'fe80::1', family: 'IPv6', internal: false }, { address: '192.168.1.20', family: 'IPv4', internal: false }] })).toBe('192.168.1.20');
    expect(homeAddress({ tun: [{ address: '100.64.0.2', family: 'IPv4', internal: false }], wlan0: [{ address: '10.0.0.7', family: 4, internal: false }] })).toBe('10.0.0.7');
    expect(homeAddress({ lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] })).toBeNull();
  });
  it('carries the key after the "#", which a browser never sends', () => {
    expect(phoneUrl('192.168.1.20', 4000, 'KEY')).toBe('http://192.168.1.20:4000/#KEY');
    expect(PHONE_PAGE).not.toMatch(/https?:\/\//);
  });
});

describe('the server a phone talks to', () => {
  const script = join(mkdtempSync(join(tmpdir(), 'longboard-phone-')), 'phone.js');
  writeFileSync(script, '/* the page script */');
  it('serves the page and its script, takes sealed messages once, and nothing else', async () => {
    const took: PhoneMessage[] = [];
    let changed = 0;
    const phone = new PhoneTyping(script, (m) => took.push(m), () => (changed += 1));
    expect(await phone.start('127.0.0.1')).toBe(true);
    try {
      const url = new URL(phone.url!);
      const key = url.hash.slice(1);
      const at = url.origin;
      const page = await fetch(`${at}/`);
      expect([page.status, (await page.text()).includes('Longboard remote'), page.headers.get('content-security-policy')?.includes("default-src 'none'")]).toEqual([200, true, true]);
      expect(await (await fetch(`${at}/app.js`)).text()).toBe('/* the page script */');
      expect((await fetch(`${at}/config.json`)).status).toBe(404);
      const post = (body: string): Promise<number> => fetch(`${at}/send`, { method: 'POST', body }).then((r) => r.status);
      expect(phone.connected).toBe(false);
      expect(await post(sealPhoneMessage(key, 1, { t: 'hello' })!)).toBe(204);
      expect([phone.connected, changed, took]).toEqual([true, 1, []]);
      const text = sealPhoneMessage(key, 2, { t: 'text', v: 'films tonight' })!;
      expect(await post(text)).toBe(204);
      expect(await post(text)).toBe(403);
      expect(await post(sealPhoneMessage(newPhoneKey(), 3, { t: 'key', v: 'ok' })!)).toBe(403);
      expect(await post('junk')).toBe(403);
      expect(await post(sealPhoneMessage(key, 3, { t: 'key', v: 'ok' })!)).toBe(204);
      expect(took).toEqual([{ t: 'text', v: 'films tonight' }, { t: 'key', v: 'ok' }]);
    } finally {
      phone.stop();
    }
    expect([phone.on, phone.url]).toEqual([false, null]);
  });
});
