import { EvEm } from "~/eventEmitter";
import { describe, test, expect, beforeEach, vi } from "vitest";

describe("EvEm - Wildcard Subscription Tests", () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test("should receive events for wildcard type subscription (*.type)", () => {
    const wildcardCallback = vi.fn();

    emitter.subscribe("*.type", wildcardCallback);

    const eventData = { data: "Event Data" };
    emitter.publish("event.type", eventData);

    expect(wildcardCallback).toHaveBeenCalledWith(eventData);
  });

  test("should receive events for wildcard source subscription (source.*)", () => {
    const wildcardCallback = vi.fn();

    emitter.subscribe("source.*", wildcardCallback);

    const eventData = { data: "Event Data" };
    emitter.publish("source.event", eventData);

    expect(wildcardCallback).toHaveBeenCalledWith(eventData);
  });

  test("should not receive events that do not match the wildcard pattern", () => {
    const wildcardCallback = vi.fn();

    emitter.subscribe("unmatched.*", wildcardCallback);
    emitter.publish("matched.event", { data: "Test" });

    expect(wildcardCallback).not.toHaveBeenCalled();
  });

  test("should handle multiple wildcard patterns and combinations", () => {
    const wildcardCallback1 = vi.fn();
    const wildcardCallback2 = vi.fn();

    emitter.subscribe("*.event", wildcardCallback1);
    emitter.subscribe("test.*", wildcardCallback2);

    const eventData1 = { type: "Event1" };
    const eventData2 = { type: "Event2" };

    emitter.publish("test.event", eventData1);
    emitter.publish("demo.event", eventData2);

    expect(wildcardCallback1).toHaveBeenCalledWith(eventData1);
    expect(wildcardCallback1).toHaveBeenCalledWith(eventData2);
    expect(wildcardCallback2).toHaveBeenCalledWith(eventData1);
    expect(wildcardCallback2).not.toHaveBeenCalledWith(eventData2);
  });
});
