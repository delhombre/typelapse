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

/** Prose is full of the word "from"; only real code should be scanned. */
const withoutComments = (source: string): string => {
	return source.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");
};

const STATIC_IMPORT = /\bfrom\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /\bimport\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']/g;

const importsOf = (file: string): string[] => {
	const source = withoutComments(readFileSync(file, "utf8"));
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

	it("keeps node built-ins out of the domain and the application", () => {
		const isNodeBuiltin = (specifier: string) => specifier.startsWith("node:");

		expect(violationsIn("domain", (s) => !isNodeBuiltin(s))).toEqual([]);
		expect(violationsIn("application", (s) => !isNodeBuiltin(s))).toEqual([]);
	});
});
