/**
 * Raw, pre-resolution attachment shape from `parseHazardousEventFormData.server.ts`, consumed
 * by `resolveAttachmentsForWrite.ts` -- distinct from `HazardousEventAttachmentProps` because a
 * new File item has no `fileKey`/`fileSize` until `promote()` runs inside the write transaction
 * (design.md Decision 7). `existingFile` vs `newFile` is the staged-vs-already-promoted split
 * (a staged file's `file.name` has a `/temp/` segment; a promoted one doesn't).
 */
export type HazardousEventAttachmentInput =
	| {
			readonly kind: "link";
			readonly id: string;
			readonly title: string;
			readonly tag: ReadonlyArray<{ id: string; name: string }> | null;
			readonly url: string;
	  }
	| {
			readonly kind: "existingFile";
			readonly id: string;
			readonly title: string;
			readonly tag: ReadonlyArray<{ id: string; name: string }> | null;
			/** Matched against an existing row's `fileKey` -- the resolver carries that row's
			 * `fileName`/`fileType`/`fileSize` forward unchanged; the file itself was not
			 * re-uploaded this submission. */
			readonly fileKey: string;
	  }
	| {
			readonly kind: "newFile";
			readonly id: string;
			readonly title: string;
			readonly tag: ReadonlyArray<{ id: string; name: string }> | null;
			/** Basename of the staged file in temp storage, as `stage()` named it (uuid-prefixed) --
			 * passed to `promote()` as-is. */
			readonly stagedFileName: string;
			readonly contentType: string;
	  };
