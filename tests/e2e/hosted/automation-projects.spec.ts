import pg from "pg";
import { GREET_DIFF } from "../support/fixtures";
import {
	HOSTED,
	createApiKeyByApi,
	makeCreator,
	newAccount,
	signUpByApi,
	signedOut,
} from "../support/hosted";
import { expect, test } from "../support/studio";

/**
 * A project only render by URL has written is an automation project: the
 * cloud-projects ceiling does not count it until a save from the studio makes
 * it regular. The unit and contract tests hold the rule on both stores; this
 * holds that the real routes, the real database and a script with only a key
 * agree. A Creator is brought to its ceiling of 100 regular projects by SQL,
 * since that is what a hundred saves leave behind.
 */

const CEILING = 100;
const SMALL = { width: 1280, height: 720, fps: 24 };
const LEGACY = {
	title: "Saved from the studio",
	code: "const value = 1;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [{ code: "const value = 1;", duration: 900 }],
};

/** What a person's save of a project leaves in the table, without the studio's hundred clicks. */
function savedDocument(id: string) {
	return {
		schemaVersion: 2,
		project: {
			id,
			title: id,
			canvas: { width: 1920, height: 1080, background: "mesh:solar" },
			settings: { progressStyle: "none", transitionMs: 650, typewriter: false, focusZoom: false },
			assets: [],
			scenes: [{ id: "scene-1", durationMs: 1000, blocks: [] }],
			audioCues: [],
		},
	};
}

test.describe("Hosted automation projects: a Creator at the ceiling still renders by URL, and a save from the studio is what makes a project count", () => {
	test("a 101st source renders, the 101st studio save is refused, and a saved project counts", async () => {
		const owner = newAccount("automation");
		const session = await signUpByApi(owner);
		await makeCreator(owner.email);
		const key = await createApiKeyByApi(session, "GitHub Action");
		const script = await signedOut();
		const database = new pg.Pool({ connectionString: HOSTED.databaseUrl });
		const ownerId = (await database.query('SELECT id FROM "user" WHERE email = $1', [owner.email]))
			.rows[0]?.id as string;
		const regular = async () =>
			Number(
				(
					await database.query(
						"SELECT count(*) AS n FROM projects WHERE owner_id = $1 AND NOT automation",
						[ownerId],
					)
				).rows[0]?.n,
			);
		let automationId = "";

		try {
			await test.step("the account holds a hundred regular projects", async () => {
				for (let index = 0; index < CEILING; index += 1) {
					const id = `saved-${ownerId}-${index}`;
					await database.query(
						"INSERT INTO projects (id, owner_id, title, document) VALUES ($1, $2, $1, $3)",
						[id, ownerId, JSON.stringify(savedDocument(id))],
					);
				}
				expect(await regular()).toBe(CEILING);
			});

			await test.step("a script's key renders a 101st source, which takes no place", async () => {
				const response = await script.post("/api/cloud/render/source", {
					headers: { authorization: `Bearer ${key}` },
					data: { source: GREET_DIFF, renderOptions: SMALL },
				});
				expect(response.status(), await response.text()).toBe(202);
				automationId = (await response.json()).job.projectId;
				const stored = await database.query("SELECT automation FROM projects WHERE id = $1", [
					automationId,
				]);
				expect(stored.rows).toEqual([{ automation: true }]);
				expect(await regular()).toBe(CEILING);
			});

			await test.step("the studio's save of a 101st project is still refused", async () => {
				const refused = await session.post("/api/projects", { data: { document: LEGACY } });
				expect(refused.status(), await refused.text()).toBe(402);
				expect(await refused.json()).toMatchObject({
					code: "plan-limit",
					ceiling: "cloudProjects",
					limit: CEILING,
					used: CEILING,
					plan: "creator",
				});
			});

			await test.step("the allowance counts what the ceiling counts", async () => {
				const allowance = await session.get("/api/billing/allowance");
				expect(allowance.status()).toBe(200);
				expect((await allowance.json()).allowance.usage.cloudProjects).toBe(CEILING);
			});

			await test.step("saving the render-by-URL project from the studio is refused at the ceiling, and writes nothing", async () => {
				const opened = await session.get(`/api/projects/${automationId}`);
				expect(opened.status()).toBe(200);
				const { project } = await opened.json();
				const save = (revision: number) =>
					session.put(`/api/projects/${automationId}`, {
						data: {
							expectedRevision: revision,
							document: {
								...project.document,
								project: { ...project.document.project, title: "Polished in the studio" },
							},
						},
					});

				const refused = await save(project.revision);

				expect(refused.status(), await refused.text()).toBe(402);
				expect(await refused.json()).toMatchObject({ ceiling: "cloudProjects", used: CEILING });
				expect(
					(await session.get(`/api/projects/${automationId}`).then((r) => r.json())).project,
				).toMatchObject({ revision: project.revision });

				await test.step("once a place is free, the same save makes it a regular project that counts", async () => {
					await database.query("DELETE FROM projects WHERE id = $1", [`saved-${ownerId}-0`]);

					const saved = await save(project.revision);

					expect(saved.status(), await saved.text()).toBe(200);
					expect(await regular()).toBe(CEILING);
					const next = await session.post("/api/projects", { data: { document: LEGACY } });
					expect(next.status()).toBe(402);
				});
			});
		} finally {
			await database.end();
			await script.dispose();
			await session.dispose();
		}
	});
});
