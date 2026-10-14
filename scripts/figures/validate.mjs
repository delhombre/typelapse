/**
 * Runs hairline's own checks on the landing's five figures, through the bridge.
 *
 *   pnpm figures:validate               # all five
 *   pnpm figures:validate glide queue   # some
 *
 * For each figure: `scripts/figures/bridge.mjs` writes its hairline-format JS,
 * `build.mjs` puts it on the bench page, `validate.mjs` reads the page (the
 * 200-line limit is one of its checks) and `look.mjs` takes the eight pictures
 * and measures the frame, the read-out, the console, the flicker and how much
 * of the ink the pointer moves. The sheets are written to a temporary folder
 * whose path is printed at the end.
 *
 * Hairline's scripts come from its `hairline-create` skill, which this repo
 * does not vendor: they are found in `$HAIRLINE_SKILL`, or in
 * `~/.claude/skills/hairline-create`. look.mjs installs playwright-core once,
 * into the user's cache folder, the first time it runs.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { FIGURES, bridge } from "./bridge.mjs";

/**
 * Where the pointer answers, in each figure's world: the part that answers, then the
 * figure's two edges (the slider's low and high ends). Kept here, not in the figures,
 * because a figure's own file is held to 200 lines.
 */
const POINTS = {
	scenes: ["56,85,0", "0,0,0", "112,105,0"],
	glide: ["80,40,0", "0,82.6,0", "124,0,0"],
	safezone: ["65,100,7", "5,150,7", "73,7,7"],
	local: ["182,46,0", "0,70,0", "182,46,0"],
	queue: ["130,23,9.4", "68,23,9.4", "192,23,9.4"],
};

const skill = process.env.HAIRLINE_SKILL ?? join(homedir(), ".claude", "skills", "hairline-create");
for (const f of ["build.mjs", "validate.mjs", "look.mjs"]) {
	if (!existsSync(join(skill, f))) {
		console.error(
			`figures:validate: ${join(skill, f)} not found. Install hairline's hairline-create skill, or set HAIRLINE_SKILL to its folder.`,
		);
		process.exit(2);
	}
}

const missing = FIGURES.filter((n) => !POINTS[n]);
if (missing.length) {
	console.error(
		`figures:validate: no pointer points for ${missing.join(", ")}. Add them to POINTS in scripts/figures/validate.mjs.`,
	);
	process.exit(2);
}

const wanted = process.argv.slice(2);
const unknown = wanted.filter((n) => !FIGURES.includes(n));
if (unknown.length) {
	console.error(
		`figures:validate: unknown figure ${unknown.join(", ")}. The figures: ${FIGURES.join(", ")}.`,
	);
	process.exit(2);
}

const out = mkdtempSync(join(tmpdir(), "typelapse-figures-"));
const node = (script, args) =>
	spawnSync(process.execPath, [join(skill, script), ...args], { cwd: out, encoding: "utf8" });

let failed = 0;
for (const name of wanted.length ? wanted : FIGURES) {
	const js = join(out, `${name}.js`);
	const page = join(out, `hairline-${name}.html`);
	writeFileSync(js, await bridge(name));
	const [answer, low, high] = POINTS[name];
	const steps = [
		node("build.mjs", [js, page]),
		node("validate.mjs", [page]),
		node("look.mjs", [js, "--answer", answer, "--edge", low, "--edge", high]),
	];
	const bad = steps.some((s) => s.status !== 0);
	console.log(`== ${name}${bad ? "  FAILED" : ""}`);
	for (const s of steps) {
		process.stdout.write(s.stdout);
		process.stderr.write(s.stderr);
	}
	failed += bad ? 1 : 0;
}

console.log(`\n${failed ? `${failed} figure(s) failed` : "all figures pass"}; pictures in ${out}`);
process.exit(failed ? 1 : 0);
