import { describe, expect, it, vi } from "vitest";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "../../domain/HazardousEvent";
import { NotFoundError, ValidationError } from "~/shared/errors";
import type { ILogger } from "~/shared/logging/ILogger";
import { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import type {
	IHazardousEventRepository,
	SpatialObservationRecord,
} from "../ports/IHazardousEventRepository";
import { toSpatialObservationDto } from "../dto/SpatialObservationDto";
import {
	GetHazardousEventByIdUseCase,
	type GetHazardousEventByIdQuery,
} from "./GetHazardousEventById";

class FakeLogger implements ILogger {
	info = vi.fn();
	warn = vi.fn();
	error = vi.fn();
	debug = vi.fn();
}

class FakeHazardousEventRepository implements IHazardousEventRepository {
	readonly findByIdCalls: { id: string; tenantId: string }[] = [];
	readonly findCurrentSpatialObservationCalls: {
		hazardousEventId: string;
		tenantId: string;
	}[] = [];
	private readonly store = new Map<string, HazardousEvent>();
	private readonly observations = new Map<
		string,
		SpatialObservationRecord | null
	>();

	constructor(
		seed: readonly HazardousEvent[] = [],
		observations: ReadonlyMap<
			string,
			SpatialObservationRecord | null
		> = new Map(),
		/** Resolves a lookup whose raw id cosmetically differs from the matched event's own id. */
		private readonly findByIdOverride?: HazardousEvent,
	) {
		for (const entity of seed) {
			this.store.set(this.key(entity.id, entity.tenantId), entity);
		}
		for (const [id, record] of observations) {
			this.observations.set(id, record);
		}
	}

	private key(id: string, tenantId: string): string {
		return `${tenantId}:${id}`;
	}

	async findById(id: string, tenantId: string): Promise<HazardousEvent> {
		this.findByIdCalls.push({ id, tenantId });
		if (this.findByIdOverride) {
			return this.findByIdOverride;
		}
		const found = this.store.get(this.key(id, tenantId));
		if (!found) {
			throw new NotFoundError("HazardousEvent", id);
		}
		return found;
	}

	async findCurrentSpatialObservation(
		hazardousEventId: string,
		tenantId: string,
	): Promise<SpatialObservationRecord | null> {
		this.findCurrentSpatialObservationCalls.push({
			hazardousEventId,
			tenantId,
		});
		return this.observations.get(hazardousEventId) ?? null;
	}

	async findAll(): Promise<HazardousEvent[]> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async delete(): Promise<void> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async countReferencingDisasterEvents(): Promise<number> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async findSpatialObservationByTime(): Promise<never> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async saveSpatialObservation(): Promise<never> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async save(): Promise<HazardousEvent> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}
}

class FakeWorkflowRepository implements IWorkflowRepository {
	readonly findByEntityCalls: { entityId: string; entityType: string }[] = [];
	private readonly store = new Map<string, WorkflowInstance>();

	constructor(seed: readonly WorkflowInstance[] = []) {
		for (const instance of seed) {
			this.store.set(instance.entityId, instance);
		}
	}

	async findByEntity(
		entityId: string,
		entityType: string,
	): Promise<WorkflowInstance | null> {
		this.findByEntityCalls.push({ entityId, entityType });
		return this.store.get(entityId) ?? null;
	}

	async findByEntityIds(): Promise<WorkflowInstance[]> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async save(): Promise<WorkflowInstance> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async deleteByEntity(): Promise<void> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}
}

const baseEventProps: HazardousEventProps = {
	id: "event-A",
	tenantId: "tenant-1",
	specificHazardId: "hazard-1",
	startDate: "2026-01-01",
	endDate: "",
	nationalSpecification: "national spec",
	description: "Original",
	chainsExplanation: "chains",
	magnitude: "5.2",
	recordOriginator: "originator",
	dataSource: "source",
	hazardousEventStatus: null,
	specificHazardLocalName: "Local name",
	specificHazardNationalName: null,
	apiImportId: null,
	createdByUserId: "user-1",
	updatedByUserId: null,
	submittedByUserId: null,
	submittedAt: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: null,
	hazardDriverIds: ["driver-a"],
	attachments: [],
	fieldValues: [],
	customFieldValues: [
		{ hazardTypeCustomFieldDefinitionId: "custom-a", value: "orig" },
	],
};

