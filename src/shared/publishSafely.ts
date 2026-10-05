import type { EvEm } from '../eventEmitter.js';

/**
 * Publish an event and log a rejection instead of leaving it unhandled. The adapters publish from socket and stream
 * callbacks, where nothing awaits the publish, and a publish rejects when an app's own subscriber makes it (a schema
 * with schemaErrorPolicy THROW, the recursion limit): unhandled, that would crash a Node.js process.
 */
export function publishSafely(evem: EvEm, event: string, data: unknown, source: string): Promise<void> {
  return evem.publish(event, data).then(
    () => undefined,
    error => console.error(`Error publishing "${event}" from ${source}:`, error)
  );
}
