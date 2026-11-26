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
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";
import { getInstance, i18nextMiddleware } from "~/middleware/i18next.server";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { seedCountryAccount } from "../../../db/models/hazardousEventTestHelpers";
import {
	eventsOfTenant,
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
import { loader } from "~/routes/$lang+/_authenticated+/he-preview+/csv-template";
import { action as importAction } from "~/routes/$lang+/_authenticated+/he-preview+/csv-import";

vi.setConfig({ testTimeout: 30_000 });

const mockGetCountryAccountsIdFromSession = vi.mocked(
	getCountryAccountsIdFromSession,
);
const mockGetUserRoleFromSession = vi.mocked(getUserRoleFromSession);
const mockRequireUser = vi.mocked(requireUser);

const TEST_USER_ID = randomUUID();

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
	url: string,
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
		request: new Request(url, init),
		params: { lang: "en" },
		context: await makeI18nContext(url),
	} as unknown as Parameters<typeof loader>[0];
}

function templateUrl(mode: string): string {
	return `http://localhost/en/he-preview/csv-template?mode=${mode}`;
}

async function downloadTemplate(tenantId: string, mode: string) {
	const response = await loader(
		await makeArgs(templateUrl(mode), tenantId, "data-collector"),
	);
	expect(response).toBeInstanceOf(Response);
	return response as Response;
}

async function importText(tenantId: string, text: string, mode: string) {
	const formData = new FormData();
	formData.append(
		"file",
		new File([text], `template-${mode}.csv`, { type: "text/csv" }),
	);
	formData.append("import_type", mode);
	return importAction(
		await makeArgs(
			"http://localhost/en/he-preview/csv-import",
			tenantId,
			"data-collector",
			{ method: "POST", body: formData },
		),
	);
}

async function thrownBy(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run();
	} catch (err) {
		return err;
	}
	return undefined;
}

describe("Hazardous event CSV template route", () => {
	let tenantId: string;

	beforeEach(async () => {
		testingModule = await Test.createTestingModule({
			imports: [HazardousEventsModule],
		}).compile();
		mockGetCountryAccountsIdFromSession.mockReset();
		mockGetUserRoleFromSession.mockReset();
		mockRequireUser.mockReset();
		tenantId = await seedCountryAccount();
		// The example row names a specific hazard, so the instance must have one.
		await seedTaxonomyWithRefs();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await testingModule.close();
	});

	describe("guards", () => {
		it("lets requireUser's login redirect propagate", async () => {
			const redirect = new Response(null, {
				status: 302,
				headers: { Location: "/en/user/login" },
			});
			const args = await makeArgs(templateUrl("create"), null, null);
			mockRequireUser.mockReset();
			mockRequireUser.mockRejectedValueOnce(redirect);

			expect(await thrownBy(() => loader(args))).toBe(redirect);
		});

		it("redirects to select-instance before the EditData check when no tenant resolves", async () => {
			const thrown = await thrownBy(async () =>
				loader(await makeArgs(templateUrl("create"), null, "data-viewer")),
			);

			expect(thrown).toBeInstanceOf(Response);
			expect((thrown as Response).headers.get("Location")).toBe(
				"/en/user/select-instance",
			);
		});

		it("throws a 403 ADR-003 envelope for a data-viewer, with namespaces loaded", async () => {
			const args = await makeArgs(
				templateUrl("create"),
				tenantId,
				"data-viewer",
			);

			const thrown = await thrownBy(() => loader(args));

			expect(thrown).toBeInstanceOf(Response);
			const response = thrown as Response;
			expect(response.status).toBe(403);
			const body = (await response.json()) as ErrorResponse;
			expect(body.error.code).toBe("FORBIDDEN");
			const i18n = getInstance(args.context);
			expect(i18n.hasLoadedNamespace("hazardous-events")).toBe(true);
			expect(i18n.hasLoadedNamespace("common")).toBe(true);
		});

		it.each(["bogus", ""])(
			"returns a 404 ADR-003 envelope for mode=%j",
			async (mode) => {
				const thrown = await thrownBy(async () =>
					loader(await makeArgs(templateUrl(mode), tenantId, "data-collector")),
				);

				expect(thrown).toBeInstanceOf(Response);
				const response = thrown as Response;
				expect(response.status).toBe(404);
				const body = (await response.json()) as ErrorResponse;
				expect(body.success).toBe(false);
				expect(body.error.code).toBe("NOT_FOUND");
			},
		);
	});

	describe("templates import cleanly in their own mode", () => {
		it.each(["create", "upsert"])(
			"the %s template creates one event in the session tenant",
			async (mode) => {
				const response = await downloadTemplate(tenantId, mode);
				expect(response.status).toBe(200);
				expect(response.headers.get("Content-Type")).toBe(
					"text/csv; charset=utf-8; header=present",
				);

				const result = await importText(tenantId, await response.text(), mode);

				expect(result).toMatchObject({
					ok: true,
					mode,
					created: 1,
					updated: 0,
				});
				const rows = await eventsOfTenant(tenantId);
				expect(rows).toHaveLength(1);
				expect(rows[0].countryAccountsId).toBe(tenantId);
			},
		);

		// The update example names a placeholder id the template cannot know, so only its
		// header is valid; the row fails as not_found by design (OD-17).
		it("the update template passes header validation; its placeholder row fails with not_found", async () => {
			const response = await downloadTemplate(tenantId, "update");
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text.split("\r\n")[0].split(",")[0]).toBe("id");

			const result = await importText(tenantId, text, "update");

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.mode).toBe("update");
			expect(result.fileErrors).toEqual([]);
			expect(result.rowErrors).toEqual([
				expect.objectContaining({ line: 2, code: "not_found" }),
			]);
			expect(await eventsOfTenant(tenantId)).toHaveLength(0);
		});
	});
});
