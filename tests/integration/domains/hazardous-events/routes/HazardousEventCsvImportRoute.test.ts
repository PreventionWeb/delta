import "../../../db/setup";
import "reflect-metadata";

import { randomUUID } from "crypto";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { RouterContextProvider } from "react-router";

import { HazardousEventsModule } from "~/domains/hazardous-events/infrastructure/HazardousEventsModule.server";
import { ImportHazardousEventsCsvUseCase } from "~/domains/hazardous-events/application/use-cases/ImportHazardousEventsCsv";
import { HazardousEventErrorBoundary } from "~/domains/hazardous-events/presentation/web/HazardousEventErrorBoundary";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";
import { getInstance, i18nextMiddleware } from "~/middleware/i18next.server";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { seedCountryAccount } from "../../../db/models/hazardousEventTestHelpers";
import {
	eventsOfTenant,
	nullTenantEventCount,
	seedTaxonomyWithRefs,
} from "../hazardousEventCsvTestHarness";

let testingModule: TestingModule;

vi.mock("~/init.server", () => ({
	getAppContext: () => ({
		get: (token: Parameters<TestingModule["get"]>[0]) =>
			testingModule.get(token),
	}),
}));

vi.mock("~/utils/session", async (importOriginal) => {
	const original = await importOriginal<Record<string, unknown>>();
	return {
		...original,
		getCountryAccountsIdFromSession: vi.fn(),
		getUserRoleFromSession: vi.fn(),
	};
});

vi.mock("~/utils/auth", async (importOriginal) => {
	const original = await importOriginal<Record<string, unknown>>();
	return { ...original, requireUser: vi.fn() };
});

import {
	getCountryAccountsIdFromSession,
	getUserRoleFromSession,
} from "~/utils/session";
import { requireUser } from "~/utils/auth";
import {
	loader,
	action,
	ErrorBoundary,
} from "~/routes/$lang+/_authenticated+/he-preview+/csv-import";

vi.setConfig({ testTimeout: 30_000 });

const mockGetCountryAccountsIdFromSession = vi.mocked(
	getCountryAccountsIdFromSession,
);
const mockGetUserRoleFromSession = vi.mocked(getUserRoleFromSession);
const mockRequireUser = vi.mocked(requireUser);

const URL_IMPORT = "http://localhost/en/he-preview/csv-import";
const TEST_USER_ID = randomUUID();

// audit_logs.user_id is an FK to userTable, so the session user must be a real row.
beforeAll(async () => {
	await dr
		.insert(userTable)
		.values({ id: TEST_USER_ID, email: `test-user-${TEST_USER_ID}@test.com` });
}, 60_000);

async function makeI18nContext(url: string): Promise<RouterContextProvider> {
	const context = new RouterContextProvider();
	await i18nextMiddleware(
		{ request: new Request(url), params: {}, context } as unknown as Parameters<
			typeof i18nextMiddleware
		>[0],
		async () => new Response(),
	);
	return context;
}

async function makeArgs(
	tenantIdForSession: string | null,
	role: string | null,
	init?: RequestInit,
) {
	mockGetCountryAccountsIdFromSession.mockResolvedValue(
		tenantIdForSession ?? undefined,
	);
	mockGetUserRoleFromSession.mockResolvedValue((role ?? undefined) as never);
	mockRequireUser.mockResolvedValue({
		user: { id: TEST_USER_ID },
		session: {},
	} as never);
	return {
		request: new Request(URL_IMPORT, init),
		params: { lang: "en" },
		context: await makeI18nContext(URL_IMPORT),
	} as unknown as Parameters<typeof action>[0];
}

function multipart(
	file: BlobPart | null,
	importType: string,
	fileName = "events.csv",
): RequestInit {
	const formData = new FormData();
	if (file !== null) {
		formData.append("file", new File([file], fileName, { type: "text/csv" }));
	}
	formData.append("import_type", importType);
	return { method: "POST", body: formData };
}

type Taxonomy = Awaited<ReturnType<typeof seedTaxonomyWithRefs>>;

function validCreateCsv(tax: Taxonomy, extra: Record<string, string> = {}) {
	const cells: Record<string, string> = {
		startDate: "2025-03-01",
		endDate: "2025-03-02",
		recordOriginator: "Field survey",
		hipTypeId: tax.hipTypeId,
		hipClusterId: tax.hipClusterId,
		hipHazardId: tax.hipHazardId,
		...extra,
	};
	const header = Object.keys(cells);
	return `${header.join(",")}\r\n${header.map((c) => cells[c]).join(",")}\r\n`;
}

