// Downloads: where a file goes and what it is called. Pure, so the rules are
// unit-tested; the shell does the asking and the saving.

const MAX_NAME = 120;

/**
 * A file name that is safe to create in the downloads folder: no folders, no
 * control characters, not hidden, not empty, not over-long. The browser has
 * usually cleaned the name already; this does not rely on it.
 */
export function safeFileName(name: string): string {
  let clean = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  if (!clean) clean = 'download';
  if (clean.length > MAX_NAME) {
    const dot = clean.lastIndexOf('.');
    const ext = dot > 0 && clean.length - dot <= 12 ? clean.slice(dot) : '';
    clean = clean.slice(0, MAX_NAME - ext.length) + ext;
  }
  return clean;
}

/** A name not already in use: "report.pdf", then "report (2).pdf", "report (3).pdf"... */
export function uniqueName(name: string, taken: (candidate: string) => boolean): string {
  const clean = safeFileName(name);
  if (!taken(clean)) return clean;
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  for (let n = 2; n < 10000; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken(candidate)) return candidate;
  }
  return `${stem} (${Date.now()})${ext}`;
}

/** "3.4 MB", for the question and the messages. Empty when the size is not known. */
export function sizeText(bytes: number): string {
  if (!(bytes > 0)) return '';
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** How far a download has got: "40% of 3.4 MB", or what has come so far when the site did not say how big it is. */
export function progressText(received: number, total: number): string {
  if (total > 0) return `${Math.min(100, Math.max(0, Math.floor((received / total) * 100)))}% of ${sizeText(total)}`;
  return received > 0 ? `${sizeText(received)} so far` : 'starting';
}
