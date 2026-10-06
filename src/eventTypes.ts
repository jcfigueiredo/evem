/**
 * Types for typed event maps: `new EvEm<AppEvents>()`, or `new EvEm({ events: defineEvents({ … }) })`. With a map,
 * EvEm checks event names and payloads; wildcard patterns get the union of the payloads of the events they match,
 * and a pattern that matches nothing is a compile error. Without one, nothing changes.
 */

import type { CancelableEvent } from './eventEmitter.js';

declare const UNTYPED: unique symbol;
declare const CANCELABLE: unique symbol;
declare const PAYLOAD: unique symbol;

/**
 * The key an event map uses to declare its separator: `interface AppEvents { [SEPARATOR]: ':'; … }`. The
 * emitter's `separator` option is then required, and must be the same
 */
export const SEPARATOR: unique symbol = Symbol('evem.separator');

/** The event map of an emitter created without one: any name, any payload, explicit generics as before */
export interface UntypedEvents {
  readonly [UNTYPED]: true;
}

/**
 * Declares a cancelable event in a map: `'order.placing': Cancelable<Order>`. Subscribers get `cancel()` and
 * `canceled`, and publish requires `{ cancelable: true }`
 */
export interface Cancelable<T> {
  readonly [CANCELABLE]: T;
}

export type IsUntyped<E> = typeof UNTYPED extends keyof E ? true : false;

/** The event names of a map */
export type EventNames<E> = Exclude<keyof E, typeof SEPARATOR | typeof UNTYPED> & string;

/** The separator a map declares, or '.' */
export type SeparatorOf<E> = E extends { readonly [SEPARATOR]: infer S extends string } ? S : '.';

type Split<S extends string, Sep extends string> = S extends `${infer Head}${Sep}${infer Tail}`
  ? [Head, ...Split<Tail, Sep>]
  : [S];

// EvEm's rules: '*' alone matches everything; a trailing '*' one or more segments; any other '*' exactly one
type MatchParts<P extends string[], N extends string[]> = P extends ['*']
  ? N extends [string, ...string[]]
    ? true
    : false
  : P extends [infer PH extends string, ...infer PT extends string[]]
    ? N extends [infer NH extends string, ...infer NT extends string[]]
      ? PH extends '*' | NH
        ? MatchParts<PT, NT>
        : false
      : false
    : N extends []
      ? true
      : false;

type Matches<P extends string, N extends string, S extends string> = P extends '*'
  ? true
  : MatchParts<Split<P, S>, Split<N, S>>;

/** The names in a map that a pattern matches */
export type MatchingNames<E, P extends string, S extends string> = {
  [K in EventNames<E>]: Matches<P, K, S> extends true ? K : never;
}[EventNames<E>];

/** A payload as published: a Cancelable<T> is published as T */
export type Published<T> = T extends Cancelable<infer U> ? U : T;

/** A payload as subscribers get it: a Cancelable<T> arrives with cancel() and canceled */
export type Delivered<T> = T extends Cancelable<infer U> ? U & CancelableEvent : T;

/** What publishers of the events a pattern matches send: the union of their payloads, as published */
export type PublishedOf<E, P extends string, S extends string> = Published<E[MatchingNames<E, P, S> & keyof E]>;

/** What subscribers to a pattern get: the union of the payloads of the events it matches */
export type PayloadOf<E, P extends string, S extends string> = Delivered<E[MatchingNames<E, P, S> & keyof E]>;

/** A pattern that matches no event becomes this string, so the compiler's message says why */
export type NoEventMatches<P extends string> = `No event matches "${P}"`;

/** The pattern, if it matches an event in the map; NoEventMatches otherwise */
export type CheckedPattern<E, P extends string, S extends string> = [MatchingNames<E, P, S>] extends [never]
  ? NoEventMatches<P>
  : P;

/** A name that isn't in the map becomes this string, so the compiler's message says why */
export type NotAnEvent<N extends string> = `"${N}" is not an event`;

/** The name, if it's in the map; NotAnEvent otherwise */
export type CheckedName<E, N extends string> = N extends EventNames<E> ? N : NotAnEvent<N>;

/** (name, data) pairs for the events a pattern matches: narrowing the name narrows the data */
export type EventPairs<E, P extends string, S extends string> = {
  [K in MatchingNames<E, P, S>]: [event: K, data: Published<E[K]>];
}[MatchingNames<E, P, S>];

/** What a typed middleware may return: null (cancel), a payload, or a reroute to an event with its payload */
export type TypedMiddlewareResult<E> =
  null | Published<E[EventNames<E>]> | { [K in EventNames<E>]: { event: K; data: Published<E[K]> } }[EventNames<E>];

/** History records for the events a pattern matches */
export type TypedEventRecords<E, P extends string, S extends string> = {
  [K in MatchingNames<E, P, S>]: { event: K; data: Published<E[K]>; timestamp: number };
}[MatchingNames<E, P, S>];

/** The runtime list of an event map, from defineEvents(): what the emitter's development warnings check against */
export interface EventDefinitions<E, S extends string> {
  /** The declared event names */
  readonly names: readonly string[];
  /** The separator the names use */
  readonly separator: S;
  /** Carries the map's type; never set */
  readonly [PAYLOAD]?: E;
}

/** A payload type in defineEvents(): `payload<Order>()` */
export interface PayloadMarker<T> {
  readonly [PAYLOAD]: T;
}

/** The marker for an event's payload type in defineEvents(): `{ 'order.placed': payload<Order>() }` */
// Stryker disable ObjectLiteral,BlockStatement: the marker's value is never read, only its type
export function payload<T = void>(): PayloadMarker<T> {
  return {} as PayloadMarker<T>;
}
// Stryker restore ObjectLiteral,BlockStatement

type FromDefinitions<D> = { [K in keyof D]: D[K] extends PayloadMarker<infer T> ? T : never };

/**
 * Declare an event map once, as types and as a runtime list:
 * `const appEvents = defineEvents({ 'task:opened': payload<Task>() }, { separator: ':' })`, then
 * `new EvEm({ events: appEvents })`. `EventsOf<typeof appEvents>` is the map's type.
 */
export function defineEvents<const D extends Record<string, PayloadMarker<unknown>>, const S extends string = '.'>(
  definitions: D,
  options: { separator?: S } = {}
): EventDefinitions<FromDefinitions<D>, S> {
  return Object.freeze({
    names: Object.freeze(Object.keys(definitions)),
    separator: (options.separator ?? '.') as S
  });
}

/** The event map defineEvents() declared, with its separator */
export type EventsOf<D> = D extends EventDefinitions<infer E, infer S> ? E & { readonly [SEPARATOR]: S } : never;

type ReplaceDots<K extends string, S extends string> = K extends `${infer Head}.${infer Tail}`
  ? `${Head}${S}${ReplaceDots<Tail, S>}`
  : K;

/**
 * An adapter's event map (written with dots) for an emitter with another separator:
 * `interface AppEvents extends WithSeparator<SseEvents, ':'> { … }`
 */
export type WithSeparator<M, S extends string> = {
  [K in keyof M as K extends string ? ReplaceDots<K, S> : K]: M[K];
};
