import "../../../db/setup";
import "reflect-metadata";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { RouterContextProvider } from "react-router";

import { NoticesModule } from "~/domains/notices/infrastructure/NoticesModule.server";
import { dr } from "~/db.server";
import { noticesTable } from "~/drizzle/schema/noticesTable";
import { countriesTable } from "../../../db/testSchema/countriesTable";
import { countryAccounts } from "../../../db/testSchema/countryAccounts";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";
import {
	withRequestContext,
	getRequestContext,
} from "~/utils/requestContext.server";
import { i18nextMiddleware, getInstance } from "~/middleware/i18next.server";

// vi.mock factories run lazily on first import of the mocked module, by which
// point beforeEach has already set testingModule for the current test.
let testingModule: TestingModule;

vi.mock("~/init.server", () => ({
	getAppContext: () => ({
		get: (token: Parameters<TestingModule["get"]>[0]) =>
			testingModule.get(token),
	}),
}));

vi.mock("~/utils/session", async (importOriginal) => {
	const original = await importOriginal<Record<string, unknown>>();
	return { ...original, getCountryAccountsIdFromSession: vi.fn() };
});

import { getCountryAccountsIdFromSession } from "~/utils/session";
import { loader } from "~/routes/$lang+/_authenticated+/notices+/$id";

const mockGetCountryAccountsIdFromSession = vi.mocked(
	getCountryAccountsIdFromSession,
);

async function insertCountryAccount(): Promise<string> {
	const [country] = await dr
		.insert(countriesTable)
		.values({ name: `Test Country ${crypto.randomUUID().slice(0, 8)}` })
		.returning({ id: countriesTable.id });
	const [account] = await dr
		.insert(countryAccounts)
		.values({ shortDescription: "TST", countryId: country.id })
		.returning({ id: countryAccounts.id });
	return account.id;
}

describe("Notice detail route loader", () => {
	let tenantId: string;
	let noticeId: string;

	beforeEach(async () => {
		testingModule = await Test.createTestingModule({
			imports: [NoticesModule],
		}).compile();

		mockGetCountryAccountsIdFromSession.mockReset();

		tenantId = await insertCountryAccount();

		const [notice] = await dr
			.insert(noticesTable)
			.values({
				countryAccountsId: tenantId,
				titleJson: { en: "Test notice" },
				bodyJson: { en: "Body" },
				isPublished: true,
				audience: "all",
				publishedAt: new Date("2026-01-01T00:00:00.000Z"),
			})
			.returning({ id: noticesTable.id });
		noticeId = notice.id;
	});

	afterEach(async () => {
		await testingModule.close();
	});

	// Primes the private i18next context key by running the real middleware (design.md Decision 4).
	async function makeI18nContext(url: string): Promise<RouterContextProvider> {
		const context = new RouterContextProvider();
		await i18nextMiddleware(
			{
				request: new Request(url),
				params: {},
				context,
			} as unknown as Parameters<typeof i18nextMiddleware>[0],
			async () => new Response(),
		);
		return context;
	}

	async function makeArgs(
		id: string | undefined,
		tenantIdForSession: string | null,
	) {
		mockGetCountryAccountsIdFromSession.mockResolvedValue(
			tenantIdForSession ?? undefined,
		);
		const url = `http://localhost/en/notices/${id}`;
		const context = await makeI18nContext(url);
		// Cast needed: the loader only destructures request/params/context, so the
		// missing url/pattern fields of a real LoaderFunctionArgs don't matter here.
		return {
			request: new Request(url),
			params: { lang: "en", id },
			context,
		} as unknown as Parameters<typeof loader>[0];
	}

	it("returns the plain NoticeDto with no success wrapper for a known id", async () => {
		const result = await loader(await makeArgs(noticeId, tenantId));

		expect(result).toMatchObject({
			id: noticeId,
			tenantId,
			titleJson: { en: "Test notice" },
		});
		expect(result).not.toHaveProperty("success");
	});

	it("throws a 404 Response with error.code NOT_FOUND for an unknown id", async () => {
		const unknownId = crypto.randomUUID();

		let thrown: unknown;
		try {
			await loader(await makeArgs(unknownId, tenantId));
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(404);
		const body = (await response.json()) as ErrorResponse;
		expect(body.success).toBe(false);
		expect(body.error.code).toBe("NOT_FOUND");
	});

	it("throws a 404, not the other tenant's data, when the notice belongs to a different tenant", async () => {
		const otherTenantId = await insertCountryAccount();

		let thrown: unknown;
		try {
			await loader(await makeArgs(noticeId, otherTenantId));
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(404);
		const body = (await response.json()) as ErrorResponse;
		expect(body.error.code).toBe("NOT_FOUND");
	});

	it("throws a redirect to /{lang}/user/select-instance when no tenant can be resolved", async () => {
		let thrown: unknown;
		try {
			await loader(await makeArgs(noticeId, null));
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/en/user/select-instance");
	});

	it("uses getRequestContext().tenantId and skips the session fallback when context is active", async () => {
		const url = `http://localhost/en/notices/${noticeId}`;
		const context = await makeI18nContext(url);
		const result = await withRequestContext(async () => {
			const ctx = getRequestContext();
			if (ctx) ctx.tenantId = tenantId;
			// Cast needed: the loader only destructures request/params/context.
			return loader({
				request: new Request(url),
				params: { lang: "en", id: noticeId },
				context,
			} as unknown as Parameters<typeof loader>[0]);
		});

		expect(result).toMatchObject({ id: noticeId, tenantId });
		expect(mockGetCountryAccountsIdFromSession).not.toHaveBeenCalled();
	});

	it("completes without throwing when the loader's context supports getInstance(context).loadNamespaces", async () => {
		const context = await makeI18nContext(
			`http://localhost/en/notices/${noticeId}`,
		);

		let thrown: unknown;
		try {
			await getInstance(context).loadNamespaces(["notices", "common"]);
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeUndefined();
	});

	it("logs and rethrows a non-DomainError failure unmodified", async () => {
		const { getPinoLogger } =
			await import("~/infrastructure/logging/PinoLogger.server");
		const errorSpy = vi.spyOn(getPinoLogger(), "error");

		const { GetNoticeByIdUseCase } =
			await import("~/domains/notices/application/use-cases/GetNoticeById");
		const dbError = new Error("DB connection lost");
		const executeSpy = vi
			.spyOn(testingModule.get(GetNoticeByIdUseCase), "execute")
			.mockRejectedValueOnce(dbError);

		let thrown: unknown;
		try {
			await loader(await makeArgs(noticeId, tenantId));
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBe(dbError);
		expect(errorSpy).toHaveBeenCalledTimes(1);

		executeSpy.mockRestore();
		errorSpy.mockRestore();
	});
});
