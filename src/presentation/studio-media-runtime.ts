import {
	BrowserObjectUrlSceneAssetSourceFactory,
	createBrowserLocalMediaImporter,
} from "@/infrastructure/assets/browser-local-media-importer";
import { createSceneAssetSourceRegistry } from "@/infrastructure/assets/scene-asset-source.registry";
import { IndexedDbLocalProjectAdapter } from "@/infrastructure/project/indexeddb-local-project.adapter";

export const studioMediaRegistry = createSceneAssetSourceRegistry();
export const studioMediaSourceFactory = new BrowserObjectUrlSceneAssetSourceFactory();
export const studioLocalLibrary = new IndexedDbLocalProjectAdapter({
	databaseName: "typelapse-studio-media",
});
export const studioMediaImporter = createBrowserLocalMediaImporter({
	registry: studioMediaRegistry,
	sourceFactory: studioMediaSourceFactory,
});
