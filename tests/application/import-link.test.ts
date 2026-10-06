import {
	IMPORT_HASH_KEY,
	MAX_IMPORT_URL_PAYLOAD,
	importIntentFragment,
	studioImportLink,
} from "@/application/import/import-link";
import { encodeImportIntent, takeImportIntent } from "@/presentation/utils/import-intent";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The studio link a script is handed: `/app#import=…`, the link the landing
 * writes. The server cannot reach the browser's session storage, so what does
 * not fit in an address is left out, and these tests hold the server's link to
 * what the studio actually reads.
 */

const STUDIO = "https://typelapse.test";
const PR = "https://github.com/octocat/Hello-World/pull/1";
const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,4 @@
 export function greet(name: string) {
-  return "Hello " + name;
+  return \`Hello, \${name.trim()} 👋\`;
 }
`;

function land(link: string) {
	const url = new URL(link);
	window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
}

describe("studioImportLink", () => {
	beforeEach(() => {
		window.sessionStorage.clear();
		window.history.replaceState(null, "", "/app");
	});

	it("opens the studio on the source, as the landing's link does", () => {
		const link = studioImportLink(STUDIO, PR);

		expect(link.startsWith(`${STUDIO}/app${IMPORT_HASH_KEY}`)).toBe(true);
		expect(link.slice(`${STUDIO}/app`.length)).toBe(encodeImportIntent({ source: PR }));
		land(link);
		expect(takeImportIntent()).toEqual({ source: PR });
	});

	it("carries a diff that fits an address, which the studio reads back whole", () => {
		const link = studioImportLink(STUDIO, DIFF);

		expect(link).toContain("#import=");
		land(link);
		expect(takeImportIntent()).toEqual({ source: DIFF });
	});

	it("opens the studio empty for a diff too long to travel in an address", () => {
		const long = `${DIFF}${"+  const another = 1;\n".repeat(400)}`;

		expect(studioImportLink(STUDIO, long)).toBe(`${STUDIO}/app`);
	});

	it("is always the app's own address, whatever the configured one carries", () => {
		expect(
			studioImportLink("https://typelapse.test/landing?x=1#top", PR).startsWith(`${STUDIO}/app#`),
		).toBe(true);
	});
});

describe("importIntentFragment", () => {
	it("leaves out what is past the budget, and keeps what is within it", () => {
		const within = importIntentFragment({ source: "a".repeat(4000) });
		const past = importIntentFragment({ source: "a".repeat(5000) });

		expect(within?.length).toBeLessThanOrEqual(IMPORT_HASH_KEY.length + MAX_IMPORT_URL_PAYLOAD);
		expect(past).toBeNull();
	});
});
