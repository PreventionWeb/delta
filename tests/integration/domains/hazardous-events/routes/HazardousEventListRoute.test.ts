import "../../../db/setup";
import "reflect-metadata";

import { randomUUID } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { RouterContextProvider } from "react-router";

import { HazardousEventsModule } from "~/domains/hazardous-events/infrastructure/HazardousEventsModule.server";
import { HAZARDOUS_EVENT_REPOSITORY } from "~/domains/hazardous-events/infrastructure/HazardousEventRepositoryToken";
import type { IHazardousEventRepository } from "~/domains/hazardous-events/application/ports/IHazardousEventRepository";
import { HazardousEvent } from "~/domains/hazardous-events/domain/HazardousEvent";
import { CreateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/CreateHazardousEvent";
import type { HazardousEventListItemDto } from "~/domains/hazardous-events/application/dto/HazardousEventListItemDto";
import {
	seedCountryAccount,
	seedSpecificHazard,
} from "../../../db/models/hazardousEventTestHelpers";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";
import {
	withRequestContext,
	getRequestContext,
} from "~/utils/requestContext.server";
import { i18nextMiddleware } from "~/middleware/i18next.server";

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
import { loader } from "~/routes/$lang+/_authenticated+/he-preview+/_index";

const mockGetCountryAccountsIdFromSession = vi.mocked(
	getCountryAccountsIdFromSession,
);
const mockGetUserRoleFromSession = vi.mocked(getUserRoleFromSession);
const mockRequireUser = vi.mocked(requireUser);

function baseEventProps(
	id: string,
	tenantId: string,
	specificHazardId: string,
) {
	return {
		id,
		tenantId,
		specificHazardId,
		startDate: "2026-01-01",
		endDate: "",
		nationalSpecification: "",
		description: "",
		chainsExplanation: "",
		magnitude: "",
		recordOriginator: "",
		dataSource: "",
		hazardousEventStatus: null,
		specificHazardLocalName: null,
		specificHazardNationalName: null,
		apiImportId: null,
		createdByUserId: null,
		updatedByUserId: null,
		submittedByUserId: null,
		submittedAt: null,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: null,
		hazardDriverIds: [],
		attachments: [],
		fieldValues: [],
		customFieldValues: [],
	};
}

/** Direct repository insert bypasses CreateHazardousEventUseCase, so no WorkflowInstance row is
 * ever created for it -- DEF-031's own "no WorkflowInstance" state. */
async function seedEventWithoutWorkflow(
	tenantId: string,
	specificHazardId: string,
): Promise<string> {
	const id = randomUUID();
	const repository = testingModule.get<IHazardousEventRepository>(
		HAZARDOUS_EVENT_REPOSITORY,
	);
	const entity = HazardousEvent.create(
		baseEventProps(id, tenantId, specificHazardId),
		new Set(),
		new Set(),
	);
	await repository.insert(entity);
	return id;
}

async function seedEventWithWorkflow(
	tenantId: string,
	specificHazardId: string,
): Promise<string> {
	const useCase = testingModule.get(CreateHazardousEventUseCase);
	const dto = await useCase.execute({
		tenantId,
		specificHazardId,
		startDate: "2026-01-01",
		endDate: "",
		nationalSpecification: "",
		description: "",
		chainsExplanation: "",
		magnitude: "",
		recordOriginator: "",
		dataSource: "",
		hazardousEventStatus: null,
		specificHazardLocalName: null,
		specificHazardNationalName: null,
		apiImportId: null,
		actingUserId: randomUUID(),
		hazardDriverIds: [],
		attachments: [],
		fieldValues: [],
		customFieldValues: [],
	});
	return dto.id;
}

// Primes the private i18next context key by running the real middleware (Notices precedent).
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
	// null (not the default "data-viewer" param), not undefined, so callers can explicitly request
	// "no role" without JS default-parameter substitution silently overriding an explicit undefined.
	role: string | null = "data-viewer",
) {
	mockGetCountryAccountsIdFromSession.mockResolvedValue(
		tenantIdForSession ?? undefined,
	);
	mockGetUserRoleFromSession.mockResolvedValue((role ?? undefined) as never);
	mockRequireUser.mockResolvedValue({} as never);
	const request = new Request(url);
	const context = await makeI18nContext(url);
	// Cast needed: the loader only destructures request/params/context, so the
	// missing url/pattern fields of a real LoaderFunctionArgs don't matter here.
	return {
		request,
		params: { lang: "en" },
		context,
	} as unknown as Parameters<typeof loader>[0];
}

