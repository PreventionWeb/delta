import "../setup";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hazardousEventAttachmentTable } from "~/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { seedHazardousEvent } from "../models/hazardousEventTestHelpers";

// Reshaped table (ca-shared-attachments-module, design.md Decisions 2-4; spec.md
// "hazardous_event_attachment table shape" + "Attachment field population matches its type").
interface AttachmentFields {
	hazardousEventId: string;
	title: string;
	type: "File" | "Link";
	url: string | null;
	tag: Array<{ id: string; name: string }> | null;
	fileKey: string | null;
	fileName: string | null;
	fileType: string | null;
	fileSize: number | null;
}
type AttachmentOverrides = Partial<AttachmentFields>;

// Must match the table's own check-constraint name.
const TYPE_CHECK_CONSTRAINT = "hazardous_event_attachment_type_check";

const FILE_COLUMNS = ["fileKey", "fileName", "fileType", "fileSize"] as const;
type FileColumn = (typeof FILE_COLUMNS)[number];

// Stale values used only to prove the check constraint rejects a Link row carrying any one
// leftover file field -- values themselves are arbitrary.
const STALE_FILE_VALUES: Record<FileColumn, string | number> = {
	fileKey: "stale/leftover.pdf",
	fileName: "leftover.pdf",
	fileType: "application/pdf",
	fileSize: 2048,
};

function baseFileAttachment(
	hazardousEventId: string,
	overrides: AttachmentOverrides = {},
) {
	return {
		hazardousEventId,
		title: "Report",
		type: "File" as const,
		fileKey: "reports/1.pdf",
		fileName: "1.pdf",
		fileType: "application/pdf",
		fileSize: 1024,
		url: null,
		tag: null,
		...overrides,
	};
}

function baseLinkAttachment(
	hazardousEventId: string,
	overrides: AttachmentOverrides = {},
) {
	return {
		hazardousEventId,
		title: "Report",
		type: "Link" as const,
		url: "https://example.com/report",
		fileKey: null,
		fileName: null,
		fileType: null,
		fileSize: null,
		tag: null,
		...overrides,
	};
}

