import { describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { extensionIdOf, openCrx } from '../src/main/crx';

/** Protocol-buffer writing, just enough to make an extension file as the store makes them. */
const varint = (n: number): Buffer => {
  const out: number[] = [];
  for (; n > 127; n = Math.floor(n / 128)) out.push((n % 128) | 128);
  out.push(n);
  return Buffer.from(out);
};
const field = (number: number, bytes: Buffer): Buffer =>
  Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes]);

function makeCrx(
  archive: Buffer,
  o: { signWith?: ReturnType<typeof generateKeyPairSync>; claim?: Buffer; ec?: boolean } = {},
): { file: Buffer; id: string } {
  const pair = o.ec
    ? generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    : generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = pair.publicKey.export({ type: 'spki', format: 'der' });
  const id = extensionIdOf(key);
  const signedPart = field(1, o.claim ?? createHash('sha256').update(key).digest().subarray(0, 16));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(signedPart.length);
  const signature = sign(
    'sha256',
    Buffer.concat([Buffer.from('CRX3 SignedData\0', 'latin1'), length, signedPart, archive]),
    (o.signWith ?? pair).privateKey,
  );
  const header = Buffer.concat([
    field(o.ec ? 3 : 2, Buffer.concat([field(1, key), field(2, signature)])),
    field(10000, signedPart),
  ]);
  const start = Buffer.alloc(12);
  start.write('Cr24', 'latin1');
  start.writeUInt32LE(3, 4);
  start.writeUInt32LE(header.length, 8);
  return { file: Buffer.concat([start, header, archive]), id };
}

describe('an extension file from the store', () => {
  const archive = Buffer.from('PK\u0003\u0004 a made-up archive '.repeat(50), 'latin1');
  it('is accepted when the key of the extension asked for signed it', () => {
    for (const ec of [false, true]) {
      const { file, id } = makeCrx(archive, { ec });
      const crx = openCrx(file, id);
      expect(crx.id).toBe(id);
      expect(crx.archive.equals(archive)).toBe(true);
      expect(extensionIdOf(Buffer.from(crx.key, 'base64'))).toBe(id);
    }
  });
  it('is refused when one byte of what is inside has changed', () => {
    const { file, id } = makeCrx(archive);
    const changed = Buffer.from(file);
    changed[changed.length - 20] = changed[changed.length - 20]! ^ 1;
    expect(() => openCrx(changed, id)).toThrow(/not what its maker's key signed/);
  });
  it('is refused when it is for another extension, whoever signed it', () => {
    const { file } = makeCrx(archive);
    expect(() => openCrx(file, makeCrx(archive).id)).toThrow(/different extension/);
  });
  it('is refused when someone else signed it in the name of the extension asked for', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const { file, id } = makeCrx(archive, { signWith: other });
    expect(() => openCrx(file, id)).toThrow(/not what its maker's key signed/);
  });
  it('is refused when it is not such a file at all, or is cut short', () => {
    const { file, id } = makeCrx(archive);
    expect(() => openCrx(Buffer.from('PK\u0003\u0004 just a zip'), id)).toThrow(/not an extension file/);
    expect(() => openCrx(file.subarray(0, 40), id)).toThrow();
    expect(() => openCrx(Buffer.alloc(0), id)).toThrow();
    const old = Buffer.from(file);
    old.writeUInt32LE(2, 4);
    expect(() => openCrx(old, id)).toThrow(/kind that is not accepted/);
  });
});
