import {
	type CSSProperties,
	type ReactElement,
	type FocusEvent as ReactFocusEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	type Ref,
	cloneElement,
	createContext,
	useContext,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import "./studio-tooltip.css";

type TooltipSide = "top" | "right" | "bottom" | "left";

interface TooltipPlacement {
	readonly left: number;
	readonly top: number;
	readonly side: TooltipSide;
}

const VIEWPORT_PADDING = 10;
const SIDE_OFFSET = 8;

function oppositeSide(side: TooltipSide): TooltipSide {
	if (side === "top") return "bottom";
	if (side === "bottom") return "top";
	if (side === "left") return "right";
	return "left";
}

function sideFits(
	side: TooltipSide,
	anchor: DOMRect,
	tooltip: DOMRect,
	viewportWidth: number,
	viewportHeight: number,
): boolean {
	if (side === "top") return anchor.top - SIDE_OFFSET - tooltip.height >= VIEWPORT_PADDING;
	if (side === "bottom") {
		return anchor.bottom + SIDE_OFFSET + tooltip.height <= viewportHeight - VIEWPORT_PADDING;
	}
	if (side === "left") return anchor.left - SIDE_OFFSET - tooltip.width >= VIEWPORT_PADDING;
	return anchor.right + SIDE_OFFSET + tooltip.width <= viewportWidth - VIEWPORT_PADDING;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function calculatePlacement(
	anchor: DOMRect,
	tooltip: DOMRect,
	preferredSide: TooltipSide,
	viewportWidth: number,
	viewportHeight: number,
): TooltipPlacement {
	const fallback = oppositeSide(preferredSide);
	const side = sideFits(preferredSide, anchor, tooltip, viewportWidth, viewportHeight)
		? preferredSide
		: sideFits(fallback, anchor, tooltip, viewportWidth, viewportHeight)
			? fallback
			: preferredSide;
	let left = anchor.left + (anchor.width - tooltip.width) / 2;
	let top = anchor.top + (anchor.height - tooltip.height) / 2;
	if (side === "top") top = anchor.top - SIDE_OFFSET - tooltip.height;
	if (side === "bottom") top = anchor.bottom + SIDE_OFFSET;
	if (side === "left") left = anchor.left - SIDE_OFFSET - tooltip.width;
	if (side === "right") left = anchor.right + SIDE_OFFSET;
	return {
		side,
		left: clamp(left, VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING - tooltip.width),
		top: clamp(top, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - tooltip.height),
	};
}

function assignRef(ref: Ref<HTMLElement> | undefined, node: HTMLElement | null): void {
	if (typeof ref === "function") {
		ref(node);
		return;
	}
	if (ref) {
		ref.current = node;
	}
}

interface TooltipContextValue {
	readonly activeId: string | null;
	readonly pointerDelay: () => number;
	readonly show: (id: string) => void;
	readonly dismiss: (id: string) => void;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

export interface StudioTooltipProviderProps {
	readonly children: ReactNode;
	readonly delayDuration?: number;
	readonly skipDelayDuration?: number;
}

export function StudioTooltipProvider({
	children,
	delayDuration = 360,
	skipDelayDuration = 480,
}: StudioTooltipProviderProps) {
	const [activeId, setActiveId] = useState<string | null>(null);
	const shownId = useRef<string | null>(null);
	const warmUntil = useRef(0);
	const show = (id: string) => {
		shownId.current = id;
		setActiveId(id);
	};
	const dismiss = (id: string) => {
		if (shownId.current === id) {
			shownId.current = null;
			warmUntil.current = Date.now() + skipDelayDuration;
		}
		setActiveId((current) => (current === id ? null : current));
	};
	return (
		<TooltipContext.Provider
			value={{
				activeId,
				pointerDelay: () => (Date.now() < warmUntil.current ? 0 : delayDuration),
				show,
				dismiss,
			}}
		>
			{children}
		</TooltipContext.Provider>
	);
}

interface TriggerProps {
	readonly "aria-describedby"?: string;
	readonly title?: string;
	readonly disabled?: boolean;
	readonly ref?: Ref<HTMLElement>;
	readonly onFocus?: (event: ReactFocusEvent<HTMLElement>) => void;
	readonly onBlur?: (event: ReactFocusEvent<HTMLElement>) => void;
	readonly onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
	readonly onPointerEnter?: (event: ReactPointerEvent<HTMLElement>) => void;
	readonly onPointerLeave?: (event: ReactPointerEvent<HTMLElement>) => void;
	readonly onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
	readonly onPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void;
	readonly onPointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void;
}

export interface StudioTooltipProps {
	readonly content: ReactNode;
	readonly children: ReactElement<TriggerProps>;
	readonly side?: TooltipSide;
}

export function StudioTooltip({ content, children, side = "top" }: StudioTooltipProps) {
	const context = useContext(TooltipContext);
	if (!context) {
		throw new Error("StudioTooltip must be rendered inside StudioTooltipProvider");
	}
	const reactId = useId();
	const id = `studio-tooltip-${reactId.replaceAll(":", "")}`;
	const open = context.activeId === id;
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const focusFromPointer = useRef(false);
	const triggerRef = useRef<HTMLElement | null>(null);
	const tooltipRef = useRef<HTMLDivElement | null>(null);
	const [placement, setPlacement] = useState<TooltipPlacement | null>(null);
	const cancelPending = () => {
		if (timer.current !== null) {
			clearTimeout(timer.current);
			timer.current = null;
		}
	};
	useEffect(
		() => () => {
			if (timer.current !== null) {
				clearTimeout(timer.current);
			}
		},
		[],
	);
	useLayoutEffect(() => {
		if (!open) {
			return;
		}
		const updatePlacement = () => {
			const trigger = triggerRef.current;
			const tooltip = tooltipRef.current;
			if (!trigger || !tooltip) {
				return;
			}
			setPlacement(
				calculatePlacement(
					trigger.getBoundingClientRect(),
					tooltip.getBoundingClientRect(),
					side,
					window.innerWidth,
					window.innerHeight,
				),
			);
		};
		updatePlacement();
		window.addEventListener("resize", updatePlacement);
		window.addEventListener("scroll", updatePlacement, true);
		const observer =
			typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePlacement);
		if (observer) {
			if (triggerRef.current) observer.observe(triggerRef.current);
			if (tooltipRef.current) observer.observe(tooltipRef.current);
		}
		return () => {
			window.removeEventListener("resize", updatePlacement);
			window.removeEventListener("scroll", updatePlacement, true);
			observer?.disconnect();
		};
	}, [open, side]);
	const describedBy = [children.props["aria-describedby"], open ? id : null]
		.filter(Boolean)
		.join(" ");

	const trigger = cloneElement(children, {
		ref: (node: HTMLElement | null) => {
			triggerRef.current = node;
			assignRef(children.props.ref, node);
		},
		title: undefined,
		"aria-describedby": describedBy || undefined,
		onFocus: (event: ReactFocusEvent<HTMLElement>) => {
			children.props.onFocus?.(event);
			if (focusFromPointer.current) {
				focusFromPointer.current = false;
			} else if (!children.props.disabled) {
				cancelPending();
				context.show(id);
			}
		},
		onBlur: (event: ReactFocusEvent<HTMLElement>) => {
			children.props.onBlur?.(event);
			cancelPending();
			context.dismiss(id);
		},
		onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
			children.props.onKeyDown?.(event);
			if (event.key === "Escape") {
				cancelPending();
				context.dismiss(id);
			}
		},
		onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
			children.props.onPointerEnter?.(event);
			if (event.pointerType === "touch" || children.props.disabled) {
				return;
			}
			cancelPending();
			const delay = context.pointerDelay();
			if (delay === 0) {
				context.show(id);
				return;
			}
			timer.current = setTimeout(() => {
				timer.current = null;
				context.show(id);
			}, delay);
		},
		onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
			children.props.onPointerLeave?.(event);
			cancelPending();
			context.dismiss(id);
		},
		onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
			children.props.onPointerDown?.(event);
			focusFromPointer.current = true;
			cancelPending();
			context.dismiss(id);
		},
		onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
			children.props.onPointerUp?.(event);
			focusFromPointer.current = false;
		},
		onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
			children.props.onPointerCancel?.(event);
			focusFromPointer.current = false;
		},
	});

	return (
		<>
			{trigger}
			{open && typeof document !== "undefined"
				? createPortal(
						<div
							ref={tooltipRef}
							id={id}
							role="tooltip"
							className="studio-tooltip"
							data-side={placement?.side ?? side}
							data-positioned={placement ? "" : undefined}
							style={
								{
									left: placement?.left,
									top: placement?.top,
									visibility: placement ? "visible" : "hidden",
								} as CSSProperties
							}
						>
							{content}
						</div>,
						document.body,
					)
				: null}
		</>
	);
}
