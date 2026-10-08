import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Remotion bundles `server/remotion/root.tsx` and `server/remotion/v2/root.tsx`
 * with its own webpack, which knows nothing of tsconfig's `@/` alias. A value
 * import spelled `@/...` anywhere in what those entries reach passes Vitest and
 * Vite, then fails every render with "Can't resolve '@/...'". Type-only
 * imports are erased before bundling and may keep the alias.
 */

const ROOT = resolve(__dirname, "../..");
const SRC = resolve(ROOT, "src");
const ENTRIES = ["server/remotion/root.tsx", "server/remotion/v2/root.tsx"];

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/[^\n]*/g;
const TEMPLATE_LITERAL = /`(?:\\[\s\S]|[^\\`])*`/g;

/** `import|export [type] <clause> from "x"`, which cannot run across another statement's quotes. */
const FROM_STATEMENT = /\b(?:import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /\bimport\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']/g;

const code = (file: string): string =>
	readFileSync(file, "utf8")
		.replace(BLOCK_COMMENT, "")
		.replace(LINE_COMMENT, "")
		.replace(TEMPLATE_LITERAL, "``");

/** `{ type A, type B }` is erased whole; one value name keeps the import. */
const onlyTypeNames = (clause: string): boolean => {
	const named = /^\{([\s\S]*)\}$/.exec(clause.trim());
	if (!named?.[1]) {
		return false;
	}
	return named[1]
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean)
		.every((name) => name.startsWith("type "));
};

const valueSpecifiers = (file: string): string[] => {
	const source = code(file);
	const specifiers: string[] = [];
	for (const match of source.matchAll(FROM_STATEMENT)) {
		const [, typeOnly, clause = "", specifier] = match;
		if (specifier && !typeOnly && !onlyTypeNames(clause)) {
			specifiers.push(specifier);
		}
	}
	for (const pattern of [SIDE_EFFECT_IMPORT, DYNAMIC_IMPORT]) {
		for (const match of source.matchAll(pattern)) {
			if (match[1]) {
				specifiers.push(match[1]);
			}
		}
	}
	return specifiers;
};

const SOURCE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** The TypeScript file a specifier names, or null for packages and assets. */
const sourceFor = (from: string, specifier: string): string | null => {
	let base: string;
	if (specifier.startsWith("@/")) {
		base = resolve(SRC, specifier.slice(2));
	} else if (specifier.startsWith("./") || specifier.startsWith("../")) {
		base = resolve(dirname(from), specifier);
	} else {
		return null;
	}
	for (const suffix of SOURCE_SUFFIXES) {
		const candidate = base + suffix;
		if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) {
			return candidate;
		}
	}
	return null;
};

const aliasedImportsReachedFrom = (entries: readonly string[]): string[] => {
	const seen = new Set<string>();
	const found: string[] = [];
	const queue = entries.map((entry) => resolve(ROOT, entry));
	while (queue.length > 0) {
		const file = queue.pop();
		if (!file || seen.has(file)) {
			continue;
		}
		seen.add(file);
		for (const specifier of valueSpecifiers(file)) {
			if (specifier.startsWith("@/")) {
				found.push(`${file.slice(ROOT.length + 1)} imports "${specifier}"`);
			}
			const target = sourceFor(file, specifier);
			if (target) {
				queue.push(target);
			}
		}
	}
	return found.sort();
};

describe("what Remotion bundles", () => {
	it("reaches the composition's source, so the scan is not vacuous", () => {
		const reached = new Set<string>();
		const queue = ENTRIES.map((entry) => resolve(ROOT, entry));
		while (queue.length > 0) {
			const file = queue.pop();
			if (!file || reached.has(file)) {
				continue;
			}
			reached.add(file);
			for (const specifier of valueSpecifiers(file)) {
				const target = sourceFor(file, specifier);
				if (target) {
					queue.push(target);
				}
			}
		}
		const names = [...reached].map((file) => file.slice(ROOT.length + 1));

		expect(names).toContain("src/presentation/components/preview/focus-zoom-body.tsx");
		expect(names).toContain("src/presentation/components/preview/magic-move-canvas.tsx");
	});

	it("imports nothing through the @/ alias, which Remotion's webpack cannot resolve", () => {
		expect(aliasedImportsReachedFrom(ENTRIES)).toEqual([]);
	});
});
