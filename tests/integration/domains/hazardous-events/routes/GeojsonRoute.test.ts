import "../../../db/setup";
import "reflect-metadata";

import { randomUUID } from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import { dr } from "~/db.server";
import { divisionTable } from "../../../db/testSchema/divisionTable";
import type { InsertDivision } from "../../../db/testSchema/divisionTable";
import { seedCountryAccount } from "../../../db/models/hazardousEventTestHelpers";

// vi.mock can't intercept requireUser/optionalUser (same-module calls inside ~/utils/auth) --
// so this suite drives the "approvedRecordsArePublic" branch instead, mocking only the
// cross-module ~/utils/session calls vi.mock can actually intercept.
vi.mock("~/utils/session", async (importOriginal) => {
	const original = await importOriginal<Record<string, unknown>>();
	return {
		...original,
		getCountryAccountsIdFromSession: vi.fn(),
		getCountrySettingsFromSession: vi.fn(),
	};
});

import {
	getCountryAccountsIdFromSession,
	getCountrySettingsFromSession,
} from "~/utils/session";
import { loader } from "~/routes/$lang+/api+/geojson.$id";

const mockGetCountryAccountsIdFromSession = vi.mocked(
	getCountryAccountsIdFromSession,
);
const mockGetCountrySettingsFromSession = vi.mocked(
	getCountrySettingsFromSession,
);

const SAMPLE_GEOJSON = {
	type: "Polygon",
	coordinates: [
		[
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 0],
		],
	],
};

async function seedDivision(
	countryAccountsId: string,
	overrides: Partial<InsertDivision> = {},
) {
	const [division] = await dr
		.insert(divisionTable)
		.values({
			countryAccountsId,
			name: { en: `Division ${randomUUID()}` },
			geojson: SAMPLE_GEOJSON,
			...overrides,
		})
		.returning();
	return division;
}

function mockSessionForTenant(tenantId: string) {
	mockGetCountryAccountsIdFromSession.mockResolvedValue(tenantId);
	mockGetCountrySettingsFromSession.mockResolvedValue({
		approvedRecordsArePublic: true,
	} as never);
}

function makeArgs(id: string | undefined): LoaderFunctionArgs {
	return {
		// No Cookie header -- optionalUser() resolves to null for an unauthenticated request.
		request: new Request(`http://localhost/en/api/geojson/${id ?? ""}`),
		params: { id },
		context: {},
	} as unknown as LoaderFunctionArgs;
}

describe("GET /api/geojson/:id loader", () => {
	beforeEach(() => {
		mockGetCountryAccountsIdFromSession.mockReset();
		mockGetCountrySettingsFromSession.mockReset();
	});

	it("returns the division's geojson and resolved display name when the requesting session belongs to the same tenant", async () => {
		const tenantA = await seedCountryAccount();
		const division = await seedDivision(tenantA);
		mockSessionForTenant(tenantA);

		const response = await loader(makeArgs(division.id));

		expect(response).toBeInstanceOf(Response);
		const body = await (response as Response).json();
		expect(body).toEqual({ geojson: SAMPLE_GEOJSON, name: division.name.en });
	});

	it("returns 404, not another tenant's geojson, when the session belongs to a different tenant", async () => {
		const tenantA = await seedCountryAccount();
		const division = await seedDivision(tenantA);
		const tenantB = await seedCountryAccount();
		mockSessionForTenant(tenantB);

		let thrown: unknown;
		try {
			await loader(makeArgs(division.id));
		} catch (e) {
			thrown = e;
		}

		expect(thrown).toBeInstanceOf(Response);
		expect((thrown as Response).status).toBe(404);
	});
});
