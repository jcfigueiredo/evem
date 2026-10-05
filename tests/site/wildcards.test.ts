import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EvEm } from '../../src/index';
import { matchesPattern } from '../../demo/src/engine/tracedEvEm';
import { explainMatch } from '../../demo/src/engine/wildcards';

const NOT_AT_THE_END = "(a * that isn't at the end matches exactly one segment)";

describe('explainMatch', () => {
  it.each([
    ['user.login', '*', '* on its own matches every event'],
    ['user.login', 'user.login', 'the same name'],
    ['user.logout', 'user.login', 'segment 2 is "logout", not "login"'],
    ['user', 'user.login', 'the event has 1 segment, the pattern 2 segments'],
    ['user.login', 'user.*', 'the * at the end matched "login"'],
    ['user.profile.updated', 'user.*', 'the * at the end matched "profile.updated"'],
    ['user', 'user.*', 'the event has 1 segment; a * at the end needs at least one more after "user"'],
    ['admin.login', 'user.*', 'segment 1 is "admin", not "user"'],
    ['user.created', '*.created', '* matched "user"'],
    ['admin.user.created', '*.created', `the event has 3 segments, the pattern 2 segments ${NOT_AT_THE_END}`],
    ['system.db.error', 'system.*.error', '* matched "db"'],
    ['system.error', 'system.*.error', `the event has 2 segments, the pattern 3 segments ${NOT_AT_THE_END}`],
    ['system.db.pool.error', 'system.*.error', `the event has 4 segments, the pattern 3 segments ${NOT_AT_THE_END}`],
    ['a.b.c', '*.b.*', '* matched "a", the * at the end matched "c"']
  ])('%s against %s: %s, with the verdict EvEm gives', (event, pattern, reason) => {
    expect(explainMatch(event, pattern)).toEqual({ matched: matchesPattern(new EvEm(), event, pattern), reason });
  });
});

describe('explainMatch - against EvEm, on generated events and patterns', () => {
  const segment = fc.constantFrom('a', 'b', 'user', '', 'x*');
  const name = (part: fc.Arbitrary<string>) =>
    fc
      .array(part, { minLength: 1, maxLength: 5 })
      .map(parts => parts.join('.'))
      .filter(text => text !== '');

  it('gives the verdict EvEm gives, with a reason, for any event and pattern', () => {
    fc.assert(
      fc.property(name(segment), name(fc.oneof(segment, fc.constant('*'))), (event, pattern) => {
        const explanation = explainMatch(event, pattern);
        expect(explanation.matched).toBe(matchesPattern(new EvEm(), event, pattern));
        expect(explanation.reason).not.toBe('');
      })
    );
  });
});
