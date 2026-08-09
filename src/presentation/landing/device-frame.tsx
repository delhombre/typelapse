import type { CSSProperties, ReactNode } from "react";

/**
 * A realistic iPhone 17 Pro Max shell, presentation-only. It draws the titanium
 * bezel, the concentric rounded corners, the Dynamic Island and the side buttons
 * around whatever screen content it is given, so the screen (the cycling social
 * feed) can stay a clean, full-bleed layer. All hardware chrome is decorative and
 * marked aria-hidden; the caller labels the device as a whole.
 */

/** Bezel thickness in px. Outer radius minus this gives a truly concentric inner. */
const BEZEL = 11;
/** Outer titanium-frame corner radius. Big and soft, Apple-product-shot round. */
const OUTER_RADIUS = 57;
/** Screen corner radius: OUTER_RADIUS - BEZEL, so frame and screen nest exactly. */
const INNER_RADIUS = OUTER_RADIUS - BEZEL;

/** Dynamic Island pill: a solid black notch floating just below the top bezel. */
const ISLAND_WIDTH = "34%";
const ISLAND_HEIGHT = 26;
const ISLAND_TOP = 10;

/** Brushed-titanium metal, a soft diagonal sheen so the frame catches light. */
const TITANIUM =
	"linear-gradient(150deg, #56565a 0%, #303032 16%, #1b1b1d 48%, #262628 78%, #4c4c50 100%)";

/** Darker metal for the physical side buttons. */
const BUTTON_METAL = "linear-gradient(180deg, #3a3a3d 0%, #1a1a1c 55%, #2c2c2e 100%)";

/** Premium drop shadow plus a bright 1px inner top edge (light on the metal). */
const DEVICE_SHADOW = [
	"0 2px 6px -2px rgb(0 0 0 / 0.5)",
	"0 30px 60px -20px rgb(0 0 0 / 0.65)",
	"0 60px 120px -30px rgb(0 0 0 / 0.7)",
	"inset 0 1.5px 0 rgb(255 255 255 / 0.45)",
	"inset 0 -1px 1px rgb(0 0 0 / 0.5)",
].join(", ");

interface SideButton {
	/** Distance from the top of the device, as a fraction of its height. */
	top: string;
	/** Button length in px. */
	height: number;
}

/** Left edge: action button, then the two volume pills (top to bottom). */
const LEFT_BUTTONS: SideButton[] = [
	{ top: "20%", height: 24 },
	{ top: "29%", height: 42 },
	{ top: "37.5%", height: 42 },
];
/** Right edge: one longer power / side button. */
const RIGHT_BUTTONS: SideButton[] = [{ top: "27%", height: 74 }];

function sideButtonStyle(button: SideButton, side: "left" | "right"): CSSProperties {
	return {
		position: "absolute",
		top: button.top,
		height: button.height,
		width: 3,
		[side]: -2,
		borderRadius: 3,
		background: BUTTON_METAL,
		boxShadow: "0 1px 2px rgb(0 0 0 / 0.5), inset 0 1px 0 rgb(255 255 255 / 0.15)",
	};
}

interface DeviceFrameProps {
	children: ReactNode;
	/** Accessible label for the whole device (the screen content stays hidden). */
	ariaLabel: string;
	className?: string;
	style?: CSSProperties;
}

export function DeviceFrame({ children, ariaLabel, className = "", style }: DeviceFrameProps) {
	return (
		<div
			role="img"
			aria-label={ariaLabel}
			className={`relative w-full ${className}`}
			style={{
				maxWidth: 320,
				aspectRatio: "9 / 19.5",
				borderRadius: OUTER_RADIUS,
				background: TITANIUM,
				boxShadow: DEVICE_SHADOW,
				padding: BEZEL,
				...style,
			}}
		>
			{/* Physical side buttons, drawn on the bezel edges for realism. */}
			{LEFT_BUTTONS.map((button) => (
				<span key={`l-${button.top}`} aria-hidden style={sideButtonStyle(button, "left")} />
			))}
			{RIGHT_BUTTONS.map((button) => (
				<span key={`r-${button.top}`} aria-hidden style={sideButtonStyle(button, "right")} />
			))}

			{/* The screen: a black, clipped, concentric well the feed content fills. */}
			<div
				aria-hidden
				className="relative h-full w-full overflow-hidden"
				style={{
					borderRadius: INNER_RADIUS,
					background: "#000",
					boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.9)",
				}}
			>
				{children}

				{/* Dynamic Island: solid black pill on top of the feed content. */}
				<div
					className="absolute left-1/2 flex items-center justify-end"
					style={{
						top: ISLAND_TOP,
						width: ISLAND_WIDTH,
						height: ISLAND_HEIGHT,
						transform: "translateX(-50%)",
						borderRadius: 999,
						background: "#000",
						boxShadow: "inset 0 0 1px 1px rgb(255 255 255 / 0.04)",
						zIndex: 30,
					}}
				>
					{/* A whisper of a camera lens at the right of the island. */}
					<span
						style={{
							width: 7,
							height: 7,
							marginRight: 9,
							borderRadius: 999,
							background: "radial-gradient(circle at 35% 30%, #26323d 0%, #05070a 70%)",
							boxShadow: "inset 0 0 1px rgb(90 130 170 / 0.5)",
						}}
					/>
				</div>
			</div>
		</div>
	);
}
