import { EvEm } from "~/eventEmitter";
import { describe, test, expect, beforeEach } from "vitest";

describe("SimpleEventEmitter Load Test", () => {
  let emitter: EvEm;

  beforeEach(() => {
    emitter = new EvEm();
  });

  test("should handle timeouts for asynchronous event callbacks", async () => {
    const testEvent = "test.asyncEvent";
    let callbackCompleted = false;

    emitter.subscribe(testEvent, async () => {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Deliberately long timeout
      callbackCompleted = true;
    });

    const publishPromise = emitter.publish(testEvent, {}, 1000); // Setting a shorter timeout
    await publishPromise;

    expect(callbackCompleted).toBe(false);
  });

  test("should handle a high volume of subscriptions, publications, and unsubscriptions efficiently", async () => {
    const emitter = new EvEm();
    const numSubscriptions = 100000; // Large number of subscriptions for the test
    let subscriptionIds: string[] = [];

    // Subscription
    const startSubscribe = performance.now();
    for (let i = 0; i < numSubscriptions; i++) {
      const id = emitter.subscribe("test.event", () => {});
      subscriptionIds.push(id);
    }
    const endSubscribe = performance.now();

    // Publication
    const startPublish = performance.now();
    await emitter.publish("test.event");
    const endPublish = performance.now();

    // Unsubscription
    const startUnsubscribe = performance.now();
    for (const id of subscriptionIds) {
      emitter.unsubscribeById(id);
    }
    const endUnsubscribe = performance.now();

    // Log the times
    console.log(
      `Time to subscribe ${numSubscriptions} events: ${
        endSubscribe - startSubscribe
      } ms`
    );
    console.log(
      `Time to publish to ${numSubscriptions} events: ${
        endPublish - startPublish
      } ms`
    );
    console.log(
      `Time to unsubscribe ${numSubscriptions} events: ${
        endUnsubscribe - startUnsubscribe
      } ms`
    );

    // Assertions (example: ensuring the operations don't take too long)
    expect(endSubscribe - startSubscribe).toBeLessThan(1000); // Adjust the threshold as needed
    expect(endPublish - startPublish).toBeLessThan(1000);
    expect(endUnsubscribe - startUnsubscribe).toBeLessThan(1000);
  });
});
