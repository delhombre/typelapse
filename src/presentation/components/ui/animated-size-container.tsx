import { useResizeObserver } from "@/presentation/hooks/use-resize-observer";
import { springs } from "@/presentation/motion";
import { motion } from "motion/react";
import { type ComponentPropsWithoutRef, type PropsWithChildren, forwardRef, useRef } from "react";

type AnimatedSizeContainerProps = PropsWithChildren<{
	width?: boolean;
	height?: boolean;
}> &
	Omit<ComponentPropsWithoutRef<typeof motion.div>, "animate" | "children">;

/**
 * A container that springs its width and/or height (each optional) to match its
 * children's measured size, so content that changes size morphs smoothly instead
 * of snapping. Ported from the pattern used across mnemos; uses springs.gentle.
 */
export const AnimatedSizeContainer = forwardRef<HTMLDivElement, AnimatedSizeContainerProps>(
	function AnimatedSizeContainer(
		{ width = false, height = false, className, transition, children, ...rest },
		forwardedRef,
	) {
		const containerRef = useRef<HTMLDivElement>(null);
		const resizeObserverEntry = useResizeObserver(containerRef);

		return (
			<motion.div
				ref={forwardedRef}
				animate={{
					...(width ? { width: resizeObserverEntry?.contentRect?.width ?? "auto" } : {}),
					...(height ? { height: resizeObserverEntry?.contentRect?.height ?? "auto" } : {}),
				}}
				transition={transition ?? springs.gentle}
				className={`overflow-clip ${className ?? ""}`}
				{...rest}
			>
				<div ref={containerRef} className={`${height ? "h-max" : ""} ${width ? "w-max" : ""}`}>
					{children}
				</div>
			</motion.div>
		);
	},
);
