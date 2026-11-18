import { describe, expect, it } from 'vitest';
import { iconDataUrl, MAX_ICON_BYTES, pngFromDataUrl } from '../src/shared/icons';

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
