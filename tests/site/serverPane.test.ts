import { describe, expect, it } from 'vitest';
import { connectionStatus } from '../../demo/src/playground/serverPane';

describe('connectionStatus', () => {
  it("says what the Server tab's connection count means, from the states of the code's handlers", () => {
    expect(connectionStatus(1, ['connected'])).toBe('1 open connection');
    expect(connectionStatus(2, ['connected', 'connected'])).toBe('2 open connections');
    expect(connectionStatus(0, ['reconnecting'])).toBe('No open connection: the client is reconnecting.');
    expect(connectionStatus(0, ['connecting'])).toBe('No open connection yet: the client is connecting.');
    expect(connectionStatus(0, ['disconnected'])).toBe(
      'No open connection: the client has stopped. Reset starts over.'
    );
    expect(connectionStatus(0, [])).toBe('No open connection.');
  });
});
