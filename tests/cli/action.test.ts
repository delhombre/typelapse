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
	"fail-on-render-error",
	"api-key",
	"api-url",
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

/** The steps of `runs`, each as its own block of YAML. */
function steps(): string[] {
	return section(ACTION, "runs")
		.split(/^ {4}- /m)
		.slice(1)
		.map((block) => `- ${block}`);
}

const stepNamed = (name: string) => {
	const found = steps().find((block) => block.includes(`name: ${name}`));
	expect(found, name).toBeDefined();
	return found ?? "";
};

describe("the hosted output", () => {
	it("masks the key in the first step of all, before anything else can print it", () => {
		const [first = ""] = steps();

		expect(first).toContain("name: Mask the API key");
		expect(first).toContain("if: inputs.api-key != ''");
		expect(first).toContain('echo "::add-mask::$key"');
	});

	it("gives the key to the mask step and the hosted step only, through the environment", () => {
		const holders = steps().filter((block) => block.includes("inputs.api-key"));

		expect(holders.map((block) => block.match(/name: (.+)/)?.[1])).toEqual([
			"Mask the API key",
			"Render on Typelapse",
		]);
		for (const block of holders) {
			expect(block).toContain("TYPELAPSE_API_KEY: ${{ inputs.api-key }}");
		}
		// Never an argument, a URL, an output or a file: no step but these two names it at all.
		const named = steps().filter((block) => /API_KEY/.test(block));
		expect(named).toHaveLength(2);
		expect(stepNamed("Render on Typelapse")).not.toMatch(/GITHUB_OUTPUT|GITHUB_ENV|--|\?/);
	});

	it("asks Typelapse after the install and before anything is rendered, and never fails the job", () => {
		const hosted = stepNamed("Render on Typelapse");

		expect(hosted).toContain("id: hosted");
		expect(hosted).toContain("continue-on-error: true");
		expect(hosted).toContain("if: inputs.api-key != '' || inputs.api-url != ''");
		expect(hosted).toContain("run: pnpm exec tsx cli/hosted-render.ts");
		expect(hosted).toMatch(/working-directory: \$\{\{ github\.action_path \}\}/);
		expect(ACTION.indexOf("name: Install Typelapse")).toBeLessThan(
			ACTION.indexOf("name: Render on Typelapse"),
		);
		expect(ACTION.indexOf("name: Render on Typelapse")).toBeLessThan(ACTION.indexOf("id: render"));
	});

	it("hands the hosted step the inputs the CLI takes, and whether the pull request is a fork's", () => {
		const hosted = stepNamed("Render on Typelapse");

		for (const input of ["source", "format", "size", "fps", "theme", "api-url"]) {
			expect(hosted, input).toContain(`inputs.${input} }}`);
		}
		expect(hosted).toContain("github.event.pull_request.head.repo.fork");
	});

	it("leaves the runner's render, cache and libraries to the runs Typelapse did not deliver", () => {
		const gated = ACTION.slice(ACTION.indexOf("name: Render on Typelapse")).split("\n    - ");

		const skippable = gated.filter((block) =>
			/typelapse-remotion-|Install the browser's libraries|id: render/.test(block),
		);
		expect(skippable).toHaveLength(3);
		for (const block of skippable) {
			expect(block).toContain("steps.hosted.outputs.rendered != 'true'");
		}
	});

	it("links a deployed studio from the key's own server unless the workflow names one", () => {
		expect(ACTION).toContain(
			"STUDIO_URL: ${{ inputs.studio-url || steps.hosted.outputs.studio-base }}",
		);
	});

	it("writes and posts the comment for a hosted render, which has no render step", () => {
		for (const name of ["Write the comment", "Comment on the pull request"]) {
			const block = stepNamed(name);
			expect(block, name).toContain(
				"(steps.render.outcome == 'success' || steps.hosted.outputs.rendered == 'true')",
			);
		}
		expect(stepNamed("Write the comment")).toContain(
			"TYPELAPSE_HOSTED: ${{ runner.temp }}/typelapse-hosted.json",
		);
	});

	it("fails the job only for the runner's own render", () => {
		const fail = stepNamed("Fail when the render failed");

		expect(fail).toContain("steps.render.outcome == 'success'");
		expect(fail).not.toContain("hosted");
	});

	it("keeps the demo workflow on the free path: no key, no address", () => {
		expect(WORKFLOW).not.toMatch(/api-key|api-url/);
	});

	it("names the share page among its outputs", () => {
		expect(section(ACTION, "outputs")).toContain("share-url:");
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

	it("renders on demand only: the render label or a manual run, never a push (#340)", () => {
		const on = section(WORKFLOW, "on");

		expect(on).toContain("workflow_dispatch:");
		expect(on).toMatch(/types: \[labeled\]/);
		expect(on).not.toMatch(/synchronize|opened|reopened|push:/);
		expect(WORKFLOW).toContain(
			"if: github.event_name == 'workflow_dispatch' || github.event.label.name == 'render'",
		);
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
