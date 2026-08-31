import "@/presentation/studio-camera.css";
import { MultimediaStudio } from "@/presentation/components/multimedia/multimedia-studio";
import { StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";

/**
 * The scene-first authoring surface uses the same camera-table material and
 * tooltip system as the validated code studio. Keeping it in the Studio chunk
 * also prevents the multimedia runtime from inflating the marketing route.
 */
export function MultimediaRoute() {
	return (
		<StudioTooltipProvider>
			<MultimediaStudio />
		</StudioTooltipProvider>
	);
}
