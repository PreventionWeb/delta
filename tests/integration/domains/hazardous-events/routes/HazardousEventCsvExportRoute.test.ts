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
import { parse } from "csv-parse/sync";

import { HazardousEventsModule } from "~/domains/hazardous-events/infrastructure/HazardousEventsModule.server";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";
import { i18nextMiddleware } from "~/middleware/i18next.server";
import { dr } from "~/db.server";
import { userTable } from "~/drizzle/schema/userTable";
import { seedCountryAccount } from "../../../db/models/hazardousEventTestHelpers";
import { E1_HEADER, seedLegacyEvent } from "../hazardousEventCsvTestHarness";

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
import { loader } from "~/routes/$lang+/_authenticated+/he-preview+/csv-export";

vi.setConfig({ testTimeout: 30_000 });

const mockGetCountryAccountsIdFromSession = vi.mocked(
	getCountryAccountsIdFromSession,
);
const mockGetUserRoleFromSession = vi.mocked(getUserRoleFromSession);
const mockRequireUser = vi.mocked(requireUser);

const URL_EXPORT = "http://localhost/en/he-preview/csv-export";
const TEST_USER_ID = randomUUID();
const EXPECTED_HEADER_LINE = `${E1_HEADER.join(",")},parent`;

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
		request: new Request(URL_EXPORT),
		params: { lang: "en" },
		context: await makeI18nContext(URL_EXPORT),
	} as unknown as Parameters<typeof loader>[0];
}

async function exportAs(tenantId: string, role: string): Promise<Response> {
	const response = await loader(await makeArgs(tenantId, role));
	expect(response).toBeInstanceOf(Response);
	return response as Response;
}

function parseBody(text: string): { header: string[]; rows: string[][] } {
	const [header, ...rows] = parse(text) as string[][];
	return { header, rows };
}

function column(
	parsed: { header: string[]; rows: string[][] },
	name: string,
): string[] {
	const index = parsed.header.indexOf(name);
	return parsed.rows.map((row) => row[index]);
}

async function thrownBy(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run();
	} catch (err) {
		return err;
	}
	return undefined;
}

describe("Hazardous event CSV export route", () => {
	let tenantId: string;

	beforeEach(async () => {
		testingModule = await Test.createTestingModule({
			imports: [HazardousEventsModule],
		}).compile();
		mockGetCountryAccountsIdFromSession.mockReset();
		mockGetUserRoleFromSession.mockReset();
		mockRequireUser.mockReset();
		tenantId = await seedCountryAccount();
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
			const args = await makeArgs(null, null);
			mockRequireUser.mockReset();
			mockRequireUser.mockRejectedValueOnce(redirect);

			expect(await thrownBy(() => loader(args))).toBe(redirect);
		});

		it("redirects to select-instance before the ViewData check when no tenant resolves", async () => {
			const thrown = await thrownBy(async () =>
				loader(await makeArgs(null, null)),
			);

			expect(thrown).toBeInstanceOf(Response);
			expect((thrown as Response).headers.get("Location")).toBe(
				"/en/user/select-instance",
			);
		});

		it("throws a 403 ADR-003 envelope for a session role without ViewData", async () => {
			await seedLegacyEvent({ tenantId });

			const thrown = await thrownBy(async () =>
				loader(await makeArgs(tenantId, null)),
			);

			expect(thrown).toBeInstanceOf(Response);
			const response = thrown as Response;
			expect(response.status).toBe(403);
			const body = (await response.json()) as ErrorResponse;
			expect(body.success).toBe(false);
			expect(body.error.code).toBe("FORBIDDEN");
		});
	});

	describe("content", () => {
		it("gives a data-viewer every tenant row, drafts included, and no other tenant's rows", async () => {
			const draftId = await seedLegacyEvent({
				tenantId,
				approvalStatus: "draft",
			});
			const publishedId = await seedLegacyEvent({
				tenantId,
				approvalStatus: "published",
			});
			const otherTenantId = await seedCountryAccount();
			const foreignId = await seedLegacyEvent({ tenantId: otherTenantId });

			const response = await exportAs(tenantId, "data-viewer");

			expect(response.status).toBe(200);
			const parsed = parseBody(await response.text());
			const ids = column(parsed, "id");
			expect(new Set(ids)).toEqual(new Set([draftId, publishedId]));
			expect(ids).not.toContain(foreignId);
			expect(new Set(column(parsed, "countryAccountsId"))).toEqual(
				new Set([tenantId]),
			);
			expect(column(parsed, "approvalStatus").sort()).toEqual([
				"draft",
				"published",
			]);
		});

		it("starts with the E1 legacy header followed by ,parent", async () => {
			await seedLegacyEvent({ tenantId });

			const text = await (await exportAs(tenantId, "data-viewer")).text();

			expect(text.split("\r\n")[0]).toBe(EXPECTED_HEADER_LINE);
		});

		it("ends every record with CRLF and has no bare LF", async () => {
			await seedLegacyEvent({ tenantId });
			await seedLegacyEvent({ tenantId });

			const text = await (await exportAs(tenantId, "data-viewer")).text();

			expect(text.endsWith("\r\n")).toBe(true);
			expect(text.replace(/\r\n/g, "")).not.toContain("\n");
			expect(text.split("\r\n")).toHaveLength(4);
		});

		it("writes no UTF-8 BOM", async () => {
			await seedLegacyEvent({ tenantId });

			const bytes = new Uint8Array(
				await (await exportAs(tenantId, "data-viewer")).arrayBuffer(),
			);

			expect([...bytes.slice(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
			expect(String.fromCharCode(bytes[0])).toBe(E1_HEADER[0][0]);
		});

		it("returns a header-only file at 200 for an empty tenant", async () => {
			const response = await exportAs(tenantId, "data-viewer");

			expect(response.status).toBe(200);
			expect(await response.text()).toBe(`${EXPECTED_HEADER_LINE}\r\n`);
		});
	});

	describe("response headers", () => {
		it("sends the RFC 4180 content type, the legacy filename and no-store", async () => {
			const response = await exportAs(tenantId, "data-viewer");

			expect(response.headers.get("Content-Type")).toBe(
				"text/csv; charset=utf-8; header=present",
			);
			expect(response.headers.get("Content-Disposition")).toBe(
				'attachment; filename="hazardous-event.csv"',
			);
			expect(response.headers.get("Cache-Control")).toBe("no-store");
		});
	});
});
