# Errors, timeouts and recursion

What happens when a subscriber throws, takes too long, or publishes the event it is handling.

## Error Policy Configuration

EvEm allows you to configure, per publish, how errors in event callbacks are handled through different error policies.

### Using Different Error Policies

```typescript
import { EvEm, ErrorPolicy } from "@jcfigueiredo/evem";
const evem = new EvEm();

// Register handlers
evem.subscribe<{ isValid: boolean }>('process.data', (data) => {
  // This handler might throw
  if (!data.isValid) {
    throw new Error('Invalid data format');
  }
  console.log('Processing data:', data);
});

evem.subscribe('process.data', () => {
  console.log('Second handler ran');
});

// Default behavior: log the error and continue
await evem.publish('process.data', { isValid: false });
// Logs: Error in event handler for "process.data": Error: Invalid data format ...
// Output: Second handler ran

// Silent policy: ignore errors completely
await evem.publish('process.data', { isValid: false }, {
  errorPolicy: ErrorPolicy.SILENT
});
// Output: Second handler ran

// Cancel policy: log the error and stop the event
const completed = await evem.publish('process.data', { isValid: false }, {
  errorPolicy: ErrorPolicy.CANCEL_ON_ERROR
});
// Logs: Error in event handler for "process.data": Error: Invalid data format ...
console.log(completed);
// Output: false

// Throw policy: stop the event and reject with the error
try {
  await evem.publish('process.data', { isValid: false }, {
    errorPolicy: ErrorPolicy.THROW
  });
} catch (error) {
  console.error('Caught error from event handler:', error);
  // Handle the error at the caller level
}
```

| Policy | The error | Remaining subscribers | `publish` |
|---|---|---|---|
| `LOG_AND_CONTINUE` (default) | logged with `console.error` | run | resolves `true` |
| `SILENT` | ignored | run | resolves `true` |
| `CANCEL_ON_ERROR` | logged | skipped | resolves `false` |
| `THROW` | passed to the caller | skipped | rejects with the error |

The policy applies to errors thrown by callbacks and transforms (including rejected promises), and to [timeouts](#managing-timeouts-in-callbacks). When a transform fails and the event continues, the next subscribers receive the data unchanged. Other errors are handled where they happen:

- A filter that throws is logged and counts as rejecting the event.
- A middleware that throws is logged and cancels the event (`publish` resolves `false`).
- A failed schema validation follows the subscription's `schemaErrorPolicy` (see [Schema Validation](subscriptions.md#schema-validation)).
- Debounced calls and history replays run outside any `publish`, so their errors are logged.

### Use Cases for Different Error Policies

Different error policies are useful in different scenarios:

- **LOG_AND_CONTINUE**: Good for non-critical handlers where failures should be noted but not impact other handlers
- **SILENT**: Useful for optional features where errors shouldn't clutter logs
- **CANCEL_ON_ERROR**: Good for validation chains where any failure should halt the process
- **THROW**: Useful when the caller needs to handle errors from event handlers directly

## Managing Timeouts in Callbacks

`publish` waits for each async callback (and each async transform) before running the next subscriber, but only up to a timeout: 5000 ms by default, or the `timeout` you pass. The timeout applies to each callback separately, not to the whole publish.

```typescript
import { ErrorPolicy } from "@jcfigueiredo/evem";

// Wait up to 3000 ms for each callback of this event
await evem.publish("network.request", requestData, 3000);

// The same, combined with other options
await evem.publish("network.request", requestData, {
  timeout: 3000,
  errorPolicy: ErrorPolicy.THROW
});

// Uses the default 5000 ms timeout
await evem.publish("data.process", processData);
```

### Handling Timeout Exceedance

A callback that takes longer than the timeout is reported as an error, `Event handler timed out after 3000ms`, and handled by the publish [error policy](#error-policy-configuration): logged by default, ignored with `SILENT`, stopping the event with `CANCEL_ON_ERROR` and rejecting `publish` with `THROW`. `publish` stops waiting for it, but **the callback itself keeps running**: JavaScript can't stop a running function. If the work should stop too, give it its own deadline, for example with `fetch(url, { signal: AbortSignal.timeout(3000) })`.

```typescript
import { EvEm, ErrorPolicy } from "@jcfigueiredo/evem";
const evem = new EvEm();

evem.subscribe("report.generate", async () => {
  await new Promise(resolve => setTimeout(resolve, 2000)); // Slow work
  console.log("Report finished");
});

try {
  await evem.publish("report.generate", undefined, {
    timeout: 500,
    errorPolicy: ErrorPolicy.THROW
  });
} catch (error) {
  console.log((error as Error).message);
}
// Output:
// Event handler timed out after 500ms
// Report finished   <- 1.5 seconds later: the callback wasn't stopped
```

A transform that times out is handled the same way (`Transform timed out after 500ms`), and the next subscribers receive the data unchanged.

## Recursion Protection

A handler that publishes the event it's handling can loop forever. EvEm limits how deeply that can nest: 3 levels by default, or the depth you pass to the constructor (`new EvEm(5)`).

```typescript
import { EvEm } from "@jcfigueiredo/evem";
const evem = new EvEm(); // Same as new EvEm(3)

let calls = 0;
evem.subscribe('tick', async () => {
  calls++;
  await evem.publish('tick'); // Re-publishes the event it's handling
});

await evem.publish('tick');
console.log(calls);
// Logs: Error in event handler for "tick": Error: Max recursion depth of 3 exceeded for event 'tick'
// Output: 3
```

The publish that goes over the limit rejects with that error. Here the third handler awaits it, so the rejection becomes that handler's error and is handled by the outer publish's error policy.

- The depth counts publishes of the same event started from inside its own handlers (callbacks, middleware and transforms), directly or through the handlers of other events.
- Independent publishes of the same event are not limited, even when they overlap.
- A publish started after the handler has awaited other work can't be traced back to it, so it starts a new chain. Loops like that aren't caught.
- Await (or catch) publishes you start from handlers: one that goes over the limit without being awaited is an unhandled promise rejection.
