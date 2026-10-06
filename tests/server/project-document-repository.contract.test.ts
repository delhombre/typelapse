// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountUsageRepository } from "../../server/db/account-usage.repository";
import { createDatabase } from "../../server/db/database";
import { createProjectDocumentRepository } from "../../server/db/project-document.repository";
import { user } from "../../server/db/schema";
import type { ProjectDocumentV2 } from "../../src/application/project/project-document";
import type { ProjectDocumentRepositoryPort } from "../../src/application/project/project-document-repository.port";
import { MemoryProjectRepository } from "../application/support/memory-project-repository";

/**
 * One contract, two adapters: what the cloud-projects ceiling counts. The
 * memory adapter always runs. The PostgreSQL one runs when
 * TYPELAPSE_TEST_DATABASE_URL names a database, for example the one
 * `tests/e2e/hosted/services.sh up` starts:
 *
 *   TYPELAPSE_TEST_DATABASE_URL=postgres://postgres:typelapse@127.0.0.1:54381/typelapse
 *
 * A regular project is one a person saved from the studio, and it counts. An
 * automation project is one only render by URL has written, and it does not,
 * until a save from the studio makes it regular. Each test makes its own
 * accounts and the PostgreSQL subject removes them, which takes their projects
 * with them.
 */
const DATABASE_URL = process.env.TYPELAPSE_TEST_DATABASE_URL;

interface Subject {
	readonly repository: ProjectDocumentRepositoryPort;
	account(label: string): Promise<string>;
	dispose(): Promise<void>;
}

async function memorySubject(): Promise<Subject> {
	return {
		repository: new MemoryProjectRepository(),
		account: async (label) => `${label}-${randomBytes(3).toString("hex")}`,
		dispose: async () => undefined,
	};
}

async function postgresSubject(): Promise<Subject> {
	const db = createDatabase(DATABASE_URL ?? "");
	const made: string[] = [];
	return {
		repository: createProjectDocumentRepository(db),
		account: async (label) => {
			const id = `contract-${label}-${randomBytes(4).toString("hex")}`;
			await db.insert(user).values({ id, name: label, email: `${id}@typelapse.test` });
			made.push(id);
			return id;
		},
		dispose: async () => {
			for (const id of made) {
				await db.$client.query('DELETE FROM "user" WHERE id = $1', [id]);
			}
			await db.$client.end();
		},
	};
}

const subjects: Array<[string, () => Promise<Subject>]> = [["memory", memorySubject]];
if (DATABASE_URL) {
	subjects.push(["PostgreSQL", postgresSubject]);
}

/** Project ids are global, so each test draws its own. */
function projectDocument(title: string, id = `project-${randomBytes(6).toString("hex")}`) {
	const document: ProjectDocumentV2 = {
		schemaVersion: 2,
		project: {
			id,
			title,
			canvas: { width: 1920, height: 1080, background: "mesh:solar" },
			settings: { progressStyle: "none", transitionMs: 650, typewriter: false, focusZoom: false },
			assets: [],
			scenes: [
				{
					id: "scene-1",
					durationMs: 1000,
					blocks: [
						{
							id: "text-1",
							kind: "text",
							text: title,
							placement: { x: 0, y: 0, width: 1, height: 1 },
							opacity: 1,
							typography: {
								fontFamily: "Inter",
								fontSize: 64,
								fontWeight: 700,
								color: "#ffffff",
								align: "center",
							},
						},
					],
				},
			],
			audioCues: [],
		},
	};
	return document;
}

