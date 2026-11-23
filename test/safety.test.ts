// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { installPurchaseGuard, isSpendControl, looksLikeSpendUrl } from '../src/layer/guard/purchase-guard';
import { buildOutline, maskIdentifier, sanitizeUrl } from '../src/layer/diagnostics/outline';
import { browserUserAgent, buildYear, chipName, identityFor, systemName, tvBrowserUserAgent, tvUserAgent } from '../src/main/useragent';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aboutTitle, NOTICE } from '../src/shared/about';

function html(markup: string): HTMLElement {
  document.body.innerHTML = markup;
  return document.body;
}

describe('purchase guard', () => {
  it.each([
    '<button id="t">Rent HD $4.99</button>',
    '<button id="t">Buy movie</button>',
    '<button id="t">Go ad free</button>',
    '<a id="t" href="/x">Start your free trial</a>',
    '<button><span id="t">Subscribe</span></button>',
    '<div role="button" id="t" aria-label="Pre-order now"></div>',
    '<a id="t" href="/gp/buy/spc/handlers/display.html">Continue</a>',
    '<button id="t">Log Out</button>',
    '<button id="t">Edit Profiles</button>',
    '<button id="t">Account</button>',
    '<a id="t" href="/x">Cancel subscription</a>',
    '<input id="t" type="submit" value="Place your order">',
    '<form action="/checkout/confirm"><button id="t">Continue</button></form>',
  ])('blocks %s', (markup) => {
    html(markup);
    expect(isSpendControl(document.getElementById('t')!)).toBe(true);
  });

  it.each([
    '<button id="t">Play</button>',
    '<button id="t">Resume Episode 3</button>',
    '<a id="t" href="/detail/abc">More details</a>',
    '<button id="t">Add to Watchlist</button>',
    '<button id="t">Subtitles</button>',
    '<button id="t">Help</button>',
    '<button id="t">Log in</button>',
  ])('allows %s', (markup) => {
    html(markup);
    expect(isSpendControl(document.getElementById('t')!)).toBe(false);
  });

  it('honours adapter selectors', () => {
    html('<div class="offer"><button id="t">Continue</button></div>');
    expect(isSpendControl(document.getElementById('t')!, ['.offer'])).toBe(true);
  });

  it('stops a click before the page sees it', () => {
    html('<button id="buy">Buy now</button><button id="play">Play</button>');
    const blocked = vi.fn();
    const pageHandler = vi.fn();
    document.getElementById('buy')!.addEventListener('click', pageHandler);
    document.getElementById('play')!.addEventListener('click', pageHandler);
    const stop = installPurchaseGuard(document, [], blocked);
    document.getElementById('buy')!.click();
    expect(pageHandler).not.toHaveBeenCalled();
    expect(blocked).toHaveBeenCalledTimes(1);
    document.getElementById('play')!.click();
    expect(pageHandler).toHaveBeenCalledTimes(1);
    stop();
    document.getElementById('buy')!.click();
    expect(pageHandler).toHaveBeenCalledTimes(2);
  });

  it('flags spend URLs and refuses unparseable ones', () => {
    expect(looksLikeSpendUrl('https://www.example.com/gp/buy/thing')).toBe(true);
    expect(looksLikeSpendUrl('https://www.example.com/detail/123')).toBe(false);
    // A page of offers may be looked at (the owner's decision, 2026-11-21); what its buttons lead to may not.
    expect(looksLikeSpendUrl('https://www.example.com/offers/welcome')).toBe(false);
    expect(looksLikeSpendUrl('https://www.example.com/offers/checkout')).toBe(true);
    expect(looksLikeSpendUrl('https://www.example.com/signup?plan=1')).toBe(true);
    expect(looksLikeSpendUrl('https://www.example.com/subscribe')).toBe(true);
    expect(looksLikeSpendUrl('http://[bad')).toBe(true);
  });
});

