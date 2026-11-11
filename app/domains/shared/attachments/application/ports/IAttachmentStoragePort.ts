/** Identifies where a promoted/deleted/retrieved file lives — always server-derived, never
 * built from client-supplied path fragments (design.md Decision 1). */
export interface AttachmentDescriptor {
	readonly tenantId: string;
	/** e.g. "hazardous-event" — matches legacy's existing on-disk directory segment. */
	readonly ownerType: string;
	readonly ownerId: string;
}

export interface StagedFileReference {
	/** Sanitized basename only, never a path — the file as it exists in temp storage. */
	readonly name: string;
}

/** Confirmed extension beyond Decision 3's literal `{fileKey}` sketch: `fileSize` -- nothing
 * else in the system ever carries a size, and `retrieve()` has no production caller this change
 * (Decision 3), so `promote()`'s own `fs.stat` after the move is the only source. `fileName` --
 * the original, pre-staging display name -- moved here from an application-layer regex decoding
 * the adapter's own `{uuid}__{basename}` staging convention (Gate 5/SOLID finding: that regex
 * was an application-layer dependency on a concrete adapter's internal format, not the port's
 * contract). */
export interface PromoteResult {
	readonly fileKey: string;
	readonly fileSize: number;
	readonly fileName: string;
}

export interface IAttachmentStoragePort {
	/** Writes `file.content` to a temporary, tenant-scoped location and returns a reference
	 * usable by a later `promote()` call. */
	stage(
		tenantId: string,
		file: { name: string; content: Buffer },
	): Promise<StagedFileReference>;

	/** Moves `staged` into permanent, tenant-and-owner-scoped storage. The resulting path is
	 * derived solely from `descriptor` and `staged.name` -- never from a client-supplied path
	 * fragment (design.md Decision 1). */
	promote(
		descriptor: AttachmentDescriptor,
		staged: StagedFileReference,
	): Promise<PromoteResult>;

	/** Idempotent -- deleting a `fileKey` that does not exist on disk resolves without throwing. */
	delete(descriptor: AttachmentDescriptor, fileKey: string): Promise<void>;

	retrieve(descriptor: AttachmentDescriptor, fileKey: string): Promise<Buffer>;
}
