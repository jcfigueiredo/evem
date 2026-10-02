import { EvEm } from "~/eventEmitter";
import { INLINE_EVEM_PAGES, loadInlineEvEm } from "./demoPages";
import { describe, expect, it } from "vitest";

/**
 * Regression tests: transforms in the demo pages' inline EvEm copies must follow the real library.
 * Subscribers run in priority order and each callback receives the current data; after a callback
 * runs, its transform (if any) is applied and the result is what the NEXT subscriber receives.
 * The middleware demo's copy instead applied each subscriber's transform to its own input.
 */

const transformPages = Object.entries(INLINE_EVEM_PAGES)
  .filter(([, features]) => features.transforms)
  .map(([file]) => file);

type Emitter = { subscribe: (...args: any[]) => unknown; publish: (...args: any[]) => Promise<unknown> };

/** The transform chain from the middleware demo: trim, then uppercase, then add a prefix */
async function runTransformChain(evem: Emitter): Promise<string[]> {
  const received: string[] = [];
  const subscribeStep = (transform: (value: string) => string) => {
    evem.subscribe("data.process", (data: { value: string }) => { received.push(data.value); }, {
      transform: (data: { value: string }) => ({ ...data, value: transform(data.value) }),
    });
  };
  subscribeStep(value => value.trim());
  subscribeStep(value => value.toUpperCase());
  subscribeStep(value => `PROCESSED: ${value}`);
  // A last subscriber without a transform sees the result of the whole chain
  evem.subscribe("data.process", (data: { value: string }) => { received.push(data.value); });

  await evem.publish("data.process", { value: "  hello world  " });
  return received;
}

/** A high-priority subscriber's transform feeds a normal-priority subscriber registered before it */
async function runPriorityTransform(evem: Emitter): Promise<string[]> {
  const received: string[] = [];
  evem.subscribe("user.input", (data: { text: string }) => { received.push(`normal: ${data.text}`); });
  evem.subscribe("user.input", (data: { text: string }) => { received.push(`high: ${data.text}`); }, {
    priority: "high",
    transform: (data: { text: string }) => ({ ...data, text: data.text.toUpperCase() }),
  });

  await evem.publish("user.input", { text: "hello world" });
  return received;
}

const EXPECTED_CHAIN = ["  hello world  ", "hello world", "HELLO WORLD", "PROCESSED: HELLO WORLD"];
const EXPECTED_PRIORITY_TRANSFORM = ["high: hello world", "normal: HELLO WORLD"];

describe("demo pages: inline EvEm transforms", () => {
  it("the expected results match the real library", async () => {
    expect(await runTransformChain(new EvEm())).toEqual(EXPECTED_CHAIN);
    expect(await runPriorityTransform(new EvEm())).toEqual(EXPECTED_PRIORITY_TRANSFORM);
  });

  describe.each(transformPages)("%s", (file) => {
    it("passes each transform's result to the next subscriber (Step 1 raw, Step 2 trimmed, Step 3 uppercased)", async () => {
      const { EvEm: InlineEvEm } = loadInlineEvEm(file);
      expect(await runTransformChain(new InlineEvEm())).toEqual(EXPECTED_CHAIN);
    });

    it("gives a subscriber its input untransformed; its transform only affects later subscribers", async () => {
      const { EvEm: InlineEvEm } = loadInlineEvEm(file);
      expect(await runPriorityTransform(new InlineEvEm())).toEqual(EXPECTED_PRIORITY_TRANSFORM);
    });
  });
});
