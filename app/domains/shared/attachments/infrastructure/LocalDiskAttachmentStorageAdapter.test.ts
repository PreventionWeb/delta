import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import type { AttachmentDescriptor } from "~/domains/shared/attachments/application/ports/IAttachmentStoragePort";

import { LocalDiskAttachmentStorageAdapter } from "./LocalDiskAttachmentStorageAdapter.server";

// ---------------------------------------------------------------------------
// Pure unit test against a real (not mocked) temp-filesystem fixture, no DB involved.
// `uploadRoot` (ctor arg) replaces `BASE_UPLOAD_PATH` -- pointing it at a per-test `mkdtemp`
// dir isolates every test from the real `uploads/` tree with no mocking.
//
// Permanent-storage layout (design.md Decision 1: `{uploadRoot}/tenant-{id}/{ownerType}/
// {ownerId}/<file>`) is asserted directly only in the path-traversal scenario below; every
// other scenario goes through the port's own public methods only.
// ---------------------------------------------------------------------------

async function listAllFiles(root: string): Promise<string[]> {
	let entries;
	try {
		entries = await fs.readdir(root, { withFileTypes: true });
	} catch {
		return [];
	}
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listAllFiles(fullPath)));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}
	return files;
}

function makeDescriptor(
	overrides: Partial<AttachmentDescriptor> = {},
): AttachmentDescriptor {
	return {
		tenantId: "tenant-1",
		ownerType: "hazardous-event",
		ownerId: "event-1",
		...overrides,
	};
}

let tempRoot: string;
let adapter: LocalDiskAttachmentStorageAdapter;

beforeEach(async () => {
	tempRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), "delta-attachments-test-"),
	);
	adapter = new LocalDiskAttachmentStorageAdapter(tempRoot);
});

