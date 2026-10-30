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
import { loader } from "~/routes/$lang+/_authenticated+/he-preview+/$id";

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
	// null (not the default "data-viewer" param), not undefined, so callers can explicitly request
	// "no role" without JS default-parameter substitution silently overriding an explicit undefined.
	role: string | null = "data-viewer",
) {
	mockGetCountryAccountsIdFromSession.mockResolvedValue(
		tenantIdForSession ?? undefined,
	);
	mockGetUserRoleFromSession.mockResolvedValue((role ?? undefined) as never);
	mockRequireUser.mockResolvedValue({} as never);
	const url = `http://localhost/en/he-preview/${id}`;
	const context = await makeI18nContext(url);
	return {
		request: new Request(url),
		params: { lang: "en", id },
		context,
	} as unknown as Parameters<typeof loader>[0];
}

describe("Hazardous event detail route loader", () => {
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

	it("returns the plain detail DTO with no success wrapper for a known id with a WorkflowInstance", async () => {
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);

		const result = await loader(await makeArgs(id, tenantId));

		expect(result).toMatchObject({ id, tenantId });
		expect(
			(result as { workflowStatus: unknown }).workflowStatus,
		).not.toBeNull();
		expect(result).not.toHaveProperty("success");
	});

	it("returns workflowStatus null (DEF-031), not a thrown error, for a known id with no WorkflowInstance", async () => {
		const id = await seedEventWithoutWorkflow(tenantId, specificHazardId);

		const result = await loader(await makeArgs(id, tenantId));

		expect(result).toMatchObject({ id, tenantId });
		expect((result as { workflowStatus: unknown }).workflowStatus).toBeNull();
	});

	it("throws a 404 Response with error.code NOT_FOUND for an unknown id", async () => {
		const unknownId = randomUUID();

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

	it("throws a 404, not the other tenant's data, when the event belongs to a different tenant", async () => {
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);
		const otherTenantId = await seedCountryAccount();

		let thrown: unknown;
		try {
			await loader(await makeArgs(id, otherTenantId));
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
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);

		let thrown: unknown;
		try {
			await loader(await makeArgs(id, null));
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
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);

		let thrown: unknown;
		try {
			await loader(await makeArgs(id, null, null));
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/en/user/select-instance");
	});

	it("uses getRequestContext().tenantId and skips the session fallback when context is active", async () => {
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);
		const url = `http://localhost/en/he-preview/${id}`;
		const context = await makeI18nContext(url);
		mockGetUserRoleFromSession.mockResolvedValue("data-viewer" as never);
		mockRequireUser.mockResolvedValue({} as never);
		const result = await withRequestContext(async () => {
			const ctx = getRequestContext();
			if (ctx) ctx.tenantId = tenantId;
			return loader({
				request: new Request(url),
				params: { lang: "en", id },
				context,
			} as unknown as Parameters<typeof loader>[0]);
		});

		expect(result).toMatchObject({ id, tenantId });
		expect(mockGetCountryAccountsIdFromSession).not.toHaveBeenCalled();
	});

	it("sources the ADR-003 envelope's traceId from the active request context", async () => {
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);
		const url = `http://localhost/en/he-preview/${id}`;
		const context = await makeI18nContext(url);
		const { GetHazardousEventByIdUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
		const { ValidationError } = await import("~/shared/errors/DomainError");
		const executeSpy = vi
			.spyOn(testingModule.get(GetHazardousEventByIdUseCase), "execute")
			.mockRejectedValueOnce(new ValidationError("bad id"));

		let thrown: unknown;
		await withRequestContext(
			async () => {
				const ctx = getRequestContext();
				if (ctx) ctx.tenantId = tenantId;
				try {
					await loader({
						request: new Request(url),
						params: { lang: "en", id },
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
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);
		const { GetHazardousEventByIdUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
		const { ValidationError } = await import("~/shared/errors/DomainError");
		const executeSpy = vi
			.spyOn(testingModule.get(GetHazardousEventByIdUseCase), "execute")
			.mockRejectedValueOnce(new ValidationError("bad id"));

		let thrown: unknown;
		try {
			await loader(await makeArgs(id, tenantId));
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
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);

		await loader(await makeArgs(id, tenantId));

		expect(mockRequireUser).toHaveBeenCalledTimes(1);
	});

	it("propagates requireUser's own redirect unmodified when unauthenticated", async () => {
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);
		const redirect = new Response(null, {
			status: 302,
			headers: { Location: "/en/user/login" },
		});
		mockRequireUser.mockRejectedValueOnce(redirect);
		const { GetHazardousEventByIdUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
		const executeSpy = vi.spyOn(
			testingModule.get(GetHazardousEventByIdUseCase),
			"execute",
		);

		let thrown: unknown;
		try {
			await loader(await makeArgs(id, tenantId));
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBe(redirect);
		expect(executeSpy).not.toHaveBeenCalled();
		executeSpy.mockRestore();
	});

	it("logs and rethrows a non-DomainError failure unmodified", async () => {
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);
		const { getPinoLogger } =
			await import("~/infrastructure/logging/PinoLogger.server");
		const errorSpy = vi.spyOn(getPinoLogger(), "error");

		const { GetHazardousEventByIdUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
		const dbError = new Error("DB connection lost");
		const executeSpy = vi
			.spyOn(testingModule.get(GetHazardousEventByIdUseCase), "execute")
			.mockRejectedValueOnce(dbError);

		let thrown: unknown;
		try {
			await loader(await makeArgs(id, tenantId));
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBe(dbError);
		expect(errorSpy).toHaveBeenCalledTimes(1);

		executeSpy.mockRestore();
		errorSpy.mockRestore();
	});

	it("rejects a session without ViewData with a 403 FORBIDDEN, without calling the use case", async () => {
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);
		const { GetHazardousEventByIdUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
		const executeSpy = vi.spyOn(
			testingModule.get(GetHazardousEventByIdUseCase),
			"execute",
		);

		let thrown: unknown;
		try {
			await loader(await makeArgs(id, tenantId, null));
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

	// design.md Risk: IHazardousEventRepository.findById is a Drizzle uuid-column lookup -- a
	// non-UUID string raises a raw Postgres 22P02 error (not a DomainError), surfacing as an
	// unhandled 500, not a clean 404. Confirmed against the real DrizzleHazardousEventRepository
	// behavior, not assumed.
	it("propagates a raw error (not a clean 404) for a malformed, non-UUID id param", async () => {
		await expect(
			loader(await makeArgs("not-a-uuid", tenantId)),
		).rejects.not.toBeInstanceOf(Response);
	});
});
