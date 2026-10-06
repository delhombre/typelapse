import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { GREET_DIFF } from "../support/fixtures";
import {
	HOSTED,
	cloudProjectsOf,
	createApiKeyByApi,
	makeCreator,
	newAccount,
	renderJobsOf,
	signUpByApi,
	signedOut,
} from "../support/hosted";
import { probeVideo, rgbPixels } from "../support/media";
import { expect, test } from "../support/studio";

/**
 * The GitHub Action's hosted output, against the real stack: the script the
 * Action runs (`cli/hosted-render.ts`, then `cli/pr-comment.ts`) with the
 * environment a runner gives it, a real key, the real API, database, worker and
 * share page. The unit tests hold the decisions; this holds that a Creator's key
 * ends in a published, reachable page with the look asked for, that a free
 * account's key leaves the runner to render and says so, and that no key leaves
 * the script silent. The source is the repository's own diff (no network): the
 * route reads a pull request address and a diff through one reader.
 *
 * Serial: the Creator's render feeds the page, the theme and the rerun journeys.
 */
test.describe.configure({ mode: "serial" });

const run = promisify(execFile);
const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules/.bin/tsx");
const creator = newAccount("action");
const free = newAccount("action-free");
let creatorKey = "";
let jobId = "";

/** What a runner hands the Action's hosted step, and what the step leaves for the next ones. */
async function hostedStep(env: Record<string, string>) {
	const dir = mkdtempSync(join(tmpdir(), "typelapse-action-"));
	const files = {
		GITHUB_OUTPUT: join(dir, "output"),
		GITHUB_STEP_SUMMARY: join(dir, "summary"),
		TYPELAPSE_HOSTED_RESULT: join(dir, "hosted.json"),
	};
	const { stdout, stderr } = await run(TSX, ["cli/hosted-render.ts"], {
		cwd: ROOT,
		env: {
			PATH: process.env.PATH ?? "",
			HOME: process.env.HOME ?? "",
			TMPDIR: process.env.TMPDIR ?? "",
			SOURCE: GREET_DIFF,
			...files,
			...env,
		},
	});
	const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);
	const outputs = Object.fromEntries(
		(read(files.GITHUB_OUTPUT) ?? "")
			.split("\n")
			.filter(Boolean)
			.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
	);
	return {
		dir,
		log: `${stdout}${stderr}`,
		outputs,
		hosted: read(files.TYPELAPSE_HOSTED_RESULT),
		summary: read(files.GITHUB_STEP_SUMMARY),
		hostedPath: files.TYPELAPSE_HOSTED_RESULT,
	};
}

