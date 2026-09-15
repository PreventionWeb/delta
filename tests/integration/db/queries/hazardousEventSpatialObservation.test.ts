import "../setup";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hazardousEventSpatialObservationTable } from "~/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationTable";
import { hazardousEventSpatialObservationDivisionTable } from "~/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationDivisionTable";
import { hazardousEventSpatialObservationGeomTable } from "~/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationGeomTable";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { divisionTable, InsertDivision } from "../testSchema/divisionTable";
import { seedHazardousEvent } from "../models/hazardousEventTestHelpers";

async function seedDivision(overrides: Partial<InsertDivision> = {}) {
	const [division] = await dr
		.insert(divisionTable)
		.values({ name: { en: `Division ${randomUUID()}` }, ...overrides })
		.returning();
	return division;
}

async function seedObservation() {
	const { id: hazardousEventId } = await seedHazardousEvent();
	const [observation] = await dr
		.insert(hazardousEventSpatialObservationTable)
		.values({ hazardousEventId, observationTime: new Date() })
		.returning();
	return observation;
}

const samplePoint = { type: "Point", coordinates: [1, 1] };

describe("hazardousEventSpatialObservationTable", () => {
	it("inserts an observation under an existing hazardous event", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		const [row] = await dr
			.insert(hazardousEventSpatialObservationTable)
			.values({
				hazardousEventId,
				observationTime: new Date("2026-01-01T00:00:00Z"),
				note: "Initial observation",
			})
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.hazardousEventId).toBe(hazardousEventId);
		expect(row.observationTime).toBeInstanceOf(Date);
		expect(row.note).toBe("Initial observation");
		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("allows note = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		const [row] = await dr
			.insert(hazardousEventSpatialObservationTable)
			.values({
				hazardousEventId,
				observationTime: new Date("2026-01-01T00:00:00Z"),
				note: null,
			})
			.returning();

		expect(row.note).toBeNull();
	});

	it("rejects an insert with hazardousEventId = NULL", async () => {
		await expect(
			dr.insert(hazardousEventSpatialObservationTable).values({
				// @ts-expect-error - hazardousEventId is required; verifying the not-null constraint
				hazardousEventId: null,
				observationTime: new Date("2026-01-01T00:00:00Z"),
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with observationTime = NULL", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		await expect(
			dr.insert(hazardousEventSpatialObservationTable).values({
				// @ts-expect-error - observationTime is required; verifying the not-null constraint
				observationTime: null,
				hazardousEventId,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose hazardousEventId matches no hazardous_event row", async () => {
		await expect(
			dr.insert(hazardousEventSpatialObservationTable).values({
				hazardousEventId: crypto.randomUUID(),
				observationTime: new Date("2026-01-01T00:00:00Z"),
			}),
		).rejects.toThrow();
	});

	it("allows a hazardous event to have multiple dated observations", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardousEventSpatialObservationTable)
				.values({
					hazardousEventId,
					observationTime: new Date("2026-01-01T00:00:00Z"),
				})
				.returning(),
			dr
				.insert(hazardousEventSpatialObservationTable)
				.values({
					hazardousEventId,
					observationTime: new Date("2026-01-02T00:00:00Z"),
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("rejects a duplicate (hazardousEventId, observationTime) pair", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();
		const observationTime = new Date("2026-01-01T00:00:00Z");
		await dr
			.insert(hazardousEventSpatialObservationTable)
			.values({ hazardousEventId, observationTime });

		await expect(
			dr
				.insert(hazardousEventSpatialObservationTable)
				.values({ hazardousEventId, observationTime }),
		).rejects.toThrow();
	});

	it("allows two concurrent inserts of different observationTime values under the same hazardousEventId", async () => {
		const { id: hazardousEventId } = await seedHazardousEvent();

		const outcomes = await Promise.all([
			dr
				.insert(hazardousEventSpatialObservationTable)
				.values({
					hazardousEventId,
					observationTime: new Date("2026-01-01T00:00:00Z"),
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(hazardousEventSpatialObservationTable)
				.values({
					hazardousEventId,
					observationTime: new Date("2026-01-02T00:00:00Z"),
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});

	describe("cascade-delete behaviour", () => {
		it("deleting the referenced hazardous event cascades and removes the observation row", async () => {
			const { id: hazardousEventId } = await seedHazardousEvent();
			const [inserted] = await dr
				.insert(hazardousEventSpatialObservationTable)
				.values({
					hazardousEventId,
					observationTime: new Date("2026-01-01T00:00:00Z"),
				})
				.returning({ id: hazardousEventSpatialObservationTable.id });

			await dr
				.delete(hazardousEventTable)
				.where(eq(hazardousEventTable.id, hazardousEventId));

			const remaining = await dr
				.select({ id: hazardousEventSpatialObservationTable.id })
				.from(hazardousEventSpatialObservationTable)
				.where(eq(hazardousEventSpatialObservationTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});
	});
});

describe("hazardousEventSpatialObservationDivisionTable", () => {
	it("inserts an association between an existing observation and an existing division", async () => {
		const observation = await seedObservation();
		const division = await seedDivision();

		const [row] = await dr
			.insert(hazardousEventSpatialObservationDivisionTable)
			.values({
				hazardousEventSpatialObservationId: observation.id,
				divisionId: division.id,
			})
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.hazardousEventSpatialObservationId).toBe(observation.id);
		expect(row.divisionId).toBe(division.id);
		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("rejects an insert with hazardousEventSpatialObservationId = NULL", async () => {
		const division = await seedDivision();

		await expect(
			dr.insert(hazardousEventSpatialObservationDivisionTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				hazardousEventSpatialObservationId: null,
				divisionId: division.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with divisionId = NULL", async () => {
		const observation = await seedObservation();

		await expect(
			dr.insert(hazardousEventSpatialObservationDivisionTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				divisionId: null,
				hazardousEventSpatialObservationId: observation.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose hazardousEventSpatialObservationId matches no observation row", async () => {
		const division = await seedDivision();

		await expect(
			dr.insert(hazardousEventSpatialObservationDivisionTable).values({
				hazardousEventSpatialObservationId: crypto.randomUUID(),
				divisionId: division.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose divisionId matches no division row", async () => {
		const observation = await seedObservation();

		await expect(
			dr.insert(hazardousEventSpatialObservationDivisionTable).values({
				hazardousEventSpatialObservationId: observation.id,
				divisionId: crypto.randomUUID(),
			}),
		).rejects.toThrow();
	});

	it("allows an observation to be associated with multiple divisions", async () => {
		const observation = await seedObservation();
		const division1 = await seedDivision();
		const division2 = await seedDivision();

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardousEventSpatialObservationDivisionTable)
				.values({
					hazardousEventSpatialObservationId: observation.id,
					divisionId: division1.id,
				})
				.returning(),
			dr
				.insert(hazardousEventSpatialObservationDivisionTable)
				.values({
					hazardousEventSpatialObservationId: observation.id,
					divisionId: division2.id,
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("allows a division to be reused across observations", async () => {
		const observation1 = await seedObservation();
		const observation2 = await seedObservation();
		const division = await seedDivision();

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardousEventSpatialObservationDivisionTable)
				.values({
					hazardousEventSpatialObservationId: observation1.id,
					divisionId: division.id,
				})
				.returning(),
			dr
				.insert(hazardousEventSpatialObservationDivisionTable)
				.values({
					hazardousEventSpatialObservationId: observation2.id,
					divisionId: division.id,
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("rejects a duplicate (hazardousEventSpatialObservationId, divisionId) pair", async () => {
		const observation = await seedObservation();
		const division = await seedDivision();
		await dr.insert(hazardousEventSpatialObservationDivisionTable).values({
			hazardousEventSpatialObservationId: observation.id,
			divisionId: division.id,
		});

		await expect(
			dr.insert(hazardousEventSpatialObservationDivisionTable).values({
				hazardousEventSpatialObservationId: observation.id,
				divisionId: division.id,
			}),
		).rejects.toThrow();
	});

	it("allows two concurrent inserts of different division associations sharing the same observation", async () => {
		const observation = await seedObservation();
		const division1 = await seedDivision();
		const division2 = await seedDivision();

		const outcomes = await Promise.all([
			dr
				.insert(hazardousEventSpatialObservationDivisionTable)
				.values({
					hazardousEventSpatialObservationId: observation.id,
					divisionId: division1.id,
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(hazardousEventSpatialObservationDivisionTable)
				.values({
					hazardousEventSpatialObservationId: observation.id,
					divisionId: division2.id,
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});

	describe("cascade/restrict behaviour", () => {
		it("deleting the referenced spatial observation cascades and removes the division row", async () => {
			const observation = await seedObservation();
			const division = await seedDivision();
			const [inserted] = await dr
				.insert(hazardousEventSpatialObservationDivisionTable)
				.values({
					hazardousEventSpatialObservationId: observation.id,
					divisionId: division.id,
				})
				.returning({ id: hazardousEventSpatialObservationDivisionTable.id });

			await dr
				.delete(hazardousEventSpatialObservationTable)
				.where(eq(hazardousEventSpatialObservationTable.id, observation.id));

			const remaining = await dr
				.select({ id: hazardousEventSpatialObservationDivisionTable.id })
				.from(hazardousEventSpatialObservationDivisionTable)
				.where(
					eq(hazardousEventSpatialObservationDivisionTable.id, inserted.id),
				);

			expect(remaining).toHaveLength(0);
		});

		it("rejects deleting a division still referenced by a division association row", async () => {
			const observation = await seedObservation();
			const division = await seedDivision();
			await dr.insert(hazardousEventSpatialObservationDivisionTable).values({
				hazardousEventSpatialObservationId: observation.id,
				divisionId: division.id,
			});

			await expect(
				dr.delete(divisionTable).where(eq(divisionTable.id, division.id)),
			).rejects.toThrow();
		});
	});
});

describe("hazardousEventSpatialObservationGeomTable", () => {
	it("inserts a geometry under an existing spatial observation", async () => {
		const observation = await seedObservation();

		const [row] = await dr
			.insert(hazardousEventSpatialObservationGeomTable)
			.values({
				hazardousEventSpatialObservationId: observation.id,
				geom: sql`ST_GeomFromGeoJSON(${JSON.stringify(samplePoint)})`,
				title: "Sample point",
			})
			.returning();

		expect(row.id).toBeTruthy();
		expect(row.hazardousEventSpatialObservationId).toBe(observation.id);
		expect(row.title).toBe("Sample point");
		expect(row.createdAt).toBeInstanceOf(Date);
		expect(row.updatedAt).toBeInstanceOf(Date);
	});

	it("allows title = NULL", async () => {
		const observation = await seedObservation();

		const [row] = await dr
			.insert(hazardousEventSpatialObservationGeomTable)
			.values({
				hazardousEventSpatialObservationId: observation.id,
				geom: sql`ST_GeomFromGeoJSON(${JSON.stringify(samplePoint)})`,
				title: null,
			})
			.returning();

		expect(row.title).toBeNull();
	});

	it("rejects an insert with hazardousEventSpatialObservationId = NULL", async () => {
		await expect(
			dr.insert(hazardousEventSpatialObservationGeomTable).values({
				// @ts-expect-error - required; verifying the not-null constraint
				hazardousEventSpatialObservationId: null,
				geom: sql`ST_GeomFromGeoJSON(${JSON.stringify(samplePoint)})`,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert with geom = NULL", async () => {
		const observation = await seedObservation();

		await expect(
			dr.insert(hazardousEventSpatialObservationGeomTable).values({
				// geom's type is `unknown`, so null type-checks; DB rejects it at runtime
				geom: null,
				hazardousEventSpatialObservationId: observation.id,
			}),
		).rejects.toThrow();
	});

	it("rejects an insert whose hazardousEventSpatialObservationId matches no observation row", async () => {
		await expect(
			dr.insert(hazardousEventSpatialObservationGeomTable).values({
				hazardousEventSpatialObservationId: crypto.randomUUID(),
				geom: sql`ST_GeomFromGeoJSON(${JSON.stringify(samplePoint)})`,
			}),
		).rejects.toThrow();
	});

	it("allows a spatial observation to have multiple geometries", async () => {
		const observation = await seedObservation();
		const otherPoint = { type: "Point", coordinates: [2, 2] };

		const [row1, row2] = await Promise.all([
			dr
				.insert(hazardousEventSpatialObservationGeomTable)
				.values({
					hazardousEventSpatialObservationId: observation.id,
					geom: sql`ST_GeomFromGeoJSON(${JSON.stringify(samplePoint)})`,
				})
				.returning(),
			dr
				.insert(hazardousEventSpatialObservationGeomTable)
				.values({
					hazardousEventSpatialObservationId: observation.id,
					geom: sql`ST_GeomFromGeoJSON(${JSON.stringify(otherPoint)})`,
				})
				.returning(),
		]);

		expect(row1).toHaveLength(1);
		expect(row2).toHaveLength(1);
	});

	it("allows two concurrent inserts of different geometries under the same observation", async () => {
		const observation = await seedObservation();
		const otherPoint = { type: "Point", coordinates: [3, 3] };

		const outcomes = await Promise.all([
			dr
				.insert(hazardousEventSpatialObservationGeomTable)
				.values({
					hazardousEventSpatialObservationId: observation.id,
					geom: sql`ST_GeomFromGeoJSON(${JSON.stringify(samplePoint)})`,
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
			dr
				.insert(hazardousEventSpatialObservationGeomTable)
				.values({
					hazardousEventSpatialObservationId: observation.id,
					geom: sql`ST_GeomFromGeoJSON(${JSON.stringify(otherPoint)})`,
				})
				.returning()
				.then(
					() => "fulfilled" as const,
					() => "rejected" as const,
				),
		]);

		expect(outcomes).toEqual(["fulfilled", "fulfilled"]);
	});

	describe("cascade-delete behaviour", () => {
		it("deleting the referenced spatial observation cascades and removes the geom row", async () => {
			const observation = await seedObservation();
			const [inserted] = await dr
				.insert(hazardousEventSpatialObservationGeomTable)
				.values({
					hazardousEventSpatialObservationId: observation.id,
					geom: sql`ST_GeomFromGeoJSON(${JSON.stringify(samplePoint)})`,
				})
				.returning({ id: hazardousEventSpatialObservationGeomTable.id });

			await dr
				.delete(hazardousEventSpatialObservationTable)
				.where(eq(hazardousEventSpatialObservationTable.id, observation.id));

			const remaining = await dr
				.select({ id: hazardousEventSpatialObservationGeomTable.id })
				.from(hazardousEventSpatialObservationGeomTable)
				.where(eq(hazardousEventSpatialObservationGeomTable.id, inserted.id));

			expect(remaining).toHaveLength(0);
		});
	});
});
