import type {
	CloudExportPort,
	CloudRenderJob,
	CloudRenderRequest,
} from "@/domain/ports/cloud-export.port";

/**
 * Client for the hosted render service. The backend is currently a stub
 * (`/api/cloud/*`) that acknowledges jobs without rendering; the hosted render
 * fleet is not built yet.
 */
export class CloudRenderAdapter implements CloudExportPort {
	constructor(private readonly baseUrl: string = "/api/cloud") {}

	async submitRender(request: CloudRenderRequest): Promise<CloudRenderJob> {
		const res = await fetch(`${this.baseUrl}/render`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				// Placeholder entitlement: a real impl sends a signed session token
				// and the server verifies the subscription; never trust this header.
				"x-typelapse-plan": "pro",
			},
			body: JSON.stringify(request),
		});
		if (!res.ok) {
			const err = (await res.json().catch(() => null)) as { error?: string } | null;
			throw new Error(err?.error ?? `Cloud render failed (${res.status})`);
		}
		return (await res.json()) as CloudRenderJob;
	}

	async getJob(jobId: string): Promise<CloudRenderJob> {
		const res = await fetch(`${this.baseUrl}/jobs/${jobId}`);
		if (!res.ok) {
			throw new Error(`Job lookup failed (${res.status})`);
		}
		return (await res.json()) as CloudRenderJob;
	}
}
