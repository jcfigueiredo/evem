import type { SseCloseInfo, SseConnectRequest, SseTransport, SseTransportListener } from '../../../src/sse/types';

/**
 * A transport the test drives by hand: open, send events, end connections
 */
export class FakeTransport implements SseTransport {
  connections: Array<{
    request: SseConnectRequest;
    listener: SseTransportListener;
    end: (info: SseCloseInfo) => void;
  }> = [];
  aborts = 0;

  connect(request: SseConnectRequest, listener: SseTransportListener): Promise<SseCloseInfo> {
    return new Promise(resolve => this.connections.push({ request, listener, end: resolve }));
  }

  abort(): void {
    this.aborts++;
    this.connections.at(-1)?.end({ reason: 'aborted' });
  }

  get current() {
    const connection = this.connections.at(-1);
    if (!connection) throw new Error('No connection yet');
    return connection;
  }

  /** Open the current connection and deliver events to it */
  open() {
    this.current.listener.open();
  }

  send(data: string, type = 'message', lastEventId = '') {
    this.current.listener.activity();
    return this.current.listener.event({ type, data, lastEventId });
  }

  end(info: SseCloseInfo = { reason: 'ended' }) {
    this.current.end(info);
  }
}
