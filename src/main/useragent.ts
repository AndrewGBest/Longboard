import { PRODUCT } from '../shared/product';

/**
 * The browser identity we send: the embedded Chromium's own user agent with
 * the Electron and app tokens removed. It states the real engine, the real
 * version and the real OS. It never claims to be a TV, console or other OS,
 * and there is no way to switch it (Hard rule 3).
 */
export function browserUserAgent(defaultUa: string): string {
  return defaultUa
    .replace(/\s?Electron\/\S+/g, '')
    .replace(new RegExp(`\\s?${PRODUCT.packageName}\\/\\S+`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
