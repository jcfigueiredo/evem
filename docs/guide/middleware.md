# Middleware

EvEm allows you to register middleware functions that can intercept, transform, or cancel events before they reach subscribers. Middleware runs in registration order; each one receives the event name and the data returned by the previous one.

## Basic Middleware Usage

```typescript
import { EvEm, type MiddlewareFunction } from "@jcfigueiredo/evem";
const evem = new EvEm();

// Create a middleware that adds metadata to all events
const addMetadataMiddleware: MiddlewareFunction = (event, data) => {
  return {
    ...data,
    timestamp: Date.now(),
    eventName: event
  };
};

// Register the middleware
evem.use(addMetadataMiddleware);

interface LoginEvent {
  username: string;
  timestamp: number;
  eventName: string;
}

// Register an event handler that can use the metadata
evem.subscribe<LoginEvent>('user.login', (data) => {
  console.log(`User logged in at ${new Date(data.timestamp).toISOString()}`);
  console.log(`Event: ${data.eventName}`);
  console.log(`Username: ${data.username}`);
});

// Publish an event
await evem.publish('user.login', { username: 'alice' });
// Output (with the current time):
// User logged in at 2026-10-02T15:30:45.123Z
// Event: user.login
// Username: alice
```

## Pattern-Based Middleware

You can apply middleware to specific event patterns, allowing for more targeted event processing:

```typescript
import { EvEm, type MiddlewareConfig } from "@jcfigueiredo/evem";
const evem = new EvEm();

// Middleware that only applies to user events
const userEventsMiddleware: MiddlewareConfig = {
  pattern: 'user.*',
  handler: (event, data) => {
    console.log(`Processing user event: ${event}`);
    return {
      ...data,
      audit: { eventType: 'user' }
    };
  }
};

// Middleware that only applies to creation events
const creationEventsMiddleware: MiddlewareConfig = {
  pattern: '*.created',
  handler: (event, data) => {
    console.log(`Processing creation event: ${event}`);
    return {
      ...data,
      isNew: true
    };
  }
};

// Register both middleware with their patterns
evem.use(userEventsMiddleware);
evem.use(creationEventsMiddleware);

// Subscribe to see the results
evem.subscribe('user.created', (data) => {
  console.log('User created:', data);
});

// These events will trigger different middleware
await evem.publish('user.login', { id: 1 });      // Only the user middleware runs
await evem.publish('product.created', { id: 2 }); // Only the creation middleware runs
await evem.publish('user.created', { id: 3 });    // Both run, in registration order
// Output:
// Processing user event: user.login
// Processing creation event: product.created
// Processing user event: user.created
// Processing creation event: user.created
// User created: { id: 3, audit: { eventType: 'user' }, isNew: true }
```

## Event Transformation and Redirection

Middleware can also redirect events to a different event name:

```typescript
import { EvEm, type MiddlewareFunction } from "@jcfigueiredo/evem";
const evem = new EvEm();

// Create a middleware that redirects events based on roles
const routingMiddleware: MiddlewareFunction = (event, data) => {
  if (event === 'user.action' && data.role === 'admin') {
    // Redirect admin actions to a special admin event
    return {
      event: 'admin.action',
      data
    };
  }
  return data;
};

// Register the middleware
evem.use(routingMiddleware);

// Set up handlers for both regular user actions and admin actions
evem.subscribe('user.action', (data) => {
  console.log('Regular user action:', data);
});

evem.subscribe('admin.action', (data) => {
  console.log('Admin action (redirected):', data);
});

// Publish events - they will be routed based on the role
await evem.publish('user.action', { role: 'user', action: 'view' });
// Output: Regular user action: { role: 'user', action: 'view' }

await evem.publish('user.action', { role: 'admin', action: 'delete' });
// Output: Admin action (redirected): { role: 'admin', action: 'delete' }
```

A redirect is a **new** object with **exactly two** properties, `event` (a string) and `data`. Returning the original data unchanged, or a copy with extra properties, never redirects, even when the payload itself has `event` and `data` fields, like `{ event: 'chat.send', data: {...} }` messages sent over `ws.send`. After a redirect, later middleware is matched against the new event name, the subscribers of the new event receive it, and history records it under the new name.

## Event Filtering with Middleware

Middleware can be used to filter or cancel events based on global conditions. Returning `null` cancels the event: no subscriber receives it and `publish` resolves to `false`. A middleware that throws also cancels the event (the error is logged). Returning the data unchanged never cancels, so a middleware that passes events through doesn't cancel the ones whose data is `null`; the flip side is that a middleware can't cancel an event whose data is `null` by returning `null`.

```typescript
import type { MiddlewareFunction } from "@jcfigueiredo/evem";

// Create a middleware that implements a permissions system
const permissionsMiddleware: MiddlewareFunction = (event, data) => {
  // Check if this event requires permissions
  if (event.startsWith('secure.')) {
    // Check if the user has permissions
    if (!data.user?.permissions?.includes('admin')) {
      // Cancel the event by returning null
      console.log('Access denied: Admin permission required');
      return null;
    }
  }
  return data;
};

// Register the middleware
evem.use(permissionsMiddleware);

// Handler will only be called if permissions check passes
evem.subscribe('secure.data.access', (data) => {
  console.log('Accessing secure data:', data);
});

// This will be canceled by the middleware
await evem.publish('secure.data.access', { user: { name: 'bob', permissions: ['user'] } });
// Output: Access denied: Admin permission required

// This will pass the middleware check
await evem.publish('secure.data.access', { user: { name: 'alice', permissions: ['admin'] } });
// Output: Accessing secure data: { user: { name: 'alice', permissions: [ 'admin' ] } }
```
