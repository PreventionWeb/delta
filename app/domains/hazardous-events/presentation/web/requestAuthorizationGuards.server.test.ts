import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";

vi.mock("~/utils/session", () => ({ getUserRoleFromSession: vi.fn() }));

import { getUserRoleFromSession } from "~/utils/session";
import {
	requireEditDataPermission,
	requireStatusAwareEditPermission,
	requireWorkflowActionAuthorized,
	requireValidValidatorIds,
} from "./requestAuthorizationGuards.server";
import type { ParsedHazardousEventFormData } from "./parseHazardousEventFormData.server";
import type { MappedWorkflowAction } from "./formDataMappers";

const mockGetUserRoleFromSession = vi.mocked(getUserRoleFromSession);

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

const request = new Request("http://localhost/en/he-preview/new");

// ---------------------------------------------------------------------------
// requireEditDataPermission
// ---------------------------------------------------------------------------

describe("requireEditDataPermission", () => {
	beforeEach(() => {
		mockGetUserRoleFromSession.mockReset();
	});

	it("resolves with the role for a role that has EditData", async () => {
		mockGetUserRoleFromSession.mockResolvedValue("data-collector");

		await expect(requireEditDataPermission({ request })).resolves.toBe(
			"data-collector",
		);
	});

	it("throws a 403 Response with error.code FORBIDDEN and the exact message for a role without EditData (test-quality-auditor finding)", async () => {
		mockGetUserRoleFromSession.mockResolvedValue("data-viewer");

		let thrown: unknown;
		try {
			await requireEditDataPermission({ request });
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(403);
		const body = (await response.json()) as ErrorResponse;
		expect(body.error.code).toBe("FORBIDDEN");
		expect(body.error.message).toBe("EditData permission required");
	});
});

// ---------------------------------------------------------------------------
// requireStatusAwareEditPermission
// ---------------------------------------------------------------------------

function statusAwareArgs(
	overrides: Partial<
		Parameters<typeof requireStatusAwareEditPermission>[0]
	> = {},
) {
	return {
		role: "data-collector",
		workflowStatus: "DRAFT" as const,
		request: new Request("http://localhost/en/he-preview/edit/event-1"),
		...overrides,
	};
}

async function expectForbiddenWithMessage(
	fn: () => void,
): Promise<ErrorResponse> {
	let thrown: unknown;
	try {
		fn();
	} catch (err) {
		thrown = err;
	}
	expect(thrown).toBeInstanceOf(Response);
	const response = thrown as Response;
	expect(response.status).toBe(403);
	return (await response.json()) as ErrorResponse;
}

describe("requireStatusAwareEditPermission", () => {
	it("does not throw for a non-data-viewer role and a non-blocked status (DRAFT)", () => {
		expect(() =>
			requireStatusAwareEditPermission(statusAwareArgs()),
		).not.toThrow();
	});

	it("does not throw for a null workflowStatus (DEF-031 legacy row)", () => {
		expect(() =>
			requireStatusAwareEditPermission(
				statusAwareArgs({ workflowStatus: null }),
			),
		).not.toThrow();
	});

	it.each(["SUBMITTED", "APPROVED", "PUBLISHED"] as const)(
		"throws for status %s regardless of role",
		async (workflowStatus) => {
			const body = await expectForbiddenWithMessage(() =>
				requireStatusAwareEditPermission(statusAwareArgs({ workflowStatus })),
			);
			expect(body.error.code).toBe("FORBIDDEN");
		},
	);

	it("throws for a data-viewer role even at a non-blocked status (DRAFT) -- called directly, not only through the composed route (test-quality-auditor finding: this function's own safeguard was never isolated before)", async () => {
		const body = await expectForbiddenWithMessage(() =>
			requireStatusAwareEditPermission(
				statusAwareArgs({ role: "data-viewer", workflowStatus: "DRAFT" }),
			),
		);
		expect(body.error.code).toBe("FORBIDDEN");
	});

	it("throws with the exact message (test-quality-auditor finding)", async () => {
		const body = await expectForbiddenWithMessage(() =>
			requireStatusAwareEditPermission(
				statusAwareArgs({ role: "data-viewer" }),
			),
		);
		expect(body.error.message).toBe(
			"Record cannot be edited in its current workflow status",
		);
	});
});

// ---------------------------------------------------------------------------
// requireWorkflowActionAuthorized
// ---------------------------------------------------------------------------

describe("requireWorkflowActionAuthorized", () => {
	it("returns null for a plain save (no tempAction) without throwing", () => {
		expect(
			requireWorkflowActionAuthorized({
				parsed: parsed(),
				actingUserRole: "data-collector",
				request,
			}),
		).toBeNull();
	});

	it("returns null for an unmapped action (e.g. legacy's submit-return)", () => {
		expect(
			requireWorkflowActionAuthorized({
				parsed: parsed({ tempAction: "submit-return" }),
				actingUserRole: "admin",
				request,
			}),
		).toBeNull();
	});

	it.each(["submit-validate", "submit-publish"] as const)(
		"throws AuthorizationError (403) for %s when actingUserRole is not admin",
		(tempAction) => {
			try {
				requireWorkflowActionAuthorized({
					parsed: parsed({ tempAction }),
					actingUserRole: "data-collector",
					request,
				});
				throw new Error("expected a throw");
			} catch (err) {
				expect((err as Response).status).toBe(403);
			}
		},
	);

	it("throws AuthorizationError (403) when actingUserRole is undefined", () => {
		try {
			requireWorkflowActionAuthorized({
				parsed: parsed({ tempAction: "submit-validate" }),
				actingUserRole: undefined,
				request,
			});
			throw new Error("expected a throw");
		} catch (err) {
			expect((err as Response).status).toBe(403);
		}
	});

	it.each(["submit-validate", "submit-publish"] as const)(
		"returns the mapped action for %s when actingUserRole is admin",
		(tempAction) => {
			const result = requireWorkflowActionAuthorized({
				parsed: parsed({ tempAction }),
				actingUserRole: "admin",
				request,
			});
			expect(result).toBe(
				tempAction === "submit-validate" ? "direct-validate" : "direct-publish",
			);
		},
	);

	it("throws ValidationError (422) for submit-validation with an empty validator list", async () => {
		try {
			requireWorkflowActionAuthorized({
				parsed: parsed({
					tempAction: "submit-validation",
					validatorUserIds: [],
				}),
				actingUserRole: "data-collector",
				request,
			});
			throw new Error("expected a throw");
		} catch (err) {
			expect((err as Response).status).toBe(422);
		}
	});

	it("throws ValidationError (422) for submit-validation with an empty validator list even when actingUserRole is admin -- this check doesn't branch on role", async () => {
		try {
			requireWorkflowActionAuthorized({
				parsed: parsed({
					tempAction: "submit-validation",
					validatorUserIds: [],
				}),
				actingUserRole: "admin",
				request,
			});
			throw new Error("expected a throw");
		} catch (err) {
			expect((err as Response).status).toBe(422);
		}
	});

	it("returns submit-validation when the validator list is non-empty", () => {
		const result = requireWorkflowActionAuthorized({
			parsed: parsed({
				tempAction: "submit-validation",
				validatorUserIds: ["validator-1"],
			}),
			actingUserRole: "data-collector",
			request,
		});
		expect(result).toBe("submit-validation");
	});

	it("returns submit-draft without checking validatorUserIds", () => {
		const result = requireWorkflowActionAuthorized({
			parsed: parsed({ tempAction: "submit-draft" }),
			actingUserRole: "data-collector",
			request,
		});
		expect(result).toBe("submit-draft");
	});
});

// ---------------------------------------------------------------------------
// requireValidValidatorIds
// ---------------------------------------------------------------------------

function validValidatorIdsArgs(overrides: {
	mappedAction: MappedWorkflowAction | null;
	validatorUserIds?: readonly string[];
	getValidCandidateIds?: () => Promise<readonly string[]>;
}) {
	return {
		mappedAction: overrides.mappedAction,
		parsed: parsed({ validatorUserIds: overrides.validatorUserIds ?? [] }),
		getValidCandidateIds:
			overrides.getValidCandidateIds ?? vi.fn().mockResolvedValue([]),
		request,
	};
}

describe("requireValidValidatorIds", () => {
	it.each(["submit-draft", "direct-validate", "direct-publish", null] as const)(
		"is a no-op (returns [], does not call getValidCandidateIds) for mappedAction %s",
		async (mappedAction) => {
			const getValidCandidateIds = vi.fn().mockResolvedValue(["validator-1"]);

			const result = await requireValidValidatorIds(
				validValidatorIdsArgs({ mappedAction, getValidCandidateIds }),
			);

			expect(result).toEqual([]);
			expect(getValidCandidateIds).not.toHaveBeenCalled();
		},
	);

	it("filters validatorUserIds down to only ids present in getValidCandidateIds()'s result", async () => {
		const getValidCandidateIds = vi
			.fn()
			.mockResolvedValue(["validator-1", "validator-2"]);

		const result = await requireValidValidatorIds(
			validValidatorIdsArgs({
				mappedAction: "submit-validation",
				validatorUserIds: ["validator-1", "validator-stale"],
				getValidCandidateIds,
			}),
		);

		expect(result).toEqual(["validator-1"]);
	});

	it("returns every submitted id when all are valid candidates", async () => {
		const getValidCandidateIds = vi
			.fn()
			.mockResolvedValue(["validator-1", "validator-2"]);

		const result = await requireValidValidatorIds(
			validValidatorIdsArgs({
				mappedAction: "submit-validation",
				validatorUserIds: ["validator-1", "validator-2"],
				getValidCandidateIds,
			}),
		);

		expect(result).toEqual(["validator-1", "validator-2"]);
	});

	it("throws a 422 Response when the filtered list is empty (all submitted ids stale/tampered)", async () => {
		const getValidCandidateIds = vi.fn().mockResolvedValue(["validator-1"]);

		let thrown: unknown;
		try {
			await requireValidValidatorIds(
				validValidatorIdsArgs({
					mappedAction: "submit-validation",
					validatorUserIds: ["validator-stale"],
					getValidCandidateIds,
				}),
			);
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		const response = thrown as Response;
		expect(response.status).toBe(422);
		const body = (await response.json()) as ErrorResponse;
		expect(body.error.message).toBe(
			"At least one validator must be selected for submit-validation",
		);
	});

	it("throws a 422 Response when the submitted validator list was already empty", async () => {
		const getValidCandidateIds = vi.fn().mockResolvedValue(["validator-1"]);

		let thrown: unknown;
		try {
			await requireValidValidatorIds(
				validValidatorIdsArgs({
					mappedAction: "submit-validation",
					validatorUserIds: [],
					getValidCandidateIds,
				}),
			);
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Response);
		expect((thrown as Response).status).toBe(422);
	});
});
