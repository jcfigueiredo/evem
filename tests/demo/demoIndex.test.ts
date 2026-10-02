import { readFileSync } from "fs";
import { listDemoPages, readDemoPage } from "./demoPages";
import { describe, expect, it } from "vitest";

/** Every demo page is reachable from demo/index.html and links back to it */

const index = readFileSync(new URL("../../demo/index.html", import.meta.url), "utf8");
const linkedPages = [...index.matchAll(/<a href="examples\/([^"]+)" class="demo-card">/g)].map(match => match[1]);

describe("demo index", () => {
  it("has a card for every page in demo/examples, and no card for a missing page", () => {
    expect([...linkedPages].sort()).toEqual(listDemoPages());
  });

  it.each(listDemoPages())("%s links back to the index", (file) => {
    expect(readDemoPage(file)).toContain('<a href="../index.html" class="nav-link">← Back to demos</a>');
  });
});