describe.each(subjects)("the project store on %s: what the ceiling counts", (_name, open) => {
	let subject: Subject;
	let store: ProjectDocumentRepositoryPort;

	beforeAll(async () => {
		subject = await open();
		store = subject.repository;
	});
	afterAll(() => subject.dispose());

	/** The studio's own save of a new project, which meets the ceiling. */
	const createRegular = (ownerId: string, maxProjects: number, title = "Regular") =>
		store.create({ ownerId, document: projectDocument(title), maxProjects });

	/** A regular project that the ceiling let in. */
	async function regularProject(ownerId: string, maxProjects: number) {
		const created = await createRegular(ownerId, maxProjects);
		if (created.outcome !== "created") {
			throw new Error("The ceiling refused a project the test needs");
		}
		return created.project;
	}

	it("counts a regular project from the day it is created, for its owner alone", async () => {
		const owner = await subject.account("regular");
		const other = await subject.account("other");

		const first = await createRegular(owner, 2);
		const second = await createRegular(owner, 2);
		const third = await createRegular(owner, 2);

		expect([first.outcome, second.outcome, third.outcome]).toEqual([
			"created",
			"created",
			"limit-reached",
		]);
		expect(third).toEqual({ outcome: "limit-reached", projectCount: 2 });
		expect((await createRegular(other, 2)).outcome).toBe("created");
	});

	it("does not count an automation project, and never refuses one for the ceiling", async () => {
		const owner = await subject.account("automation");
		await createRegular(owner, 2);
		await createRegular(owner, 2);

		const made = await Promise.all(
			[1, 2, 3].map((index) =>
				store.createAutomation({
					ownerId: owner,
					document: projectDocument(`Source ${index}`),
				}),
			),
		);

		// The account is at its ceiling of regular projects, and three more exist.
		for (const project of made) {
			expect(project).toMatchObject({ ownerId: owner, revision: 1 });
			expect(await store.findOwnedById(owner, project.id)).toEqual(project);
		}
		expect(await createRegular(owner, 2)).toEqual({ outcome: "limit-reached", projectCount: 2 });
	});

	it("leaves a room a regular project can still take when only automation projects fill it", async () => {
		const owner = await subject.account("room");
		await createRegular(owner, 2);
		for (const index of [1, 2, 3, 4]) {
			await store.createAutomation({
				ownerId: owner,
				document: projectDocument(`Source ${index}`),
			});
		}

		const created = await createRegular(owner, 2);

		expect(created.outcome).toBe("created");
	});

	it("refuses an automation project over an id that is taken, as a rival request for the source", async () => {
		const owner = await subject.account("rival");
		const document = projectDocument("One source");
		await store.createAutomation({ ownerId: owner, document });

		await expect(store.createAutomation({ ownerId: owner, document })).rejects.toThrow();
		expect((await store.findOwnedById(owner, document.project.id))?.revision).toBe(1);
	});

	it("writes a new revision of an automation project without making it count", async () => {
		const owner = await subject.account("revision");
		await regularProject(owner, 2);
		const made = await store.createAutomation({
			ownerId: owner,
			document: projectDocument("Source"),
		});
		const newer = projectDocument("Source, changed", made.id);

		const updated = await store.updateAutomation({
			ownerId: owner,
			id: made.id,
			expectedRevision: 1,
			document: newer,
		});

		expect(updated).toMatchObject({
			outcome: "updated",
			project: { id: made.id, revision: 2, document: newer },
		});
		// One place is left beside the one regular project, so the revision took none of it.
		expect((await createRegular(owner, 2)).outcome).toBe("created");
		expect(await createRegular(owner, 2)).toEqual({ outcome: "limit-reached", projectCount: 2 });
	});

	it("does not turn a regular project into an automation one", async () => {
		const owner = await subject.account("kept");
		const regular = await regularProject(owner, 1);

		const updated = await store.updateAutomation({
			ownerId: owner,
			id: regular.id,
			expectedRevision: 1,
			document: projectDocument("Rewritten by an automation", regular.id),
		});

		expect(updated.outcome).toBe("updated");
		expect(await createRegular(owner, 1)).toEqual({ outcome: "limit-reached", projectCount: 1 });
	});

	it("answers a stale revision, and a project that is not the caller's, as update does", async () => {
		const owner = await subject.account("owner");
		const stranger = await subject.account("stranger");
		const made = await store.createAutomation({
			ownerId: owner,
			document: projectDocument("Source"),
		});
		const document = projectDocument("Changed", made.id);

		const stale = await store.updateAutomation({
			ownerId: owner,
			id: made.id,
			expectedRevision: 7,
			document,
		});
		const foreign = await store.updateAutomation({
			ownerId: stranger,
			id: made.id,
			expectedRevision: 1,
			document,
		});
		const missing = await store.updateAutomation({
			ownerId: owner,
			id: "no-such-project",
			expectedRevision: 1,
			document: projectDocument("Changed", "no-such-project"),
		});

		expect(stale).toEqual({ outcome: "conflict", currentRevision: 1 });
		expect(foreign).toEqual({ outcome: "not-found" });
		expect(missing).toEqual({ outcome: "not-found" });
	});

	it("makes an automation project regular on the studio's first save of it, and it counts from then on", async () => {
		const owner = await subject.account("promoted");
		await regularProject(owner, 2);
		const made = await store.createAutomation({
			ownerId: owner,
			document: projectDocument("Source"),
		});
		const polished = projectDocument("Source, polished", made.id);

		const saved = await store.update({
			ownerId: owner,
			id: made.id,
			expectedRevision: 1,
			document: polished,
			maxProjects: 2,
		});

		expect(saved).toMatchObject({
			outcome: "updated",
			project: { id: made.id, revision: 2, document: polished },
		});
		// The owner holds two regular projects now, so a third is refused.
		expect(await createRegular(owner, 2)).toEqual({ outcome: "limit-reached", projectCount: 2 });
		// And saving it again asks for no place, though the owner is at the ceiling.
		const again = await store.update({
			ownerId: owner,
			id: made.id,
			expectedRevision: 2,
			document: projectDocument("Source, polished again", made.id),
			maxProjects: 2,
		});
		expect(again.outcome).toBe("updated");
	});

	it("refuses the save that would make one regular project too many, and writes nothing", async () => {
		const owner = await subject.account("full");
		const first = await regularProject(owner, 2);
		await regularProject(owner, 2);
		const original = projectDocument("Source");
		const made = await store.createAutomation({ ownerId: owner, document: original });

		const refused = await store.update({
			ownerId: owner,
			id: made.id,
			expectedRevision: 1,
			document: projectDocument("Source, polished", made.id),
			maxProjects: 2,
		});

		expect(refused).toEqual({ outcome: "limit-reached", projectCount: 2 });
		expect(await store.findOwnedById(owner, made.id)).toMatchObject({
			revision: 1,
			document: original,
		});
		// It is still an automation project: once a place is free it is not taken by it.
		expect(await store.deleteOwnedById(owner, first.id)).toBe("deleted");
		expect((await createRegular(owner, 2)).outcome).toBe("created");
	});

	it("answers a stale revision as a conflict, before it asks about the ceiling", async () => {
		const owner = await subject.account("stale");
		await regularProject(owner, 1);
		const made = await store.createAutomation({
			ownerId: owner,
			document: projectDocument("Source"),
		});

		const stale = await store.update({
			ownerId: owner,
			id: made.id,
			expectedRevision: 9,
			document: projectDocument("Source, polished", made.id),
			maxProjects: 1,
		});

		expect(stale).toEqual({ outcome: "conflict", currentRevision: 1 });
	});

	it("saves a regular project without asking for a place, even beyond a ceiling that has fallen", async () => {
		const owner = await subject.account("downgraded");
		const projects = [];
		for (let index = 0; index < 4; index += 1) {
			projects.push(await regularProject(owner, 4));
		}
		const [first] = projects;
		if (!first) throw new Error("expected a project");

		// A plan whose ceiling is below what the account already holds: nothing is
		// deleted, saving what is there still works, and a new project does not.
		const saved = await store.update({
			ownerId: owner,
			id: first.id,
			expectedRevision: 1,
			document: projectDocument("Renamed", first.id),
			maxProjects: 1,
		});

		expect(saved).toMatchObject({ outcome: "updated", project: { revision: 2 } });
		expect(await createRegular(owner, 1)).toEqual({ outcome: "limit-reached", projectCount: 4 });
	});

	it("answers a project that is not the caller's, or not there, with not-found, as ever", async () => {
		const owner = await subject.account("owner");
		const stranger = await subject.account("stranger");
		const made = await store.createAutomation({
			ownerId: owner,
			document: projectDocument("Source"),
		});

		const foreign = await store.update({
			ownerId: stranger,
			id: made.id,
			expectedRevision: 1,
			document: projectDocument("Source, polished", made.id),
			maxProjects: 3,
		});
		const missing = await store.update({
			ownerId: owner,
			id: "no-such-project",
			expectedRevision: 1,
			document: projectDocument("Changed", "no-such-project"),
			maxProjects: 3,
		});

		expect(foreign).toEqual({ outcome: "not-found" });
		expect(missing).toEqual({ outcome: "not-found" });
		// The stranger's attempt made nothing regular: the project is still not counted.
		expect((await store.findOwnedById(owner, made.id))?.revision).toBe(1);
	});

	it("lets exactly one of many concurrent new projects take the last place", async () => {
		const owner = await subject.account("race-create");
		await regularProject(owner, 3);
		await regularProject(owner, 3);

		const results = await Promise.all(
			Array.from({ length: 8 }, (_, index) => createRegular(owner, 3, `Racer ${index}`)),
		);

		expect(results.filter((result) => result.outcome === "created")).toHaveLength(1);
		const refused = results.filter((result) => result.outcome === "limit-reached");
		expect(refused).toHaveLength(7);
		expect(new Set(refused.map((result) => JSON.stringify(result)))).toEqual(
			new Set([JSON.stringify({ outcome: "limit-reached", projectCount: 3 })]),
		);
	});

	it("lets exactly one of many concurrent first saves make an automation project regular", async () => {
		const owner = await subject.account("race-save");
		await regularProject(owner, 3);
		await regularProject(owner, 3);
		const sources = await Promise.all(
			Array.from({ length: 6 }, (_, index) =>
				store.createAutomation({ ownerId: owner, document: projectDocument(`Source ${index}`) }),
			),
		);

		const results = await Promise.all(
			sources.map((source) =>
				store.update({
					ownerId: owner,
					id: source.id,
					expectedRevision: 1,
					document: projectDocument("Polished", source.id),
					maxProjects: 3,
				}),
			),
		);

		expect(results.filter((result) => result.outcome === "updated")).toHaveLength(1);
		expect(results.filter((result) => result.outcome === "limit-reached")).toHaveLength(5);
		// Three regular projects and no more: the ceiling held.
		expect(await createRegular(owner, 3)).toEqual({ outcome: "limit-reached", projectCount: 3 });
	});

	it("lets a new project and a first save race for the last place, and only one wins", async () => {
		const owner = await subject.account("race-mixed");
		await regularProject(owner, 2);
		const source = await store.createAutomation({
			ownerId: owner,
			document: projectDocument("Source"),
		});

		const [created, saved] = await Promise.all([
			createRegular(owner, 2, "New"),
			store.update({
				ownerId: owner,
				id: source.id,
				expectedRevision: 1,
				document: projectDocument("Polished", source.id),
				maxProjects: 2,
			}),
		]);

		const wins = [created.outcome === "created", saved.outcome === "updated"];
		expect(wins.filter(Boolean)).toHaveLength(1);
		expect(await createRegular(owner, 2)).toEqual({ outcome: "limit-reached", projectCount: 2 });
	});

	it("does not let automation projects made meanwhile take the place a new project needs", async () => {
		const owner = await subject.account("race-automation");
		await regularProject(owner, 2);

		const [created] = await Promise.all([
			createRegular(owner, 2, "New"),
			...Array.from({ length: 5 }, (_, index) =>
				store.createAutomation({ ownerId: owner, document: projectDocument(`Source ${index}`) }),
			),
		]);

		expect(created.outcome).toBe("created");
	});
});

describe.skipIf(!DATABASE_URL)("the allowance on PostgreSQL", () => {
	const db = createDatabase(DATABASE_URL ?? "postgres://unused");
	const made: string[] = [];

	afterAll(async () => {
		for (const id of made) {
			await db.$client.query('DELETE FROM "user" WHERE id = $1', [id]);
		}
		await db.$client.end();
	});

	it("shows the projects the ceiling counts, not the ones render by URL saved", async () => {
		const id = `contract-usage-${randomBytes(4).toString("hex")}`;
		await db.insert(user).values({ id, name: "usage", email: `${id}@typelapse.test` });
		made.push(id);
		const store = createProjectDocumentRepository(db);
		await store.create({ ownerId: id, document: projectDocument("Regular"), maxProjects: 5 });
		for (const index of [1, 2, 3]) {
			await store.createAutomation({ ownerId: id, document: projectDocument(`Source ${index}`) });
		}

		const usage = await createAccountUsageRepository(db).usageFor(id, new Date());

		expect(usage.cloudProjects).toBe(1);
	});
});
