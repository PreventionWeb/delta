import { describe, expect, it } from "vitest";

import { WorkflowInstance } from "../../domain/WorkflowInstance";
import {
	toWorkflowInstanceDto,
	type WorkflowInstanceDto,
} from "./WorkflowInstanceDto";

describe("toWorkflowInstanceDto", () => {
	it("maps all fields correctly for a fully-attributed PUBLISHED instance", () => {
		const submittedAt = new Date("2026-01-01T00:00:00.000Z");
		const validatedAt = new Date("2026-01-02T00:00:00.000Z");
		const approvedAt = new Date("2026-01-03T00:00:00.000Z");
		const publishedAt = new Date("2026-01-04T00:00:00.000Z");
		const createdAt = new Date("2025-12-31T00:00:00.000Z");
		const updatedAt = new Date("2026-01-05T00:00:00.000Z");

		const instance = WorkflowInstance.create({
			id: "instance-1",
			entityId: "entity-1",
			entityType: "HE",
			status: "PUBLISHED",
			submittedByUserId: "user-submit",
			submittedAt,
			validatedByUserId: "user-validate",
			validatedAt,
			approvedByUserId: "user-approve",
			approvedAt,
			publishedByUserId: "user-publish",
			publishedAt,
			createdAt,
			updatedAt,
		});

		const dto: WorkflowInstanceDto = toWorkflowInstanceDto(instance);

		expect(dto.id).toBe("instance-1");
		expect(dto.entityId).toBe("entity-1");
		expect(dto.entityType).toBe("HE");
		expect(dto.status).toBe("PUBLISHED");

		expect(dto.submittedByUserId).toBe("user-submit");
		expect(dto.submittedAt).toBe(submittedAt.toISOString());

		expect(dto.validatedByUserId).toBe("user-validate");
		expect(dto.validatedAt).toBe(validatedAt.toISOString());

		expect(dto.approvedByUserId).toBe("user-approve");
		expect(dto.approvedAt).toBe(approvedAt.toISOString());

		expect(dto.publishedByUserId).toBe("user-publish");
		expect(dto.publishedAt).toBe(publishedAt.toISOString());

		expect(dto.createdAt).toBe(createdAt.toISOString());
		expect(dto.updatedAt).toBe(updatedAt.toISOString());
	});

	it("maps null attribution timestamps as null, not as a thrown error, for a DRAFT instance", () => {
		const createdAt = new Date("2026-01-01T00:00:00.000Z");
		const updatedAt = new Date("2026-01-01T00:00:00.000Z");

		const instance = WorkflowInstance.create({
			id: "instance-2",
			entityId: "entity-2",
			entityType: "DE",
			status: "DRAFT",
			submittedByUserId: null,
			submittedAt: null,
			validatedByUserId: null,
			validatedAt: null,
			approvedByUserId: null,
			approvedAt: null,
			publishedByUserId: null,
			publishedAt: null,
			createdAt,
			updatedAt,
		});

		expect(() => toWorkflowInstanceDto(instance)).not.toThrow();

		const dto = toWorkflowInstanceDto(instance);

		expect(dto.submittedAt).toBeNull();
		expect(dto.validatedAt).toBeNull();
		expect(dto.approvedAt).toBeNull();
		expect(dto.publishedAt).toBeNull();
		expect(dto.submittedByUserId).toBeNull();
		expect(dto.validatedByUserId).toBeNull();
		expect(dto.approvedByUserId).toBeNull();
		expect(dto.publishedByUserId).toBeNull();
	});
});
