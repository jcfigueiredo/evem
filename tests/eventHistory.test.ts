import { EvEm } from "~/eventEmitter";
import { describe, test, expect, vi, beforeEach } from "vitest";

describe("EvEm - Event History Tests", () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test("should store history of events when enabled", async () => {
    const callback = vi.fn();
    emitter.enableHistory();

    await emitter.publish("test.event", { message: "Hello, World!" });
    
    // Get the event history
    const history = emitter.getEventHistory();
    
    expect(history).toHaveLength(1);
    expect(history[0].event).toBe("test.event");
    expect(history[0].data).toEqual({ message: "Hello, World!" });
  });

  test("should limit event history size to the specified limit", async () => {
    const historyLimit = 3;
    emitter.enableHistory(historyLimit);

    // Publish 5 events
    await emitter.publish("test.event", { id: 1 });
    await emitter.publish("test.event", { id: 2 });
    await emitter.publish("test.event", { id: 3 });
    await emitter.publish("test.event", { id: 4 });
    await emitter.publish("test.event", { id: 5 });
    
    const history = emitter.getEventHistory();
    
    // Should only keep the most recent 3 events
    expect(history).toHaveLength(historyLimit);
    expect(history[0].data).toEqual({ id: 3 });
    expect(history[1].data).toEqual({ id: 4 });
    expect(history[2].data).toEqual({ id: 5 });
  });

  test("should not record events if history is disabled", async () => {
    // History is disabled by default
    await emitter.publish("test.event", { message: "Hello, World!" });
    
    const history = emitter.getEventHistory();
    expect(history).toHaveLength(0);
  });

  test("should be able to disable history after enabling it", async () => {
    emitter.enableHistory();
    
    await emitter.publish("test.event", { id: 1 });
    expect(emitter.getEventHistory()).toHaveLength(1);
    
    emitter.disableHistory();
    
    await emitter.publish("test.event", { id: 2 });
    expect(emitter.getEventHistory()).toHaveLength(1); // Still has first event, didn't record second
  });

  test("should replay last event to new subscribers with immediate option", async () => {
    emitter.enableHistory();
    
    // Publish an event
    await emitter.publish("test.event", { message: "Hello, World!" });
    
    // Subscribe after the event was published
    const callback = vi.fn();
    emitter.subscribe("test.event", callback, { 
      replayLastEvent: true 
    });
    
    // The callback should be called immediately with the last event data
    expect(callback).toHaveBeenCalledWith({ message: "Hello, World!" });
  });

  test("should replay history to new subscribers with replayHistory option", async () => {
    emitter.enableHistory();
    
    // Publish multiple events to the same channel
    await emitter.publish("test.event", { id: 1 });
    await emitter.publish("test.event", { id: 2 });
    await emitter.publish("test.event", { id: 3 });
    
    // Subscribe after the events were published
    const callback = vi.fn();
    emitter.subscribe("test.event", callback, { 
      replayHistory: true 
    });
    
    // The callback should be called for each historical event in order
    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenNthCalledWith(1, { id: 1 });
    expect(callback).toHaveBeenNthCalledWith(2, { id: 2 });
    expect(callback).toHaveBeenNthCalledWith(3, { id: 3 });
  });

  test("should not replay events if replay option is not enabled", async () => {
    emitter.enableHistory();
    
    // Publish an event
    await emitter.publish("test.event", { message: "Hello, World!" });
    
    // Subscribe after the event was published, without replay option
    const callback = vi.fn();
    emitter.subscribe("test.event", callback);
    
    // The callback should not be called immediately
    expect(callback).not.toHaveBeenCalled();
  });

  test("should respect event namespaces and wildcards when replaying events", async () => {
    emitter.enableHistory();
    
    // Publish events to different namespaces
    await emitter.publish("user.login", { userId: 1 });
    await emitter.publish("user.logout", { userId: 1 });
    await emitter.publish("system.startup", { version: "1.0.0" });
    
    // Subscribe with wildcard to replay only user events
    const userCallback = vi.fn();
    emitter.subscribe("user.*", userCallback, { 
      replayHistory: true 
    });
    
    // Should get both user.login and user.logout events
    expect(userCallback).toHaveBeenCalledTimes(2);
    expect(userCallback).toHaveBeenNthCalledWith(1, { userId: 1 }); // login event
    expect(userCallback).toHaveBeenNthCalledWith(2, { userId: 1 }); // logout event
    
    // Subscribe to specific event
    const loginCallback = vi.fn();
    emitter.subscribe("user.login", loginCallback, {
      replayHistory: true
    });
    
    // Should only get the login event
    expect(loginCallback).toHaveBeenCalledTimes(1);
    expect(loginCallback).toHaveBeenCalledWith({ userId: 1 });
  });

  test("should handle replayLastEvent and once options together", async () => {
    emitter.enableHistory();
    
    // Publish an event
    await emitter.publish("test.event", { id: 1 });
    
    // Subscribe with both replayLastEvent and once options
    const callback = vi.fn();
    const subId = emitter.subscribe("test.event", callback, { 
      replayLastEvent: true,
      once: true
    });
    
    // Callback should be called with the last event
    expect(callback).toHaveBeenCalledWith({ id: 1 });
    
    // The subscription should be removed after replaying
    await emitter.publish("test.event", { id: 2 });
    expect(callback).toHaveBeenCalledTimes(1); // Still only one call
    
    // Try to find the subscription ID in the emitter
    const info = emitter.info();
    const subscription = info.find(i => i.id === subId && !i.isMiddleware);
    expect(subscription).toBeUndefined(); // Subscription should be gone
  });

  test("should clear event history when clearEventHistory is called", async () => {
    emitter.enableHistory();
    
    await emitter.publish("test.event", { id: 1 });
    await emitter.publish("test.event", { id: 2 });
    
    // Verify history was recorded
    expect(emitter.getEventHistory()).toHaveLength(2);
    
    // Clear the history
    emitter.clearEventHistory();
    
    // Verify history was cleared
    expect(emitter.getEventHistory()).toHaveLength(0);
    
    // Verify new subscribers don't get any replayed events
    const callback = vi.fn();
    emitter.subscribe("test.event", callback, { replayHistory: true });
    expect(callback).not.toHaveBeenCalled();
  });
});