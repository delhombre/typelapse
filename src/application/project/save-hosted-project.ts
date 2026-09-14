import type {
	HostedProjectApiOptions,
	HostedProjectApiPort,
	HostedProjectRecord,
} from "./hosted-project-api.port";
import type { ProjectDocumentV2 } from "./project-document";

export type HostedProjectSaveTarget =
	| { readonly kind: "create" }
	| {
			readonly kind: "update";
			readonly id: string;
			readonly expectedRevision: number;
	  };

export interface SaveHostedProjectInput {
	readonly document: ProjectDocumentV2;
	readonly target: HostedProjectSaveTarget;
}

export type SaveHostedProjectResult =
	| {
			readonly outcome: "saved";
			readonly operation: "created" | "updated";
			readonly project: HostedProjectRecord;
	  }
	| { readonly outcome: "conflict"; readonly currentRevision: number }
	| { readonly outcome: "not-found" };

export interface HostedProjectSaver {
	execute(
		input: SaveHostedProjectInput,
		options?: HostedProjectApiOptions,
	): Promise<SaveHostedProjectResult>;
}

/** Chooses one hosted write. Conflicts stay explicit and are never retried implicitly. */
export function createHostedProjectSaver(api: HostedProjectApiPort): HostedProjectSaver {
	return {
		async execute(input, options = {}) {
			if (input.target.kind === "create") {
				const project = await api.create(input.document, options);
				return { outcome: "saved", operation: "created", project };
			}
			const result = await api.update(
				{
					id: input.target.id,
					expectedRevision: input.target.expectedRevision,
					document: input.document,
				},
				options,
			);
			if (result.outcome === "updated") {
				return { outcome: "saved", operation: "updated", project: result.project };
			}
			return result;
		},
	};
}
