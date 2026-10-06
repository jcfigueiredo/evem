/** Whether a subscription pattern matches an event name, and why, in words */
export interface MatchExplanation {
  matched: boolean;
  reason: string;
}

const segments = (count: number) => `${count} segment${count === 1 ? '' : 's'}`;

/**
 * Explain EvEm's wildcard rules for one event and pattern: `*` alone matches everything, a `*` at the end matches
 * one or more segments, and any other `*` matches exactly one. Segments are split on the emitter's separator. A test
 * pins the verdict to EvEm's own matching.
 */
export function explainMatch(event: string, pattern: string, separator = '.'): MatchExplanation {
  if (pattern === '*') return { matched: true, reason: '* on its own matches every event' };
  const events = event.split(separator);
  const patterns = pattern.split(separator);
  const trailing = patterns.length > 1 && patterns[patterns.length - 1] === '*';
  const fixed = trailing ? patterns.slice(0, -1) : patterns;
  if (trailing && events.length <= fixed.length) {
    return {
      matched: false,
      reason: `the event has ${segments(events.length)}; a * at the end needs at least one more after "${fixed.join(separator)}"`
    };
  }
  if (!trailing && events.length !== patterns.length) {
    const exactlyOne = pattern.includes('*') ? " (a * that isn't at the end matches exactly one segment)" : '';
    return {
      matched: false,
      reason: `the event has ${segments(events.length)}, the pattern ${segments(patterns.length)}${exactlyOne}`
    };
  }
  for (const [index, segment] of fixed.entries()) {
    if (segment !== '*' && segment !== events[index]) {
      return { matched: false, reason: `segment ${index + 1} is "${events[index]}", not "${segment}"` };
    }
  }
  const reasons = fixed.flatMap((segment, index) => (segment === '*' ? [`* matched "${events[index]}"`] : []));
  if (trailing) reasons.push(`the * at the end matched "${events.slice(fixed.length).join(separator)}"`);
  return { matched: true, reason: reasons.length > 0 ? reasons.join(', ') : 'the same name' };
}