describe("Hazardous event list route loader", () => {
	let tenantId: string;
	let specificHazardId: string;

	beforeEach(async () => {
		testingModule = await Test.createTestingModule({
			imports: [HazardousEventsModule],
		}).compile();

		mockGetCountryAccountsIdFromSession.mockReset();
		mockGetUserRoleFromSession.mockReset();
		mockRequireUser.mockReset();
		tenantId = await seedCountryAccount();
		specificHazardId = await seedSpecificHazard();
	});

	afterEach(async () => {
		await testingModule.close();
	});

	// Matches legacy's own pagination/api.server.ts DEFAULT_PAGE_SIZE.
	it("defaults to page 1, pageSize 50 when no query params are supplied", async () => {
		const { ListHazardousEventsUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/ListHazardousEvents");
		const executeSpy = vi.spyOn(
			testingModule.get(ListHazardousEventsUseCase),
			"execute",
		);

		await loader(await makeArgs("http://localhost/en/he-preview", tenantId));

		expect(executeSpy).toHaveBeenCalledWith({
			tenantId,
			page: 1,
			pageSize: 50,
		});
		executeSpy.mockRestore();
	});

	it("forwards explicit valid page/pageSize query params as-is", async () => {
		const { ListHazardousEventsUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/ListHazardousEvents");
		const executeSpy = vi.spyOn(
			testingModule.get(ListHazardousEventsUseCase),
			"execute",
		);

		await loader(
			await makeArgs(
				"http://localhost/en/he-preview?page=3&pageSize=50",
				tenantId,
			),
		);

		expect(executeSpy).toHaveBeenCalledWith({
			tenantId,
			page: 3,
			pageSize: 50,
		});
		executeSpy.mockRestore();
	});

	it("falls back to defaults when page/pageSize are malformed", async () => {
		const { ListHazardousEventsUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/ListHazardousEvents");
		const executeSpy = vi.spyOn(
			testingModule.get(ListHazardousEventsUseCase),
			"execute",
		);

		await loader(
			await makeArgs(
				"http://localhost/en/he-preview?page=abc&pageSize=xyz",
				tenantId,
			),
		);

		expect(executeSpy).toHaveBeenCalledWith({
			tenantId,
			page: 1,
			pageSize: 50,
		});
		executeSpy.mockRestore();
	});

	it("clamps pageSize to a maximum of 100", async () => {
		const { ListHazardousEventsUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/ListHazardousEvents");
		const executeSpy = vi.spyOn(
			testingModule.get(ListHazardousEventsUseCase),
			"execute",
		);

		await loader(
			await makeArgs("http://localhost/en/he-preview?pageSize=500", tenantId),
		);

		expect(executeSpy).toHaveBeenCalledWith({
			tenantId,
			page: 1,
			pageSize: 100,
		});
		executeSpy.mockRestore();
	});

	it("returns items + totalCount with no generic success wrapper, covering both DEF-031 WorkflowInstance states", async () => {
		const withWorkflowId = await seedEventWithWorkflow(
			tenantId,
			specificHazardId,
		);
		const withoutWorkflowId = await seedEventWithoutWorkflow(
			tenantId,
			specificHazardId,
		);

		const result = (await loader(
			await makeArgs("http://localhost/en/he-preview", tenantId),
		)) as { items: HazardousEventListItemDto[]; totalCount: number };

		expect(Array.isArray(result.items)).toBe(true);
		expect(result).not.toHaveProperty("success");
		expect(result.totalCount).toBeGreaterThanOrEqual(2);
		const byId = new Map(result.items.map((r) => [r.id, r]));
		expect(byId.get(withWorkflowId)?.workflowStatus).not.toBeNull();
		expect(byId.get(withoutWorkflowId)?.workflowStatus).toBeNull();
	});

	it("throws a redirect to /{lang}/user/select-instance when no tenant can be resolved", async () => {
		let thrown: unknown;
		try {
			await loader(await makeArgs("http://localhost/en/he-preview", null));
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/en/user/select-instance");
	});

	// Regression: ViewData must be checked after tenant resolution, not before -- see
	// requireViewDataPermission.server.ts for why checking order matters here.
	it("redirects to select-instance (not 403) when no tenant can be resolved, even with no ViewData role", async () => {
		let thrown: unknown;
		try {
			await loader(
				await makeArgs("http://localhost/en/he-preview", null, null),
			);
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/en/user/select-instance");
	});

	it("uses getRequestContext().tenantId and skips the session fallback when context is active", async () => {
		const url = "http://localhost/en/he-preview";
		const context = await makeI18nContext(url);
		mockGetUserRoleFromSession.mockResolvedValue("data-viewer" as never);
		mockRequireUser.mockResolvedValue({} as never);
		const result = await withRequestContext(async () => {
			const ctx = getRequestContext();
			if (ctx) ctx.tenantId = tenantId;
			return loader({
				request: new Request(url),
				params: { lang: "en" },
				context,
			} as unknown as Parameters<typeof loader>[0]);
		});

		expect(Array.isArray((result as { items: unknown[] }).items)).toBe(true);
		expect(mockGetCountryAccountsIdFromSession).not.toHaveBeenCalled();
	});

	it("throws the ADR-003 envelope with the correct status when the use case throws a DomainError", async () => {
		const { ListHazardousEventsUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/ListHazardousEvents");
		const { ValidationError } = await import("~/shared/errors/DomainError");
		const domainError = new ValidationError("bad query", { field: "page" });
		const executeSpy = vi
			.spyOn(testingModule.get(ListHazardousEventsUseCase), "execute")
			.mockRejectedValueOnce(domainError);

		let thrown: unknown;
		try {
			await loader(await makeArgs("http://localhost/en/he-preview", tenantId));
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(422);
		const body = (await response.json()) as ErrorResponse;
		expect(body.success).toBe(false);
		expect(body.error.code).toBe("VALIDATION_ERROR");
		expect(body.error.details).toEqual({ field: "page" });

		executeSpy.mockRestore();
	});

	it("sources the ADR-003 envelope's traceId from the active request context", async () => {
		const { ListHazardousEventsUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/ListHazardousEvents");
		const { ValidationError } = await import("~/shared/errors/DomainError");
		const executeSpy = vi
			.spyOn(testingModule.get(ListHazardousEventsUseCase), "execute")
			.mockRejectedValueOnce(new ValidationError("bad query"));
		const url = "http://localhost/en/he-preview";
		const context = await makeI18nContext(url);

		let thrown: unknown;
		await withRequestContext(
			async () => {
				const ctx = getRequestContext();
				if (ctx) ctx.tenantId = tenantId;
				try {
					await loader({
						request: new Request(url),
						params: { lang: "en" },
						context,
					} as unknown as Parameters<typeof loader>[0]);
				} catch (err) {
					thrown = err;
				}
			},
			{ traceId: "trace-123" },
		);

		const body = (await (thrown as Response).json()) as ErrorResponse;
		expect(body.error.traceId).toBe("trace-123");
		executeSpy.mockRestore();
	});

	it("generates a fresh traceId when no request context is active", async () => {
		const { ListHazardousEventsUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/ListHazardousEvents");
		const { ValidationError } = await import("~/shared/errors/DomainError");
		const executeSpy = vi
			.spyOn(testingModule.get(ListHazardousEventsUseCase), "execute")
			.mockRejectedValueOnce(new ValidationError("bad query"));

		let thrown: unknown;
		try {
			await loader(await makeArgs("http://localhost/en/he-preview", tenantId));
		} catch (err) {
			thrown = err;
		}

		const body = (await (thrown as Response).json()) as ErrorResponse;
		expect(body.error.traceId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
		executeSpy.mockRestore();
	});

	it("calls requireUser before resolving the tenant (session gate runs first)", async () => {
		await loader(await makeArgs("http://localhost/en/he-preview", tenantId));

		expect(mockRequireUser).toHaveBeenCalledTimes(1);
	});

	it("propagates requireUser's own redirect unmodified when unauthenticated", async () => {
		const redirect = new Response(null, {
			status: 302,
			headers: { Location: "/en/user/login" },
		});
		mockRequireUser.mockRejectedValueOnce(redirect);
		const { ListHazardousEventsUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/ListHazardousEvents");
		const executeSpy = vi.spyOn(
			testingModule.get(ListHazardousEventsUseCase),
			"execute",
		);

		let thrown: unknown;
		try {
			await loader(await makeArgs("http://localhost/en/he-preview", tenantId));
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBe(redirect);
		expect(executeSpy).not.toHaveBeenCalled();
		executeSpy.mockRestore();
	});

	it("logs and rethrows a non-DomainError failure unmodified", async () => {
		const { getPinoLogger } =
			await import("~/infrastructure/logging/PinoLogger.server");
		const errorSpy = vi.spyOn(getPinoLogger(), "error");

		const { ListHazardousEventsUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/ListHazardousEvents");
		const dbError = new Error("DB connection lost");
		const executeSpy = vi
			.spyOn(testingModule.get(ListHazardousEventsUseCase), "execute")
			.mockRejectedValueOnce(dbError);

		let thrown: unknown;
		try {
			await loader(await makeArgs("http://localhost/en/he-preview", tenantId));
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBe(dbError);
		expect(errorSpy).toHaveBeenCalledTimes(1);

		executeSpy.mockRestore();
		errorSpy.mockRestore();
	});

	it("rejects a session without ViewData with a 403 FORBIDDEN, without calling the use case", async () => {
		const { ListHazardousEventsUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/ListHazardousEvents");
		const executeSpy = vi.spyOn(
			testingModule.get(ListHazardousEventsUseCase),
			"execute",
		);

		let thrown: unknown;
		try {
			await loader(
				await makeArgs("http://localhost/en/he-preview", tenantId, null),
			);
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(403);
		const body = (await response.json()) as ErrorResponse;
		expect(body.error.code).toBe("FORBIDDEN");
		expect(executeSpy).not.toHaveBeenCalled();

		executeSpy.mockRestore();
	});
});
