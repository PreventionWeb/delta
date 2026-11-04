import { describe, expect, it, vi, beforeEach } from "vitest";
import type { INestApplicationContext } from "@nestjs/common";
import type { ILogger } from "~/shared/logging/ILogger";
import type { ValidatorCandidate } from "~/domains/validation-workflow/application/ports/IValidatorCandidateRepository";
import type { ParsedHazardousEventFormData } from "./parseHazardousEventFormData.server";

vi.mock("~/init.server", () => ({ getAppContext: vi.fn() }));
vi.mock("~/infrastructure/logging/PinoLogger.server", () => ({
	getPinoLogger: vi.fn(),
}));

import { getAppContext } from "~/init.server";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";
import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { FindValidatorCandidatesUseCase } from "~/domains/validation-workflow/application/use-cases/FindValidatorCandidates";
import {
	composeWorkflowAction,
	buildWorkflowComposerCallbacks,
} from "./composeWorkflowAction.server";

const mockGetAppContext = vi.mocked(getAppContext);
const mockGetPinoLogger = vi.mocked(getPinoLogger);

function parsed(
	overrides: Partial<ParsedHazardousEventFormData> = {},
): ParsedHazardousEventFormData {
	return {
		specificHazardId: "",
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
		causeId: undefined,
		causalityExplanation: null,
		causeIdChanged: false,
		spatialObservation: undefined,
		spatialObservationChanged: false,
		attachments: [],
		tempAction: null,
		validatorUserIds: [],
		...overrides,
	};
}

function makeProcessWorkflowActionUseCase() {
	return { execute: vi.fn().mockResolvedValue(undefined) };
}

