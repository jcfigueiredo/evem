# History and debugging

Recording events for late subscribers, and finding subscriptions that pile up.

## Using Event History and Replay

EvEm can maintain a history of published events, allowing new subscribers to catch up on what they missed.

```typescript
import { EvEm } from "@jcfigueiredo/evem";
const evem = new EvEm();

interface Login {
  userId: number;
  name: string;
}

// Enable history recording, keeping at most the last 100 events (default: 50)
evem.enableHistory(100);

// Publish some events that will be recorded
await evem.publish<Login>('user.login', { userId: 1, name: 'Alice' });
await evem.publish('notification', { message: 'New feature available!' });
await evem.publish<Login>('user.login', { userId: 2, name: 'Bob' });

// Retrieve all recorded events: { event, data, timestamp } records, oldest first
const allHistory = evem.getEventHistory();
console.log(`Recorded ${allHistory.length} events`);
// Output: Recorded 3 events

// Retrieve just user.login events (patterns like 'user.*' work too)
const loginHistory = evem.getEventHistory<Login>('user.login');
console.log(`${loginHistory.length} user logins recorded`);
// Output: 2 user logins recorded

// A component initialized later can get the most recent notification immediately
evem.subscribe<{ message: string }>('notification', (notification) => {
  console.log(`Latest notification: ${notification.message}`);
}, {
  replayLastEvent: true
});
// Output: Latest notification: New feature available!

// An analytics service connecting later can get every login, in order
evem.subscribe<Login>('user.login', (user) => {
  console.log(`Login: ${user.name} (#${user.userId})`);
}, {
  replayHistory: true
});
// Output:
// Login: Alice (#1)
// Login: Bob (#2)

// Clear history if needed
evem.clearEventHistory();

// Disable history recording when no longer needed (doesn't clear existing history)
evem.disableHistory();
```

What gets recorded and replayed:

- History records the data subscribers receive, after middleware (and under the new name if a middleware rerouted the event), without the `cancel()` of cancelable events. Events canceled by middleware aren't recorded.
- `enableHistory(maxEvents)` keeps the most recent `maxEvents` events (default 50). `enableHistory(0)` keeps nothing, and re-enabling with a smaller limit drops the oldest events.
- Replay only happens if history is enabled when you subscribe. It starts during `subscribe`, once for the last matching event (`replayLastEvent`) or for every matching event (`replayHistory`): the callback runs before `subscribe` returns, unless the subscription has filters (they're always checked asynchronously) or an async schema, which delay it a moment, or a debounce, which delays it by `debounceTime`. A wildcard subscription replays every event its pattern matches.
- Replayed events go through the subscription's schema, filters, throttle/debounce and once (a `once` subscription fires only once), but not its transform. Replay happens outside any `publish`: async callbacks aren't awaited, and errors are logged.

### Uses for Event History

Event history is particularly useful for:

1. **Late Subscribers**: Components that initialize after events have occurred can catch up
2. **State Synchronization**: New components can immediately sync with the current application state
3. **Audit Trails**: Keep a record of important events for logging or debugging
4. **Replay Scenarios**: Test components by replaying the same sequence of events
5. **Event Sourcing**: Build event-sourced architectures where system state is derived from event history

## Memory Leak Detection

EvEm can warn you when an event collects more subscriptions than expected, which usually means handlers aren't being unsubscribed.

```typescript
import { EvEm } from "@jcfigueiredo/evem";
const evem = new EvEm();

evem.enableMemoryLeakDetection({
  threshold: 10,                 // Warn when an event has more than 10 subscriptions (default)
  showSubscriptionDetails: true  // Also log the subscription ids and some tips (default)
});

// Now if you create many subscriptions to the same event without unsubscribing,
// you'll get a warning in the console
for (let i = 0; i < 15; i++) {
  evem.subscribe('button.click', () => console.log('Button clicked!'));
}
// Warns once, when the 11th subscription is added:
// Possible memory leak detected: 11 handlers added for event "button.click". This exceeds the threshold of 10. This could indicate event handlers are not being properly unsubscribed.
// (followed by the subscription details)

// Disable memory leak detection when no longer needed
evem.disableMemoryLeakDetection();
```

Both options are optional. The check runs when a subscription is added, and counts the subscriptions to that exact event name or pattern (a `user.*` subscription counts for `user.*`, not for each event it receives). Each event is reported once; it can be reported again after its count drops back to the threshold, or after detection is re-enabled.

## Using the Info Method for Debugging

The `info` method provides a convenient way to inspect the current state of the event emitter, which is useful for debugging and monitoring.

```typescript
import { EvEm } from "@jcfigueiredo/evem";
const evem = new EvEm();

// Set up some subscriptions and middleware
evem.subscribe('user.login', () => console.log('User logged in'));
evem.subscribe('user.logout', () => console.log('User logged out'));
evem.subscribe('system.error', () => console.log('System error occurred'), { priority: 'high' });

evem.use((event, data) => {
  console.log(`Global middleware handling: ${event}`);
  return data;
});

evem.use({
  pattern: 'user.*',
  handler: (event, data) => {
    console.log(`User event middleware: ${event}`);
    return data;
  }
});

// Get info about all events and middleware
const allInfo = evem.info();
console.log('All events and middleware:', allInfo);
// Shows all three subscriptions and both middleware

// Get info about only user-related events and middleware
const userInfo = evem.info('user.*');
console.log(userInfo);
// Output:
// [
//   { event: 'user.login', isMiddleware: false, id: '…', priority: 0 },
//   { event: 'user.logout', isMiddleware: false, id: '…', priority: 0 },
//   { event: '*', isMiddleware: true, pattern: undefined },
//   { event: 'user.*', isMiddleware: true, pattern: 'user.*' }
// ]
```

With a pattern, `info(pattern)` lists the subscriptions whose registered event name or pattern matches it, and the middleware that would run for it (including middleware without a pattern, shown as `'*'`). It matches registered names against your pattern, not the other way around: `info('user.login')` doesn't list a `user.*` subscription, even though that subscription receives `user.login` events.

This feature is particularly useful for:
1. Debugging complex event setups
2. Visualizing the current state of the event system
3. Checking which middleware will be applied to specific events
4. Inspecting the priorities of event handlers (grouped by event name, in subscription order within each name, not in the order they run)

For a comprehensive set of examples, check out the [examples](../examples.md) page.
