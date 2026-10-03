import type { IWebSocket } from '@jcfigueiredo/evem/websocket';
import { pageClock, WireLog, type FakeServer, type WireEntry } from './wire';

/** How the fake server behaves; each scenario gives its own */
export interface FakeWebSocketBehavior {
  /** Milliseconds a connection or a frame takes to arrive (default 20) */
  latency?: number;
  /**
   * Answers to `{ type: 'request' }` messages, by method: what the function returns (or resolves to) is the result;
   * what it throws (`{ code, message }`) is an error response. A method the server doesn't have is a 404 error.
   */
  methods?: Record<string, (params: unknown) => unknown>;
  /** What the server does with any other message (a chat message to broadcast, say) */
  onMessage?: (message: unknown, server: FakeWebSocketServer) => void;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** The error a method throws to answer with an error response */
interface MethodError {
  code?: number;
  message?: string;
  data?: unknown;
}

/**
 * An in-page WebSocket server for the playground: its `socketClass` creates sockets (an `IWebSocket`) that connect to
 * it, after `latency` ms. It answers requests, reacts to messages, can drop its connections or refuse the next ones,
 * and logs every frame and connection event in `wire`.
 */
export class FakeWebSocketServer implements FakeServer {
  /** A WebSocket class whose sockets connect to this server (`WebSocketConstructor`) */
  readonly socketClass: new (url: string) => IWebSocket;
  private readonly sockets = new Set<FakeSocket>();
  private readonly latency: number;
  private readonly log: WireLog;
  private refusals = 0;
  private connections = 0;
  private closed = false;

  constructor(
    private readonly behavior: FakeWebSocketBehavior = {},
    now: () => number = pageClock,
    onWire?: (entry: WireEntry) => void
  ) {
    this.log = new WireLog(now, onWire);
    this.latency = behavior.latency ?? 20;
    const server = this;
    this.socketClass = class extends FakeSocket {
      constructor(url: string) {
        super(url, server);
      }
    };
  }

  get wire(): WireEntry[] {
    return this.log.entries;
  }

  /** Connections open now */
  get openConnections(): number {
    return this.sockets.size;
  }

  /** The Server tab's controls: `send <text>`, `drop`, `refuse` */
  run(command: string, argument = ''): void {
    if (command === 'send') this.send(argument);
    else if (command === 'drop') this.drop();
    else if (command === 'refuse') this.refuseNext();
    else throw new Error(`The WebSocket server has no command ${command}`);
  }

  /** Send a message to every open connection: a string as it is (it may not even be JSON), anything else as JSON */
  send(message: unknown): void {
    if (this.sockets.size === 0) this.note('no open connection: nothing sent');
    for (const socket of this.sockets) this.reply(socket, message);
  }

  /** Close every open connection the way a network failure does (code 1006, not clean) */
  drop(): void {
    if (this.sockets.size === 0) this.note('no open connection to drop');
    for (const socket of [...this.sockets]) {
      this.sockets.delete(socket);
      this.note(`connection ${socket.number} dropped (1006)`);
      socket.closeFromServer(1006);
    }
  }

  /** Refuse the next connection attempt (call again to refuse more) */
  refuseNext(): void {
    this.refusals++;
    this.note(`will refuse the next ${this.refusals === 1 ? 'connection' : `${this.refusals} connections`}`);
  }

  /** Stop for good, quietly: the scenario started over */
  close(): void {
    this.closed = true;
    this.log.close();
    for (const socket of [...this.sockets]) socket.closeFromServer(1001);
    this.sockets.clear();
  }

  /** @internal A socket finished connecting: accept it, or refuse it */
  connect(socket: FakeSocket): boolean {
    if (this.closed) return false;
    if (this.refusals > 0) {
      this.refusals--;
      this.note('refused a connection');
      return false;
    }
    socket.number = ++this.connections;
    this.sockets.add(socket);
    this.note(`connection ${socket.number} opened`);
    return true;
  }

