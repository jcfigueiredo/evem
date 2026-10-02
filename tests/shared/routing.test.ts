import { describe, expect, it } from 'vitest';
import { routeServerMessage, toServerEventName } from '../../src/shared/routing';

describe('toServerEventName', () => {
  it('should add the prefix to a name without it', () => {
    expect(toServerEventName('user.login', 'server')).toBe('server.user.login');
  });

  it('should not add the prefix twice', () => {
    expect(toServerEventName('server.user.login', 'server')).toBe('server.user.login');
  });

  it('should only treat a whole leading segment as the prefix', () => {
    expect(toServerEventName('serverless.deploy', 'server')).toBe('server.serverless.deploy');
  });

  it('should use the name as-is with an empty prefix', () => {
    expect(toServerEventName('user.login', '')).toBe('user.login');
  });
});

describe('routeServerMessage', () => {
  const options = { prefix: 'server', channel: 'ws', handleResponses: true };

  it('should route the { event, data } envelope to a prefixed server event', () => {
    expect(routeServerMessage({ event: 'user.login', data: { id: 1 } }, options))
      .toEqual({ event: 'server.user.login', data: { id: 1 } });
  });

  it('should route the legacy { type, data } format to a prefixed server event', () => {
    expect(routeServerMessage({ type: 'notification', data: 'hi' }, options))
      .toEqual({ event: 'server.notification', data: 'hi' });
  });

  it('should prefer event over type', () => {
    expect(routeServerMessage({ event: 'a', type: 'b', data: 1 }, options).event).toBe('server.a');
  });

  it('should route responses when enabled', () => {
    expect(routeServerMessage({ type: 'response', id: 'r1', result: 42, timestamp: 5 }, options))
      .toEqual({ event: 'ws.response', data: { id: 'r1', result: 42, timestamp: 5 } });
    expect(routeServerMessage({ type: 'response', id: 'r2', error: { code: 1, message: 'no' }, timestamp: 5 }, options))
      .toEqual({ event: 'ws.response.error', data: { id: 'r2', error: { code: 1, message: 'no' }, timestamp: 5 } });
  });

  it('should send responses to <channel>.message when responses are not handled', () => {
    const response = { type: 'response', id: 'r1', result: 42 };
    expect(routeServerMessage(response, { prefix: 'server', channel: 'sse', handleResponses: false }))
      .toEqual({ event: 'sse.message', data: response });
  });

  it('should send other messages, including non-objects, to <channel>.message', () => {
    expect(routeServerMessage({ ping: 1 }, options)).toEqual({ event: 'ws.message', data: { ping: 1 } });
    expect(routeServerMessage(null, options)).toEqual({ event: 'ws.message', data: null });
    expect(routeServerMessage(42, options)).toEqual({ event: 'ws.message', data: 42 });
    expect(routeServerMessage('text', options)).toEqual({ event: 'ws.message', data: 'text' });
  });

  it('should not route event or type fields that are not non-empty strings', () => {
    expect(routeServerMessage({ event: 42, data: 1 }, options).event).toBe('ws.message');
    expect(routeServerMessage({ type: '', data: 1 }, options).event).toBe('ws.message');
  });
});
