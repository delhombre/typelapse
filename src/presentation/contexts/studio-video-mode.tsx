import { type ReactNode, createContext, useContext } from "react";

const StudioVideoModeContext = createContext(false);

/** Presentation-only signal: desktop frames the whole export canvas, mobile keeps the compact card. */
export function StudioVideoModeProvider({
	active,
	children,
}: {
	active: boolean;
	children: ReactNode;
}) {
	return <StudioVideoModeContext value={active}>{children}</StudioVideoModeContext>;
}

export function useStudioVideoMode(): boolean {
	return useContext(StudioVideoModeContext);
}