async function thrownBy(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run();
	} catch (err) {
		return err;
	}
	return undefined;
}

async function expectForbidden(thrown: unknown): Promise<void> {
	expect(thrown).toBeInstanceOf(Response);
	const response = thrown as Response;
	expect(response.status).toBe(403);
	const body = (await response.json()) as ErrorResponse;
	expect(body.success).toBe(false);
	expect(body.error.code).toBe("FORBIDDEN");
}

function expectSelectInstanceRedirect(thrown: unknown): void {
	expect(thrown).toBeInstanceOf(Response);
	const response = thrown as Response;
	expect(response.status).toBeGreaterThanOrEqual(300);
	expect(response.status).toBeLessThan(400);
	expect(response.headers.get("Location")).toBe("/en/user/select-instance");
}

describe("Hazardous event CSV import route", () => {
	let tenantId: string;
	let tax: Taxonomy;

	beforeEach(async () => {
		testingModule = await Test.createTestingModule({
			imports: [HazardousEventsModule],
		}).compile();
		mockGetCountryAccountsIdFromSession.mockReset();
		mockGetUserRoleFromSession.mockReset();
		mockRequireUser.mockReset();
		tenantId = await seedCountryAccount();
		tax = await seedTaxonomyWithRefs();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await testingModule.close();
	});

	it("exports HazardousEventErrorBoundary as its ErrorBoundary", () => {
		expect(ErrorBoundary).toBe(HazardousEventErrorBoundary);
	});

	describe("guard order", () => {
		it("lets requireUser's login redirect propagate from the loader, even with no tenant", async () => {
			const redirect = new Response(null, {
				status: 302,
				headers: { Location: "/en/user/login" },
			});
			const args = await makeArgs(null, null);
			mockRequireUser.mockReset();
			mockRequireUser.mockRejectedValueOnce(redirect);

			expect(await thrownBy(() => loader(args))).toBe(redirect);
		});

		it("lets requireUser's login redirect propagate from the action, writing nothing", async () => {
			const executeSpy = vi.spyOn(
				testingModule.get(ImportHazardousEventsCsvUseCase),
				"execute",
			);
			const redirect = new Response(null, {
				status: 302,
				headers: { Location: "/en/user/login" },
			});
			const args = await makeArgs(
				tenantId,
				"data-collector",
				multipart(validCreateCsv(tax), "create"),
			);
			mockRequireUser.mockReset();
			mockRequireUser.mockRejectedValueOnce(redirect);

			expect(await thrownBy(() => action(args))).toBe(redirect);
			expect(executeSpy).not.toHaveBeenCalled();
			expect(await eventsOfTenant(tenantId)).toHaveLength(0);
		});

		it("redirects to select-instance before the EditData check when no tenant resolves", async () => {
			expectSelectInstanceRedirect(
				await thrownBy(async () => loader(await makeArgs(null, "data-viewer"))),
			);
			expectSelectInstanceRedirect(
				await thrownBy(async () =>
					action(
						await makeArgs(
							null,
							"data-viewer",
							multipart(validCreateCsv(tax), "create"),
						),
					),
				),
			);
		});

		it("throws a 403 ADR-003 envelope from the loader for a data-viewer, with namespaces loaded", async () => {
			const args = await makeArgs(tenantId, "data-viewer");

			await expectForbidden(await thrownBy(() => loader(args)));
			const i18n = getInstance(args.context);
			expect(i18n.hasLoadedNamespace("hazardous-events")).toBe(true);
			expect(i18n.hasLoadedNamespace("common")).toBe(true);
		});

		it("throws a 403 ADR-003 envelope from the action for a data-viewer and writes nothing", async () => {
			const executeSpy = vi.spyOn(
				testingModule.get(ImportHazardousEventsCsvUseCase),
				"execute",
			);
			const args = await makeArgs(
				tenantId,
				"data-viewer",
				multipart(validCreateCsv(tax), "create"),
			);

			await expectForbidden(await thrownBy(() => action(args)));
			expect(executeSpy).not.toHaveBeenCalled();
			expect(await eventsOfTenant(tenantId)).toHaveLength(0);
		});

		it("returns empty loader data for an EditData user", async () => {
			expect(await loader(await makeArgs(tenantId, "data-collector"))).toEqual(
				{},
			);
		});
	});

	describe("multipart import", () => {
		it("creates the row in the session tenant and returns the success result as action data", async () => {
			const nullBefore = await nullTenantEventCount();

			const result = await action(
				await makeArgs(
					tenantId,
					"data-collector",
					multipart(validCreateCsv(tax), "create"),
				),
			);

			expect(result).toMatchObject({
				ok: true,
				mode: "create",
				created: 1,
				updated: 0,
				unchanged: 0,
			});
			const rows = await eventsOfTenant(tenantId);
			expect(rows).toHaveLength(1);
			expect(rows[0].specificHazardId).toBe(tax.specificHazardId);
			expect(await nullTenantEventCount()).toBe(nullBefore);
		});

		it("ignores a countryAccountsId column naming another tenant", async () => {
			const otherTenantId = await seedCountryAccount();

			const result = await action(
				await makeArgs(
					tenantId,
					"data-collector",
					multipart(
						validCreateCsv(tax, { countryAccountsId: otherTenantId }),
						"create",
					),
				),
			);

			expect(result).toMatchObject({ ok: true, created: 1 });
			expect(result.ignoredColumns).toContain("countryAccountsId");
			expect(await eventsOfTenant(tenantId)).toHaveLength(1);
			expect(await eventsOfTenant(otherTenantId)).toHaveLength(0);
		});
	});

	describe("upload limits and decoding", () => {
		it("rejects a 10,500,000-byte file with file_too_large and writes nothing", async () => {
			const oversized = new Uint8Array(10_500_000).fill(0x61);

			const result = await action(
				await makeArgs(
					tenantId,
					"data-collector",
					multipart(oversized, "create"),
				),
			);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.fileErrors).toEqual([{ code: "file_too_large" }]);
			expect(await eventsOfTenant(tenantId)).toHaveLength(0);
		});

		it("rejects a file containing a lone 0xE9 byte with invalid_encoding", async () => {
			const header = new TextEncoder().encode(
				"startDate,endDate,recordOriginator\r\n2025-01-01,2025-01-02,M",
			);
			const latin1 = new Uint8Array([...header, 0xe9, 0x0d, 0x0a]);

			const result = await action(
				await makeArgs(tenantId, "data-collector", multipart(latin1, "create")),
			);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.fileErrors).toEqual([{ code: "invalid_encoding" }]);
			expect(await eventsOfTenant(tenantId)).toHaveLength(0);
		});

		it("rejects a ragged row as malformed_csv on line 2", async () => {
			const ragged =
				"startDate,endDate,recordOriginator\r\n2025-01-01,2025-01-02\r\n";

			const result = await action(
				await makeArgs(tenantId, "data-collector", multipart(ragged, "create")),
			);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.fileErrors).toEqual([{ code: "malformed_csv", line: 2 }]);
			expect(await eventsOfTenant(tenantId)).toHaveLength(0);
		});

		it("rejects import_type=bogus with invalid_mode and writes nothing", async () => {
			const result = await action(
				await makeArgs(
					tenantId,
					"data-collector",
					multipart(validCreateCsv(tax), "bogus"),
				),
			);

			expect(result).toMatchObject({ ok: false, mode: null });
			if (result.ok) return;
			expect(result.fileErrors).toEqual([{ code: "invalid_mode" }]);
			expect(await eventsOfTenant(tenantId)).toHaveLength(0);
		});
	});

	describe("unexpected errors", () => {
		it("turns a non-DomainError from the use case into a 500 INTERNAL_ERROR envelope with a traceId", async () => {
			const { getPinoLogger } =
				await import("~/infrastructure/logging/PinoLogger.server");
			vi.spyOn(getPinoLogger(), "error").mockImplementation(() => undefined);
			vi.spyOn(
				testingModule.get(ImportHazardousEventsCsvUseCase),
				"execute",
			).mockRejectedValueOnce(new Error("repository-secret"));

			const thrown = await thrownBy(async () =>
				action(
					await makeArgs(
						tenantId,
						"data-collector",
						multipart(validCreateCsv(tax), "create"),
					),
				),
			);

			expect(thrown).toBeInstanceOf(Response);
			const response = thrown as Response;
			expect(response.status).toBe(500);
			const text = await response.text();
			const body = JSON.parse(text) as ErrorResponse;
			expect(body.error.code).toBe("INTERNAL_ERROR");
			expect(typeof body.error.traceId).toBe("string");
			expect(body.error.traceId.length).toBeGreaterThan(0);
			expect(text).not.toContain("repository-secret");
		});
	});
});
