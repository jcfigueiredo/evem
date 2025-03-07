import { EvEm } from "~/eventEmitter";
import { describe, test, expect, vi, beforeEach } from "vitest";

describe("EvEm - Subscription Tests", () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test("should subscribe to an event with a synchronous callback and receive parameters", () => {
    const callback = vi.fn();
    emitter.subscribe("test.event", callback);

    const eventData = { message: "Hello, World!" };
    emitter.publish("test.event", eventData);

    expect(callback).toHaveBeenCalledWith(eventData);
  });

  test("subscribe method should return a valid UUID", () => {
    const subscriptionId = emitter.subscribe("test.event", () => {});

    expect(subscriptionId).toBeDefined();
    expect(subscriptionId).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });

  test("should throw error when subscribing with an empty event name", () => {
    const callback = vi.fn();
    expect(() => emitter.subscribe("", callback)).toThrow("Event name cannot be empty.");
  });

  test("should handle exceptions thrown in event callbacks", async () => {
    const erroringCallback = vi.fn(() => {
      throw new Error("Error in callback");
    });

    emitter.subscribe("error.event", erroringCallback);

    // With our new implementation, errors in callbacks are caught and logged rather than propagated
    const result = await emitter.publish("error.event");
    expect(result).toBe(true); // Event wasn't canceled
    expect(erroringCallback).toHaveBeenCalled();
  });

  test("should subscribe to an event with an asynchronous callback", async () => {
    const callback = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async operation
    });
    emitter.subscribe("async.event", callback);

    await emitter.publish("async.event");
    expect(callback).toHaveBeenCalled();
  });

  test("should subscribe to multiple events with different callbacks and receive parameters", () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    emitter.subscribe("event1", callback1);
    emitter.subscribe("event2", callback2);

    const eventData1 = { data: "Data1" };
    const eventData2 = { data: "Data2" };

    emitter.publish("event1", eventData1);
    emitter.publish("event2", eventData2);

    expect(callback1).toHaveBeenCalledWith(eventData1);
    expect(callback2).toHaveBeenCalledWith(eventData2);
  });

  test("should subscribe to the same event multiple times with different callbacks and receive parameters", () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    emitter.subscribe("shared.event", callback1);
    emitter.subscribe("shared.event", callback2);

    const eventData = { data: "Shared Data" };

    emitter.publish("shared.event", eventData);

    expect(callback1).toHaveBeenCalledWith(eventData);
    expect(callback2).toHaveBeenCalledWith(eventData);
  });

  test("should handle exceptions thrown in event callbacks", async () => {
    const erroringCallback = vi.fn(() => {
      throw new Error("Error in callback");
    });

    emitter.subscribe("error.event", erroringCallback);

    // With our new implementation, errors in callbacks are caught and logged rather than propagated
    const result = await emitter.publish("error.event");
    expect(result).toBe(true); // Event wasn't canceled
    expect(erroringCallback).toHaveBeenCalled();
  });

  test("should handle typed event data with type safety", async () => {
    interface UserEvent {
      userId: number;
      action: string;
    }

    const callback = vi.fn((data: UserEvent) => {
      // TypeScript should recognize these properties
      expect(data.userId).toBe(123);
      expect(data.action).toBe("login");
    });

    emitter.subscribe<UserEvent>("user.event", callback);

    const eventData: UserEvent = {
      userId: 123,
      action: "login"
    };

    await emitter.publish("user.event", eventData);
    expect(callback).toHaveBeenCalledWith(eventData);
  });
});
