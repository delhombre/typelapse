export interface HostedProjectReferenceStore {
	load(accountId: string): string | null;
	save(accountId: string, projectId: string): void;
}

interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

function identifier(value: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error("Hosted project reference requires an identifier");
	return normalized;
}

/** Stores only an owner-scoped project id. Documents and media never enter Web Storage. */
export class BrowserHostedProjectReferenceStore implements HostedProjectReferenceStore {
	constructor(private readonly storage: StorageLike = window.localStorage) {}

	private key(accountId: string): string {
		return `typelapse:hosted-project:${encodeURIComponent(identifier(accountId))}`;
	}

	load(accountId: string): string | null {
		try {
			const value = this.storage.getItem(this.key(accountId))?.trim();
			return value || null;
		} catch {
			return null;
		}
	}

	save(accountId: string, projectId: string): void {
		try {
			this.storage.setItem(this.key(accountId), identifier(projectId));
		} catch {}
	}
}