describe("composeWorkflowAction", () => {
	beforeEach(() => {
		// Explicit reset, not relied-upon call ordering -- each test that needs a specific `warn`
		// behavior still sets its own mockReturnValue, but this removes the implicit assumption
		// that no earlier test's stub leaks into a later one.
		mockGetPinoLogger.mockReset();
		mockGetPinoLogger.mockReturnValue({ warn: vi.fn() } as unknown as ILogger);
	});

	it("returns { attempted: false } and calls nothing for a null mappedAction", async () => {
		const processWorkflowActionUseCase = makeProcessWorkflowActionUseCase();
		const getRecordDisplayName = vi.fn();

		const result = await composeWorkflowAction({
			processWorkflowActionUseCase,
			mappedAction: null,
			parsed: parsed(),
			entityId: "event-1",
			actingUserId: "user-1",
			actingUserRole: "data-collector",
			getRecordDisplayName,
			validatorUserIds: [],
		});

		expect(result).toEqual({ attempted: false });
		expect(getRecordDisplayName).not.toHaveBeenCalled();
		expect(processWorkflowActionUseCase.execute).not.toHaveBeenCalled();
	});

	it("calls getRecordDisplayName exactly once for submit-validation", async () => {
		const processWorkflowActionUseCase = makeProcessWorkflowActionUseCase();
		const getRecordDisplayName = vi.fn().mockResolvedValue("Flood");

		await composeWorkflowAction({
			processWorkflowActionUseCase,
			mappedAction: "submit-validation",
			parsed: parsed(),
			entityId: "event-1",
			actingUserId: "user-1",
			actingUserRole: "data-collector",
			getRecordDisplayName,
			validatorUserIds: ["validator-1"],
		});

		expect(getRecordDisplayName).toHaveBeenCalledTimes(1);
	});

	it.each(["direct-validate", "direct-publish", "submit-draft"] as const)(
		"does not call getRecordDisplayName for %s",
		async (mappedAction) => {
			const processWorkflowActionUseCase = makeProcessWorkflowActionUseCase();
			const getRecordDisplayName = vi.fn().mockResolvedValue("unused");

			await composeWorkflowAction({
				processWorkflowActionUseCase,
				mappedAction,
				parsed: parsed(),
				entityId: "event-1",
				actingUserId: "user-1",
				actingUserRole: "admin",
				getRecordDisplayName,
				validatorUserIds: [],
			});

			expect(getRecordDisplayName).not.toHaveBeenCalled();
		},
	);

	it("passes recordDate as 'start to end' when endDate differs from startDate, for submit-validation", async () => {
		const processWorkflowActionUseCase = makeProcessWorkflowActionUseCase();

		await composeWorkflowAction({
			processWorkflowActionUseCase,
			mappedAction: "submit-validation",
			parsed: parsed({ startDate: "2026-01-01", endDate: "2026-01-05" }),
			entityId: "event-1",
			actingUserId: "user-1",
			actingUserRole: "data-collector",
			getRecordDisplayName: vi.fn().mockResolvedValue("Flood"),
			validatorUserIds: ["validator-1"],
		});

		expect(processWorkflowActionUseCase.execute).toHaveBeenCalledWith(
			expect.objectContaining({ recordDate: "2026-01-01 to 2026-01-05" }),
		);
	});

	it("passes recordDate as just startDate when endDate is absent, for submit-validation", async () => {
		const processWorkflowActionUseCase = makeProcessWorkflowActionUseCase();

		await composeWorkflowAction({
			processWorkflowActionUseCase,
			mappedAction: "submit-validation",
			parsed: parsed({ startDate: "2026-01-01", endDate: "" }),
			entityId: "event-1",
			actingUserId: "user-1",
			actingUserRole: "data-collector",
			getRecordDisplayName: vi.fn().mockResolvedValue("Flood"),
			validatorUserIds: ["validator-1"],
		});

		expect(processWorkflowActionUseCase.execute).toHaveBeenCalledWith(
			expect.objectContaining({ recordDate: "2026-01-01" }),
		);
	});

	it("submit-validation's command carries validatorUserIds/recordDisplayName, not actingUserRole", async () => {
		const processWorkflowActionUseCase = makeProcessWorkflowActionUseCase();

		await composeWorkflowAction({
			processWorkflowActionUseCase,
			mappedAction: "submit-validation",
			parsed: parsed(),
			entityId: "event-1",
			actingUserId: "user-1",
			actingUserRole: "data-collector",
			getRecordDisplayName: vi.fn().mockResolvedValue("Flood"),
			validatorUserIds: ["validator-1", "validator-2"],
		});

		const call = processWorkflowActionUseCase.execute.mock.calls[0][0];
		expect(call).toMatchObject({
			action: "submit-validation",
			entityType: "HE",
			entityId: "event-1",
			actingUserId: "user-1",
			validatorUserIds: ["validator-1", "validator-2"],
			recordDisplayName: "Flood",
		});
		expect(call).not.toHaveProperty("actingUserRole");
	});

	it.each(["direct-validate", "direct-publish", "submit-draft"] as const)(
		"%s's command carries actingUserRole, not validatorUserIds/recordDisplayName",
		async (mappedAction) => {
			const processWorkflowActionUseCase = makeProcessWorkflowActionUseCase();

			await composeWorkflowAction({
				processWorkflowActionUseCase,
				mappedAction,
				parsed: parsed(),
				entityId: "event-1",
				actingUserId: "user-1",
				actingUserRole: "admin",
				getRecordDisplayName: vi.fn(),
				validatorUserIds: [],
			});

			const call = processWorkflowActionUseCase.execute.mock.calls[0][0];
			expect(call).toMatchObject({
				action: mappedAction,
				entityType: "HE",
				entityId: "event-1",
				actingUserId: "user-1",
				actingUserRole: "admin",
			});
			expect(call).not.toHaveProperty("validatorUserIds");
			expect(call).not.toHaveProperty("recordDisplayName");
			expect(call).not.toHaveProperty("recordDate");
		},
	);

	it("returns { attempted: true, outcome: 'succeeded' } when the use case resolves", async () => {
		const processWorkflowActionUseCase = makeProcessWorkflowActionUseCase();

		const result = await composeWorkflowAction({
			processWorkflowActionUseCase,
			mappedAction: "submit-draft",
			parsed: parsed(),
			entityId: "event-1",
			actingUserId: "user-1",
			actingUserRole: "data-collector",
			getRecordDisplayName: vi.fn(),
			validatorUserIds: [],
		});

		expect(result).toEqual({ attempted: true, outcome: "succeeded" });
		expect(processWorkflowActionUseCase.execute).toHaveBeenCalledTimes(1);
	});

	it("returns { attempted: true, outcome: 'failed' } and logs a warn when the use case rejects, without throwing", async () => {
		const processWorkflowActionUseCase = {
			execute: vi.fn().mockRejectedValue(new Error("write failed")),
		};
		const warn = vi.fn();
		mockGetPinoLogger.mockReturnValue({ warn } as unknown as ILogger);

		const result = await composeWorkflowAction({
			processWorkflowActionUseCase,
			mappedAction: "direct-validate",
			parsed: parsed(),
			entityId: "event-1",
			actingUserId: "user-1",
			actingUserRole: "admin",
			getRecordDisplayName: vi.fn(),
			validatorUserIds: [],
		});

		expect(result).toEqual({ attempted: true, outcome: "failed" });
		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "hazardous_event.workflow_action_failed",
				err: expect.any(Error),
				entityId: "event-1",
				action: "direct-validate",
			}),
		);
	});

	it("propagates a getRecordDisplayName rejection uncaught, without calling execute or logging", async () => {
		const processWorkflowActionUseCase = makeProcessWorkflowActionUseCase();
		const warn = vi.fn();
		mockGetPinoLogger.mockReturnValue({ warn } as unknown as ILogger);
		const getRecordDisplayName = vi
			.fn()
			.mockRejectedValue(new Error("lookup failed"));

		await expect(
			composeWorkflowAction({
				processWorkflowActionUseCase,
				mappedAction: "submit-validation",
				parsed: parsed(),
				entityId: "event-1",
				actingUserId: "user-1",
				actingUserRole: "data-collector",
				getRecordDisplayName,
				validatorUserIds: ["validator-1"],
			}),
		).rejects.toThrow("lookup failed");

		expect(processWorkflowActionUseCase.execute).not.toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// buildWorkflowComposerCallbacks
// ---------------------------------------------------------------------------

describe("buildWorkflowComposerCallbacks", () => {
	beforeEach(() => {
		mockGetAppContext.mockReset();
	});

	function detailResult(overrides: {
		specificHazardName?: string | null;
		hazardClusterName?: string | null;
		hazardTypeName?: string | null;
	}) {
		return {
			specificHazardName: overrides.specificHazardName ?? "",
			hazardClusterName: overrides.hazardClusterName ?? "",
			hazardTypeName: overrides.hazardTypeName ?? "",
		};
	}

	// Token-checking, not a blanket `get: () => ({ execute })` -- if production code ever
	// requested the wrong use-case token for a given callback, this throws instead of silently
	// handing back the fake meant for the other one (code-review finding).
	function mockAppContextFor(
		expectedToken: unknown,
		execute: ReturnType<typeof vi.fn>,
	) {
		mockGetAppContext.mockReturnValue({
			get: (requestedToken: unknown) => {
				if (requestedToken !== expectedToken) {
					throw new Error(
						`Unexpected DI token requested: ${String(requestedToken)}`,
					);
				}
				return { execute };
			},
		} as unknown as INestApplicationContext);
	}

	it("getRecordDisplayName prefers specificHazardName when present", async () => {
		const getByIdExecute = vi.fn().mockResolvedValue(
			detailResult({
				specificHazardName: "Flash flood",
				hazardClusterName: "Flood",
				hazardTypeName: "Hydrological",
			}),
		);
		mockAppContextFor(GetHazardousEventByIdUseCase, getByIdExecute);

		const { getRecordDisplayName } = buildWorkflowComposerCallbacks({
			tenantId: "tenant-1",
			actingUserId: "user-1",
		});

		await expect(getRecordDisplayName("event-1")).resolves.toBe("Flash flood");
	});

	it("getRecordDisplayName falls back to hazardClusterName when specificHazardName is empty", async () => {
		const getByIdExecute = vi.fn().mockResolvedValue(
			detailResult({
				hazardClusterName: "Flood",
				hazardTypeName: "Hydrological",
			}),
		);
		mockAppContextFor(GetHazardousEventByIdUseCase, getByIdExecute);

		const { getRecordDisplayName } = buildWorkflowComposerCallbacks({
			tenantId: "tenant-1",
			actingUserId: "user-1",
		});

		await expect(getRecordDisplayName("event-1")).resolves.toBe("Flood");
	});

	it("getRecordDisplayName falls back to hazardTypeName when the first two are empty", async () => {
		const getByIdExecute = vi
			.fn()
			.mockResolvedValue(detailResult({ hazardTypeName: "Hydrological" }));
		mockAppContextFor(GetHazardousEventByIdUseCase, getByIdExecute);

		const { getRecordDisplayName } = buildWorkflowComposerCallbacks({
			tenantId: "tenant-1",
			actingUserId: "user-1",
		});

		await expect(getRecordDisplayName("event-1")).resolves.toBe("Hydrological");
	});

	it("getRecordDisplayName returns '' when all three names are empty", async () => {
		const getByIdExecute = vi.fn().mockResolvedValue(detailResult({}));
		mockAppContextFor(GetHazardousEventByIdUseCase, getByIdExecute);

		const { getRecordDisplayName } = buildWorkflowComposerCallbacks({
			tenantId: "tenant-1",
			actingUserId: "user-1",
		});

		await expect(getRecordDisplayName("event-1")).resolves.toBe("");
	});

	it("getRecordDisplayName re-fetches per call with the factory's tenantId and the call-time id", async () => {
		const getByIdExecute = vi
			.fn()
			.mockResolvedValue(detailResult({ specificHazardName: "Flash flood" }));
		mockAppContextFor(GetHazardousEventByIdUseCase, getByIdExecute);

		const { getRecordDisplayName } = buildWorkflowComposerCallbacks({
			tenantId: "tenant-xyz",
			actingUserId: "user-1",
		});

		await getRecordDisplayName("event-a");
		await getRecordDisplayName("event-b");

		expect(getByIdExecute).toHaveBeenCalledTimes(2);
		expect(getByIdExecute).toHaveBeenNthCalledWith(1, {
			id: "event-a",
			tenantId: "tenant-xyz",
		});
		expect(getByIdExecute).toHaveBeenNthCalledWith(2, {
			id: "event-b",
			tenantId: "tenant-xyz",
		});
	});

	it("getValidCandidateIds delegates excludingUserId to FindValidatorCandidatesUseCase.execute, tenant-scoped", async () => {
		const candidates: readonly ValidatorCandidate[] = [
			{ id: "validator-1", firstName: "A", lastName: "B", email: "a@b.com" },
			{ id: "validator-2", firstName: "C", lastName: "D", email: "c@d.com" },
		];
		const findValidatorsExecute = vi.fn().mockResolvedValue(candidates);
		mockAppContextFor(FindValidatorCandidatesUseCase, findValidatorsExecute);

		const { getValidCandidateIds } = buildWorkflowComposerCallbacks({
			tenantId: "tenant-xyz",
			actingUserId: "user-acting",
		});

		const ids = await getValidCandidateIds();

		expect(findValidatorsExecute).toHaveBeenCalledWith({
			tenantId: "tenant-xyz",
			excludingUserId: "user-acting",
		});
		expect(ids).toEqual(["validator-1", "validator-2"]);
	});
});
