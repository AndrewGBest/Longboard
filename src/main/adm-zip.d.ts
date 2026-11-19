// The few parts of adm-zip that are used (main/extensions.ts).
declare module 'adm-zip' {
  interface Entry {
    entryName: string;
    isDirectory: boolean;
    header: { size: number };
    getData(): Buffer;
  }
  export default class AdmZip {
    constructor(data: Buffer);
    getEntries(): Entry[];
  }
}