  /** @internal The client closed a socket */
  disconnect(socket: FakeSocket, code: number): void {
    if (this.sockets.delete(socket)) this.note(`connection ${socket.number} closed by the client (${code})`);
  }

  /** @internal A frame from a client arrives */
  receive(socket: FakeSocket, text: string): void {
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      // What the server can't read, it says so (what the client can't read is its own ws.parse.error)
      this.note(`could not read connection ${socket.number}'s frame: it isn't JSON`);
      return;
    }
    const request = message as { type?: unknown; id?: unknown; method?: unknown; params?: unknown };
    if (request?.type === 'request' && typeof request.method === 'string') {
      const method = this.behavior.methods?.[request.method];
      const respond = (response: object) => this.reply(socket, { type: 'response', id: request.id, ...response });
      if (!method) {
        respond({ error: { code: 404, message: `No method ${request.method}` } });
        return;
      }
      Promise.resolve()
        .then(() => method(request.params))
        .then(
          result => respond({ result }),
          (error: MethodError) =>
            respond({ error: { code: error?.code ?? 500, message: error?.message ?? 'Failed', data: error?.data } })
        );
      return;
    }
    this.behavior.onMessage?.(message, this);
  }

  /** @internal A frame from the server to one client */
  reply(socket: FakeSocket, message: unknown): void {
    const text = typeof message === 'string' ? message : JSON.stringify(message);
    // An answer that comes after its connection closed (a slow method, then a drop) never reaches the wire
    if (!this.sockets.has(socket)) {
      this.note(`not sent (connection ${socket.number} is closed): ${text}`);
      return;
    }
    this.record('server', text);
    setTimeout(() => socket.deliver(text), this.latency);
  }

  /** @internal */
  record(direction: WireEntry['direction'], text: string): void {
    this.log.add(direction, text);
  }

  /** @internal */
  note(text: string): void {
    this.log.add('note', text);
  }

  /** @internal */
  get delay(): number {
    return this.latency;
  }
}

/** A socket connected to a FakeWebSocketServer: the browser WebSocket's states and events */
class FakeSocket implements IWebSocket {
  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSING = CLOSING;
  readonly CLOSED = CLOSED;
  readyState = CONNECTING;
  number = 0;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;

  constructor(
    readonly url: string,
    private readonly server: FakeWebSocketServer
  ) {
    setTimeout(() => {
      if (this.readyState !== CONNECTING) return;
      if (this.server.connect(this)) {
        this.readyState = OPEN;
        this.onopen?.({ type: 'open' });
      } else {
        // A refused connection: the browser reports an error, then the close
        this.readyState = CLOSED;
        this.onerror?.({ type: 'error' });
        this.onclose?.({ type: 'close', code: 1006, reason: '', wasClean: false });
      }
    }, this.server.delay);
  }

  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
    // Like the browser: an error while connecting, nothing once closing or closed
    if (this.readyState === CONNECTING)
      throw new Error("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.");
    if (this.readyState !== OPEN) return;
    const text = String(data);
    this.server.record('client', text);
    setTimeout(() => {
      if (this.readyState === OPEN) this.server.receive(this, text);
    }, this.server.delay);
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === CLOSING || this.readyState === CLOSED) return;
    if (this.readyState === CONNECTING) {
      this.readyState = CLOSED;
      this.onclose?.({ type: 'close', code, reason, wasClean: false });
      return;
    }
    this.readyState = CLOSING;
    this.server.disconnect(this, code);
    setTimeout(() => {
      this.readyState = CLOSED;
      this.onclose?.({ type: 'close', code, reason, wasClean: true });
    }, this.server.delay);
  }

  /** The server closed this connection */
  closeFromServer(code: number): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.onclose?.({ type: 'close', code, reason: '', wasClean: code !== 1006 });
  }

  /** A frame from the server arrives */
  deliver(text: string): void {
    if (this.readyState === OPEN) this.onmessage?.({ type: 'message', data: text });
  }
}
