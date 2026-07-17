export interface WorkspaceCreateProps {
	organizationId: string;
	name: string;
}

interface WorkspaceProps {
	id: string;
	organizationId: string;
	name: string;
	snippetIds: readonly string[];
	templateIds: readonly string[];
}

/**
 * A workspace is an organization's shared content context. It curates the
 * organization's shared snippet library and its org templates, referencing
 * the underlying snippet/template aggregates by id. One organization may hold
 * several workspaces; the presentation layer switches the active one.
 */
export class Workspace {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly snippetIds: readonly string[];
	readonly templateIds: readonly string[];

	private constructor(props: WorkspaceProps) {
		this.id = props.id;
		this.organizationId = props.organizationId;
		this.name = props.name;
		this.snippetIds = props.snippetIds;
		this.templateIds = props.templateIds;
	}

	static create(props: WorkspaceCreateProps): Workspace {
		if (!props.organizationId.trim()) {
			throw new Error("Workspace must belong to an organization");
		}
		if (!props.name.trim()) {
			throw new Error("Workspace name must not be empty");
		}
		return new Workspace({
			id: crypto.randomUUID(),
			organizationId: props.organizationId,
			name: props.name,
			snippetIds: [],
			templateIds: [],
		});
	}

	hasSnippet(snippetId: string): boolean {
		return this.snippetIds.includes(snippetId);
	}

	hasTemplate(templateId: string): boolean {
		return this.templateIds.includes(templateId);
	}

	shareSnippet(snippetId: string): Workspace {
		if (!snippetId.trim()) {
			throw new Error("snippetId must not be empty");
		}
		if (this.hasSnippet(snippetId)) {
			throw new Error(`Snippet ${snippetId} is already shared`);
		}
		return new Workspace({ ...this, snippetIds: [...this.snippetIds, snippetId] });
	}

	unshareSnippet(snippetId: string): Workspace {
		if (!this.hasSnippet(snippetId)) {
			throw new Error(`Snippet ${snippetId} is not in the shared library`);
		}
		return new Workspace({
			...this,
			snippetIds: this.snippetIds.filter((id) => id !== snippetId),
		});
	}

	addTemplate(templateId: string): Workspace {
		if (!templateId.trim()) {
			throw new Error("templateId must not be empty");
		}
		if (this.hasTemplate(templateId)) {
			throw new Error(`Template ${templateId} already exists`);
		}
		return new Workspace({ ...this, templateIds: [...this.templateIds, templateId] });
	}

	removeTemplate(templateId: string): Workspace {
		if (!this.hasTemplate(templateId)) {
			throw new Error(`Template ${templateId} does not exist`);
		}
		return new Workspace({
			...this,
			templateIds: this.templateIds.filter((id) => id !== templateId),
		});
	}

	rename(name: string): Workspace {
		if (!name.trim()) {
			throw new Error("Workspace name must not be empty");
		}
		return new Workspace({ ...this, name });
	}
}
