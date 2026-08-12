import type { ProjectPayload } from "@/application/project/project-payload";

/**
 * The curated template gallery.
 *
 * Every entry is a complete {@link ProjectPayload}: the exact shape the studio's
 * one hydration path accepts, so clicking a card is the same operation as
 * opening a saved file. No account, no server, no trial.
 *
 * The six are chosen as a showcase, not a sampler. Each demonstrates something
 * a crossfade-based tool cannot do: token-level morphing across a refactor, a
 * diff read the way a reviewer reads it, a typed-out intro, a dimmed
 * walkthrough, a portrait cut for social, and a test suite growing an
 * expectation at a time.
 */
export interface TemplateDefinition {
	/** Stable slug: used as a React key and in the gallery's own tests. */
	id: string;
	name: string;
	/** One line, shown under the name on the card. */
	description: string;
	/** Shiki language id, mirrored from the project so cards can label without parsing. */
	language: string;
	/** Lowercase facets shown as chips on the card. */
	tags: readonly string[];
	project: ProjectPayload;
}

/* ──────────── 1. Extract a custom hook ──────────── */

/** The import line is shared by all three frames, so it anchors the morph. */
const HOOK_IMPORT = `import { useEffect, useState } from "react"
`;

const HOOK_INLINE = `${HOOK_IMPORT}
export function Profile({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    fetch(\`/api/users/\${id}\`)
      .then((res) => res.json())
      .then(setUser)
  }, [id])

  return <h1>{user?.name ?? "Loading…"}</h1>
}`;

const HOOK_EXTRACTED = `${HOOK_IMPORT}
function useUser(id: string) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    fetch(\`/api/users/\${id}\`)
      .then((res) => res.json())
      .then(setUser)
  }, [id])

  return user
}

export function Profile({ id }: { id: string }) {
  const user = useUser(id)

  return <h1>{user?.name ?? "Loading…"}</h1>
}`;

const HOOK_CANCELLED = `${HOOK_IMPORT}
function useUser(id: string) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch(\`/api/users/\${id}\`, { signal: controller.signal })
      .then((res) => res.json())
      .then(setUser)

    return () => controller.abort()
  }, [id])

  return user
}

export function Profile({ id }: { id: string }) {
  const user = useUser(id)

  return <h1>{user?.name ?? "Loading…"}</h1>
}`;

/* ──────────── 2. Fix an N+1, in review ──────────── */

const DIFF_HEADER = `--- a/src/api/orders.ts
+++ b/src/api/orders.ts
@@ -8,10 +8,14 @@
 export async function listOrders(userId: string) {
   const orders = await db.order.findMany({ where: { userId } })
 `;

const DIFF_BEFORE = `${DIFF_HEADER}
   return orders.map((order) => ({
     ...order,
     items: db.item.findMany({ where: { orderId: order.id } }),
   }))
 }`;

const DIFF_REMOVED = `${DIFF_HEADER}
-  return orders.map((order) => ({
-    ...order,
-    items: db.item.findMany({ where: { orderId: order.id } }),
-  }))
 }`;

const DIFF_FIXED = `${DIFF_HEADER}
-  return orders.map((order) => ({
-    ...order,
-    items: db.item.findMany({ where: { orderId: order.id } }),
-  }))
+  const items = await db.item.findMany({
+    where: { orderId: { in: orders.map((o) => o.id) } },
+  })
+
+  return orders.map((order) => ({
+    ...order,
+    items: items.filter((item) => item.orderId === order.id),
+  }))
 }`;

/* ──────────── 3. Type it out: debounce ──────────── */

const DEBOUNCE_STUB = "export function debounce(fn: () => void, ms = 300) {}";

const DEBOUNCE_BODY = `export function debounce(fn: () => void, ms = 300) {
  let timer: ReturnType<typeof setTimeout>

  return () => {
    clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }
}`;

const DEBOUNCE_GENERIC = `export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  ms = 300,
) {
  let timer: ReturnType<typeof setTimeout>

  return (...args: T) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}`;

