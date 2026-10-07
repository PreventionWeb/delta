import { describe, expect, it, vi } from "vitest";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "../../domain/HazardousEvent";
import { ValidationError } from "~/shared/errors";
import type { ILogger } from "~/shared/logging/ILogger";
import { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import type {
	IHazardousEventRepository,
	SpatialObservationRecord,
} from "../ports/IHazardousEventRepository";
import {
	ListHazardousEventsUseCase,
	type ListHazardousEventsQuery,
} from "./ListHazardousEvents";

class FakeLogger implements ILogger {
	info = vi.fn();
	warn = vi.fn();
	error = vi.fn();
	debug = vi.fn();
}

class FakeHazardousEventRepository implements IHazardousEventRepository {
	readonly findAllCalls: {
		tenantId: string;
		pagination: { page: number; pageSize: number };
	}[] = [];

	constructor(
		private readonly impl: (
			tenantId: string,
		) => Promise<HazardousEvent[]> = () => Promise.resolve([]),
	) {}

	async findAll(
		tenantId: string,
		pagination: { page: number; pageSize: number },
	): Promise<HazardousEvent[]> {
		this.findAllCalls.push({ tenantId, pagination });
		return this.impl(tenantId);
	}

	async findById(): Promise<HazardousEvent> {
		throw new Error("not used by ListHazardousEventsUseCase's own tests");
	}

	async save(): Promise<HazardousEvent> {
		throw new Error("not used by ListHazardousEventsUseCase's own tests");
	}

	async delete(): Promise<void> {
		throw new Error("not used by ListHazardousEventsUseCase's own tests");
	}

	async countReferencingDisasterEvents(): Promise<number> {
		throw new Error("not used by ListHazardousEventsUseCase's own tests");
	}

	async findCurrentSpatialObservation(): Promise<SpatialObservationRecord | null> {
		throw new Error("not used by ListHazardousEventsUseCase's own tests");
	}

	async findSpatialObservationByTime(): Promise<SpatialObservationRecord | null> {
		throw new Error("not used by ListHazardousEventsUseCase's own tests");
	}

	async saveSpatialObservation(): Promise<SpatialObservationRecord> {
		throw new Error("not used by ListHazardousEventsUseCase's own tests");
	}
}

class FakeWorkflowRepository implements IWorkflowRepository {
	readonly findByEntityIdsCalls: {
		entityIds: string[];
		entityType: string;
	}[] = [];
	readonly findByEntityCalls: { entityId: string; entityType: string }[] = [];

	constructor(
		private readonly impl: (
			entityIds: string[],
		) => Promise<WorkflowInstance[]> = () => Promise.resolve([]),
	) {}

	async findByEntityIds(
		entityIds: string[],
		entityType: string,
	): Promise<WorkflowInstance[]> {
		this.findByEntityIdsCalls.push({ entityIds, entityType });
		return this.impl(entityIds);
	}

	async findByEntity(
		entityId: string,
		entityType: string,
	): Promise<WorkflowInstance | null> {
		this.findByEntityCalls.push({ entityId, entityType });
		return null;
	}

	async save(): Promise<WorkflowInstance> {
		throw new Error("not used by ListHazardousEventsUseCase's own tests");
	}

	async deleteByEntity(): Promise<void> {
		throw new Error("not used by ListHazardousEventsUseCase's own tests");
	}
}

const baseHazardousEventProps: HazardousEventProps = {
	id: "he-1",
	tenantId: "tenant-1",
	specificHazardId: "hazard-1",
	startDate: "2026-01-01",
	endDate: "2026-01-02",
	nationalSpecification: "national spec",
	description: "description",
	chainsExplanation: "chains explanation",
	magnitude: "5.0",
	recordOriginator: "originator",
	dataSource: "source",
	hazardousEventStatus: "ongoing",
	specificHazardLocalName: "local name",
	specificHazardNationalName: "national name",
	apiImportId: "api-1",
	createdByUserId: "user-1",
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

function makeEvent(
	overrides: Partial<HazardousEventProps> = {},
): HazardousEvent {
	return HazardousEvent.create(
		{ ...baseHazardousEventProps, ...overrides },
		new Set(),
		new Set(),
	);
}

function makeWorkflow(entityId: string): WorkflowInstance {
	return WorkflowInstance.createDraft({
		id: `workflow-${entityId}`,
		entityId,
		entityType: "HE",
		now: new Date("2026-01-01T00:00:00.000Z"),
	});
}

function makeQuery(
	overrides: Partial<ListHazardousEventsQuery> = {},
): ListHazardousEventsQuery {
	return { tenantId: "tenant-1", page: 1, pageSize: 10, ...overrides };
}

describe("ListHazardousEventsUseCase", () => {
	it("returns a HazardousEventListItemDto per event, each workflowStatus matching its own WorkflowInstance", async () => {
		const eventA = makeEvent({ id: "he-A" });
		const eventB = makeEvent({ id: "he-B" });
		const eventC = makeEvent({ id: "he-C" });
		const now = new Date("2026-01-02T00:00:00.000Z");
		const workflowA = makeWorkflow("he-A").submit({ userId: "user-1", now });
		const workflowB = makeWorkflow("he-B");
		const workflowC = makeWorkflow("he-C")
			.submit({ userId: "user-1", now })
			.approve({ userId: "user-1", now });
		const hazardousEventRepository = new FakeHazardousEventRepository(() =>
			Promise.resolve([eventA, eventB, eventC]),
		);
		const workflowRepository = new FakeWorkflowRepository(() =>
			Promise.resolve([workflowA, workflowB, workflowC]),
		);
		const useCase = new ListHazardousEventsUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			workflowRepository,
		);

		const result = await useCase.execute(makeQuery());

		expect(result).toHaveLength(3);
		expect(result[0].id).toBe("he-A");
		expect(result[0].workflowStatus).toBe("SUBMITTED");
		expect(result[1].id).toBe("he-B");
		expect(result[1].workflowStatus).toBe("DRAFT");
		expect(result[2].id).toBe("he-C");
		expect(result[2].workflowStatus).toBe("APPROVED");
	});

	it("passes tenantId and pagination to findAll exactly once, unchanged", async () => {
		const hazardousEventRepository = new FakeHazardousEventRepository();
		const workflowRepository = new FakeWorkflowRepository();
		const useCase = new ListHazardousEventsUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			workflowRepository,
		);

		await useCase.execute(makeQuery({ page: 2, pageSize: 10 }));

		expect(hazardousEventRepository.findAllCalls).toEqual([
			{ tenantId: "tenant-1", pagination: { page: 2, pageSize: 10 } },
		]);
	});

	it("throws ValidationError and performs no repository lookup for an empty tenantId", async () => {
		const hazardousEventRepository = new FakeHazardousEventRepository();
		const workflowRepository = new FakeWorkflowRepository();
		const logger = new FakeLogger();
		const useCase = new ListHazardousEventsUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);

		await expect(useCase.execute(makeQuery({ tenantId: "" }))).rejects.toThrow(
			ValidationError,
		);
		await expect(useCase.execute(makeQuery({ tenantId: "" }))).rejects.toThrow(
			/tenantId/,
		);

		expect(hazardousEventRepository.findAllCalls).toHaveLength(0);
		expect(workflowRepository.findByEntityIdsCalls).toHaveLength(0);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("throws ValidationError and performs no repository lookup for a non-string tenantId reaching execute() at runtime", async () => {
		const hazardousEventRepository = new FakeHazardousEventRepository();
		const workflowRepository = new FakeWorkflowRepository();
		const logger = new FakeLogger();
		const useCase = new ListHazardousEventsUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);
		const query = {
			tenantId: 42 as unknown as string,
			page: 1,
			pageSize: 10,
		} satisfies ListHazardousEventsQuery;

		await expect(useCase.execute(query)).rejects.toThrow(ValidationError);
		await expect(useCase.execute(query)).rejects.toThrow(/tenantId/);

		expect(hazardousEventRepository.findAllCalls).toHaveLength(0);
		expect(workflowRepository.findByEntityIdsCalls).toHaveLength(0);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it.each([
		["page 0", { page: 0 }, /^page /],
		["negative page", { page: -1 }, /^page /],
		["non-integer page", { page: 1.5 }, /^page /],
		["pageSize 0", { pageSize: 0 }, /pageSize/],
		["negative pageSize", { pageSize: -1 }, /pageSize/],
		["non-integer pageSize", { pageSize: 1.5 }, /pageSize/],
		["pageSize 101", { pageSize: 101 }, /pageSize/],
	])(
		"throws ValidationError naming the offending field for %s",
		async (_label, overrides, expectedMessage) => {
			const hazardousEventRepository = new FakeHazardousEventRepository();
			const workflowRepository = new FakeWorkflowRepository();
			const logger = new FakeLogger();
			const useCase = new ListHazardousEventsUseCase(
				logger,
				hazardousEventRepository,
				workflowRepository,
			);

			await expect(useCase.execute(makeQuery(overrides))).rejects.toThrow(
				ValidationError,
			);
			await expect(useCase.execute(makeQuery(overrides))).rejects.toThrow(
				expectedMessage,
			);

			expect(hazardousEventRepository.findAllCalls).toHaveLength(0);
			expect(workflowRepository.findByEntityIdsCalls).toHaveLength(0);
			expect(logger.info).not.toHaveBeenCalled();
		},
	);

	it("accepts page/pageSize at their own valid boundary (1/100) and forwards them unchanged", async () => {
		const hazardousEventRepository = new FakeHazardousEventRepository();
		const workflowRepository = new FakeWorkflowRepository();
		const useCase = new ListHazardousEventsUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			workflowRepository,
		);

		await expect(
			useCase.execute(makeQuery({ page: 1, pageSize: 100 })),
		).resolves.toEqual([]);

		expect(hazardousEventRepository.findAllCalls).toEqual([
			{ tenantId: "tenant-1", pagination: { page: 1, pageSize: 100 } },
		]);
	});

	it("accepts pageSize at its own lower boundary (1) and forwards it unchanged", async () => {
		const hazardousEventRepository = new FakeHazardousEventRepository();
		const workflowRepository = new FakeWorkflowRepository();
		const useCase = new ListHazardousEventsUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			workflowRepository,
		);

		await expect(
			useCase.execute(makeQuery({ page: 1, pageSize: 1 })),
		).resolves.toEqual([]);

		expect(hazardousEventRepository.findAllCalls).toEqual([
			{ tenantId: "tenant-1", pagination: { page: 1, pageSize: 1 } },
		]);
	});

	it("returns [] and performs no workflow lookup for an empty page", async () => {
		const hazardousEventRepository = new FakeHazardousEventRepository(() =>
			Promise.resolve([]),
		);
		const workflowRepository = new FakeWorkflowRepository();
		const logger = new FakeLogger();
		const useCase = new ListHazardousEventsUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);

		const result = await useCase.execute(makeQuery());

		expect(result).toEqual([]);
		expect(workflowRepository.findByEntityIdsCalls).toHaveLength(0);
		expect(logger.info).toHaveBeenCalledOnce();
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "hazardous_events.listed",
				tenantId: "tenant-1",
				count: 0,
				missingWorkflowStatusCount: 0,
			}),
		);
	});

	it("calls findByEntityIds exactly once for a five-event page, with all five ids and entity type HE, and never calls findByEntity", async () => {
		const events = Array.from({ length: 5 }, (_, i) =>
			makeEvent({ id: `he-${i}` }),
		);
		const workflows = events.map((e) => makeWorkflow(e.id));
		const hazardousEventRepository = new FakeHazardousEventRepository(() =>
			Promise.resolve(events),
		);
		const workflowRepository = new FakeWorkflowRepository(() =>
			Promise.resolve(workflows),
		);
		const useCase = new ListHazardousEventsUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			workflowRepository,
		);

		await useCase.execute(makeQuery());

		expect(workflowRepository.findByEntityIdsCalls).toHaveLength(1);
		expect(workflowRepository.findByEntityIdsCalls[0]).toEqual({
			entityIds: events.map((e) => e.id),
			entityType: "HE",
		});
		expect(workflowRepository.findByEntityCalls).toHaveLength(0);
	});

	it("findAll rejects: the same error propagates, and findByEntityIds is never called", async () => {
		const dbError = new Error("DB connection lost");
		const hazardousEventRepository = new FakeHazardousEventRepository(() =>
			Promise.reject(dbError),
		);
		const workflowRepository = new FakeWorkflowRepository();
		const logger = new FakeLogger();
		const useCase = new ListHazardousEventsUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);

		await expect(useCase.execute(makeQuery())).rejects.toBe(dbError);

		expect(workflowRepository.findByEntityIdsCalls).toHaveLength(0);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("findByEntityIds rejects: the same error propagates, and no log event is emitted", async () => {
		const event = makeEvent();
		const dbError = new Error("workflow lookup failed");
		const hazardousEventRepository = new FakeHazardousEventRepository(() =>
			Promise.resolve([event]),
		);
		const workflowRepository = new FakeWorkflowRepository(() =>
			Promise.reject(dbError),
		);
		const logger = new FakeLogger();
		const useCase = new ListHazardousEventsUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);

		await expect(useCase.execute(makeQuery())).rejects.toBe(dbError);

		expect(logger.info).not.toHaveBeenCalled();
	});

	it("joins rows to workflow instances by id, preserving findAll's own order, not a positional zip", async () => {
		const eventA = makeEvent({ id: "he-A" });
		const eventB = makeEvent({ id: "he-B" });
		const eventC = makeEvent({ id: "he-C" });
		const now = new Date("2026-01-02T00:00:00.000Z");
		const workflowA = makeWorkflow("he-A").submit({ userId: "user-1", now });
		const workflowC = makeWorkflow("he-C")
			.submit({ userId: "user-1", now })
			.approve({ userId: "user-1", now });
		const hazardousEventRepository = new FakeHazardousEventRepository(() =>
			Promise.resolve([eventA, eventB, eventC]),
		);
		const workflowRepository = new FakeWorkflowRepository(() =>
			Promise.resolve([workflowC, workflowA]),
		);
		const useCase = new ListHazardousEventsUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			workflowRepository,
		);

		const result = await useCase.execute(makeQuery());

		expect(result.map((d) => d.id)).toEqual(["he-A", "he-B", "he-C"]);
		expect(result[0].workflowStatus).toBe("SUBMITTED");
		expect(result[1].workflowStatus).toBeNull();
		expect(result[2].workflowStatus).toBe("APPROVED");
	});

	it("returns every row, including one with no WorkflowInstance, with workflowStatus null, and does not throw", async () => {
		const eventA = makeEvent({ id: "he-A" });
		const eventB = makeEvent({ id: "he-B" });
		const workflowA = makeWorkflow("he-A");
		const hazardousEventRepository = new FakeHazardousEventRepository(() =>
			Promise.resolve([eventA, eventB]),
		);
		const workflowRepository = new FakeWorkflowRepository(() =>
			Promise.resolve([workflowA]),
		);
		const logger = new FakeLogger();
		const useCase = new ListHazardousEventsUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);

		const result = await useCase.execute(makeQuery());

		expect(result).toHaveLength(2);
		expect(result[1].id).toBe("he-B");
		expect(result[1].workflowStatus).toBeNull();
		expect(result[1].tenantId).toBe(eventB.tenantId);
	});

	it("logs count and missingWorkflowStatusCount once on success", async () => {
		const eventA = makeEvent({ id: "he-A" });
		const eventB = makeEvent({ id: "he-B" });
		const eventC = makeEvent({ id: "he-C" });
		const workflowA = makeWorkflow("he-A");
		const workflowC = makeWorkflow("he-C");
		const hazardousEventRepository = new FakeHazardousEventRepository(() =>
			Promise.resolve([eventA, eventB, eventC]),
		);
		const workflowRepository = new FakeWorkflowRepository(() =>
			Promise.resolve([workflowA, workflowC]),
		);
		const logger = new FakeLogger();
		const useCase = new ListHazardousEventsUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);

		await useCase.execute(makeQuery());

		expect(logger.info).toHaveBeenCalledOnce();
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "hazardous_events.listed",
				tenantId: "tenant-1",
				count: 3,
				missingWorkflowStatusCount: 1,
			}),
		);
	});

	it("resolves two concurrent calls for different tenants independently, with each tenant's own ids only", async () => {
		const t1EventA = makeEvent({ id: "t1-a", tenantId: "T1" });
		const t1EventB = makeEvent({ id: "t1-b", tenantId: "T1" });
		const t2Event = makeEvent({ id: "t2-a", tenantId: "T2" });
		const now = new Date("2026-01-02T00:00:00.000Z");
		const t1WorkflowA = makeWorkflow("t1-a").submit({ userId: "user-1", now });
		const t1WorkflowB = makeWorkflow("t1-b");
		const t2Workflow = makeWorkflow("t2-a")
			.submit({ userId: "user-1", now })
			.approve({ userId: "user-1", now });

		const hazardousEventRepository = new FakeHazardousEventRepository(
			(tenantId) =>
				Promise.resolve(tenantId === "T1" ? [t1EventA, t1EventB] : [t2Event]),
		);
		const workflowRepository = new FakeWorkflowRepository((entityIds) =>
			Promise.resolve(
				entityIds.includes("t1-a") ? [t1WorkflowA, t1WorkflowB] : [t2Workflow],
			),
		);
		const useCase = new ListHazardousEventsUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			workflowRepository,
		);

		const [resultT1, resultT2] = await Promise.all([
			useCase.execute({ tenantId: "T1", page: 1, pageSize: 10 }),
			useCase.execute({ tenantId: "T2", page: 1, pageSize: 10 }),
		]);

		expect(resultT1).toHaveLength(2);
		expect(resultT1.map((d) => d.id)).toEqual(["t1-a", "t1-b"]);
		expect(resultT1[0].workflowStatus).toBe("SUBMITTED");
		expect(resultT1[1].workflowStatus).toBe("DRAFT");
		expect(resultT2).toHaveLength(1);
		expect(resultT2[0].id).toBe("t2-a");
		expect(resultT2[0].workflowStatus).toBe("APPROVED");
		expect(workflowRepository.findByEntityIdsCalls).toHaveLength(2);
		for (const call of workflowRepository.findByEntityIdsCalls) {
			if (call.entityIds.includes("t1-a")) {
				expect(call.entityIds).toEqual(["t1-a", "t1-b"]);
			} else {
				expect(call.entityIds).toEqual(["t2-a"]);
			}
		}
	});
});
