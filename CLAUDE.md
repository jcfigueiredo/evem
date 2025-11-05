# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- **Run all tests**: `pnpm test:nowatch`
- **Run single test file**: `pnpm test:nowatch -- tests/priority.test.ts`
- **Run specific test by name**: `pnpm test:nowatch -- -t "callbacks should be executed in priority order"`
- **Coverage report**: `pnpm test:coverage`
- **Watch mode tests**: `pnpm test`
- **TypeScript check**: `pnpm tsc --noEmit`

## Architecture

### Core Implementation
The event emitter is implemented as a single class `EvEm` in `src/eventEmitter.ts` (~1300 lines). Key design patterns:

- **Subscription Storage**: Uses nested Maps (`Map<eventName, Map<subscriptionId, CallbackInfo>>`) for O(1) lookups
- **UUID-based Tracking**: Each subscription gets a unique UUID for precise unsubscription
- **Callback Processing Pipeline**: 
  1. Middleware processing (global → pattern-specific)
  2. Schema validation (if configured)
  3. Filter predicates (sync/async)
  4. Throttle/debounce logic
  5. Transform functions
  6. Once-only auto-unsubscription
  7. Priority-ordered execution

### Feature Layers
The implementation has distinct layers that can be composed:

1. **Core Pub/Sub**: Basic event emission with namespace/wildcard support
2. **Flow Control**: Throttling, debouncing, priority ordering
3. **Data Processing**: Filters, transforms, schema validation
4. **Middleware System**: Global event interception and modification
5. **History/Replay**: Event recording and replay for late subscribers
6. **Diagnostics**: Memory leak detection, info/debugging methods

### Key Data Structures
- `CallbackInfo`: Stores callback function, priority, and transform function
- `EventRecord`: Stores event name, data, and timestamp for history
- `CancelableEvent`: Wrapper for events that can be canceled by handlers
- Separate timer Maps for debounce/throttle management

### Testing Strategy
- 25 test files in `tests/` directory, each focused on a specific feature
- Tests use Vitest with global test functions
- Common patterns: mock callbacks with `vi.fn()`, async testing with timers
- Coverage focus on edge cases and feature interactions

### WebSocket Adapter (Optional Extension)

The WebSocket adapter provides common patterns for real-time communication built on top of EvEm. It's implemented as a separate, optional module that doesn't modify the core.

**Location**: `src/websocket/` directory

**Components**:

1. **ConnectionManager** (`src/websocket/ConnectionManager.ts`)
   - Manages connection state machine: `disconnected → connecting → connected → reconnecting → disconnecting`
   - Emits state change events to `ws.connection.state` with `{ from, to, timestamp }`
   - Provides helper methods: `isConnected()`, `isConnecting()`, `isDisconnected()`
   - All state transitions are async to properly await EvEm's async publish

2. **MessageQueue** (`src/websocket/MessageQueue.ts`)
   - Queues messages while disconnected for offline support
   - Uses **middleware pattern** for clean interception of `ws.send*` events
   - FIFO queue with configurable size limits and overflow handling
   - Auto-flush on reconnection (configurable via `autoFlush` option)
   - Publishes queued messages to `ws.send.queued` during flush
   - Emits `ws.queue.overflow` when queue is full and messages are dropped

3. **RequestResponseManager** (`src/websocket/RequestResponseManager.ts`)
   - Implements RPC-style request-response pattern with correlation IDs
   - Uses UUID for request ID generation (or accepts custom IDs)
   - Configurable timeout (default: 5000ms) with `RequestTimeoutError`
   - Tracks pending requests with promises and timeout timers
   - Listens for `ws.response` (success) and `ws.response.error` (failure)
   - Automatically cleans up timeouts and pending requests

**Event Naming Convention**:
- `ws.connection.state` - Connection state changes
- `ws.send` - Outgoing messages (exact match)
- `ws.send.*` - Outgoing messages (wildcard pattern)
- `ws.send.request` - Outgoing RPC requests
- `ws.send.queued` - Messages flushed from queue
- `ws.response` - Incoming successful responses
- `ws.response.error` - Incoming error responses
- `ws.queue.overflow` - Queue overflow notifications

**Key Implementation Patterns**:

1. **Middleware over Subscriptions**: MessageQueue uses middleware for cleaner lifecycle management
   - Registers TWO middleware handlers: one for exact `ws.send`, one for wildcard `ws.send.*`
   - Required because wildcards don't match exact event names in EvEm
   - Stores handler function reference for proper cleanup with `removeMiddleware()`

2. **Synchronous Queueing with Side Effects**: Middleware handler queues synchronously while returning data unchanged
   - Uses `isEnqueuing` flag to prevent re-entrancy
   - Only queues when enabled, not connected, and event doesn't include 'queued'

3. **Async State Transitions**: All ConnectionManager transitions are async and await publish

4. **Composition over Inheritance**: All components take EvEm instance, no extension of core classes

5. **Zero Core Modifications**: WebSocket adapter is completely separate from EvEm core

**Testing**:
- 3 test files with 78 total tests (all passing)
- `tests/websocket/connection-manager.test.ts` - 27 tests
- `tests/websocket/message-queue.test.ts` - 33 tests
- `tests/websocket/request-response.test.ts` - 18 tests
- MockWebSocket utility in `tests/websocket/mocks/` for testing
- Tests cover state machines, edge cases, EvEm feature integration, lifecycle management

**Type Definitions**:
- `src/websocket/types.ts` contains all TypeScript interfaces and types
- `IWebSocket` interface for universal WebSocket compatibility (browser + Node.js)
- Connection state types, message types, error types

## Code Style Guidelines
- **Imports**: Use named imports; sort imports alphabetically
- **Types**: Strong typing with TS; use interfaces for public APIs and types for internal structures
- **Naming**: camelCase for variables/methods; PascalCase for classes/interfaces; UPPERCASE for constants
- **Error Handling**: Use specific error messages; handle async errors with try/catch; use Promise rejection for async failures
- **Documentation**: JSDoc comments for public APIs
- **Testing**: TDD approach - write tests first to validate simple designs

## Development Approach
- Minimize external dependencies (only uuid for ID generation)
- Focus on performance with Map-based lookups and efficient iteration
- Maintain backward compatibility when adding features
- Each feature should be independently testable and composable