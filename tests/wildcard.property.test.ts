import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EvEm } from '../src/eventEmitter';

// 100 generated cases per property by default; FC_NUM_RUNS=5000 pnpm test:nowatch <this file> searches longer
fc.configureGlobal({ numRuns: Number(process.env['FC_NUM_RUNS'] ?? 100) });

/**
 * The documented wildcard rules, read independently of EvEm, as a regular expression: `*` alone matches every
 * event; a `*` at the end of a longer pattern matches one or more segments; any other `*` matches exactly one
 * segment (empty ones too); everything else, `x*` included, matches only itself
 */
function reference(event: string, pattern: string, separator = '.'): boolean {
  if (pattern === '*') return true;
  const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sep = literal(separator);
  // A segment: anything that doesn't contain the separator
  const segment = `(?:(?!${sep}).)*`;
  const parts = pattern.split(separator);
  const source = parts
    .map((part, index) => {
      if (part !== '*') return literal(part);
      return index === parts.length - 1 ? `${segment}(?:${sep}${segment})*` : segment;
    })
    .join(sep);
  return new RegExp(`^${source}$`, 's').test(event);
}

// Segments: names, an empty one (a..b), and a literal star inside a name
const segment = fc.constantFrom('a', 'b', 'user', '', 'x*');
const name = (part: fc.Arbitrary<string>) =>
  fc
    .array(part, { minLength: 1, maxLength: 5 })
    .map(parts => parts.join('.'))
    .filter(text => text !== '');
const event = name(segment);
const pattern = name(fc.oneof({ arbitrary: segment, weight: 3 }, { arbitrary: fc.constant('*'), weight: 2 }));

describe('Wildcard matching - properties', () => {
  it('delivers an event to exactly the subscriptions whose pattern the rules match', async () => {
    await fc.assert(
      fc.asyncProperty(event, fc.uniqueArray(pattern, { minLength: 1, maxLength: 6 }), async (published, patterns) => {
        const evem = new EvEm();
        const called = new Set<string>();
        for (const each of patterns) {
          evem.subscribe(each, () => {
            called.add(each);
          });
        }
        await evem.publish(published);
        expect([...called].sort()).toEqual(patterns.filter(each => reference(published, each)).sort());
      })
    );
  });

  it('follows the same rules with another separator, where dots are ordinary characters', async () => {
    const separator = fc.constantFrom(':', '::', '/');
    // Segments with dots in them, and with the separators' characters, so a ':' inside '::' shows up
    const part = fc.constantFrom('a', 'user', '', 'x*', 'a.b', 'c:d');
    const join = (parts: fc.Arbitrary<string[]>, sep: string) =>
      parts.map(each => each.join(sep)).filter(text => text !== '');
    await fc.assert(
      fc.asyncProperty(
        separator.chain(sep =>
          fc.tuple(
            fc.constant(sep),
            join(fc.array(part, { minLength: 1, maxLength: 5 }), sep),
            fc.uniqueArray(
              join(
                fc.array(fc.oneof({ arbitrary: part, weight: 3 }, { arbitrary: fc.constant('*'), weight: 2 }), {
                  minLength: 1,
                  maxLength: 5
                }),
                sep
              ),
              { minLength: 1, maxLength: 6 }
            )
          )
        ),
        async ([sep, published, patterns]) => {
          const evem = new EvEm({ separator: sep });
          const called = new Set<string>();
          for (const each of patterns) {
            evem.subscribe(each, () => {
              called.add(each);
            });
          }
          await evem.publish(published);
          expect([...called].sort()).toEqual(patterns.filter(each => reference(published, each, sep)).sort());
        }
      )
    );
  });

  it('runs a pattern middleware for exactly the events the same rules match', async () => {
    await fc.assert(
      fc.asyncProperty(event, pattern, async (published, middlewarePattern) => {
        const evem = new EvEm();
        let ran = false;
        evem.use({
          pattern: middlewarePattern,
          handler: (_name, data) => {
            ran = true;
            return data;
          }
        });
        await evem.publish(published);
        expect(ran).toBe(reference(published, middlewarePattern));
      })
    );
  });
});
