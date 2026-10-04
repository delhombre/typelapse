import { mkdirSync } from "node:fs";
import {
	BucketAlreadyOwnedByYou,
	CreateBucketCommand,
	HeadBucketCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { HOSTED } from "../support/hosted";

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
console.log(`hosted services ready: migrations applied, bucket "${HOSTED.bucket}" present`);
