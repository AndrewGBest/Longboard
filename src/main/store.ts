// Small JSON files in the user data folder. Written whole, to a temporary
// name first, so a power cut leaves the old file rather than half a new one.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Undefined when the file is missing or cannot be parsed. Only the second is a problem, and is passed to `onProblem`. */
export function readJson(file: string, onProblem: (why: string) => void = () => undefined): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') onProblem(String(err).slice(0, 200));
    return undefined;
  }
}

/** Never throws: a failure is logged and the old file stays. */
export function writeJson(file: string, value: unknown): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(tmp, file);
  } catch (err) {
    console.error(`[longboard] could not save ${file}: ${String(err).slice(0, 200)}`);
  }
}
