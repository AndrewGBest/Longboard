// The saved sign-ins on this machine (Hard rule 10). Each password is
// encrypted by the system's keyring before it touches the disk and is only
// ever decrypted to be handed to the page it was saved at, when the person
// asks. The file is passwords.json in Longboard's own folder, readable only
// by the person; nothing here is logged, synced or sent anywhere.
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { addLogin, emptyVault, listLogins, parseVault, removeLogin, setNever, usersAt, type Vault } from '../shared/passwords';

/** The system's keyring, as Electron's safeStorage gives it. A stand-in is used by the unit tests. */
export interface Keyring {
  /** False when the system has no keyring: then nothing is saved at all. */
  available: () => Promise<boolean>;
  /** Throws when the result would not be protected by the keyring. */
  encrypt: (text: string) => Promise<Buffer>;
  decrypt: (secret: Buffer) => Promise<string>;
}

export class Passwords {
  private vault: Vault = emptyVault();
  private ok = false;
  /** Done when the keyring has been asked whether it is there. */
  readonly ready: Promise<void>;

  constructor(private readonly file: string, private readonly keyring: Keyring) {
    try {
      this.vault = parseVault(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      // no file yet, or one that cannot be read: start with nothing saved
    }
    this.ready = Promise.resolve()
      .then(() => keyring.available())
      .then((ok) => void (this.ok = ok === true), () => undefined);
  }

  /** Whether the system has a keyring. False until `ready`. */
  available(): boolean {
    return this.ok;
  }

  private write(next: Vault): void {
    this.vault = next;
    writeFileSync(this.file, JSON.stringify(next, null, 2), { mode: 0o600 });
    try {
      chmodSync(this.file, 0o600);
    } catch {
      // a filesystem without permissions
    }
  }

  users(place: string | null): string[] {
    return usersAt(this.vault, place);
  }

  never(): string[] {
    return [...this.vault.never];
  }

  list(): Array<{ place: string; site: string; user: string }> {
    return listLogins(this.vault);
  }

  /** Keeps a sign-in. False when there is no keyring, or no room. */
  async save(place: string, user: string, password: string, now: number): Promise<boolean> {
    await this.ready;
    if (!this.available()) return false;
    let secret: string;
    try {
      secret = (await this.keyring.encrypt(password)).toString('base64');
    } catch {
      return false;
    }
    const next = addLogin(this.vault, place, user, secret, now);
    if (!next) return false;
    this.write(next);
    return true;
  }

  /** The password saved for a user at a place, or null. The only way a password leaves the vault. */
  async reveal(place: string | null, user: string): Promise<string | null> {
    await this.ready;
    const login = place ? (this.vault.sites[place] ?? []).find((l) => l.user === user) : undefined;
    if (!login || !this.available()) return null;
    try {
      return await this.keyring.decrypt(Buffer.from(login.secret, 'base64'));
    } catch {
      return null;
    }
  }

  remove(place: string, user: string): void {
    this.write(removeLogin(this.vault, place, user));
  }

  setNever(place: string, never: boolean): void {
    this.write(setNever(this.vault, place, never));
  }

  removeAll(): void {
    this.write(emptyVault());
  }
}
