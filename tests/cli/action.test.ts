// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMENT_MARKER } from "../../cli/pr-comment";

/**
 * The GitHub Action is YAML that only GitHub runs, so these are the facts a
 * typo would break silently: where the Marketplace looks for it, the inputs
 * the README promises, the marker the comment step edits by, and the places
 * the CLI must run from for its downloads and paths to land where they should.
 */

const ROOT = resolve(__dirname, "../..");
const ACTION = readFileSync(resolve(ROOT, "action.yml"), "utf8");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/render-pr.yml"), "utf8");
const README = readFileSync(resolve(ROOT, "README.md"), "utf8");
const INPUTS = [
	"source",
	"format",
	"size",
	"fps",
	"theme",
	"studio-url",
	"comment",
	"github-token",
];

/** The block of one top-level key, up to the next top-level key. */
function section(yaml: string, key: string): string {
	return yaml.match(new RegExp(`^${key}:\\n([\\s\\S]*?)(?=^\\S|$(?![\\s\\S]))`, "m"))?.[1] ?? "";
}

/** Each input's own block, keyed by name. */
function inputs(): Map<string, string> {
	const blocks = new Map<string, string>();
	const parts = section(ACTION, "inputs").split(/^ {2}(?=[\w-]+:\n)/m);
	for (const part of parts) {
		const name = part.match(/^([\w-]+):\n/)?.[1];
		if (name) {
			blocks.set(name, part);
		}
	}
	return blocks;
}

describe("the render-pr GitHub Action", () => {
	it("sits at the repository root, where the Marketplace lists an action, with branding", () => {
		expect(existsSync(resolve(ROOT, "action.yml"))).toBe(true);
		expect(ACTION).toMatch(/^name: .+$/m);
		expect(ACTION).toMatch(/^description: .+$/m);
		expect(section(ACTION, "branding")).toMatch(/icon: \S+/);
		expect(section(ACTION, "runs")).toContain("using: composite");
	});

	it("documents every input and needs no secret for the free path", () => {
		const declared = inputs();

		expect([...declared.keys()]).toEqual(INPUTS);
		for (const [name, block] of declared) {
			expect(block, name).toMatch(/description: \S/);
			expect(block, name).not.toMatch(/required: true/);
		}
		// The workflow's own token reads the pull request; nothing else is asked for.
		expect(declared.get("github-token")).toContain("default: ${{ github.token }}");
		expect(declared.get("source")).toContain("github.event.pull_request.html_url");
	});

	it("hands inputs to shell steps through the environment, never spliced into the script", () => {
		const runBlocks = [...ACTION.matchAll(/run: \|\n([\s\S]*?)(?=\n {4}- |\n\S|$(?![\s\S]))/g)];

		expect(runBlocks.length).toBeGreaterThan(0);
		for (const [, script] of runBlocks) {
			expect(script).not.toMatch(/\$\{\{\s*(inputs|github\.event)\./);
		}
	});

	it("runs the CLI from the action's own checkout, so Remotion's browser lands in its node_modules", () => {
		const render = ACTION.slice(ACTION.indexOf("id: render"));

		expect(render).toMatch(/working-directory: \$\{\{ github\.action_path \}\}/);
		expect(render).toContain("--json");
		expect(render).toContain("--open");
		// An absolute --out: a relative one would resolve against the action checkout.
		expect(render).toContain('--out "$RUNNER_TEMP/typelapse/"');
	});

	it("caches the pnpm store and Remotion's headless shell between runs", () => {
		expect(ACTION).toContain("uses: actions/cache@");
		expect(ACTION).toContain("node_modules/.remotion");
		expect(ACTION).toContain("pnpm store path");
	});

	it("installs the headless shell's Linux libraries only when the runner lacks them", () => {
		// ubuntu-latest ships Chrome and its libraries; a minimal or self-hosted
		// image does not, and Remotion's browser then dies on libnspr4.so.
		const step = ACTION.slice(ACTION.indexOf("name: Install the browser's libraries"));

		expect(step).toContain("if: runner.os == 'Linux'");
		expect(step).toMatch(/ldconfig -p \| grep -q libnss3\.so/);
		expect(step).toContain("libasound2t64");
		expect(ACTION.indexOf("name: Install the browser's libraries")).toBeLessThan(
			ACTION.indexOf("id: render"),
		);
	});

	it("installs the pnpm this repository pins, whatever the calling repository pins", () => {
		// pnpm/action-setup reads packageManager from the caller's package.json and
		// throws when it differs, so the action installs ours by version instead.
		expect(ACTION).not.toContain("uses: pnpm/action-setup");
		expect(ACTION).toContain("packageManager");
	});

	it("edits the comment it posted before, found by the marker the body carries", () => {
		const script = ACTION.slice(ACTION.indexOf("actions/github-script@"));

		expect(script).toContain(COMMENT_MARKER);
		expect(script).toContain("updateComment");
		expect(script).toContain("createComment");
	});

	it("fails the job with the CLI's exit code after the comment is written", () => {
		const steps = ACTION.slice(ACTION.indexOf("actions/github-script@"));

		expect(steps).toMatch(/exit "\$TYPELAPSE_EXIT"/);
	});
});

describe("the demo workflow on this repository's pull requests", () => {
	it("runs the action from the checkout on pull requests to main, with the least permissions", () => {
		expect(WORKFLOW).toMatch(/pull_request:\n\s+branches: \[main\]/);
		expect(WORKFLOW).toMatch(/contents: read/);
		expect(WORKFLOW).toMatch(/pull-requests: write/);
		expect(WORKFLOW).toMatch(/uses: \.\/\n/);
		expect(WORKFLOW).toContain("uses: actions/checkout@");
	});
});

describe("the README", () => {
	it("documents every input of the action", () => {
		const docs = README.slice(README.indexOf("## Render every pull request"));

		expect(docs.length).toBeGreaterThan(0);
		for (const name of INPUTS) {
			expect(docs, name).toContain(`\`${name}\``);
		}
	});
});
