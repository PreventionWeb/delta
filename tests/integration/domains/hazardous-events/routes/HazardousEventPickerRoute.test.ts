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
import {
	seedCountryAccount,
	seedSpecificHazard,
} from "../../../db/models/hazardousEventTestHelpers";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";
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
import { loader } from "~/routes/$lang+/_authenticated+/he-preview+/picker";

const mockGetCountryAccountsIdFromSession = vi.mocked(
	getCountryAccountsIdFromSession,
);
const mockGetUserRoleFromSession = vi.mocked(getUserRoleFromSession);
const mockRequireUser = vi.mocked(requireUser);

const TEST_USER_ID = randomUUID();

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

async function seedEvent(
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
	role: string | null = "data-collector",
) {
	mockGetCountryAccountsIdFromSession.mockResolvedValue(
		tenantIdForSession ?? undefined,
	);
	mockGetUserRoleFromSession.mockResolvedValue((role ?? undefined) as never);
	mockRequireUser.mockResolvedValue({
		user: { id: TEST_USER_ID },
		session: {},
	} as never);
	const request = new Request(url);
	const context = await makeI18nContext(url);
	return {
		request,
		params: { lang: "en" },
		context,
	} as unknown as Parameters<typeof loader>[0];
}

describe("Hazardous event picker route loader", () => {
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

	it("is tenant-scoped, returning only events for the resolved tenant", async () => {
		const otherTenantId = await seedCountryAccount();
		const ownId = await seedEvent(tenantId, specificHazardId);
		await seedEvent(otherTenantId, specificHazardId);

		const result = await loader(
			await makeArgs("http://localhost/en/he-preview/picker", tenantId),
		);

		expect(result.items.map((item) => item.id)).toEqual([ownId]);
	});

	it("returns the resolved session role, not always null (code review finding)", async () => {
		const result = await loader(
			await makeArgs(
				"http://localhost/en/he-preview/picker",
				tenantId,
				"admin",
			),
		);

		expect(result.role).toBe("admin");
	});

	it("rejects a session without EditData with a 403 FORBIDDEN", async () => {
		let thrown: unknown;
		try {
			await loader(
				await makeArgs(
					"http://localhost/en/he-preview/picker",
					tenantId,
					"data-viewer",
				),
			);
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(403);
		const body = (await response.json()) as ErrorResponse;
		expect(body.error.code).toBe("FORBIDDEN");
	});

	it("loads the hazardous-events namespace before a 403 is thrown (6b, D5)", async () => {
		const args = await makeArgs(
			"http://localhost/en/he-preview/picker",
			tenantId,
			"data-viewer",
		);

		const thrown = await loader(args).catch((e: unknown) => e);

		expect((thrown as Response).status).toBe(403);
		expect(
			getInstance(args.context).hasLoadedNamespace("hazardous-events"),
		).toBe(true);
	});

	it("still redirects an unauthenticated request to login (6b, D5)", async () => {
		const redirect = new Response(null, {
			status: 302,
			headers: { Location: "/en/user/login" },
		});
		const args = await makeArgs(
			"http://localhost/en/he-preview/picker",
			tenantId,
		);
		mockRequireUser.mockReset();
		mockRequireUser.mockRejectedValueOnce(redirect);

		const thrown = await loader(args).catch((e: unknown) => e);

		expect(thrown).toBe(redirect);
	});

	it("throws a 500 INTERNAL_ERROR envelope for a non-DomainError use-case failure (6b, D4)", async () => {
		const { getPinoLogger } =
			await import("~/infrastructure/logging/PinoLogger.server");
		const errorSpy = vi
			.spyOn(getPinoLogger(), "error")
			.mockImplementation(() => undefined);
		const { ListHazardousEventsUseCase } =
			await import("~/domains/hazardous-events/application/use-cases/ListHazardousEvents");
		const executeSpy = vi
			.spyOn(testingModule.get(ListHazardousEventsUseCase), "execute")
			.mockRejectedValueOnce(new Error("picker-secret"));

		const thrown = await loader(
			await makeArgs("http://localhost/en/he-preview/picker", tenantId),
		).catch((e: unknown) => e);

		expect((thrown as Response).status).toBe(500);
		const text = await (thrown as Response).text();
		const body = JSON.parse(text) as ErrorResponse;
		expect(body.error.code).toBe("INTERNAL_ERROR");
		expect(body.error).not.toHaveProperty("details");
		expect(text).not.toContain("picker-secret");
		expect(errorSpy).toHaveBeenCalledTimes(1);
		executeSpy.mockRestore();
		errorSpy.mockRestore();
	});

	it("redirects to /{lang}/user/select-instance when no tenant can be resolved", async () => {
		let thrown: unknown;
		try {
			await loader(
				await makeArgs("http://localhost/en/he-preview/picker", null),
			);
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.headers.get("Location")).toBe("/en/user/select-instance");
	});
});