/* ──────────── 4. Walk through a rate limiter ──────────── */

/** One file, four spotlights: the walkthrough moves the eye, not the code. */
const RATE_LIMITER = `export class RateLimiter {
  private tokens: number
  private lastRefill = Date.now()

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
  ) {
    this.tokens = capacity
  }

  take(cost = 1): boolean {
    const elapsed = (Date.now() - this.lastRefill) / 1000

    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsed * this.perSecond,
    )
    this.lastRefill = Date.now()

    if (this.tokens < cost) {
      return false
    }

    this.tokens -= cost
    return true
  }
}`;

/* ──────────── 5. Batch the query (portrait) ──────────── */

const BATCH_IDS = "const ids = orders.map((o) => o.userId)";

const BATCH_UNIQUE = `${BATCH_IDS}
const unique = [...new Set(ids)]`;

const BATCH_QUERY = `${BATCH_UNIQUE}

const users = await db.user.findMany({
  where: { id: { in: unique } },
})`;

/* ──────────── 6. Grow a test suite ──────────── */

const SUITE_HEAD = `import { describe, expect, it } from "vitest"

import { slugify } from "./slugify"
`;

const SUITE_EMPTY = `${SUITE_HEAD}
describe("slugify", () => {})`;

const SUITE_ONE = `${SUITE_HEAD}
describe("slugify", () => {
  it("lowercases and joins words with a hyphen", () => {
    expect(slugify("Hello World")).toBe("hello-world")
  })
})`;

const SUITE_TWO = `${SUITE_HEAD}
describe("slugify", () => {
  it("lowercases and joins words with a hyphen", () => {
    expect(slugify("Hello World")).toBe("hello-world")
  })

  it("drops punctuation", () => {
    expect(slugify("Ship it, now!")).toBe("ship-it-now")
  })
})`;

const SUITE_THREE = `${SUITE_HEAD}
describe("slugify", () => {
  it("lowercases and joins words with a hyphen", () => {
    expect(slugify("Hello World")).toBe("hello-world")
  })

  it("drops punctuation", () => {
    expect(slugify("Ship it, now!")).toBe("ship-it-now")
  })

  it("collapses runs of separators", () => {
    expect(slugify("a  --  b")).toBe("a-b")
  })
})`;

