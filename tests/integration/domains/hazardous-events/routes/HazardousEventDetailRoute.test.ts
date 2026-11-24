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
	seedUser,
} from "../../../db/models/hazardousEventTestHelpers";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";
import {
	withRequestContext,
	getRequestContext,
} from "~/utils/requestContext.server";
import { getInstance, i18nextMiddleware } from "~/middleware/i18next.server";

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
import { loader as editLoader } from "~/routes/$lang+/_authenticated+/he-preview+/edit.$id";

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
		actingUserId: await seedUser(),
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

	// design.md Decision 11: role no longer surfaced (Edit/add-cause links removed);
	// requireViewDataPermission() still runs for its 403 gate (covered below), just not captured.
	it("does not include a role field alongside the detail DTO (design.md Decision 11)", async () => {
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);

		const result = await loader(await makeArgs(id, tenantId, "data-collector"));

		expect(result).not.toHaveProperty("role");
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

	it("sends no details and not the requested id in a not-found body (6b, D8)", async () => {
		const unknownId = randomUUID();

		const thrown = await loader(await makeArgs(unknownId, tenantId)).catch(
			(e: unknown) => e,
		);

		expect((thrown as Response).status).toBe(404);
		const text = await (thrown as Response).text();
		expect((JSON.parse(text) as ErrorResponse).error).not.toHaveProperty(
			"details",
		);
		expect(text).not.toContain(unknownId);
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

	it("loads the French hazardous-events namespace before a 403 is thrown (6b, D5)", async () => {
		const id = randomUUID();
		const url = `http://localhost/fr/he-preview/${id}`;
		mockGetCountryAccountsIdFromSession.mockResolvedValue(tenantId);
		mockGetUserRoleFromSession.mockResolvedValue(undefined as never);
		mockRequireUser.mockResolvedValue({} as never);
		const context = await makeI18nContext(url);

		const thrown = await loader({
			request: new Request(url),
			params: { lang: "fr", id },
			context,
		} as unknown as Parameters<typeof loader>[0]).catch((e: unknown) => e);

		expect((thrown as Response).status).toBe(403);
		const i18n = getInstance(context);
		expect(i18n.language).toBe("fr");
		expect(i18n.hasLoadedNamespace("hazardous-events")).toBe(true);
		expect(i18n.getResource("fr", "hazardous-events", "title")).toBe(
			"Événements dangereux",
		);
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

	/** Silences error logs, recording each call's argument and the active request traceId. */
	async function spyOnErrorLog() {
		const { getPinoLogger } =
			await import("~/infrastructure/logging/PinoLogger.server");
		const loggedTraceIds: (string | undefined)[] = [];
		const loggedArgs: unknown[] = [];
		const spy = vi.spyOn(getPinoLogger(), "error").mockImplementation((arg) => {
			loggedArgs.push(arg);
			loggedTraceIds.push(getRequestContext()?.traceId);
		});
		return { spy, loggedTraceIds, loggedArgs };
	}

	/** Runs the loader under a request context with `traceId`; the use case rejects with `failure`. */
	async function loaderFailingWith(
		failure: unknown,
		traceId: string,
	): Promise<{ thrown: unknown; url: string }> {
		const id = await seedEventWithWorkflow(tenantId, specificHazardId);
		const url = `http://localhost/en/he-preview/${id}`;
		const context = await makeI18nContext(url);
		const { GetHazardousEventByIdUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/GetHazardousEventById");
		vi.spyOn(
			testingModule.get(GetHazardousEventByIdUseCase),
			"execute",
		).mockRejectedValueOnce(failure);

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
			{ traceId },
		);
		return { thrown, url };
	}

	describe("non-DomainError failures (6b, D4)", () => {
		beforeEach(() => {
			mockGetUserRoleFromSession.mockResolvedValue("data-viewer" as never);
			mockRequireUser.mockResolvedValue({} as never);
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("throws a 500 INTERNAL_ERROR envelope with the request traceId, no details and nothing from the error", async () => {
			const log = await spyOnErrorLog();

			const { thrown } = await loaderFailingWith(
				new Error("DB connection lost"),
				"trace-500",
			);

			expect(thrown).toBeInstanceOf(Response);
			const response = thrown as Response;
			expect(response.status).toBe(500);
			const text = await response.text();
			const body = JSON.parse(text) as ErrorResponse;
			expect(body.success).toBe(false);
			expect(body.error.code).toBe("INTERNAL_ERROR");
			expect(body.error.traceId).toBe("trace-500");
			expect(body.error.message).toBe(
				"An unexpected error occurred. Please try again later.",
			);
			expect(typeof body.error.timestamp).toBe("string");
			expect(body.error).not.toHaveProperty("details");
			expect(text).not.toContain("DB connection lost");
			expect(log.loggedTraceIds).toEqual(["trace-500"]);
		});

		it("logs the original error and the request URL exactly once", async () => {
			const log = await spyOnErrorLog();
			const dbError = new Error("DB connection lost");

			const { url } = await loaderFailingWith(dbError, "trace-log");

			expect(log.loggedArgs).toHaveLength(1);
			expect(log.loggedArgs[0]).toMatchObject({ err: dbError, url });
		});

		it("propagates a thrown redirect Response unchanged without logging", async () => {
			const log = await spyOnErrorLog();
			const redirect = new Response(null, {
				status: 302,
				headers: { Location: "/en/somewhere" },
			});

			const { thrown } = await loaderFailingWith(redirect, "trace-302");

			expect(thrown).toBe(redirect);
			expect(log.loggedArgs).toEqual([]);
		});

		it("keeps each of two concurrent failing requests' own trace id", async () => {
			await spyOnErrorLog();

			const [a, b] = await Promise.all([
				loaderFailingWith(new Error("a"), "trace-a"),
				loaderFailingWith(new Error("b"), "trace-b"),
			]);

			const bodyA = (await (a.thrown as Response).json()) as ErrorResponse;
			const bodyB = (await (b.thrown as Response).json()) as ErrorResponse;
			expect(bodyA.error.traceId).toBe("trace-a");
			expect(bodyB.error.traceId).toBe("trace-b");
		});
	});

	it("serves concurrent malformed-id detail and edit requests each a 404 with its own trace id", async () => {
		mockGetCountryAccountsIdFromSession.mockResolvedValue(tenantId);
		mockGetUserRoleFromSession.mockResolvedValue("admin" as never);
		mockRequireUser.mockResolvedValue({ user: { id: randomUUID() } } as never);
		const run = async (
			path: string,
			id: string,
			traceId: string,
			call: (args: never) => Promise<unknown>,
		) => {
			const url = `http://localhost/en/he-preview/${path}`;
			const context = await makeI18nContext(url);
			let thrown: unknown;
			await withRequestContext(
				async () => {
					try {
						await call({
							request: new Request(url),
							params: { lang: "en", id },
							context,
						} as never);
					} catch (err) {
						thrown = err;
					}
				},
				{ traceId },
			);
			return thrown as Response;
		};

		const [detail, edit] = await Promise.all([
			run("not-a-uuid", "not-a-uuid", "trace-detail", loader),
			run("edit/also-bad", "also-bad", "trace-edit", editLoader),
		]);

		expect([detail.status, edit.status]).toEqual([404, 404]);
		const detailBody = (await detail.json()) as ErrorResponse;
		const editBody = (await edit.json()) as ErrorResponse;
		expect(detailBody.error.traceId).toBe("trace-detail");
		expect(editBody.error.traceId).toBe("trace-edit");
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

	it("throws a 404 NOT_FOUND, with no SQL text, for a malformed, non-UUID id param", async () => {
		let thrown: unknown;
		try {
			await loader(await makeArgs("not-a-uuid", tenantId));
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(404);
		const text = await response.text();
		expect((JSON.parse(text) as ErrorResponse).error.code).toBe("NOT_FOUND");
		expect(text).not.toMatch(/select|Failed query/i);
	});
});
