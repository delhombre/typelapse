// @vitest-environment node
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The staging deploy's shell (scripts/deploy/staging.sh), run for real against a
 * kubectl that is a script. What is decided here: which failures are retried and
 * how often, that a retry replays the manifest on stdin, that a lost poll does
 * not end the smoke step, and that stale smoke Jobs go. The real cluster only
 * sees it on the next dispatch of the workflow (#286).
 */

const SCRIPT = resolve(__dirname, "../../scripts/deploy/staging.sh");

/**
 * A kubectl that records every call and what it is fed on stdin, fails the calls matching STUB_FAIL_MATCH
 * the first STUB_FAIL_TIMES times with STUB_FAIL_MSG, and otherwise answers just
 * enough for the script: the secret manifest, Job status, no pods, no events.
 */
const KUBECTL = `#!/usr/bin/env bash
set -u
args="$*"
echo "$args" >> "$STUB_DIR/calls"
case "$args" in
  *"-f -") cat > "$STUB_DIR/stdin-$(wc -l < "$STUB_DIR/calls" | tr -d ' ')" ;;
esac
if [ -n "\${STUB_FAIL_MATCH:-}" ] && printf '%s' "$args" | grep -Eq "$STUB_FAIL_MATCH"; then
  failed=$(cat "$STUB_DIR/failed" 2>/dev/null || echo 0)
  if [ "$failed" -lt "\${STUB_FAIL_TIMES:-0}" ]; then
    echo $((failed + 1)) > "$STUB_DIR/failed"
    echo "$STUB_FAIL_MSG" >&2
    exit 1
  fi
fi
case "$args" in
  *"create secret"*) printf 'kind: Secret\\ndata: TOPSECRETVALUE\\n' ;;
  *"get cronjob/"*) echo "cronjob.batch/stub" ;;
  *"get jobs"*"-o json"*)
    if [ -n "\${STUB_JOBS_JSON:-}" ]; then cat "$STUB_JOBS_JSON"; else echo '{"items":[]}'; fi ;;
  *"get job "*"jsonpath"*) printf '%s' "\${STUB_STATUS:-1/}" ;;
esac
exit 0
`;

const SLEEP = `#!/usr/bin/env bash
echo "$1" >> "$STUB_DIR/sleeps"
`;

const TRANSIENT = "Unable to connect to the server: dial tcp 10.0.0.1:31285: i/o timeout";
const SECRETS = {
	DATABASE_URL: "postgres://db",
	BETTER_AUTH_SECRET: "auth",
	R2_ACCESS_KEY_ID: "r2id",
	R2_SECRET_ACCESS_KEY: "r2secret",
	POLAR_ACCESS_TOKEN: "polar",
	POLAR_WEBHOOK_SECRET: "hook",
	SMTP_URL: "smtps://mail",
};

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "staging-script-"));
	mkdirSync(join(dir, "bin"));
	mkdirSync(join(dir, "runner"));
	const stubs: [string, string][] = [
		["kubectl", KUBECTL],
		["sleep", SLEEP],
	];
	for (const [name, body] of stubs) {
		writeFileSync(join(dir, "bin", name), body);
		chmodSync(join(dir, "bin", name), 0o755);
	}
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function run(step: string, env: Record<string, string> = {}) {
	const result = spawnSync("bash", [SCRIPT, step], {
		encoding: "utf8",
		env: {
			PATH: `${join(dir, "bin")}:${process.env.PATH ?? ""}`,
			HOME: process.env.HOME ?? "",
			STUB_DIR: dir,
			RUNNER_TEMP: join(dir, "runner"),
			NAMESPACE: "typelapse-staging",
			GITHUB_RUN_ID: "9",
			GITHUB_RUN_ATTEMPT: "1",
			...env,
		},
	});
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function read(name: string): string {
	try {
		return readFileSync(join(dir, name), "utf8");
	} catch {
		return "";
	}
}

const calls = () => read("calls").split("\n").filter(Boolean);
const sleeps = () => read("sleeps").split("\n").filter(Boolean);
const retries = (stderr: string) => stderr.split("\n").filter((l) => l.includes("retrying in"));

describe("kube(): which failures are retried", () => {
	it("retries a connection error twice, then lets the apply through, and replays the manifest each time", () => {
		const result = run("apply-secrets", {
			...SECRETS,
			STUB_FAIL_MATCH: "apply",
			STUB_FAIL_TIMES: "2",
			STUB_FAIL_MSG: TRANSIENT,
		});

		expect(result.status).toBe(0);
		expect(retries(result.stderr)).toHaveLength(2);
		const applies = calls().filter((c) => c.includes("apply"));
		expect(applies).toHaveLength(3);
		for (const apply of applies) {
			expect(apply).toContain("--server-side");
			expect(apply).toContain("--validate=false");
		}
		// The pipe is empty the second time: every attempt must be handed the manifest.
		for (const index of [2, 3, 4]) {
			expect(read(`stdin-${index}`)).toContain("TOPSECRETVALUE");
		}
		expect(result.stdout + result.stderr).not.toContain("TOPSECRETVALUE");
		expect(sleeps()).toEqual(["2", "4"]);
	});

	it("gives up after five attempts, waiting 2, 4, 8 then 16 seconds", () => {
		const result = run("apply-secrets", {
			...SECRETS,
			STUB_FAIL_MATCH: "apply",
			STUB_FAIL_TIMES: "99",
			STUB_FAIL_MSG: TRANSIENT,
		});

		expect(result.status).not.toBe(0);
		expect(calls().filter((c) => c.includes("apply"))).toHaveLength(5);
		expect(sleeps()).toEqual(["2", "4", "8", "16"]);
		expect(result.stderr).toContain("giving up after 5 attempts");
	});

	it("does not retry a validation error, even one that mentions EOF", () => {
		const result = run("apply-secrets", {
			...SECRETS,
			STUB_FAIL_MATCH: "apply",
			STUB_FAIL_TIMES: "99",
			STUB_FAIL_MSG:
				'Error from server (Invalid): Secret "typelapse-env" is invalid: unexpected EOF in field data',
		});

		expect(result.status).not.toBe(0);
		expect(calls().filter((c) => c.includes("apply"))).toHaveLength(1);
		expect(retries(result.stderr)).toHaveLength(0);
		expect(sleeps()).toEqual([]);
	});

	it("does not retry a refusal such as Forbidden", () => {
		const result = run("rollout", {
			STUB_FAIL_MATCH: "rollout",
			STUB_FAIL_TIMES: "99",
			STUB_FAIL_MSG: "Error from server (Forbidden): deployments.apps is forbidden",
		});

		expect(result.status).not.toBe(0);
		expect(calls().filter((c) => c.includes("rollout"))).toHaveLength(1);
		expect(retries(result.stderr)).toHaveLength(0);
	});

	it.each([
		"Error from server: rpc error: code = Unknown desc = invalid connection",
		"dial tcp 10.0.0.1:31285: i/o timeout",
		"net/http: TLS handshake timeout",
		"dial tcp 10.0.0.1:31285: connect: connection refused",
		"error: unexpected EOF",
	])("retries %s", (message) => {
		const result = run("rollout", {
			STUB_FAIL_MATCH: "rollout",
			STUB_FAIL_TIMES: "1",
			STUB_FAIL_MSG: message,
		});

		expect(result.status).toBe(0);
		expect(retries(result.stderr)).toHaveLength(1);
		expect(calls().filter((c) => c.includes("rollout"))).toHaveLength(2);
	});

	it("does not take a dropped request for a missing CronJob when suspending the workers", () => {
		const result = run("suspend-workers", {
			STUB_FAIL_MATCH: "get cronjob/typelapse-render-worker",
			STUB_FAIL_TIMES: "1",
			STUB_FAIL_MSG: TRANSIENT,
		});

		expect(result.status).toBe(0);
		const patches = calls().filter((c) => c.includes("patch"));
		expect(patches).toHaveLength(2);
	});
});

describe("smoke", () => {
	const job = "smoke-render-worker-9-1";

	it("absorbs a poll the cluster could not answer and carries on", () => {
		const result = run("smoke", {
			STUB_FAIL_MATCH: `get job ${job} `,
			STUB_FAIL_TIMES: "5",
			STUB_FAIL_MSG: "Error from server: rpc error: code = Unknown desc = invalid connection",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`Smoke poll of ${job} failed (1 lost so far), continuing`);
		expect(result.stdout).toContain(`${job} completed`);
		expect(result.stdout).toContain("absorbed: 1");
		expect(retries(result.stderr)).toHaveLength(4);
	});

	it("fails on a Job that reports failure", () => {
		const result = run("smoke", { STUB_STATUS: "0/1" });

		expect(result.status).toBe(1);
		expect(result.stdout).toContain(`::error::${job} failed`);
	});

	it("fails at the deadline and leaves the unfinished Jobs in place", () => {
		const result = run("smoke", { STUB_STATUS: "/", SMOKE_TIMEOUT_SECONDS: "0" });

		expect(result.status).toBe(1);
		expect(result.stdout).toContain("did not finish in 0 s");
		expect(result.stdout).toContain(`Leaving ${job} in place`);
		expect(calls().some((c) => c.includes("delete job"))).toBe(false);
	});

	it("deletes smoke Jobs older than an hour before creating new ones, and only those", () => {
		const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
		const item = (name: string, minutes: number) => ({
			metadata: { name, creationTimestamp: ago(minutes).replace(/\.\d+Z$/, "Z") },
		});
		const jobsFile = join(dir, "jobs.json");
		writeFileSync(
			jobsFile,
			JSON.stringify({
				items: [
					item("smoke-render-worker-1-1", 120),
					item("smoke-deletion-worker-1-1", 61),
					item("smoke-render-worker-8-1", 10),
					item("typelapse-render-worker-29000", 120),
				],
			}),
		);

		const result = run("smoke", { STUB_JOBS_JSON: jobsFile });

		expect(result.status).toBe(0);
		const log = calls();
		const deletes = log.filter((c) => c.includes("delete job"));
		expect(deletes.some((c) => c.includes("smoke-render-worker-1-1"))).toBe(true);
		expect(deletes.some((c) => c.includes("smoke-deletion-worker-1-1"))).toBe(true);
		expect(deletes.some((c) => c.includes("smoke-render-worker-8-1"))).toBe(false);
		expect(deletes.some((c) => c.includes("typelapse-render-worker-29000"))).toBe(false);
		const firstDelete = log.findIndex((c) => c.includes("delete job smoke-render-worker-1-1"));
		const firstCreate = log.findIndex((c) => c.includes("create job"));
		expect(firstDelete).toBeLessThan(firstCreate);
	});
});
