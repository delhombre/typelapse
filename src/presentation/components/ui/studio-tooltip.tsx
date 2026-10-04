import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { createContext, useContext } from "react";
import type { ReactElement, ReactNode } from "react";

const StudioTooltipProviderContext = createContext(false);

const providerProps = {
	delayDuration: 0,
	skipDelayDuration: 180,
	disableHoverableContent: true,
} as const;

export function StudioTooltipProvider({ children }: { children: ReactNode }) {
	return (
		<StudioTooltipProviderContext.Provider value>
			<TooltipPrimitive.Provider {...providerProps}>{children}</TooltipPrimitive.Provider>
		</StudioTooltipProviderContext.Provider>
	);
}

export function StudioTooltip({
	content,
	children,
	side = "top",
	className,
}: {
	content: ReactNode;
	children: ReactElement;
	side?: "top" | "right" | "bottom" | "left";
	className?: string;
}) {
	const hasSharedProvider = useContext(StudioTooltipProviderContext);
	const tooltip = (
		<TooltipPrimitive.Root>
			<TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
			<TooltipPrimitive.Portal>
				<TooltipPrimitive.Content
					side={side}
					sideOffset={8}
					collisionPadding={12}
					className={["studio-tooltip", className].filter(Boolean).join(" ")}
				>
					{content}
				</TooltipPrimitive.Content>
			</TooltipPrimitive.Portal>
		</TooltipPrimitive.Root>
	);

	if (hasSharedProvider) {
		return tooltip;
	}

	// Components stay independently renderable in tests, stories and embedded
	// surfaces. The app-level provider still coordinates the full studio.
	return <TooltipPrimitive.Provider {...providerProps}>{tooltip}</TooltipPrimitive.Provider>;
}
