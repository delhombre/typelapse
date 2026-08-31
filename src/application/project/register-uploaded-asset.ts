import { Asset } from "../../domain/entities/asset";
import type { Project } from "../../domain/entities/project";
import type { UploadedPrivateMedia } from "../assets/upload-private-media";

/**
 * Attach only the durable identity and canonical metadata to the project.
 * Signed GET access remains an ephemeral preview concern and never crosses the
 * aggregate or serialization boundary.
 */
export function registerUploadedAsset(project: Project, uploaded: UploadedPrivateMedia): Project {
	if (uploaded.asset.status !== "ready") {
		throw new Error("Uploaded asset is not ready");
	}
	if (uploaded.asset.projectId !== project.id) {
		throw new Error("Uploaded asset belongs to another project");
	}
	return project.registerAsset(Asset.create({ id: uploaded.asset.id, ...uploaded.asset.metadata }));
}
