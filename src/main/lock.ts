// Hashing for the parental lock (shared/lock.ts). The PIN is never written
// down or logged; what is kept is a salted scrypt hash.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { isPin, type Lock } from '../shared/lock';

const digest = (pin: string, salt: string): Buffer => scryptSync(pin, Buffer.from(salt, 'hex'), 32);

/** A new lock for a PIN. */
export function makeLock(pin: string, homeOnly: boolean): Lock {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: digest(pin, salt).toString('hex'), homeOnly };
}

/** True when `pin` is the lock's PIN. */
export function checkPin(lock: Lock, pin: unknown): boolean {
  if (!isPin(pin)) return false;
  const want = Buffer.from(lock.hash, 'hex');
  const got = digest(pin, lock.salt);
  return want.length === got.length && timingSafeEqual(want, got);
}
