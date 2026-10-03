import { describe, expect, it } from 'vitest';
import { chunkText } from '../../demo/src/fakes/wire';

describe('chunkText', () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it('shows a chunk as text, and the bytes of a character split across chunks as \\xNN', () => {
    expect(chunkText(bytes('data: café\n'))).toBe('data: café\n');
    const coffee = bytes('☕ ok');
    expect(chunkText(coffee.subarray(0, 2))).toBe('\\xE2\\x98');
    expect(chunkText(coffee.subarray(2))).toBe('\\x95 ok');
    const emoji = bytes('a🙂b');
    expect(chunkText(emoji.subarray(0, 3))).toBe('a\\xF0\\x9F');
    expect(chunkText(emoji.subarray(3))).toBe('\\x99\\x82b');
  });
});
