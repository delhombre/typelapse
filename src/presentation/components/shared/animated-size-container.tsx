import { useResizeObserver } from "@/presentation/hooks/use-resize-observer";
import { springs } from "@/presentation/motion";
import { motion } from "motion/react";
import {
	type ComponentPropsWithoutRef,
	type ForwardRefExoticComponent,
	type PropsWithChildren,
	type RefAttributes,
	forwardRef,
	useRef,
} from "react";

type AnimatedSizeContainerProps = PropsWithChildren<{
	width?: boolean;
	height?: boolean;
}> &
	Omit<ComponentPropsWithoutRef<typeof motion.div>, "animate" | "children">;

const AnimatedSizeContainer: ForwardRefExoticComponent<
	AnimatedSizeContainerProps & RefAttributes<HTMLDivElement>
> = forwardRef<HTMLDivElement, AnimatedSizeContainerProps>(
	(
		{
			width = false,
			height = false,
			className,
			transition,
			children,
			...rest
		}: AnimatedSizeContainerProps,
		forwardedRef,
	) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const resizeObserverEntry = useResizeObserver(containerRef);

		return (
			<motion.div
				animate={{
					width: width ? (resizeObserverEntry?.contentRect?.width ?? "auto") : "auto",
					height: height ? (resizeObserverEntry?.contentRect?.height ?? "auto") : "auto",
				}}
				className={`overflow-clip ${className ?? ""}`}
				ref={forwardedRef}
				transition={transition ?? springs.gentle}
				{...rest}
			>
				<div className={`${height ? "h-max" : ""} ${width ? "w-max" : ""}`} ref={containerRef}>
					{children}
				</div>
			</motion.div>
		);
	},
);

AnimatedSizeContainer.displayName = "AnimatedSizeContainer";

export { AnimatedSizeContainer };
