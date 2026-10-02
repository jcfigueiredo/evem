import { EvEm } from "~/eventEmitter";
import { describe, test, expect, beforeEach, afterEach, vi, SpyInstance } from "vitest";

describe("EvEm - Unsubscription Tests", () => {
  let evem: EvEm;

  beforeEach(() => {
    evem = new EvEm();
  });

  test("should unsubscribe a previously subscribed callback and stop receiving events", () => {
    const callback = vi.fn();
    evem.subscribe("test.event", callback);

    evem.unsubscribe("test.event", callback);

    const eventData = { message: "Test Data" };
    evem.publish("test.event", eventData);

    expect(callback).not.toHaveBeenCalled();
  });

  test("should throw error when unsubscribing with an empty event name", () => {
    const callback = vi.fn();
    expect(() => evem.unsubscribe("", callback)).toThrow("You can't unsubscribe to an event with an empty name.");
  });

  test("should throw error when unsubscribing with an empty id", () => {
    const callback = vi.fn();
    expect(() => evem.unsubscribeById("")).toThrow("You can't unsubscribe to an event with an empty id.");
  });

  test("should handle unsubscribing a callback that was never subscribed", () => {
    const callback = vi.fn();

    evem.unsubscribe("test.event", callback);

    const eventData = { message: "Test Data" };
    evem.publish("test.event", eventData);

    expect(callback).not.toHaveBeenCalled();
  });

  test("should unsubscribe only the specified callback among multiple", () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    evem.subscribe("multi.event", callback1);
    evem.subscribe("multi.event", callback2);

    evem.unsubscribe("multi.event", callback1);

    const eventData = { data: "Event Data" };
    evem.publish("multi.event", eventData);

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledWith(eventData);
  });

  test("should unsubscribe from an event using a UUID", () => {
    const emitter = new EvEm();
    const callback = vi.fn();

    const subscriptionId1 = emitter.subscribe("event1", callback);
    emitter.subscribe("event2", callback);

    emitter.publish("event1");
    emitter.publish("event2");
    emitter.unsubscribeById(subscriptionId1); // Unsubscribe from all events with this ID
    emitter.publish("event1");
    emitter.publish("event2");

    expect(callback).toHaveBeenCalledTimes(3); // Called once for each event before unsubscription
  });

  test("should unsubscribe from a specific event by UUID", () => {
    const emitter = new EvEm();
    const callback = vi.fn();

    const subscriptionId = emitter.subscribe("event1", callback);
    emitter.publish("event1");
    emitter.unsubscribeById(subscriptionId);
    emitter.publish("event1");

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("unsubscribing with an invalid UUID without specifying the event name should not affect other subscriptions", () => {
    const emitter = new EvEm();
    const callback = vi.fn();

    emitter.subscribe("event1", callback);
    emitter.unsubscribeById("invalid-uuid"); // Invalid UUID
    emitter.publish("event1");

    expect(callback).toHaveBeenCalledTimes(1);
  });

  describe("EvEm - Unsubscription Tests for nonexistent events ", () => {
    let evem: EvEm;
    let consoleWarnSpy: SpyInstance;

    beforeEach(() => {
      evem = new EvEm();
      consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    test("should warn when trying to unsubscribe from a non-existent event", () => {
      const nonExistentEvent = "non.existent.event";
      const callback = () => {};

      evem.unsubscribe(nonExistentEvent, callback);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `Warning: Attempting to unsubscribe from a non-existent event: ${nonExistentEvent}`
      );
    });
  });
});

describe("EvEm - unsubscribe(event, callback) with subscription options", () => {
  let evem: EvEm;

  beforeEach(() => {
    evem = new EvEm();
  });

  const optionCases: Array<[string, Record<string, unknown>]> = [
    ["filter", { filter: () => true }],
    ["once", { once: true }],
    ["schema", { schema: () => true }],
    ["throttleTime", { throttleTime: 50 }],
    ["debounceTime", { debounceTime: 10 }],
    ["priority", { priority: "high" }]
  ];

  test.each(optionCases)("should remove a subscription created with %s", async (_name, options) => {
    const callback = vi.fn();
    evem.subscribe("order.placed", callback, options);

    evem.unsubscribe("order.placed", callback);
    await evem.publish("order.placed", { id: 1 });
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(callback).not.toHaveBeenCalled();
    expect(evem.info("order.placed")).toEqual([]);
  });

  test("should cancel a pending debounced call", async () => {
    const callback = vi.fn();
    evem.subscribe("search.input", callback, { debounceTime: 20 });

    await evem.publish("search.input", "abc");
    evem.unsubscribe("search.input", callback);
    await new Promise(resolve => setTimeout(resolve, 40));

    expect(callback).not.toHaveBeenCalled();
  });
});

describe("EvEm - unsubscribing releases event entries", () => {
  test("should drop the entry for an event once its last subscription is removed", () => {
    const evem = new EvEm();
    // Inspect internal state: there's no public API that exposes empty entries
    const events = (evem as unknown as { events: Map<string, unknown> }).events;
    const callback = vi.fn();

    for (let i = 0; i < 100; i++) {
      const id = evem.subscribe(`request.${i}`, callback);
      evem.unsubscribeById(id);
    }
    evem.subscribe("order.placed", callback);
    evem.unsubscribe("order.placed", callback);

    expect(events.size).toBe(0);
  });
});
