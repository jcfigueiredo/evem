/**
 * Routing of incoming server messages to EvEm events, shared by the WebSocket and SSE adapters
 * so that the same server protocol produces the same events over either transport.
 */

/**
 * The EvEm event to publish for an incoming message
 */
export interface RoutedMessage {
  event: string;
  data: unknown;
}

export interface RouteOptions {
  /** Prefix for server events ('server' → 'server.user.login'); '' publishes names as-is */
  prefix: string;
  /** Namespace of the adapter's own events ('ws' → 'ws.message', 'ws.response') */
  channel: string;
  /** Route `{ type: 'response' }` messages to `<channel>.response` / `<channel>.response.error` */
  handleResponses: boolean;
}

/**
 * Name of the EvEm event for a server event: the server's name with the prefix added, unless it
 * already starts with it ("notification" → "server.notification", while "server.notification"
 * stays as it is). With an empty prefix, the name is used as-is.
 */
export function toServerEventName(name: string, prefix: string): string {
  if (!prefix || name.startsWith(`${prefix}.`)) {
    return name;
  }
  return `${prefix}.${name}`;
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value !== '';

/**
 * Decide which event an incoming (already parsed) message is published as:
 * - `{ type: 'response', id, result | error }` → `<channel>.response` / `<channel>.response.error`
 *   (only with `handleResponses`)
 * - `{ event, data }` → `<prefix>.<event>` with `data` (the recommended envelope)
 * - `{ type, data }` → `<prefix>.<type>` with `data` (legacy format)
 * - anything else, including values that aren't objects → `<channel>.message` with the whole message
 */
export function routeServerMessage(message: unknown, options: RouteOptions): RoutedMessage {
  const { prefix, channel, handleResponses } = options;

  if (message === null || typeof message !== 'object') {
    return { event: `${channel}.message`, data: message };
  }

  const { type, event, data, id, result, error, timestamp } = message as Record<string, unknown>;

  if (handleResponses && type === 'response') {
    return error
      ? { event: `${channel}.response.error`, data: { id, error, timestamp: timestamp ?? Date.now() } }
      : { event: `${channel}.response`, data: { id, result, timestamp: timestamp ?? Date.now() } };
  }

  if (isNonEmptyString(event)) {
    return { event: toServerEventName(event, prefix), data };
  }

  if (isNonEmptyString(type) && type !== 'response') {
    return { event: toServerEventName(type, prefix), data };
  }

  return { event: `${channel}.message`, data: message };
}
