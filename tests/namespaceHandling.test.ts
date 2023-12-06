
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EvEm } from '~/eventEmitter';

describe('EvEm - Namespace Handling Tests', () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test('should call callbacks for specific namespace events', () => {
    const bookCallback = vi.fn();
    const cdCallback = vi.fn();

    emitter.subscribe('book.buy', bookCallback);
    emitter.subscribe('cd.buy', cdCallback);

    const bookData = { item: 'Book' };
    const cdData = { item: 'CD' };

    emitter.publish('book.buy', bookData);
    emitter.publish('cd.buy', cdData);

    expect(bookCallback).toHaveBeenCalledWith(bookData);
    expect(cdCallback).toHaveBeenCalledWith(cdData);
  });

  test('should not call callbacks for unrelated namespace events', () => {
    const bookCallback = vi.fn();

    emitter.subscribe('book.sell', bookCallback);
    emitter.publish('book.buy', { item: 'Book' });

    expect(bookCallback).not.toHaveBeenCalled();
  });

  test('should handle events with multiple namespace parts', () => {
    const nestedCallback = vi.fn();

    emitter.subscribe('book.author.new', nestedCallback);

    const eventData = { author: 'New Author' };
    emitter.publish('book.author.new', eventData);

    expect(nestedCallback).toHaveBeenCalledWith(eventData);
  });

  test('should not call callbacks for partially matching namespaces', () => {
    const partialMatchCallback = vi.fn();

    emitter.subscribe('book.author', partialMatchCallback);
    emitter.publish('book.author.new', { author: 'New Author' });

    expect(partialMatchCallback).not.toHaveBeenCalled();
  });
});
