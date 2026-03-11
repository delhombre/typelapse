export function CornerBrackets({
	className = "border-neutral-500/30 group-hover:border-neutral-300 transition-colors duration-300",
}: { className?: string }) {
	return (
		<>
			<span className={`absolute top-0 left-0 h-2 w-2 border-t border-l ${className}`} />
			<span className={`absolute top-0 right-0 h-2 w-2 border-t border-r ${className}`} />
			<span className={`absolute bottom-0 left-0 h-2 w-2 border-b border-l ${className}`} />
			<span className={`absolute bottom-0 right-0 h-2 w-2 border-b border-r ${className}`} />
		</>
	);
}
