// Characterization tests for applyHazardFilters's specificHazardId rename (ca-he-hazard-filter-fixes).
import "../setup";
import { randomUUID } from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { dr } from "~/db.server";
import { applyHazardFilters } from "~/backend.server/utils/hazardFilters";
import { hipTypeTable } from "../testSchema/hipTypeTable";
import { hipClusterTable } from "../testSchema/hipClusterTable";
import { hipHazardTable } from "../testSchema/hipHazardTable";
import { hazardousEventTable } from "../testSchema/hazardousEventTable";
import { disasterEventTable } from "../testSchema/disasterEventTable";
import { disasterRecordsTable } from "../testSchema/disasterRecordsTable";
import { eventTable } from "../testSchema/eventTable";
import {
	seedCountryAccount,
	seedHipChain,
	seedHazardousEvent,
} from "./hazardousEventTestHelpers";

// vi.hoisted so the spies exist before the mocked module factory runs.
const { debugSpy, infoSpy, warnSpy, errorSpy } = vi.hoisted(() => ({
	debugSpy: vi.fn(),
	infoSpy: vi.fn(),
	warnSpy: vi.fn(),
	errorSpy: vi.fn(),
}));

vi.mock("~/utils/logger.server", () => ({
	default: vi.fn(() => ({
		debug: debugSpy,
		info: infoSpy,
		warn: warnSpy,
		error: errorSpy,
	})),
}));

beforeEach(() => {
	debugSpy.mockClear();
	infoSpy.mockClear();
	warnSpy.mockClear();
	errorSpy.mockClear();
});

// Finds a captured logger call by message, across whichever spy it was logged on.
function findLogCall(message: string) {
	const allCalls = [
		...debugSpy.mock.calls,
		...infoSpy.mock.calls,
		...warnSpy.mock.calls,
		...errorSpy.mock.calls,
	];
	return allCalls.find((call) => call[0] === message);
}

async function seedDisasterRecordChain(
	countryAccountsId: string,
	hazardousEventId: string,
) {
	const [de] = await dr
		.insert(eventTable)
		.values({ name: "DE", description: "DE" })
		.returning({ id: eventTable.id });
	await dr.insert(disasterEventTable).values({
		id: de.id,
		countryAccountsId,
		hazardousEventId,
	});
	const [record] = await dr
		.insert(disasterRecordsTable)
		.values({
			countryAccountsId,
			disasterEventId: de.id,
			approvalStatus: "published",
		})
		.returning({ id: disasterRecordsTable.id });
	return record.id;
}

describe("applyHazardFilters — internal naming safety", () => {
	it("filters disaster records by the exact hip hazard and logs the standard sequence", async () => {
		const countryAccountsId = await seedCountryAccount();
		const { hipHazardId, hipClusterId, hipTypeId } = await seedHipChain();
		const matching = await seedHazardousEvent({
			countryAccountsId,
			hipHazardId,
			hipClusterId,
			hipTypeId,
		});
		const other = await seedHazardousEvent({ countryAccountsId });

		const matchingRecordId = await seedDisasterRecordChain(
			countryAccountsId,
			matching.id,
		);
		const otherRecordId = await seedDisasterRecordChain(
			countryAccountsId,
			other.id,
		);

		// any[] matches applyHazardFilters's own untyped (out-of-scope) signature.
		const baseConditions: any[] = [];
		// Builders are thenable — awaiting the return auto-executes it; production callers discard it too.
		await applyHazardFilters(
			{ specificHazardId: hipHazardId },
			dr,
			baseConditions,
			eq,
			hipTypeTable,
			hipClusterTable,
			hipHazardTable,
			hazardousEventTable,
			disasterEventTable,
			disasterRecordsTable,
			dr.select().from(disasterRecordsTable),
		);

		const rows = await dr
			.select({ id: disasterRecordsTable.id })
			.from(disasterRecordsTable)
			.innerJoin(
				disasterEventTable,
				eq(disasterRecordsTable.disasterEventId, disasterEventTable.id),
			)
			.innerJoin(
				hazardousEventTable,
				eq(disasterEventTable.hazardousEventId, hazardousEventTable.id),
			)
			.where(and(...baseConditions));
		const ids = rows.map((r: any) => r.id);
		expect(ids).toContain(matchingRecordId);
		expect(ids).not.toContain(otherRecordId);

		// Seven shorthand log sites (design.md) must keep emitting the key "specificHazardId".
		expect(findLogCall("Applied specific hazard filter")?.[1]).toEqual({
			specificHazardId: hipHazardId,
		});
		expect(findLogCall("Starting specific hazard validation")?.[1]).toEqual({
			specificHazardId: hipHazardId,
		});
		expect(
			findLogCall("Specific hazard validation completed")?.[1],
		).toMatchObject({ specificHazardId: hipHazardId, validationPassed: true });
	});

	it("logs cluster/type mismatch warnings keyed specificHazardId when the hazard belongs elsewhere", async () => {
		const { hipHazardId } = await seedHipChain();
		const baseConditions: any[] = [];
		const query = dr.select().from(disasterRecordsTable);

		await applyHazardFilters(
			{
				specificHazardId: hipHazardId,
				hazardClusterId: "unrelated-cluster",
				hazardTypeId: "unrelated-type",
			},
			dr,
			baseConditions,
			eq,
			hipTypeTable,
			hipClusterTable,
			hipHazardTable,
			hazardousEventTable,
			disasterEventTable,
			disasterRecordsTable,
			query,
		);

		expect(findLogCall("Hazard cluster mismatch detected")?.[1]).toMatchObject({
			specificHazardId: hipHazardId,
		});
		expect(findLogCall("Hazard type mismatch detected")?.[1]).toMatchObject({
			specificHazardId: hipHazardId,
		});
	});

	it("logs a not-found warning keyed specificHazardId when the hazard id does not exist", async () => {
		const missingHazardId = `missing-${randomUUID()}`;
		const baseConditions: any[] = [];
		const query = dr.select().from(disasterRecordsTable);

		await applyHazardFilters(
			{ specificHazardId: missingHazardId },
			dr,
			baseConditions,
			eq,
			hipTypeTable,
			hipClusterTable,
			hipHazardTable,
			hazardousEventTable,
			disasterEventTable,
			disasterRecordsTable,
			query,
		);

		expect(
			findLogCall("Specific hazard not found in hierarchy")?.[1],
		).toMatchObject({ specificHazardId: missingHazardId });
	});

	it("logs the hierarchy-validation catch block keyed specificHazardId when the lookup throws", async () => {
		const { hipHazardId } = await seedHipChain();
		const baseConditions: any[] = [];
		const query = dr.select().from(disasterRecordsTable);
		// Only the hierarchy-validation lookup uses `dr` — `query` above stays real, so only the try block throws.
		const throwingDr = {
			select: () => {
				throw new Error("boom");
			},
		};

		await applyHazardFilters(
			{ specificHazardId: hipHazardId },
			throwingDr,
			baseConditions,
			eq,
			hipTypeTable,
			hipClusterTable,
			hipHazardTable,
			hazardousEventTable,
			disasterEventTable,
			disasterRecordsTable,
			query,
		);

		expect(
			findLogCall("Error during hazard hierarchy validation")?.[1],
		).toMatchObject({ specificHazardId: hipHazardId });
	});
});
