import { describe, expect, it } from 'vitest';
import {
  declaredSize,
  iconCandidates,
  iconDataUrl,
  manifestIcons,
  manifestLink,
  MAX_ICON_BYTES,
  parseIconLinks,
  pngFromDataUrl,
} from '../src/shared/icons';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]);

describe('iconDataUrl', () => {
  it("wraps what the site sent under the site's own description of it", () => {
    expect(iconDataUrl(Buffer.from('abc'), 'image/svg+xml; charset=utf-8')).toBe('data:image/svg+xml;base64,YWJj');
    expect(iconDataUrl(Buffer.from('abc'), 'IMAGE/PNG')).toBe('data:image/png;base64,YWJj');
  });
  it('offers anything not described as a picture as an icon, never as a page or a script', () => {
    for (const type of ['text/html', 'application/javascript', '', null, 'image/png" onload="x', 'image/']) {
      expect(iconDataUrl(Buffer.from('abc'), type)).toBe('data:image/x-icon;base64,YWJj');
    }
  });
  it('refuses nothing at all and too much', () => {
    expect(iconDataUrl(Buffer.alloc(0), 'image/png')).toBeNull();
    expect(iconDataUrl(Buffer.alloc(MAX_ICON_BYTES + 1), 'image/png')).toBeNull();
  });
});

describe('pngFromDataUrl', () => {
  it('takes a PNG and nothing else', () => {
    expect(pngFromDataUrl(`data:image/png;base64,${png.toString('base64')}`)?.equals(png)).toBe(true);
    expect(pngFromDataUrl(`data:image/jpeg;base64,${png.toString('base64')}`)).toBeNull();
    expect(pngFromDataUrl(`data:image/png;base64,${Buffer.alloc(48, 1).toString('base64')}`)).toBeNull();
    expect(pngFromDataUrl(`data:image/png;base64,${png.toString('base64')}<script>`)).toBeNull();
    expect(pngFromDataUrl('data:image/png;base64,')).toBeNull();
    for (const bad of [null, undefined, 5, {}, 'file:///x.png']) expect(pngFromDataUrl(bad)).toBeNull();
  });
  it('refuses one that is far bigger than an icon Longboard draws', () => {
    const big = Buffer.concat([png, Buffer.alloc(500_000, 1)]);
    expect(pngFromDataUrl(`data:image/png;base64,${big.toString('base64')}`)).toBeNull();
  });
});

describe("which of a site's icons is fetched for its tile", () => {
  const page = 'https://news.example/story/1';
  const links = parseIconLinks([
    { href: 'https://news.example/f16.png', rel: 'icon', sizes: '16x16' },
    { href: 'https://news.example/touch.png', rel: 'apple-touch-icon', sizes: '' },
    { href: 'https://news.example/f512.png', rel: 'ICON', sizes: '512x512' },
    { href: 'https://news.example/app.webmanifest', rel: 'manifest', sizes: '' },
    { href: 'https://news.example/style.css', rel: 'stylesheet', sizes: '' },
  ]);
  it('reads sizes as written', () => {
    expect(declaredSize('48x48 192x192')).toBe(192);
    expect(declaredSize('any')).toBe(512);
    expect(declaredSize('')).toBe(0);
    expect(declaredSize('big')).toBe(0);
  });
  it('takes only web addresses from what a page reports, and never throws', () => {
    expect(
      parseIconLinks([
        { href: 'javascript:alert(1)', rel: 'icon' },
        { href: 'file:///etc/passwd', rel: 'icon' },
        { href: 'https://a.example/i.png' },
        null,
        5,
      ]),
    ).toEqual([]);
    for (const bad of [null, undefined, 'x', {}, 5]) expect(parseIconLinks(bad)).toEqual([]);
    expect(
      parseIconLinks(Array.from({ length: 100 }, () => ({ href: 'https://a.example/i.png', rel: 'icon', sizes: '' })))
        .length,
    ).toBeLessThanOrEqual(24);
  });
  it('finds the manifest', () => {
    expect(manifestLink(links)).toBe('https://news.example/app.webmanifest');
    expect(manifestLink([])).toBeNull();
  });
  it("reads a manifest's icons relative to the manifest, and leaves out ones made only for cutting to a shape", () => {
    const manifest = {
      icons: [
        { src: 'icons/192.png', sizes: '192x192' },
        { src: '/m.png', sizes: '512x512', purpose: 'maskable' },
        { src: 'javascript:1', sizes: '64x64' },
        { src: 5 },
        { src: 'both.png', sizes: '256x256', purpose: 'any maskable' },
      ],
    };
    expect(manifestIcons(manifest, 'https://news.example/pwa/app.webmanifest')).toEqual([
      { url: 'https://news.example/pwa/icons/192.png', size: 192 },
      { url: 'https://news.example/pwa/both.png', size: 256 },
    ]);
    for (const bad of [null, 5, 'x', [], { icons: 'all' }])
      expect(manifestIcons(bad, 'https://news.example/m.json')).toEqual([]);
  });
  it('tries the smallest picture big enough for a tile first, then smaller ones, then what the browser found, then the usual place', () => {
    expect(
      iconCandidates(
        links,
        [{ url: 'https://news.example/m192.png', size: 192 }],
        ['https://news.example/f16.png', 'https://news.example/other.ico'],
        page,
      ),
    ).toEqual([
      'https://news.example/touch.png',
      'https://news.example/m192.png',
      'https://news.example/f512.png',
      'https://news.example/f16.png',
      'https://news.example/other.ico',
      'https://news.example/favicon.ico',
    ]);
  });
  it('still has somewhere to look when the page names nothing', () => {
    expect(iconCandidates([], [], [], page)).toEqual(['https://news.example/favicon.ico']);
    expect(iconCandidates([], [], [], 'nonsense')).toEqual([]);
  });
});
