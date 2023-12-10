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