describe('identifier masking', () => {
  it('keeps ordinary structural identifiers', () => {
    for (const id of ['card', 'pv-nav-home', 'dp-atf-play-button', 'thumbUpOutlined', 'DVWebNode-detail-wrapper', 'ep-title-episode-3']) {
      expect(maskIdentifier(id)).toBe(id);
    }
  });

  // Found on the live site: a test id of the form active-profile-<profile name>.
  it.each([
    ['active-profile-Jane Doe', 'active-profile-:text'],
    ['active-profile-jane', 'active-profile-:text'],
    ['profile-avatar', 'profile-:text'],
    ['nav-merch-BlackVoices', 'nav-merch-:text'],
    ['greeting Jane', ':text'],
    ['Jane Doe', ':text'],
    ['user_jdoe', 'user-:text'],
  ])('masks %s', (input, expected) => {
    expect(maskIdentifier(input)).toBe(expected);
  });

  it('still masks id-like tokens', () => {
    expect(maskIdentifier('0ABCD12345XYZ')).toBe(':id');
    expect(maskIdentifier('card-0ABCD12345XYZ Jane')).toBe(':text');
  });

  it('is applied to ids and test ids in the outline', () => {
    const out = buildOutline(
      html('<div id="active-profile-Jane" data-testid="active-profile-Jane Doe" data-automation-id="account-jdoe"></div>'),
    );
    expect(out).not.toMatch(/Jane|Doe|jdoe/);
    expect(out).toContain('[data-testid="active-profile-:text"]');
  });
});

describe('diagnostics outline', () => {
  const SECRET = 'The Secret Show Title';
  const markup = `
    <main data-testid="home">
      <section aria-label="${SECRET} row">
        <a href="/detail/0ABCD12345XYZ/ref=${SECRET}" class="card amzn1-dv-gti-abc123456">
          <img src="https://img.example/${SECRET}.jpg" alt="${SECRET}">
          <span>${SECRET}</span>
        </a>
        <button role="button" aria-expanded="false" title="${SECRET}">Play ${SECRET}</button>
        <input type="search" placeholder="${SECRET}" value="${SECRET}" name="q">
      </section>
      <script>var x = "${SECRET}"</script>
      <div id="profile-JaneDoe-9988776655">Jane Doe</div>
    </main>`;

  it('never includes text, labels, links, image sources or values', () => {
    const out = buildOutline(html(markup));
    expect(out).not.toContain('Secret');
    expect(out).not.toContain('Jane');
    expect(out).not.toContain('img.example');
    expect(out).not.toContain('0ABCD12345XYZ');
    expect(out).not.toContain('9988776655');
    expect(out).not.toContain('script');
  });

  it('keeps the structure needed to write selectors', () => {
    const out = buildOutline(html(markup));
    expect(out).toContain('main[data-testid="home"]');
    expect(out).toContain('a.card.:id[href:');
    expect(out).toContain('button[role="button"][aria-expanded="false"]');
    expect(out).toContain('input[type="search"]');
    expect(out).toMatch(/\{text:\d+\}/);
  });

  it('reduces URLs to a path shape', () => {
    expect(sanitizeUrl('https://www.primevideo.com/detail/0ABCD12345XYZ/ref=x?autoplay=1&t=99')).toBe(
      'https://<host>/detail/:id/ref=x',
    );
  });
});

describe('user agent', () => {
  it('keeps the real engine and OS, drops the toolkit\'s tokens, and says its own name once, at the end', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) longboard/0.0.1 Chrome/146.0.0.0 Electron/44.10.1 Safari/537.36';
    expect(browserUserAgent(ua, 'Longboard', '1.2.3')).toBe(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Longboard/1.2.3',
    );
    expect(browserUserAgent(ua, 'Longboard', '1.2.3')).not.toMatch(/Electron|longboard\/0\.0\.1/);
    expect(browserUserAgent(ua, 'Longboard', '1.2.3').match(/Longboard/gi)).toHaveLength(1);
  });
});

