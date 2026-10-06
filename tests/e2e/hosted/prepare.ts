import { mkdirSync, writeFileSync } from "node:fs";
import {
	BucketAlreadyOwnedByYou,
	CreateBucketCommand,
	HeadBucketCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { createPolar } from "@polar-sh/sdk/2026-10";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { ensureCreatorProducts } from "../../../scripts/polar-sandbox-products";
import { HOSTED } from "../support/hosted";
import { POLAR_E2E } from "../support/polar";

/**
 * Bring empty services to the state the hosted API expects: every migration
 * applied, the bucket created. Safe to run again on services that already
 * have both, so the API's start command can always run it first.
 */

const pool = new pg.Pool({ connectionString: HOSTED.databaseUrl });
try {
	// The same journal drizzle-kit migrate writes, so the two never disagree.
	await migrate(drizzle(pool), { migrationsFolder: "server/db/migrations" });
} finally {
	await pool.end();
}

// TLS is verified against NODE_EXTRA_CA_CERTS, exactly as the API does it.
const storage = new S3Client({
	region: "auto",
	endpoint: HOSTED.storageUrl,
	forcePathStyle: true,
	credentials: { accessKeyId: HOSTED.accessKeyId, secretAccessKey: HOSTED.secretAccessKey },
});
try {
	await storage.send(new HeadBucketCommand({ Bucket: HOSTED.bucket }));
} catch {
	try {
		await storage.send(new CreateBucketCommand({ Bucket: HOSTED.bucket }));
	} catch (error) {
		if (!(error instanceof BucketAlreadyOwnedByYou)) throw error;
	}
}

mkdirSync(`${HOSTED.state}/render-tmp`, { recursive: true });

// Against the sandbox the two Creator products are found by name, or made, and
// their ids handed to the API through a file it reads at start. Otherwise the file
// is empty: the double's ids are in the API's environment already.
const productLines: string[] = [];
if (POLAR_E2E.mode === "sandbox" && POLAR_E2E.sandboxToken) {
	try {
		const ids = await ensureCreatorProducts(
			createPolar({ accessToken: POLAR_E2E.sandboxToken, environment: "sandbox" }),
		);
		productLines.push(
			`POLAR_CREATOR_MONTHLY_PRODUCT_ID=${ids.monthly}`,
			`POLAR_CREATOR_ANNUAL_PRODUCT_ID=${ids.annual}`,
		);
	} catch (error) {
		// A token the sandbox refuses must not take every other journey down: billing
		// stays off and the billing journey skips, saying why.
		console.warn(
			`Polar sandbox products not ready, billing stays off: ${error instanceof Error ? error.message : error}`,
		);
	}
}
writeFileSync(POLAR_E2E.productsEnvFile, `${productLines.join("\n")}\n`);
console.log(`hosted services ready: migrations applied, bucket "${HOSTED.bucket}" present`);
