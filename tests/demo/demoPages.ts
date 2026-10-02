import { execFileSync } from "child_process";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

/**
 * Helpers for testing the demo pages in demo/examples without a browser.
 *
 * Each demo page ships its own simplified inline `class EvEm`. These helpers pull that class
 * out of the page's <script> and evaluate it in Node, and pull the "View Code" samples out of
 * the page's <pre><code> blocks, so tests can check both against the real library.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DEMO_DIR = join(REPO_ROOT, "demo", "examples");

/** Features a demo page's inline EvEm copy implements (tests only exercise what a copy supports) */
export interface InlineEvEmFeatures {
  /** Wildcard patterns ('user.*') in subscriptions */
  wildcards: boolean;
  /** 'high' | 'normal' | 'low' subscription priorities */
  priority: boolean;
  /** The `transform` subscription option */
  transforms: boolean;
}

/** Every demo page that contains an inline EvEm copy, with the features that copy implements */
export const INLINE_EVEM_PAGES: Record<string, InlineEvEmFeatures> = {
  "cancelable-errors.html": { wildcards: false, priority: false, transforms: false },
  "chat-demo.html": { wildcards: true, priority: false, transforms: false },
  "core-features.html": { wildcards: true, priority: true, transforms: false },
  "flow-control.html": { wildcards: false, priority: false, transforms: false },
  "history-replay.html": { wildcards: true, priority: false, transforms: false },
  "middleware-transforms.html": { wildcards: true, priority: true, transforms: true },
  "schema-validation.html": { wildcards: false, priority: false, transforms: false },
  "websocket-demo.html": { wildcards: true, priority: false, transforms: false },
};

/**
 * [event, pattern, matches] cases following the real library's wildcard rules (EvEm#isEventMatch):
 * '*' matches everything; a trailing '*' also matches deeper event names; otherwise segment
 * counts must be equal and each pattern segment must be equal or '*'.
 */
export const WILDCARD_CASES: ReadonlyArray<readonly [event: string, pattern: string, matches: boolean]> = [
  ["user.login", "user.login", true],
  ["a.b", "a.*", true],
  ["api.users.get", "api.*", true],
  ["api.users.get", "api.*.*", true],
  ["api.users.get.extra", "api.*.*", true],
  ["api.users.get", "api.*.get", true],
  ["api.users.get", "*.users.get", true],
  ["user.login", "*", true],
  ["x.y", "*.*", true],
  ["api", "api.*", false],
  ["a.b", "a.b.*", false],
  ["system.startup", "user.*", false],
  ["api.users.get", "api.*.post", false],
  ["a.b.c", "*.c", false],
  ["a.b.c", "a.b", false],
];

/** Constructor of a demo page's inline EvEm (its API differs per page, so it is loosely typed) */
export type InlineEvEmClass = new () => any;

export interface LoadedInlineEvEm {
  EvEm: InlineEvEmClass;
  /** Messages the inline class passed to the page's `log()` helper */
  logs: string[];
}

/** Page globals the inline EvEm copies touch, stubbed so the classes can run in Node */
const STUBBED_PAGE_GLOBALS = ["window", "log", "updateStats", "updateQueueUI", "updateUI"] as const;

/** All demo pages in demo/examples */
export function listDemoPages(): string[] {
  return readdirSync(DEMO_DIR).filter(file => file.endsWith(".html")).sort();
}

/**
 * Read a demo page's HTML.
 * Set DEMO_GIT_REF (e.g. `DEMO_GIT_REF=HEAD`) to read the pages as committed at that git ref instead
 * of the working tree, e.g. to confirm these tests catch the bugs in an older version of the demos.
 */
export function readDemoPage(file: string): string {
  const ref = process.env.DEMO_GIT_REF;
  if (ref) {
    return execFileSync("git", ["show", `${ref}:demo/examples/${file}`], { cwd: REPO_ROOT, encoding: "utf8" });
  }
  return readFileSync(join(DEMO_DIR, file), "utf8");
}

/** Contents of a page's inline <script> elements (scripts loaded with src are skipped) */
export function inlineScripts(html: string): string[] {
  const scripts: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(match[1] ?? "")) continue;
    scripts.push(match[2] ?? "");
  }
  return scripts;
}

