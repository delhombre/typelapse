import { cloudIntentFrom } from "@/application/billing/cloud-intent";

/**
 * Read the Cloud intent this page was opened with (`/app#cloud`) and consume it
 * in the same breath, as `takeImportIntent` does for its hash: the hash is
 * scrubbed before returning, because under StrictMode the mounting effect runs
 * twice and an intent that survived the first read would open the sheet twice.
 * Any other hash is left alone, it belongs to another reader.
 */
export function takeCloudIntent(): boolean {
	if (cloudIntentFrom(window.location.hash) === null) {
		return false;
	}
	history.replaceState(null, "", window.location.pathname + window.location.search);
	return true;
}