export const TEMPLATE_CATALOG: readonly TemplateDefinition[] = [
	{
		id: "react-hook",
		name: "Extract a custom hook",
		description: "Lift state and effects out of a component, one honest move at a time.",
		language: "tsx",
		tags: ["react", "refactor", "hooks"],
		project: {
			title: "Profile.tsx",
			code: HOOK_INLINE,
			language: "tsx",
			themeName: "one-dark",
			background: "mesh:aurora",
			windowChrome: "macos",
			showLineNumbers: true,
			framePadding: 28,
			transitionMs: 650,
			steps: [
				{ code: HOOK_INLINE, duration: 2000, caption: "Fetching inline, inside the component" },
				{ code: HOOK_EXTRACTED, duration: 2200, caption: "The effect moves into useUser" },
				{ code: HOOK_CANCELLED, duration: 2400, caption: "And unmounting cancels the request" },
			],
		},
	},
	{
		id: "n-plus-one",
		name: "Fix an N+1, in review",
		description: "A real query fix, read the way a reviewer reads it: minus, then plus.",
		language: "diff",
		tags: ["diff", "code review", "backend"],
		project: {
			title: "orders.ts",
			code: DIFF_BEFORE,
			language: "diff",
			themeName: "midnight",
			background: "mesh:ember",
			windowChrome: "browser",
			showLineNumbers: false,
			framePadding: 28,
			transitionMs: 650,
			steps: [
				{ code: DIFF_BEFORE, duration: 2200, caption: "One item query per order: the N+1" },
				{ code: DIFF_REMOVED, duration: 1800, caption: "The loop comes out" },
				{ code: DIFF_FIXED, duration: 2600, caption: "One batched query, then match in memory" },
			],
		},
	},
	{
		id: "typewriter-debounce",
		name: "Type it out: debounce",
		description: "The first frame types itself, then grows into a generic. Ours alone.",
		language: "typescript",
		tags: ["typewriter", "typescript", "utility"],
		project: {
			title: "debounce.ts",
			code: DEBOUNCE_STUB,
			language: "typescript",
			themeName: "dracula",
			background: "mesh:nebula",
			windowChrome: "macos",
			showLineNumbers: true,
			framePadding: 32,
			typewriter: true,
			transitionMs: 650,
			steps: [
				{ code: DEBOUNCE_STUB, duration: 1600, caption: "Start from the signature" },
				{ code: DEBOUNCE_BODY, duration: 2200, caption: "One timer, reset on every call" },
				{ code: DEBOUNCE_GENERIC, duration: 2600, caption: "Now it forwards any arguments" },
			],
		},
	},
	{
		id: "rate-limiter-walkthrough",
		name: "Walk through a rate limiter",
		description: "Dim the file and move the reader region by region, with a push-in.",
		language: "typescript",
		tags: ["walkthrough", "focus", "teaching"],
		project: {
			title: "rate-limiter.ts",
			code: RATE_LIMITER,
			language: "typescript",
			themeName: "nord",
			background: "mesh:ocean",
			windowChrome: "macos",
			showLineNumbers: true,
			framePadding: 28,
			focusZoom: true,
			transitionMs: 1000,
			steps: [
				{
					code: RATE_LIMITER,
					duration: 2400,
					focus: "2-3",
					caption: "The whole state: tokens left, and when we last topped up",
				},
				{
					code: RATE_LIMITER,
					duration: 2400,
					focus: "5-10",
					caption: "Capacity and refill rate are fixed at construction",
				},
				{
					code: RATE_LIMITER,
					duration: 2600,
					focus: "13-19",
					caption: "Refill from elapsed time: no timer, no background job",
				},
				{
					code: RATE_LIMITER,
					duration: 2400,
					focus: "21-27",
					caption: "Then spend a token, or turn the caller away",
				},
			],
		},
	},
	{
		id: "batch-the-query",
		name: "Batch the query",
		description: "Portrait, with segment progress: cut for Reels, Shorts and TikTok.",
		language: "typescript",
		tags: ["9:16", "reels", "database"],
		project: {
			title: "batch.ts",
			code: BATCH_IDS,
			language: "typescript",
			themeName: "catppuccin",
			background: "mesh:forest",
			windowChrome: "none",
			showLineNumbers: false,
			framePadding: 36,
			cardMargin: 48,
			width: 1080,
			height: 1920,
			progressStyle: "reels",
			transitionMs: 400,
			steps: [
				{ code: BATCH_IDS, duration: 1400, caption: "Collect the ids" },
				{ code: BATCH_UNIQUE, duration: 1400, caption: "Drop the duplicates" },
				{ code: BATCH_QUERY, duration: 2000, caption: "One query for all of them" },
			],
		},
	},
	{
		id: "grow-a-test-suite",
		name: "Grow a test suite",
		description: "Add one expectation at a time and watch the file make room for it.",
		language: "typescript",
		tags: ["testing", "vitest", "tdd"],
		project: {
			title: "slugify.test.ts",
			code: SUITE_EMPTY,
			language: "typescript",
			themeName: "frost",
			background: "mesh:ocean",
			windowChrome: "macos",
			showLineNumbers: true,
			framePadding: 28,
			transitionMs: 650,
			steps: [
				{ code: SUITE_EMPTY, duration: 1600, caption: "An empty suite, and the thing under test" },
				{ code: SUITE_ONE, duration: 2000, caption: "The happy path first" },
				{ code: SUITE_TWO, duration: 2000, caption: "Then what people actually type" },
				{ code: SUITE_THREE, duration: 2400, caption: "And the edge that bites in production" },
			],
		},
	},
];
