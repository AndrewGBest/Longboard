// Typing from a phone: a small web server on the home network, running only
// while the person has turned it on. It serves one page and its script, and
// takes sealed messages (shared/phone.ts). Nothing else is answered. What
// arrives is handed on only after it has been opened with this run's key.
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import {
  homeAddress,
  MAX_SEALED,
  newPhoneKey,
  openPhoneMessage,
  PHONE_PAGE,
  phoneUrl,
  type PhoneMessage,
} from '../shared/phone';

/** Sent with every answer: nothing is cached, and the page may load and reach only this server. */
const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

/** The server a phone talks to. One phone session at a time; `start` makes a new key. */
export class PhoneTyping {
  private server: Server | null = null;
  private key = '';
  private lastN = 0;
  private address = '';
  private port = 0;
  private heard = false;

  /**
   * `script` is the file with the phone page's script. `take` is given each
   * message that was sealed with this run's key. `changed` is called when a
   * phone first gets through.
   */
  constructor(
    private readonly script: string,
    private readonly take: (message: PhoneMessage) => void,
    private readonly changed: () => void,
  ) {}

  get on(): boolean {
    return this.server !== null;
  }
  /** True once a phone has sent something that opened. */
  get connected(): boolean {
    return this.heard;
  }
  /** The address for the phone, key and all; shown on the TV as a code to scan and never logged. */
  get url(): string | null {
    return this.server ? phoneUrl(this.address, this.port, this.key) : null;
  }

  /**
   * Starts listening on this machine's home-network address. False when
   * there is no network. `only` and `key` are for a scripted run, which
   * names the address to listen on and brings its own key.
   */
  async start(only?: string, key?: string): Promise<boolean> {
    if (this.server) return true;
    const address = only ?? homeAddress(networkInterfaces());
    if (!address) return false;
    let scriptBytes: Buffer;
    try {
      scriptBytes = readFileSync(this.script);
    } catch {
      return false;
    }
    const server = createServer((req, res) => this.answer(req, res, scriptBytes));
    server.on('clientError', (_err, socket) => socket.destroy());
    const ok = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false));
      // On the one address, on a port the system picks.
      server.listen(0, address, () => resolve(true));
    });
    if (!ok) return false;
    const at = server.address();
    this.server = server;
    this.address = address;
    this.port = typeof at === 'object' && at ? at.port : 0;
    this.key = key ?? newPhoneKey();
    this.lastN = 0;
    this.heard = false;
    return true;
  }

  /** Stops listening and forgets the key, so the address that was scanned stops working. */
  stop(): void {
    this.server?.closeAllConnections();
    this.server?.close();
    this.server = null;
    this.key = '';
    this.heard = false;
  }

  /** The three things answered: the page, its script, and a sealed message. Everything else is a 404. */
  private answer(req: IncomingMessage, res: ServerResponse, script: Buffer): void {
    const path = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { ...SECURITY, 'content-type': 'text/html; charset=utf-8' }).end(PHONE_PAGE);
    } else if (req.method === 'GET' && path === '/app.js') {
      res.writeHead(200, { ...SECURITY, 'content-type': 'text/javascript; charset=utf-8' }).end(script);
    } else if (req.method === 'POST' && path === '/send') {
      let body = '';
      let over = false;
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        body += chunk;
        if (body.length > MAX_SEALED) {
          over = true;
          req.destroy();
        }
      });
      req.on('end', () => {
        if (over) return;
        const opened = this.key ? openPhoneMessage(this.key, body, this.lastN) : null;
        if (!opened) {
          res.writeHead(403, SECURITY).end();
          return;
        }
        this.lastN = opened.n;
        res.writeHead(204, SECURITY).end();
        if (!this.heard) {
          this.heard = true;
          this.changed();
        }
        if (opened.message.t !== 'hello') this.take(opened.message);
      });
    } else res.writeHead(404, SECURITY).end();
  }
}