describe("hazardousEventAttachmentTable", () => {
	it("inserts a valid File-type attachment with url and tag omitted", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		const [row] = await dr
			.insert(hazardousEventAttachmentTable)
			.values(baseFileAttachment(hazardousEventId))
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.hazardousEventId).toBe(hazardousEventId);
		expect(row.title).toBe("Report");
		expect(row.type).toBe("File");
		expect(row.fileKey).toBe("reports/1.pdf");
		expect(row.fileName).toBe("1.pdf");
		expect(row.fileType).toBe("application/pdf");
		expect(row.fileSize).toBe(1024);
		expect(row.url).toBeNull();
	});

	it("inserts a valid Link-type attachment with file columns omitted", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		const [row] = await dr
			.insert(hazardousEventAttachmentTable)
			.values(baseLinkAttachment(hazardousEventId))
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.type).toBe("Link");
		expect(row.url).toBe("https://example.com/report");
		expect(row.fileKey).toBeNull();
		expect(row.fileName).toBeNull();
		expect(row.fileType).toBeNull();
		expect(row.fileSize).toBeNull();
	});

	it("round-trips tag as a JSON array of {id, name} objects", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();
		const tag = [
			{ id: "t1", name: "Flood" },
			{ id: "t2", name: "Urgent" },
		];

		const [row] = await dr
			.insert(hazardousEventAttachmentTable)
			.values(baseFileAttachment(hazardousEventId, { tag }))
			.returning();

		expect(row.tag).toEqual(tag);
	});

	it("allows title = '' as a valid value", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		const [row] = await dr
			.insert(hazardousEventAttachmentTable)
			.values(baseFileAttachment(hazardousEventId, { title: "" }))
			.returning();

		expect(row.title).toBe("");
	});

	it("rejects an insert with title = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventAttachmentTable).values(
				baseFileAttachment(hazardousEventId, {
					// @ts-expect-error - title is required; verifying the not-null constraint
					title: null,
				}),
			),
		).rejects.toMatchObject({
			cause: expect.objectContaining({ code: "23502", column: "title" }),
		});
	});

	it("rejects an insert with type = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventAttachmentTable).values(
				baseFileAttachment(hazardousEventId, {
					// @ts-expect-error - type is required; verifying the not-null constraint
					type: null,
				}),
			),
		).rejects.toMatchObject({
			cause: expect.objectContaining({ code: "23502", column: "type" }),
		});
	});

	describe("Attachment field population matches its type (check constraint)", () => {
		it.each(FILE_COLUMNS)(
			"rejects a File-type row with %s = NULL",
			async (column) => {
				const { id: hazardousEventId } = await seedHazardousEvent();

				await expect(
					dr
						.insert(hazardousEventAttachmentTable)
						.values(baseFileAttachment(hazardousEventId, { [column]: null })),
				).rejects.toMatchObject({
					cause: expect.objectContaining({
						code: "23514",
						constraint: TYPE_CHECK_CONSTRAINT,
					}),
				});
			},
		);

		it("rejects a File-type row with all file columns populated and a non-null url", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();

			await expect(
				dr.insert(hazardousEventAttachmentTable).values(
					baseFileAttachment(hazardousEventId, {
						url: "https://example.com/stale-link",
					}),
				),
			).rejects.toMatchObject({
				cause: expect.objectContaining({
					code: "23514",
					constraint: TYPE_CHECK_CONSTRAINT,
				}),
			});
		});

		it("rejects a Link-type row with url = NULL", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();

			await expect(
				dr
					.insert(hazardousEventAttachmentTable)
					.values(baseLinkAttachment(hazardousEventId, { url: null })),
			).rejects.toMatchObject({
				cause: expect.objectContaining({
					code: "23514",
					constraint: TYPE_CHECK_CONSTRAINT,
				}),
			});
		});

		it.each(FILE_COLUMNS)(
			"rejects a Link-type row with url populated and %s also non-null",
			async (column) => {
				const { id: hazardousEventId } = await seedHazardousEvent();

				await expect(
					dr.insert(hazardousEventAttachmentTable).values(
						baseLinkAttachment(hazardousEventId, {
							[column]: STALE_FILE_VALUES[column],
						}),
					),
				).rejects.toMatchObject({
					cause: expect.objectContaining({
						code: "23514",
						constraint: TYPE_CHECK_CONSTRAINT,
					}),
				});
			},
		);
	});

	it("stores fileSize values beyond the 32-bit integer range on a File-type row", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		const [row] = await dr
			.insert(hazardousEventAttachmentTable)
			.values(baseFileAttachment(hazardousEventId, { fileSize: 5000000000 }))
			.returning();

		expect(row.fileSize).toBe(5000000000);
	});

	it("defaults createdAt and updatedAt when omitted", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		const [row] = await dr
			.insert(hazardousEventAttachmentTable)
			.values(baseFileAttachment(hazardousEventId))
			.returning();

		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("rejects an insert with hazardousEventId = NULL", async () => {
		await expect(
			dr.insert(hazardousEventAttachmentTable).values(
				baseFileAttachment(
					// @ts-expect-error - hazardousEventId is required; verifying the not-null constraint
					null,
				),
			),
		).rejects.toMatchObject({
			cause: expect.objectContaining({
				code: "23502",
				column: "hazardous_event_id",
			}),
		});
	});

	it("rejects an insert whose hazardousEventId matches no hazardous_event row", async () => {
		await expect(
			dr
				.insert(hazardousEventAttachmentTable)
				.values(baseFileAttachment(crypto.randomUUID())),
		).rejects.toMatchObject({
			cause: expect.objectContaining({ code: "23503" }),
		});
	});

	describe("multiple attachments per event", () => {
		it("allows a File-type and a Link-type attachment for the same event", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();

			const [fileRow] = await dr
				.insert(hazardousEventAttachmentTable)
				.values(baseFileAttachment(hazardousEventId, { fileKey: "a.pdf" }))
				.returning();
			const [linkRow] = await dr
				.insert(hazardousEventAttachmentTable)
				.values(
					baseLinkAttachment(hazardousEventId, {
						url: "https://example.com/b",
					}),
				)
				.returning();

			const rows = await dr
				.select({ id: hazardousEventAttachmentTable.id })
				.from(hazardousEventAttachmentTable)
				.where(
					eq(hazardousEventAttachmentTable.hazardousEventId, hazardousEventId),
				);

			expect(rows.map((r) => r.id).sort()).toEqual(
				[fileRow.id, linkRow.id].sort(),
			);
		});

		it("allows two concurrent File-type inserts under the same event with different fileKey values", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();

			const outcomes = await Promise.all([
				dr
					.insert(hazardousEventAttachmentTable)
					.values(baseFileAttachment(hazardousEventId, { fileKey: "c.pdf" }))
					.returning()
					.then(
						() => "fulfilled" as const,
						() => "rejected" as const,
					),
				dr
					.insert(hazardousEventAttachmentTable)
					.values(baseFileAttachment(hazardousEventId, { fileKey: "d.pdf" }))
					.returning()
					.then(
						() => "fulfilled" as const,
						() => "rejected" as const,
					),
			]);

			expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
		});
	});

	describe("cascade-delete behaviour", () => {
		it("deleting the referenced hazardous event cascades and removes attachment rows", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();
			const [inserted] = await dr
				.insert(hazardousEventAttachmentTable)
				.values(baseFileAttachment(hazardousEventId))
				.returning({ id: hazardousEventAttachmentTable.id });

			await dr
				.delete(hazardousEventTable)
				.where(eq(hazardousEventTable.id, hazardousEventId));

			const remaining = await dr
				.select({ id: hazardousEventAttachmentTable.id })
				.from(hazardousEventAttachmentTable)
				.where(eq(hazardousEventAttachmentTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});
	});
});