describe('about panel', () => {
  const flat = (text: string): string => text.replace(/^> ?/gm, '').replace(/\s+/g, ' ');

  it('carries the required notice, word for word as in the guardrails and the README', () => {
    for (const file of ['docs/LEGAL-GUARDRAILS.md', 'README.md']) {
      expect(flat(readFileSync(join(__dirname, '..', file), 'utf8'))).toContain(NOTICE);
    }
  });

  it('shows the version when it has one', () => {
    expect(aboutTitle('0.0.1')).toBe('Longboard 0.0.1');
    expect(aboutTitle(undefined)).toBe('Longboard');
  });
});

describe('the guard, after an independent review', () => {
  const el = (html: string, pick = 'button, a, input'): Element => {
    document.body.innerHTML = html;
    return document.body.querySelector(pick)!;
  };

  it('sees a button inside a web component as the button it is', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const root = document.getElementById('host')!.attachShadow({ mode: 'open' });
    root.innerHTML = '<button id="b"><span>Buy now</span></button><button id="ok">Close</button>';
    expect(isSpendControl(root.querySelector('span')!)).toBe(true);
    expect(isSpendControl(root.getElementById('ok')!)).toBe(false);
    const blocked: Element[] = [];
    const stop = installPurchaseGuard(document, [], (e) => blocked.push(e));
    let reached = 0;
    root.getElementById('b')!.addEventListener('click', () => (reached += 1));
    root.getElementById('ok')!.addEventListener('click', () => (reached += 10));
    (root.querySelector('span') as HTMLElement).click();
    (root.getElementById('ok') as HTMLElement).click();
    stop();
    expect([blocked.length, reached]).toEqual([1, 10]);
  });

  it('judges a form that names nowhere to go by the page it is on', () => {
    const submit = el('<form><button>Continue</button></form>');
    expect(isSpendControl(submit, [], 'https://shop.example/checkout/step-2')).toBe(true);
    expect(isSpendControl(submit, [], 'https://shop.example/search')).toBe(false);
    expect(isSpendControl(el('<form><button type="button">Continue</button></form>'), [], 'https://shop.example/checkout')).toBe(false);
  });

  it('knows more of the words, a price, and a picture button', () => {
    for (const text of ['Rentals', 'Register', 'Join now', 'Get started', 'Try free', 'Order now', 'Pay $3.99', 'Sign-up', 'Signup', '$3.99', '3,99 €']) {
      expect(isSpendControl(el(`<button>${text}</button>`)), text).toBe(true);
    }
    expect(isSpendControl(el('<button><img alt="Buy"></button>'))).toBe(true);
    expect(isSpendControl(el('<input type="image" alt="Subscribe">'))).toBe(true);
    for (const text of ['Play', 'More details', 'Episode 3', 'Paying attention', 'Enjoy', 'Season 2']) {
      expect(isSpendControl(el(`<button>${text}</button>`)), text).toBe(false);
    }
  });

  it('reads all of a real control, however long, but not a container', () => {
    const long = 'A long description of a film that goes on for a good while, well past eighty characters. ';
    expect(isSpendControl(el(`<a href="/title/1">${long} Rent from $3.99</a>`))).toBe(true);
    document.body.innerHTML = `<div id="box">${long} Buy</div>`;
    expect(isSpendControl(document.getElementById('box')!)).toBe(false);
  });

  it('knows a payment host as well as a payment path', () => {
    expect(looksLikeSpendUrl('https://checkout.example.com/')).toBe(true);
    expect(looksLikeSpendUrl('https://pay.example.com/x')).toBe(true);
    expect(looksLikeSpendUrl('https://www.example.com/watch')).toBe(false);
    expect(looksLikeSpendUrl('https://paypal-news.example.com/')).toBe(false);
  });

  it('survives a profile selector it cannot read', () => {
    expect(isSpendControl(el('<button>Play</button>'), ['a[href', '.buy'])).toBe(false);
  });
});

