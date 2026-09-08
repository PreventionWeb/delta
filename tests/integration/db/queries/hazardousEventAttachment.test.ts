import "../setup";
import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import {
	hazardousEventAttachmentTable,
	InsertHazardousEventAttachment,
} from "~/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { seedHazardousEvent } from "../models/hazardousEventTestHelpers";

function baseAttachment(
	hazardousEventId: string,
	overrides: Partial<InsertHazardousEventAttachment> = {},
) {
	return {
		hazardousEventId,
		title: "Report",
		fileKey: "reports/1.pdf",
		fileName: "1.pdf",
		fileType: "application/pdf",
		fileSize: 1024,
		...overrides,
	};
}

describe("hazardousEventAttachmentTable", () => {
	it("inserts a valid attachment under an existing hazardous event", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		const [row] = await dr
			.insert(hazardousEventAttachmentTable)
			.values(baseAttachment(hazardousEventId))
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.hazardousEventId).toBe(hazardousEventId);
		expect(row.title).toBe("Report");
		expect(row.fileKey).toBe("reports/1.pdf");
		expect(row.fileName).toBe("1.pdf");
		expect(row.fileType).toBe("application/pdf");
		expect(row.fileSize).toBe(1024);
	});

	it("rejects an insert with title = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventAttachmentTable).values(
				baseAttachment(hazardousEventId, {
					// @ts-expect-error - title is required; verifying the not-null constraint
					title: null,
				}),
			),
		).rejects.toThrow();
	});

	it("rejects an insert with fileKey = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventAttachmentTable).values(
				baseAttachment(hazardousEventId, {
					// @ts-expect-error - fileKey is required; verifying the not-null constraint
					fileKey: null,
				}),
			),
		).rejects.toThrow();
	});

	it("rejects an insert with fileName = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventAttachmentTable).values(
				baseAttachment(hazardousEventId, {
					// @ts-expect-error - fileName is required; verifying the not-null constraint
					fileName: null,
				}),
			),
		).rejects.toThrow();
	});

	it("rejects an insert with fileType = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventAttachmentTable).values(
				baseAttachment(hazardousEventId, {
					// @ts-expect-error - fileType is required; verifying the not-null constraint
					fileType: null,
				}),
			),
		).rejects.toThrow();
	});

	it("rejects an insert with fileSize = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventAttachmentTable).values(
				baseAttachment(hazardousEventId, {
					// @ts-expect-error - fileSize is required; verifying the not-null constraint
					fileSize: null,
				}),
			),
		).rejects.toThrow();
	});

	it("stores fileSize values beyond the 32-bit integer range", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		const [row] = await dr
			.insert(hazardousEventAttachmentTable)
			.values(baseAttachment(hazardousEventId, { fileSize: 5000000000 }))
			.returning();

		expect(row.fileSize).toBe(5000000000);
	});

	it("defaults createdAt and updatedAt when omitted", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		const [row] = await dr
			.insert(hazardousEventAttachmentTable)
			.values(baseAttachment(hazardousEventId))
			.returning();

		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("rejects an insert with hazardousEventId = NULL", async () => {
		await expect(
			dr.insert(hazardousEventAttachmentTable).values(
				baseAttachment(
					// @ts-expect-error - hazardousEventId is required; verifying the not-null constraint
					null,
				),
			),
		).rejects.toThrow();
	});

	it("rejects an insert whose hazardousEventId matches no hazardous_event row", async () => {
		await expect(
			dr
				.insert(hazardousEventAttachmentTable)
				.values(baseAttachment(crypto.randomUUID())),
		).rejects.toThrow();
	});

	describe("multiple attachments per event", () => {
		it("allows two attachments for the same event with different fileKey values", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();

			const [row1, row2] = await Promise.all([
				dr
					.insert(hazardousEventAttachmentTable)
					.values(baseAttachment(hazardousEventId, { fileKey: "a.pdf" }))
					.returning(),
				dr
					.insert(hazardousEventAttachmentTable)
					.values(baseAttachment(hazardousEventId, { fileKey: "b.pdf" }))
					.returning(),
			]);

			expect(row1).toHaveLength(1);
			expect(row2).toHaveLength(1);
		});

		it("allows two concurrent inserts of different attachments under the same event", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();

			const outcomes = await Promise.all([
				dr
					.insert(hazardousEventAttachmentTable)
					.values(baseAttachment(hazardousEventId, { fileKey: "c.pdf" }))
					.returning()
					.then(
						() => "fulfilled" as const,
						() => "rejected" as const,
					),
				dr
					.insert(hazardousEventAttachmentTable)
					.values(baseAttachment(hazardousEventId, { fileKey: "d.pdf" }))
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
				.values(baseAttachment(hazardousEventId))
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
