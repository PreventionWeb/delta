import { describe, expect, it, vi } from "vitest";

import { NoOpLogger } from "~/shared/logging/NoOpLogger";
import { AuthorizationError } from "~/shared/errors";

import { WorkflowInstance } from "../domain/WorkflowInstance";
import type { IWorkflowRepository } from "./ports/IWorkflowRepository";
import type { INotificationPort } from "./ports/INotificationPort";
import {
	ProcessWorkflowActionUseCase,
	type ProcessWorkflowActionCommand,
} from "./use-cases/ProcessWorkflowAction";
import { requireWorkflowActionAuthorized } from "~/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server";
import type { ParsedHazardousEventFormData } from "~/domains/hazardous-events/presentation/web/parseHazardousEventFormData.server";

import { isWorkflowActionAuthorized } from "./isWorkflowActionAuthorized";

const ROLES: readonly (string | undefined)[] = [
	"admin",
	"data-collector",
	"data-validator",
	"data-viewer",
	"",
	undefined,
];

describe("isWorkflowActionAuthorized", () => {
	it.each(["direct-validate", "direct-publish"] as const)(
		"%s is authorized only for actingUserRole === admin",
		(action) => {
			expect(isWorkflowActionAuthorized(action, "admin")).toBe(true);
			for (const role of [
				"data-collector",
				"data-validator",
				"data-viewer",
				"",
				undefined,
			]) {
				expect(isWorkflowActionAuthorized(action, role)).toBe(false);
			}
		},
	);

	it.each(["submit-validation", "validate", "publish", "return"] as const)(
		"%s is authorized for every role, including undefined",
		(action) => {
			for (const role of ROLES) {
				expect(isWorkflowActionAuthorized(action, role)).toBe(true);
			}
		},
	);

	it.each(["data-collector", "data-validator", "admin"])(
		"submit-draft is authorized for actingUserRole %s",
		(role) => {
			expect(isWorkflowActionAuthorized("submit-draft", role)).toBe(true);
		},
	);

	it.each(["data-viewer", undefined, "", "data_collector"])(
		"submit-draft is rejected for actingUserRole %s",
		(role) => {
			expect(isWorkflowActionAuthorized("submit-draft", role)).toBe(false);
		},
	);
});

// ---------------------------------------------------------------------------
// Cross-call-site agreement: requireWorkflowActionAuthorized (HE presentation,
// fail-fast) and ProcessWorkflowActionUseCase.execute (validation-workflow,
// authoritative) both import this one predicate instead of each re-encoding the
// admin-only rule -- this proves they can no longer silently drift apart
// (ca-he-route-adapter-write design.md Decision 2 and Decision 26).
// ---------------------------------------------------------------------------

function parsedFormData(
	overrides: Partial<ParsedHazardousEventFormData>,
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

function tempActionFor(
	action: "direct-validate" | "direct-publish" | "submit-draft",
): "submit-validate" | "submit-publish" | "submit-draft" {
	if (action === "direct-validate") return "submit-validate";
	if (action === "direct-publish") return "submit-publish";
	return "submit-draft";
}

function draftInstance(): WorkflowInstance {
	return WorkflowInstance.create({
		id: "wf-1",
		entityId: "entity-1",
		entityType: "HE",
		status: "DRAFT",
		submittedByUserId: null,
		submittedAt: null,
		validatedByUserId: null,
		validatedAt: null,
		approvedByUserId: null,
		approvedAt: null,
		publishedByUserId: null,
		publishedAt: null,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	});
}

function makeRepository(): IWorkflowRepository {
	return {
		findByEntity: vi.fn().mockResolvedValue(draftInstance()),
		findByEntityIds: vi.fn(),
		insert: vi.fn(),
		update: vi
			.fn()
			.mockImplementation((i: WorkflowInstance) => Promise.resolve(i)),
		deleteByEntity: vi.fn(),
	};
}

function makeNotificationPort(): INotificationPort {
	return { notify: vi.fn().mockResolvedValue(undefined) };
}

const request = new Request("http://localhost/en/he-preview/edit/entity-1");

describe("isWorkflowActionAuthorized agreement with its two call sites", () => {
	it.each(["direct-validate", "direct-publish", "submit-draft"] as const)(
		"HE's requireWorkflowActionAuthorized and ProcessWorkflowActionUseCase.execute agree with the predicate for %s, across every role",
		async (action) => {
			for (const role of ROLES) {
				const expected = isWorkflowActionAuthorized(action, role);

				// Call site 1: HE presentation-layer fail-fast guard.
				let heThrew = false;
				try {
					requireWorkflowActionAuthorized({
						parsed: parsedFormData({ tempAction: tempActionFor(action) }),
						actingUserRole: role,
						request,
					});
				} catch {
					heThrew = true;
				}
				expect(heThrew).toBe(!expected);

				// Call site 2: validation-workflow's own authoritative use case.
				const useCase = new ProcessWorkflowActionUseCase(
					new NoOpLogger(),
					makeRepository(),
					makeNotificationPort(),
				);
				const command: ProcessWorkflowActionCommand = {
					action,
					entityId: "entity-1",
					entityType: "HE",
					actingUserId: "user-1",
					actingUserRole: role,
				};
				let useCaseThrew = false;
				try {
					await useCase.execute(command);
				} catch (err) {
					useCaseThrew = err instanceof AuthorizationError;
				}
				expect(useCaseThrew).toBe(!expected);
			}
		},
	);
});