describe('what Longboard says it is to a site with an interface for TVs (rule 3, amended 2026-11-21 and 2026-11-23)', () => {
  const honest = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Longboard/1.2.3';
  const tv = tvUserAgent(honest, 'Longboard', '1.2.3', systemName(honest), chipName('x64'), '2026', '15.6.1');
  const big = tvBrowserUserAgent(honest);
  const id = identityFor(honest, tv, big, (url) => (new URL(url).pathname.startsWith('/tv') ? 'tv' : new URL(url).hostname === 'games.example' ? 'tv-browser' : null));

  it('adds only that it is Longboard running as a TV', () => {
    expect(tv).toBe('Mozilla/5.0 (X11; Linux x86_64) Cobalt/27.lts.3.1040976-gold (unlike Gecko) v8/15.6.1-jit gles Starboard/18, Longboard_TV_x8664_2026/1.2.3 (Longboard, Linux)');
    expect([chipName('x64'), chipName('arm64'), chipName('ia32'), chipName('')]).toEqual(['x8664', 'arm64', 'ia32', 'unknown']);
    expect(buildYear()).toMatch(/^20\d\d$/);
    // The engine is the one thing said that is not so (Andrew, 2026-11-23). No other maker's device is named, and the device part is Longboard's own.
    expect(tv).not.toMatch(/Tizen|Web0S|SMART|PlayStation|Xbox|Android|Chrome|Safari/i);
    expect(tv.endsWith(', Longboard_TV_x8664_2026/1.2.3 (Longboard, Linux)')).toBe(true);
    expect(browserUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Electron/45.2.1 Safari/537.36', 'Longboard', '1.2.3')).toBe(honest);
    expect(systemName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macOS');
  });

  it('adds only the words for a browser on a TV where a profile asks for that layout', () => {
    // Engine, version, system and name untouched; no maker's device named.
    expect(big).toBe(`${honest} Smart-TV`);
    expect(big).not.toMatch(/Tizen|Web0S|PlayStation|Xbox|Android|Cobalt/i);
    expect(id.of('https://games.example/play')).toBe(big);
    const headers = { 'user-agent': honest, Accept: '*/*' };
    expect(id.header({ url: 'https://games.example/', resourceType: 'mainFrame', requestHeaders: headers })).toEqual({ Accept: '*/*', 'User-Agent': big });
    const on = (url: string): Electron.WebContents => ({ isDestroyed: () => false, getURL: () => url }) as unknown as Electron.WebContents;
    expect(id.header({ url: 'https://pictures.example/a.png', resourceType: 'image', webContents: on('https://games.example/x'), requestHeaders: headers })['User-Agent']).toBe(big);
  });

  it('says so only for the pages a profile names, and for what those pages fetch', () => {
    expect(id.of('https://video.example/tv')).toBe(tv);
    expect(id.of('https://video.example/')).toBe(honest);
    const headers = { 'user-agent': honest, Accept: '*/*' };
    expect(id.header({ url: 'https://video.example/tv', resourceType: 'mainFrame', requestHeaders: headers })).toEqual({ Accept: '*/*', 'User-Agent': tv });
    expect(id.header({ url: 'https://video.example/', resourceType: 'mainFrame', requestHeaders: headers })).toBe(headers);
    const on = (url: string): Electron.WebContents => ({ isDestroyed: () => false, getURL: () => url }) as unknown as Electron.WebContents;
    expect(id.header({ url: 'https://pictures.example/a.png', resourceType: 'image', webContents: on('https://video.example/tv#/'), requestHeaders: headers })['User-Agent']).toBe(tv);
    expect(id.header({ url: 'https://pictures.example/a.png', resourceType: 'image', webContents: on('https://video.example/watch'), requestHeaders: headers })).toBe(headers);
    expect(id.header({ url: 'https://pictures.example/a.png', resourceType: 'image', requestHeaders: headers })).toBe(headers);
  });
});
