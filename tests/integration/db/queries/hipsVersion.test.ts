import "../setup";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hipsVersionTable } from "~/domains/hazardous-events/infrastructure/hipsVersionTable";

describe("hipsVersionTable", () => {
	it("inserts a row with a version_no", async () => {
		const [row] = await dr
			.insert(hipsVersionTable)
			.values({ versionNo: "HIPs 2025" })
			.returning();

		expect(row.versionNo).toBe("HIPs 2025");
	});

	it("rejects an insert with no version_no", async () => {
		await expect(
			dr
				.insert(hipsVersionTable)
				// @ts-expect-error versionNo is required
				.values({})
				.returning(),
		).rejects.toThrow();
	});
});
