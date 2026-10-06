/**
 * One of the adapters' own event names, written with dots in the source, in the emitter's separator:
 * 'ws.send.*' stays as it is on a default emitter, and is 'ws:send:*' on one whose separator is ':'
 */
export function localName(evem: { readonly separator: string }, name: string): string {
  return name.split('.').join(evem.separator);
}
