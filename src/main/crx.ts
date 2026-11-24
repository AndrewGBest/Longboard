// An extension as the Chrome Web Store hands it over: a "CRX3" file, which
// is a zip archive behind a header that says who signed it. This reads the
// header and checks the signature, so that what is unpacked is what the
// extension's own key signed, whatever happened on the way here.
//
// The layout (Chromium, components/crx_file): "Cr24", the number 3, the
// length of the header, the header (a protocol buffer), then the archive.
// What is signed is the text "CRX3 SignedData" and a zero byte, the length
// of the header's signed part as four bytes, that part, and the archive.
import { createHash, createPublicKey, verify } from 'node:crypto';

export interface Crx {
  /** The extension's id: the first half of the SHA-256 of its public key, written in the letters a to p. */
  id: string;
  /** The key that id comes from, as the manifest's "key" holds it. */
  key: string;
  /** The zip archive. */
  archive: Buffer;
}

/** The id that belongs to a public key. */
export function extensionIdOf(key: Buffer): string {
  return [...createHash('sha256').update(key).digest('hex').slice(0, 32)]
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join('');
}

/** The fields of a protocol-buffer message that are runs of bytes, by number. Anything malformed throws. */
function fields(buf: Buffer): Map<number, Buffer[]> {
  const out = new Map<number, Buffer[]>();
  let at = 0;
  const varint = (): number => {
    let value = 0;
    for (let shift = 0; ; shift += 7) {
      if (at >= buf.length || shift > 28) throw new Error('bad number');
      const byte = buf[at++]!;
      value += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) return value;
    }
  };
  while (at < buf.length) {
    const tag = varint();
    const kind = tag & 7;
    if (kind === 2) {
      const length = varint();
      if (at + length > buf.length) throw new Error('bad length');
      const list = out.get(tag >>> 3) ?? [];
      list.push(buf.subarray(at, at + length));
      out.set(tag >>> 3, list);
      at += length;
    } else if (kind === 0) varint();
    else if (kind === 1) at += 8;
    else if (kind === 5) at += 4;
    else throw new Error('bad field');
  }
  return out;
}

/**
 * Reads a CRX3 file and checks it. It is accepted only when one of its
 * signatures is by the key that `expectedId` comes from and that signature
 * is good for the whole archive. Anything else throws, saying why.
 */
export function openCrx(file: Buffer, expectedId: string): Crx {
  if (file.length < 16 || file.subarray(0, 4).toString('latin1') !== 'Cr24') throw new Error('not an extension file');
  if (file.readUInt32LE(4) !== 3) throw new Error('an extension file of a kind that is not accepted');
  const headerLength = file.readUInt32LE(8);
  if (headerLength <= 0 || 12 + headerLength >= file.length) throw new Error('the extension file is cut short');
  const header = fields(file.subarray(12, 12 + headerLength));
  const archive = file.subarray(12 + headerLength);
  const signedPart = header.get(10000)?.[0];
  if (!signedPart) throw new Error('the extension file says nothing of who it is for');
  // The id the file itself claims: sixteen bytes, each half of which is one letter.
  const claimed = fields(signedPart).get(1)?.[0];
  const claimedId =
    claimed && claimed.length === 16
      ? [...claimed.toString('hex')].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('')
      : '';
  if (claimedId !== expectedId) throw new Error('the extension file is for a different extension');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(signedPart.length);
  const signed = Buffer.concat([Buffer.from('CRX3 SignedData\0', 'latin1'), length, signedPart, archive]);
  // Field 2 holds the proofs made with RSA keys, field 3 those made with elliptic-curve keys.
  for (const proof of [...(header.get(2) ?? []), ...(header.get(3) ?? [])]) {
    const parts = fields(proof);
    const key = parts.get(1)?.[0];
    const signature = parts.get(2)?.[0];
    if (!key || !signature || extensionIdOf(key) !== expectedId) continue;
    let good: boolean;
    try {
      good = verify('sha256', signed, createPublicKey({ key, format: 'der', type: 'spki' }), signature);
    } catch {
      good = false;
    }
    if (!good) throw new Error("the extension file is not what its maker's key signed");
    return { id: expectedId, key: key.toString('base64'), archive: Buffer.from(archive) };
  }
  throw new Error('the extension file is not signed with the key of the extension asked for');
}