/** The comment step: the runner's CLI result (a stand-in) and the hosted result in, the body out. */
async function commentFor(step: Awaited<ReturnType<typeof hostedStep>>, withRunnerVideo: boolean) {
	const resultPath = join(step.dir, "typelapse-result.json");
	if (withRunnerVideo) {
		writeFileSync(
			resultPath,
			`${JSON.stringify({
				ok: true,
				path: "/runner/greet.ts.mp4",
				bytes: 3_000_000,
				width: 1920,
				height: 1080,
				fps: 60,
				durationMs: 3050,
				codec: "h264",
				studioUrl: `${HOSTED.appUrl}/app#import=x`,
			})}\n`,
		);
	}
	const out = join(step.dir, "comment.md");
	await run(TSX, ["cli/pr-comment.ts"], {
		cwd: ROOT,
		env: {
			PATH: process.env.PATH ?? "",
			HOME: process.env.HOME ?? "",
			TMPDIR: process.env.TMPDIR ?? "",
			TYPELAPSE_RESULT: resultPath,
			TYPELAPSE_HOSTED: step.hostedPath,
			TYPELAPSE_COMMENT: out,
			TYPELAPSE_ARTIFACT_URL: "https://github.com/o/r/actions/runs/1/artifacts/9",
			TYPELAPSE_RUN_URL: "https://github.com/o/r/actions/runs/1",
			TYPELAPSE_SHA: "0123456789abcdef",
		},
	});
	return readFileSync(out, "utf8");
}

test.describe("The Action's hosted output: a Creator's key renders on Typelapse and comments the share page, and every other key leaves the runner to render", () => {
	test("a Creator's key ends in a published page that anyone can open, in the theme and size asked for", async () => {
		const session = await signUpByApi(creator);
		await makeCreator(creator.email);
		creatorKey = await createApiKeyByApi(session, "GitHub Action");

		const step = await hostedStep({
			TYPELAPSE_API_KEY: creatorKey,
			TYPELAPSE_API_URL: HOSTED.apiUrl,
			SIZE: "1280x720",
			FPS: "24",
			THEME: "nord",
		});

		await test.step("the step leaves the share page and the studio link for the next ones", () => {
			expect(step.outputs.rendered).toBe("true");
			jobId = step.outputs["share-url"]?.split("/v/")[1] ?? "";
			expect(step.outputs["share-url"]).toBe(`${HOSTED.appUrl}/v/${jobId}`);
			expect(step.outputs["studio-url"]?.startsWith(`${HOSTED.appUrl}/app#import=`)).toBe(true);
			expect(JSON.parse(step.hosted ?? "null")).toMatchObject({ outcome: "rendered", jobId });
			expect(step.log).not.toContain(creatorKey);
		});

		await test.step("the page is public and shows the video", async () => {
			const visitor = await signedOut();
			const page = await visitor.get(`${HOSTED.appUrl}/v/${jobId}`);
			expect(page.status()).toBe(200);
			expect(await page.text()).toContain('property="og:video"');
			expect((await renderJobsOf(creator.email)).map((job) => [job.id, job.isPublic])).toEqual([
				[jobId, true],
			]);
			await visitor.dispose();
		});

		await test.step("the file is the size and rate asked for, and drawn in the theme asked for", async () => {
			const api = await signedOut();
			const done = await api.get(`/api/cloud/jobs/${jobId}`, {
				headers: { authorization: `Bearer ${creatorKey}` },
			});
			const file = await api.get((await done.json()).download.url);
			const path = test.info().outputPath("action.mp4");
			writeFileSync(path, await file.body());
			expect(probeVideo(path)).toMatchObject({ codec: "h264", width: 1280, height: 720, fps: 24 });

			// The card's own background: nord's #2e3440 fills it, and midnight's #0d1117 is nowhere.
			const pixels = rgbPixels(path, 160, 90, 0.5);
			const near = (r: number, g: number, b: number) => {
				let count = 0;
				for (let i = 0; i < pixels.length; i += 3) {
					const [pr = 0, pg = 0, pb = 0] = [pixels[i], pixels[i + 1], pixels[i + 2]];
					if (Math.abs(pr - r) < 10 && Math.abs(pg - g) < 10 && Math.abs(pb - b) < 10) count++;
				}
				return count;
			};
			expect(near(0x2e, 0x34, 0x40)).toBeGreaterThan(1000);
			expect(near(0x0d, 0x11, 0x17)).toBe(0);
			await api.dispose();
		});

		await test.step("the saved project carries the theme, with the theme's own font and radius", async () => {
			const [saved0] = await cloudProjectsOf(creator.email);
			const id = saved0?.id;
			const saved = await (await session.get(`/api/projects/${id}`)).json();
			const cards = saved.project.document.project.scenes.flatMap(
				(scene: { blocks: { kind: string }[] }) =>
					scene.blocks.filter((block) => block.kind === "code"),
			);
			expect(cards.length).toBeGreaterThan(0);
			for (const card of cards) {
				expect(card).toMatchObject({ themeName: "nord" });
				expect(card).not.toHaveProperty("fontFamily");
			}
		});

		await test.step("the comment links the share page and the studio, with no artifact", async () => {
			const body = await commentFor(step, false);
			expect(body).toContain("<!-- typelapse:render-pr -->");
			expect(body).toContain(`](${HOSTED.appUrl}/v/${jobId})`);
			expect(body).toContain(`](${step.outputs["studio-url"]})`);
			expect(body).not.toContain("Download");
		});
		await session.dispose();
	});

	test("the same run again is the same job and the same page, and no second project", async () => {
		const step = await hostedStep({
			TYPELAPSE_API_KEY: creatorKey,
			TYPELAPSE_API_URL: HOSTED.apiUrl,
			SIZE: "1280x720",
			FPS: "24",
			THEME: "nord",
		});

		expect(step.outputs["share-url"]).toBe(`${HOSTED.appUrl}/v/${jobId}`);
		expect(await cloudProjectsOf(creator.email)).toHaveLength(1);
		expect(await renderJobsOf(creator.email)).toHaveLength(1);
	});

	test("a free account's key leaves the runner to render, with the studio link and the Creator sentence", async () => {
		const session = await signUpByApi(free);
		const key = await createApiKeyByApi(session, "free key");
		await session.dispose();

		const step = await hostedStep({ TYPELAPSE_API_KEY: key, TYPELAPSE_API_URL: HOSTED.apiUrl });

		expect(step.outputs.rendered).toBe("false");
		expect(step.outputs["studio-base"]).toBe(`${HOSTED.appUrl}/app`);
		expect(JSON.parse(step.hosted ?? "null")).toMatchObject({ outcome: "free" });
		const body = await commentFor(step, true);
		expect(body).toContain("[Download greet.ts.mp4]");
		expect(body).toContain("free account");
		expect(body).toContain("the hosted video comes with Creator");
		expect(body).not.toMatch(/<sub>[^<]*\d/);
		expect(step.log).not.toContain(key);
		expect(await cloudProjectsOf(free.email)).toEqual([]);
		expect(await renderJobsOf(free.email)).toEqual([]);
	});

	test("a key that is not valid is a warning and a line in the comment, never a failed step", async () => {
		const bad = `tlk_00000000_${"0".repeat(64)}`;

		const step = await hostedStep({ TYPELAPSE_API_KEY: bad, TYPELAPSE_API_URL: HOSTED.apiUrl });

		expect(step.outputs.rendered).toBe("false");
		expect(step.log).toContain(
			"::warning title=Typelapse::This API key is not valid: it may be unknown, revoked or expired.",
		);
		expect(await commentFor(step, true)).toContain(
			"This API key is not valid: it may be unknown, revoked or expired. The video above rendered on this runner instead.",
		);
		expect(step.log).not.toContain(bad);
	});

	test("no key and no address is a script that says nothing and writes nothing", async () => {
		const step = await hostedStep({});

		expect(step.log).toBe("");
		expect(step.outputs).toEqual({});
		expect(step.hosted).toBeNull();
		expect(step.summary).toBeNull();
	});

	test("an address without a key, as a fork's run has, says so in the job summary", async () => {
		const step = await hostedStep({ TYPELAPSE_API_URL: HOSTED.apiUrl, TYPELAPSE_FORK: "true" });

		expect(step.outputs).toEqual({ rendered: "false" });
		expect(step.summary).toContain("This pull request comes from a fork");
	});
});