/** Source of `class <name> { ... }` from a page's inline scripts, or null if the page has no such class */
export function extractClassSource(html: string, className: string): string | null {
  const declaration = new RegExp(`\\bclass\\s+${className}\\s*\\{`);
  for (const script of inlineScripts(html)) {
    const match = declaration.exec(script);
    if (!match) continue;
    const openBrace = match.index + match[0].length - 1;
    return script.slice(match.index, findMatchingBrace(script, openBrace) + 1);
  }
  return null;
}

/** Evaluate a demo page's inline `class EvEm` in Node, with the page globals it uses stubbed out */
export function loadInlineEvEm(file: string): LoadedInlineEvEm {
  const source = extractClassSource(readDemoPage(file), "EvEm");
  if (!source) {
    throw new Error(`No inline class EvEm found in ${file}`);
  }

  const logs: string[] = [];
  const noop = () => undefined;
  const pageGlobals: Record<(typeof STUBBED_PAGE_GLOBALS)[number], unknown> = {
    window: {},
    log: (message: string) => { logs.push(message); },
    updateStats: noop,
    updateQueueUI: noop,
    updateUI: noop,
  };

  const factory = new Function(...STUBBED_PAGE_GLOBALS, `${source}; return EvEm;`) as
    (...args: unknown[]) => InlineEvEmClass;
  const EvEm = factory(...STUBBED_PAGE_GLOBALS.map(name => pageGlobals[name]));
  return { EvEm, logs };
}

/** The "View Code" samples of a page: the text of each <pre><code> block, with HTML entities decoded */
export function extractCodeSamples(html: string): string[] {
  return [...html.matchAll(/<pre>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi)]
    .map(match => decodeHtmlEntities(match[1] ?? ""));
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Index of the `}` that closes the `{` at `openIndex`.
 * Skips braces inside strings, template literals (including nested `${...}`), comments and regex literals.
 */
export function findMatchingBrace(src: string, openIndex: number): number {
  let depth = 0;
  // Last non-whitespace character, used to tell a regex literal from a division operator
  let previous = "";
  let i = openIndex;

  while (i < src.length) {
    const ch = src[i]!;
    const next = src[i + 1];

    if (ch === "/" && next === "/") {
      const lineEnd = src.indexOf("\n", i);
      i = lineEnd === -1 ? src.length : lineEnd;
      continue;
    }
    if (ch === "/" && next === "*") {
      const commentEnd = src.indexOf("*/", i + 2);
      i = commentEnd === -1 ? src.length : commentEnd + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      i = skipString(src, i);
      previous = ch;
      continue;
    }
    if (ch === "`") {
      i = skipTemplateLiteral(src, i);
      previous = ch;
      continue;
    }
    if (ch === "/" && (previous === "" || "(,=:[!&|?{};+-*%<>~^}".includes(previous))) {
      i = skipRegexLiteral(src, i);
      previous = "/";
      continue;
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
    if (!/\s/.test(ch)) previous = ch;
    i++;
  }

  throw new Error(`Unbalanced braces: no match for the brace at index ${openIndex}`);
}

/** Index just past the string literal starting at `start` */
function skipString(src: string, start: number): number {
  const quote = src[start];
  let i = start + 1;
  while (i < src.length) {
    if (src[i] === "\\") {
      i += 2;
    } else if (src[i] === quote) {
      return i + 1;
    } else {
      i++;
    }
  }
  return i;
}

/** Index just past the template literal starting at `start` */
function skipTemplateLiteral(src: string, start: number): number {
  let i = start + 1;
  while (i < src.length) {
    if (src[i] === "\\") {
      i += 2;
    } else if (src[i] === "`") {
      return i + 1;
    } else if (src[i] === "$" && src[i + 1] === "{") {
      i = findMatchingBrace(src, i + 1) + 1;
    } else {
      i++;
    }
  }
  return i;
}

/** Index just past the regex literal starting at `start` (or just past the `/` if it isn't one) */
function skipRegexLiteral(src: string, start: number): number {
  let inCharacterClass = false;
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
    } else if (ch === "\n") {
      return start + 1;
    } else if (ch === "[") {
      inCharacterClass = true;
      i++;
    } else if (ch === "]") {
      inCharacterClass = false;
      i++;
    } else if (ch === "/" && !inCharacterClass) {
      i++;
      while (i < src.length && /[a-z]/i.test(src[i]!)) i++;
      return i;
    } else {
      i++;
    }
  }
  return start + 1;
}
