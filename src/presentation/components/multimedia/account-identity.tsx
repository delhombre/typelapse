/** The account as a mark: up to two initials of its name, "A" when it has none. */
export function initials(name: string): string {
	const letters = name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");
	return letters || "A";
}

/** The person, as the trigger shows them: the same initials, one size up, with the address. */
export function AccountIdentity({
	name,
	email,
	headingId,
}: {
	readonly name: string;
	readonly email: string;
	readonly headingId?: string;
}) {
	return (
		<div className="mm-account-identity">
			<span className="mm-account-avatar" aria-hidden="true">
				{initials(name)}
			</span>
			<div>
				<h2 id={headingId}>{name}</h2>
				<p>{email}</p>
			</div>
		</div>
	);
}
