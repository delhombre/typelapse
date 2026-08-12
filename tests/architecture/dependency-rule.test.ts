import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../../src");

const collectSourceFiles = (dir: string): string[] => {
	const entries = readdirSync(dir);
	const files: string[] = [];

	for (const entry of entries) {
		const full = join(dir, entry);

		if (statSync(full).isDirectory()) {
			files.push(...collectSourceFiles(full));
			continue;
		}

		if (full.endsWith(".ts") || full.endsWith(".tsx")) {
			files.push(full);
		}
	}

	return files;
};

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/[^\n]*/g;
/** Scans to the first UNESCAPED backtick, so `\`` and `\${` inside stay swallowed. */
const TEMPLATE_LITERAL = /`(?:\\[\s\S]|[^\\`])*`/g;

/**
 * Only real code should be scanned. Prose is full of the word "from", and the
 * template catalog quotes whole source files - one of them a Vitest suite that
 * imports from "vitest" - inside template literals. Neither is a dependency.
 */
const withoutCommentsAndStrings = (source: string): string => {
	return source
		.replace(BLOCK_COMMENT, "")
		.replace(LINE_COMMENT, "")
		.replace(TEMPLATE_LITERAL, "``");
};

const STATIC_IMPORT = /\bfrom\s*["']([^"']+)["']/g;
/**
 * The space is required, not optional. `import"x"` is not syntax anyone writes
 * and Biome would not leave it, whereas an optional space makes the word
 * `import` at the *end of a string* open an import: `from "@/…/utils/import"`
 * matches from the word to the closing quote, and the "specifier" it then
 * captures is whatever text runs to the next quote in the file. Seven such
 * strings exist in the presentation layer today; the guard only stays quiet
 * because it scans the domain and the application, where none live yet.
 */
const SIDE_EFFECT_IMPORT = /\bimport\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']/g;

const importsOf = (file: string): string[] => {
	const source = withoutCommentsAndStrings(readFileSync(file, "utf8"));
	const specifiers: string[] = [];

	for (const pattern of [STATIC_IMPORT, SIDE_EFFECT_IMPORT, DYNAMIC_IMPORT]) {
		for (const match of source.matchAll(pattern)) {
			const specifier = match[1];

			if (specifier !== undefined) {
				specifiers.push(specifier);
			}
		}
	}

	return specifiers;
};

const isRelative = (specifier: string): boolean => {
	return specifier.startsWith("./") || specifier.startsWith("../");
};

const violationsIn = (layer: string, isAllowed: (specifier: string) => boolean): string[] => {
	const violations: string[] = [];

	for (const file of collectSourceFiles(join(SRC, layer))) {
		const relativeFile = file.slice(SRC.length + 1);

		for (const specifier of importsOf(file)) {
			if (!isAllowed(specifier)) {
				violations.push(`${relativeFile} imports "${specifier}"`);
			}
		}
	}

	return violations;
};

describe("the dependency rule", () => {
	it("keeps the domain free of every outward dependency", () => {
		const allowed = (specifier: string) => {
			return isRelative(specifier) || specifier.startsWith("@/domain/");
		};

		expect(violationsIn("domain", allowed)).toEqual([]);
	});

	it("lets the application reach the domain and itself, nothing else", () => {
		const allowed = (specifier: string) => {
			return (
				isRelative(specifier) ||
				specifier.startsWith("@/domain/") ||
				specifier.startsWith("@/application/")
			);
		};

		expect(violationsIn("application", allowed)).toEqual([]);
	});

	/**
	 * The landing is a leaf: a marketing page that may read the studio's shared
	 * presentation utilities, never the reverse. Anything both need — the haptics
	 * trigger, the spring tokens — belongs in `presentation/`, not in the page
	 * that happened to want it first. Without this rule the studio starts
	 * importing from `landing/` and the marketing page becomes a library nobody
	 * can change.
	 */
	it("keeps the landing out of the studio", () => {
		const violations: string[] = [];

		for (const file of collectSourceFiles(join(SRC, "presentation"))) {
			const relativeFile = file.slice(SRC.length + 1);

			if (relativeFile.startsWith("presentation/landing/")) {
				continue;
			}

			for (const specifier of importsOf(file)) {
				if (specifier.includes("presentation/landing/") || specifier.startsWith("./landing/")) {
					violations.push(`${relativeFile} imports "${specifier}"`);
				}
			}
		}

		expect(violations).toEqual([]);
	});

	it("keeps node built-ins out of the domain and the application", () => {
		const isNodeBuiltin = (specifier: string) => specifier.startsWith("node:");

		expect(violationsIn("domain", (s) => !isNodeBuiltin(s))).toEqual([]);
		expect(violationsIn("application", (s) => !isNodeBuiltin(s))).toEqual([]);
	});
});
