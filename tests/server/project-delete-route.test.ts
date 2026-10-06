import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createProjectsRoute } from "../../server/routes/projects";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import { Plan } from "../../src/domain/value-objects/plan";
import { MemoryProjectRepository } from "../application/support/memory-project-repository";

/**
 * `DELETE /api/projects/:id`, the route the studio's list of cloud projects
 * calls. What it removes (media, renders and their pages) is held to the real
 * stores in `project-delete.contract.test.ts`; here is what the caller is told,
 * and to whom the route answers at all.
 */
const NOW = new Date("2026-10-06T10:00:00.000Z");
const LEGACY = {
	title: "First project",
	code: "const value = 1;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [{ code: "const value = 1;", duration: 900 }],
};

function signedInAs(accountId: string): AuthPort {
	return {
		verify: async (credential) =>
			credential.includes("session=valid")
				? { accountId, expiresAt: new Date(NOW.getTime() + 60_000) }
				: null,
	};
}

function appFor(projects: MemoryProjectRepository, accountId = "account-1") {
	let made = 0;
	return new Hono().route(
		"/api/projects",
		createProjectsRoute({
			auth: signedInAs(accountId),
			projects,
			subscriptions: { planFor: async () => Plan.pro() },
			now: () => NOW,
			createId: () => `project-${++made}`,
		}),
	);
}

function withSession(path: string, init: RequestInit = {}): Request {
	const headers = new Headers(init.headers);
	headers.set("cookie", "session=valid");
	if (init.body) headers.set("content-type", "application/json");
	return new Request(`http://localhost${path}`, { ...init, headers });
}

async function save(app: ReturnType<typeof appFor>): Promise<string> {
	const response = await app.request(
		withSession("/api/projects", { method: "POST", body: JSON.stringify({ document: LEGACY }) }),
	);
	expect(response.status).toBe(201);
	return ((await response.json()) as { project: { id: string } }).project.id;
}

async function listed(app: ReturnType<typeof appFor>): Promise<string[]> {
	const response = await app.request(withSession("/api/projects"));
	const body = (await response.json()) as { projects: { id: string }[] };
	return body.projects.map((project) => project.id);
}

describe("deleting a cloud project", () => {
	it("removes the one project it names, and says nothing more than 204", async () => {
		const app = appFor(new MemoryProjectRepository(NOW));
		const doomed = await save(app);
		const spared = await save(app);

		const response = await app.request(withSession(`/api/projects/${doomed}`, { method: "DELETE" }));

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
		expect(await listed(app)).toEqual([spared]);
		expect((await app.request(withSession(`/api/projects/${doomed}`))).status).toBe(404);
		expect((await app.request(withSession(`/api/projects/${spared}`))).status).toBe(200);
	});

	it("answers another account's project exactly as it answers one that is not there, and keeps it", async () => {
		const projects = new MemoryProjectRepository(NOW);
		const owner = appFor(projects, "account-1");
		const stranger = appFor(projects, "account-2");
		const kept = await save(owner);

		const foreign = await stranger.request(withSession(`/api/projects/${kept}`, { method: "DELETE" }));
		const missing = await stranger.request(
			withSession("/api/projects/project-missing", { method: "DELETE" }),
		);

		expect(foreign.status).toBe(404);
		expect(await foreign.json()).toEqual({ error: "Project not found" });
		expect(missing.status).toBe(foreign.status);
		expect(await missing.json()).toEqual({ error: "Project not found" });
		expect(await listed(owner)).toEqual([kept]);
		expect((await owner.request(withSession(`/api/projects/${kept}`))).status).toBe(200);
	});

	it("answers 404 when the project is already gone", async () => {
		const app = appFor(new MemoryProjectRepository(NOW));
		const doomed = await save(app);
		await app.request(withSession(`/api/projects/${doomed}`, { method: "DELETE" }));

		const again = await app.request(withSession(`/api/projects/${doomed}`, { method: "DELETE" }));

		expect(again.status).toBe(404);
	});

	it("takes the session and nothing else: no cookie, and a key is no way in", async () => {
		const projects = new MemoryProjectRepository(NOW);
		const app = appFor(projects);
		const kept = await save(app);

		const anonymous = await app.request(
			new Request(`http://localhost/api/projects/${kept}`, { method: "DELETE" }),
		);
		const withKey = await app.request(
			new Request(`http://localhost/api/projects/${kept}`, {
				method: "DELETE",
				headers: { authorization: `Bearer tlk_836ac582_${"0123456789abcdef".repeat(4)}` },
			}),
		);

		expect([anonymous.status, withKey.status]).toEqual([401, 401]);
		expect(await listed(app)).toEqual([kept]);
	});
});