function makeEvent(
	overrides: Partial<HazardousEventProps> = {},
): HazardousEvent {
	return HazardousEvent.create(
		{ ...baseEventProps, ...overrides },
		new Set(["driver-a"]),
		new Set(["custom-a"]),
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

function makeObservationRecord(
	overrides: Partial<SpatialObservationRecord> = {},
): SpatialObservationRecord {
	return {
		id: "observation-1",
		hazardousEventId: "event-A",
		observationTime: new Date("2026-01-02T00:00:00.000Z"),
		note: null,
		geometries: [{ type: "Point" }],
		divisionIds: ["div-1"],
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-03T00:00:00.000Z"),
		...overrides,
	};
}

function makeQuery(
	overrides: Partial<GetHazardousEventByIdQuery> = {},
): GetHazardousEventByIdQuery {
	return { id: "event-A", tenantId: "tenant-1", ...overrides };
}

describe("GetHazardousEventByIdUseCase", () => {
	it("resolves a HazardousEventDetailDto whose workflowStatus and currentSpatialObservation reflect the fakes, given a recorded spatial observation", async () => {
		const event = makeEvent();
		const workflow = makeWorkflow(event.id);
		const record = makeObservationRecord();
		const hazardousEventRepository = new FakeHazardousEventRepository(
			[event],
			new Map([[event.id, record]]),
		);
		const workflowRepository = new FakeWorkflowRepository([workflow]);
		const useCase = new GetHazardousEventByIdUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			workflowRepository,
		);

		const result = await useCase.execute(makeQuery());

		expect(result.id).toBe(event.id);
		expect(result.workflowStatus).toBe(workflow.status);
		expect(result.currentSpatialObservation).toEqual(
			toSpatialObservationDto(record),
		);
	});

	it("resolves currentSpatialObservation as null and does not throw when no observation has been recorded", async () => {
		const event = makeEvent();
		const workflow = makeWorkflow(event.id);
		const hazardousEventRepository = new FakeHazardousEventRepository([event]);
		const workflowRepository = new FakeWorkflowRepository([workflow]);
		const useCase = new GetHazardousEventByIdUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			workflowRepository,
		);

		const result = await useCase.execute(makeQuery());

		expect(result.currentSpatialObservation).toBeNull();
	});

	it("propagates NotFoundError and performs no further lookup for a missing or cross-tenant id", async () => {
		const hazardousEventRepository = new FakeHazardousEventRepository([]);
		const workflowRepository = new FakeWorkflowRepository([]);
		const useCase = new GetHazardousEventByIdUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			workflowRepository,
		);

		await expect(useCase.execute(makeQuery({ id: "missing" }))).rejects.toThrow(
			NotFoundError,
		);

		expect(workflowRepository.findByEntityCalls).toHaveLength(0);
		expect(
			hazardousEventRepository.findCurrentSpatialObservationCalls,
		).toHaveLength(0);
	});

	it("throws ValidationError and performs no repository lookup for an empty tenantId", async () => {
		const hazardousEventRepository = new FakeHazardousEventRepository([]);
		const workflowRepository = new FakeWorkflowRepository([]);
		const logger = new FakeLogger();
		const useCase = new GetHazardousEventByIdUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);

		await expect(useCase.execute(makeQuery({ tenantId: "" }))).rejects.toThrow(
			ValidationError,
		);

		expect(hazardousEventRepository.findByIdCalls).toHaveLength(0);
		expect(workflowRepository.findByEntityCalls).toHaveLength(0);
		expect(
			hazardousEventRepository.findCurrentSpatialObservationCalls,
		).toHaveLength(0);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("throws ValidationError and performs no repository lookup for a non-string id reaching execute() at runtime", async () => {
		const hazardousEventRepository = new FakeHazardousEventRepository([]);
		const workflowRepository = new FakeWorkflowRepository([]);
		const logger = new FakeLogger();
		const useCase = new GetHazardousEventByIdUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);
		const query = {
			id: 42 as unknown as string,
			tenantId: "tenant-1",
		} satisfies GetHazardousEventByIdQuery;

		await expect(useCase.execute(query)).rejects.toThrow(ValidationError);

		expect(hazardousEventRepository.findByIdCalls).toHaveLength(0);
		expect(workflowRepository.findByEntityCalls).toHaveLength(0);
		expect(
			hazardousEventRepository.findCurrentSpatialObservationCalls,
		).toHaveLength(0);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("throws NotFoundError and performs no spatial-observation lookup when no WorkflowInstance exists for an otherwise-valid event", async () => {
		const event = makeEvent();
		const hazardousEventRepository = new FakeHazardousEventRepository([event]);
		const workflowRepository = new FakeWorkflowRepository([]);
		const logger = new FakeLogger();
		const useCase = new GetHazardousEventByIdUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);

		await expect(useCase.execute(makeQuery())).rejects.toThrow(NotFoundError);
		await expect(useCase.execute(makeQuery())).rejects.toMatchObject({
			context: { entity: "WorkflowInstance", id: event.id },
		});

		expect(
			hazardousEventRepository.findCurrentSpatialObservationCalls,
		).toHaveLength(0);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("keys the workflow and spatial-observation lookups off the resolved event's own id, not the raw query id", async () => {
		const event = makeEvent({ id: "canonical-id" });
		const workflow = makeWorkflow(event.id);
		const record = makeObservationRecord({ hazardousEventId: event.id });
		const hazardousEventRepository = new FakeHazardousEventRepository(
			[],
			new Map([[event.id, record]]),
			event,
		);
		const workflowRepository = new FakeWorkflowRepository([workflow]);
		const useCase = new GetHazardousEventByIdUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			workflowRepository,
		);

		await useCase.execute(makeQuery({ id: "cosmetically-different-id" }));

		expect(workflowRepository.findByEntityCalls).toEqual([
			{ entityId: "canonical-id", entityType: "HE" },
		]);
		expect(hazardousEventRepository.findCurrentSpatialObservationCalls).toEqual(
			[{ hazardousEventId: "canonical-id", tenantId: "tenant-1" }],
		);
	});

	it("logs exactly once on success, identifying the fetched event's id and tenant, with hasCurrentSpatialObservation false when none was recorded", async () => {
		const event = makeEvent();
		const workflow = makeWorkflow(event.id);
		const hazardousEventRepository = new FakeHazardousEventRepository([event]);
		const workflowRepository = new FakeWorkflowRepository([workflow]);
		const logger = new FakeLogger();
		const useCase = new GetHazardousEventByIdUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);

		await useCase.execute(makeQuery());

		expect(logger.info).toHaveBeenCalledOnce();
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				hazardousEventId: event.id,
				tenantId: "tenant-1",
				hasCurrentSpatialObservation: false,
			}),
		);
	});

	it("logs hasCurrentSpatialObservation true when a spatial observation was recorded", async () => {
		const event = makeEvent();
		const workflow = makeWorkflow(event.id);
		const record = makeObservationRecord();
		const hazardousEventRepository = new FakeHazardousEventRepository(
			[event],
			new Map([[event.id, record]]),
		);
		const workflowRepository = new FakeWorkflowRepository([workflow]);
		const logger = new FakeLogger();
		const useCase = new GetHazardousEventByIdUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);

		await useCase.execute(makeQuery());

		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ hasCurrentSpatialObservation: true }),
		);
	});

	it("does not log when execute() throws for any reason", async () => {
		const hazardousEventRepository = new FakeHazardousEventRepository([]);
		const workflowRepository = new FakeWorkflowRepository([]);
		const logger = new FakeLogger();
		const useCase = new GetHazardousEventByIdUseCase(
			logger,
			hazardousEventRepository,
			workflowRepository,
		);

		await expect(useCase.execute(makeQuery({ id: "missing" }))).rejects.toThrow(
			NotFoundError,
		);

		expect(logger.info).not.toHaveBeenCalled();
	});

	it("resolves two concurrent calls for different ids independently, with no cross-contamination", async () => {
		const eventA = makeEvent({ id: "event-A" });
		const eventB = makeEvent({ id: "event-B" });
		const workflowA = makeWorkflow(eventA.id).submit({
			userId: "user-2",
			now: new Date("2026-01-02T00:00:00.000Z"),
		});
		const workflowB = makeWorkflow(eventB.id);
		const recordA = makeObservationRecord({
			id: "observation-A",
			hazardousEventId: eventA.id,
		});
		const recordB = makeObservationRecord({
			id: "observation-B",
			hazardousEventId: eventB.id,
		});
		const hazardousEventRepository = new FakeHazardousEventRepository(
			[eventA, eventB],
			new Map([
				[eventA.id, recordA],
				[eventB.id, recordB],
			]),
		);
		const workflowRepository = new FakeWorkflowRepository([
			workflowA,
			workflowB,
		]);
		const useCase = new GetHazardousEventByIdUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			workflowRepository,
		);

		const [resultA, resultB] = await Promise.all([
			useCase.execute(makeQuery({ id: "event-A" })),
			useCase.execute(makeQuery({ id: "event-B" })),
		]);

		expect(resultA.id).toBe("event-A");
		expect(resultB.id).toBe("event-B");
		expect(resultA.workflowStatus).toBe(workflowA.status);
		expect(resultB.workflowStatus).toBe(workflowB.status);
		expect(resultA.currentSpatialObservation).toEqual(
			toSpatialObservationDto(recordA),
		);
		expect(resultB.currentSpatialObservation).toEqual(
			toSpatialObservationDto(recordB),
		);
	});
});
