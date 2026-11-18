// A site's own icon, on its way from the site to a file on disk. The bytes a
// site sends are never decoded by the shell: they are handed, as a data:
// address, to Longboard's own sandboxed screen, which draws the picture and
// hands back a PNG it made itself. These are the checks on each side. Pure.

export const MAX_ICON_BYTES = 2_000_000;
/** The PNG that comes back is small: a square of ICON_SIZE pixels. */
export const ICON_SIZE = 128;
const MAX_PNG_BYTES = 400_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** What a site sent as its icon, as a data: address for a picture element, or null when it cannot be one. */
export function iconDataUrl(bytes: Buffer, contentType: string | null): string | null {
  if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) return null;
  const said = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  // Anything that is not declared as a picture is offered as one anyway (many sites mislabel icons); the browser works out which kind.
  const type = /^image\/[a-z0-9.+-]{1,40}$/.test(said) ? said : 'image/x-icon';
  return `data:${type};base64,${bytes.toString('base64')}`;
}

/** The PNG Longboard's own screen made from an icon, or null when what came back is not one. */
export function pngFromDataUrl(value: unknown): Buffer | null {
  const prefix = 'data:image/png;base64,';
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null;
  const body = value.slice(prefix.length);
  if (body.length === 0 || body.length > MAX_PNG_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
  const bytes = Buffer.from(body, 'base64');
  if (bytes.length > MAX_PNG_BYTES || bytes.length < PNG_SIGNATURE.length + 12 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  return bytes;
}