afterEach(async () => {
	// Safe to remove — this directory was created by this test's own beforeEach, never a
	// pre-existing one.
	await fs.rm(tempRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Scenario: Promoting a staged file succeeds
// (specs/shared-attachments-port/spec.md — `promote()` moves a staged file into permanent,
// tenant-scoped storage)
// ---------------------------------------------------------------------------

describe("promote() moves a staged file into permanent, tenant-scoped storage", () => {
	it("moves a staged file to permanent storage, returns a fileKey, and the file is retrievable with matching bytes afterward", async () => {
		const descriptor = makeDescriptor();
		const content = Buffer.from("hello world attachment content");
		const staged = await adapter.stage("tenant-1", {
			name: "report.pdf",
			content,
		});

		const result = await adapter.promote(descriptor, staged);

		expect(result.fileKey).toBeTruthy();
		expect(typeof result.fileKey).toBe("string");
		expect(result.fileSize).toBe(content.byteLength);

		const retrieved = await adapter.retrieve(descriptor, result.fileKey);
		expect(Buffer.compare(retrieved, content)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario: A client-supplied path fragment cannot escape the tenant's own directory
// ---------------------------------------------------------------------------

describe("a client-supplied path-traversal attempt in staged.name cannot escape the tenant's own directory tree", () => {
	it("never creates a file outside the owner's own directory tree, whether promote() resolves or rejects", async () => {
		const descriptor = makeDescriptor({
			tenantId: "tenant-victim",
			ownerType: "hazardous-event",
			ownerId: "event-1",
		});
		const maliciousStaged = { name: "../../other-tenant/secret.pdf" };

		const ownerDir = path.join(
			tempRoot,
			"tenant-tenant-victim",
			"hazardous-event",
			"event-1",
		);

		let settledWithoutThrowing = true;
		try {
			await adapter.promote(descriptor, maliciousStaged);
		} catch {
			// Rejecting a malicious staged reference outright is an acceptable containment
			// strategy too — the assertions below hold regardless of which strategy the
			// adapter uses.
			settledWithoutThrowing = false;
		}

		const allFilesAfter = await listAllFiles(tempRoot);

		// The literal traversal target segment must never appear anywhere on disk.
		const escapedIntoOtherTenant = allFilesAfter.some((filePath) =>
			filePath.split(path.sep).includes("other-tenant"),
		);
		expect(escapedIntoOtherTenant).toBe(false);

		// Nothing was written above tempRoot itself (the strongest possible escape).
		for (const filePath of allFilesAfter) {
			expect(path.resolve(filePath).startsWith(path.resolve(tempRoot))).toBe(
				true,
			);
		}

		// If a file matching the malicious basename exists anywhere, it must live directly
		// inside the legitimate owner directory, never elsewhere.
		const matchingBasename = allFilesAfter.filter(
			(filePath) => path.basename(filePath) === "secret.pdf",
		);
		for (const filePath of matchingBasename) {
			expect(path.dirname(filePath)).toBe(ownerDir);
		}

		// Either outcome is fine; the containment assertions above are what this requires.
		expect(typeof settledWithoutThrowing).toBe("boolean");
	});
});

// ---------------------------------------------------------------------------
// Gate 8 finding: other scenarios target staged.name only -- descriptor fields need direct
// coverage too, since future DE/DR callers may not share HE's own "always a real id" guarantee.
// ---------------------------------------------------------------------------

describe("a malicious descriptor field is rejected, not silently resolved into an unsafe path", () => {
	it.each(["tenant-1/../other", "..", ".", "C:", "D:"])(
		"rejects tenantId = %j",
		async (maliciousTenantId) => {
			const descriptor = makeDescriptor({ tenantId: maliciousTenantId });
			await expect(adapter.delete(descriptor, "file.txt")).rejects.toThrow();
		},
	);

	it.each(["..", ".", "C:"])(
		"rejects ownerType = %j",
		async (maliciousOwnerType) => {
			const descriptor = makeDescriptor({ ownerType: maliciousOwnerType });
			await expect(adapter.delete(descriptor, "file.txt")).rejects.toThrow();
		},
	);

	it.each(["..", ".", "C:"])(
		"rejects ownerId = %j",
		async (maliciousOwnerId) => {
			const descriptor = makeDescriptor({ ownerId: maliciousOwnerId });
			await expect(adapter.delete(descriptor, "file.txt")).rejects.toThrow();
		},
	);
});

// ---------------------------------------------------------------------------
// Scenario: Deleting an existing file removes it
// ---------------------------------------------------------------------------

describe("delete() removes an existing promoted file", () => {
	it("removes a promoted file so a later retrieve() for the same fileKey fails with a not-found-shaped rejection", async () => {
		const descriptor = makeDescriptor();
		const staged = await adapter.stage("tenant-1", {
			name: "to-delete.txt",
			content: Buffer.from("will be deleted"),
		});
		const { fileKey } = await adapter.promote(descriptor, staged);

		await adapter.delete(descriptor, fileKey);

		await expect(adapter.retrieve(descriptor, fileKey)).rejects.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Scenario: Deleting a non-existent file is a no-op, not an error
// ---------------------------------------------------------------------------

describe("delete() of a fileKey that does not exist on disk is idempotent", () => {
	it("resolves successfully without throwing when the fileKey was never promoted", async () => {
		const descriptor = makeDescriptor();

		await expect(
			adapter.delete(descriptor, "never-existed-file-key"),
		).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Scenario: `delete()` never removes files outside the identified file's own path
// ---------------------------------------------------------------------------

describe("delete() only removes the one file identified by fileKey", () => {
	it("leaves other files already promoted under the same owner directory present afterward", async () => {
		const descriptor = makeDescriptor();
		const stagedA = await adapter.stage("tenant-1", {
			name: "keep-me.txt",
			content: Buffer.from("keep this content"),
		});
		const stagedB = await adapter.stage("tenant-1", {
			name: "delete-me.txt",
			content: Buffer.from("delete this content"),
		});
		const resultA = await adapter.promote(descriptor, stagedA);
		const resultB = await adapter.promote(descriptor, stagedB);

		await adapter.delete(descriptor, resultB.fileKey);

		const keptContent = await adapter.retrieve(descriptor, resultA.fileKey);
		expect(keptContent.toString()).toBe("keep this content");
		await expect(
			adapter.retrieve(descriptor, resultB.fileKey),
		).rejects.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Scenario: Two concurrent promotes for the same owner both succeed independently
// ---------------------------------------------------------------------------

describe("concurrent promote() calls for the same owner do not interfere with each other", () => {
	it("resolves both concurrent promote() calls with distinct fileKeys, and both files remain retrievable afterward", async () => {
		const descriptor = makeDescriptor();
		const stagedA = await adapter.stage("tenant-1", {
			name: "concurrent-a.txt",
			content: Buffer.from("content A"),
		});
		const stagedB = await adapter.stage("tenant-1", {
			name: "concurrent-b.txt",
			content: Buffer.from("content B"),
		});

		const [resultA, resultB] = await Promise.all([
			adapter.promote(descriptor, stagedA),
			adapter.promote(descriptor, stagedB),
		]);

		expect(resultA.fileKey).not.toBe(resultB.fileKey);

		const contentA = await adapter.retrieve(descriptor, resultA.fileKey);
		const contentB = await adapter.retrieve(descriptor, resultB.fileKey);
		expect(contentA.toString()).toBe("content A");
		expect(contentB.toString()).toBe("content B");
	});
});

// ---------------------------------------------------------------------------
// Scenario: A concurrent promote and delete for the same owner do not corrupt each other's result
// ---------------------------------------------------------------------------

describe("a concurrent promote() and delete() for the same owner do not corrupt each other's result", () => {
	it("leaves the newly promoted file present and the deleted file absent, with nothing else under that owner affected", async () => {
		const descriptor = makeDescriptor();

		// Precondition only (not concurrent) -- simulates a file already promoted before the
		// concurrent operations under test begin.
		const stagedExisting = await adapter.stage("tenant-1", {
			name: "already-there.txt",
			content: Buffer.from("pre-existing content"),
		});
		const stagedUnrelated = await adapter.stage("tenant-1", {
			name: "unrelated.txt",
			content: Buffer.from("unrelated content"),
		});
		const existingResult = await adapter.promote(descriptor, stagedExisting);
		const unrelatedResult = await adapter.promote(descriptor, stagedUnrelated);

		const stagedNew = await adapter.stage("tenant-1", {
			name: "new-file.txt",
			content: Buffer.from("new content"),
		});

		const [newResult] = await Promise.all([
			adapter.promote(descriptor, stagedNew),
			adapter.delete(descriptor, existingResult.fileKey),
		]);

		const newContent = await adapter.retrieve(descriptor, newResult.fileKey);
		expect(newContent.toString()).toBe("new content");

		await expect(
			adapter.retrieve(descriptor, existingResult.fileKey),
		).rejects.toThrow();

		const unrelatedContent = await adapter.retrieve(
			descriptor,
			unrelatedResult.fileKey,
		);
		expect(unrelatedContent.toString()).toBe("unrelated content");
	});
});

// ---------------------------------------------------------------------------
// Scenario: A staged file can be promoted using the reference `stage()` returned
// ---------------------------------------------------------------------------

describe("stage() writes content to a temp location and returns a reference usable by promote()", () => {
	it("round-trips: a file staged via stage() promotes successfully with matching content", async () => {
		const descriptor = makeDescriptor();
		const content = Buffer.from("staged then promoted content");

		const staged = await adapter.stage("tenant-1", {
			name: "staged-roundtrip.txt",
			content,
		});
		expect(staged.name).toBeTruthy();

		const { fileKey } = await adapter.promote(descriptor, staged);
		const retrieved = await adapter.retrieve(descriptor, fileKey);

		expect(Buffer.compare(retrieved, content)).toBe(0);
	});
});
