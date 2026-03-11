import { AnimatePresence, motion } from "motion/react";

interface SnippetPreviewProps {
	frames: string[];
	currentFrame: number;
	background: string;
}

export function SnippetPreview({ frames, currentFrame, background }: SnippetPreviewProps) {
	const html = frames[currentFrame] ?? "";

	return (
		<div className="relative overflow-hidden rounded-xl" style={{ background }}>
			<AnimatePresence mode="wait">
				<motion.div
					key={currentFrame}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.3 }}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is trusted
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			</AnimatePresence>
		</div>
	);
}
