import { EvEm } from "~/eventEmitter";
import { INLINE_EVEM_PAGES, WILDCARD_CASES, loadInlineEvEm } from "./demoPages";
import { describe, expect, it } from "vitest";

/**
 * Regression tests: the demo pages' inline EvEm copies must match wildcard patterns like the real
 * library. The copies required equal segment counts, so a trailing wildcard such as 'api.*' never
 * matched 'api.users.get' and the pattern-based middleware demo did nothing.
 */

const wildcardPages = Object.entries(INLINE_EVEM_PAGES)
  .filter(([, features]) => features.wildcards)
  .map(([file]) => file);

/** How many times a subscription to `pattern` is called when `event` is published once */
async function countDeliveries(evem: any, event: string, pattern: string): Promise<number> {
  let calls = 0;
  evem.subscribe(pattern, () => { calls++; });
  await evem.publish(event, {});
  return calls;
}

describe("demo pages: inline EvEm wildcard matching", () => {
  it("the cases match the real library's wildcard rules", async () => {
    for (const [event, pattern, matches] of WILDCARD_CASES) {
      expect({ event, pattern, calls: await countDeliveries(new EvEm(), event, pattern) })
        .toEqual({ event, pattern, calls: matches ? 1 : 0 });
    }
  });

  describe.each(wildcardPages)("%s", (file) => {
    it.each(WILDCARD_CASES)("publishing %s to a '%s' subscription matches: %s", async (event, pattern, matches) => {
      const { EvEm: InlineEvEm } = loadInlineEvEm(file);
      expect(await countDeliveries(new InlineEvEm(), event, pattern)).toBe(matches ? 1 : 0);
    });
  });

  describe("middleware-transforms.html pattern middleware", () => {
    it("runs 'api.*' middleware for api.users.get and api.posts.create, but not other events", async () => {
      const { EvEm: InlineEvEm } = loadInlineEvEm("middleware-transforms.html");
      const evem = new InlineEvEm();
      const intercepted: string[] = [];
      const handled: string[] = [];

      // Same call shape as the page's setupPatternMiddleware()
      evem.use("api.*", (event: string) => { intercepted.push(event); });
      evem.subscribe("api.*", (data: { name: string }) => { handled.push(data.name); });

      await evem.publish("api.users.get", { name: "api.users.get" });
      await evem.publish("api.posts.create", { name: "api.posts.create" });
      await evem.publish("system.update", { name: "system.update" });

      expect(intercepted).toEqual(["api.users.get", "api.posts.create"]);
      expect(handled).toEqual(["api.users.get", "api.posts.create"]);
    });

    it("matches the real library, where { pattern: 'api.*' } middleware runs for api.users.get", async () => {
      const evem = new EvEm();
      const intercepted: string[] = [];
      evem.use({ pattern: "api.*", handler: (event, data) => { intercepted.push(event); return data; } });

      await evem.publish("api.users.get", {});
      await evem.publish("system.update", {});

      expect(intercepted).toEqual(["api.users.get"]);
    });
  });
});
