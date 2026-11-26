import { describe, expect, it, vi } from "vitest";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "../../domain/HazardousEvent";
import { NotFoundError } from "~/shared/errors";
import type { ILogger } from "~/shared/logging/ILogger";
import { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import { GetWorkflowInstanceByEntityUseCase } from "~/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity";
import type {
	IHazardousEventRepository,
	SpatialObservationRecord,
} from "../ports/IHazardousEventRepository";
import type {
	HazardTaxonomyOptions,
	ISpecificHazardTaxonomyRepository,
	SpecificHazardTaxonomyNames,
} from "../ports/ISpecificHazardTaxonomyRepository";
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
		/** Makes findById(id, ...) reject with this error, to simulate a non-NotFoundError failure on the cause lookup. */
		private readonly findByIdErrorForId?: { id: string; error: Error },
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
		if (this.findByIdErrorForId && this.findByIdErrorForId.id === id) {
			throw this.findByIdErrorForId.error;
		}
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

	async countAll(): Promise<number> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async delete(): Promise<void> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async countReferencingDisasterEvents(): Promise<number> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async findByIdForUpdate(): Promise<HazardousEvent> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async findSpatialObservationByTime(): Promise<never> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async findIdByApiImportId(): Promise<never> {
		throw new Error("findIdByApiImportId is not used by this test");
	}

	async findExportRows(): Promise<never> {
		throw new Error("findExportRows is not used by this test");
	}

	async saveSpatialObservation(): Promise<never> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async insert(): Promise<HazardousEvent> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async update(): Promise<HazardousEvent> {
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

	async insert(): Promise<WorkflowInstance> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async update(): Promise<WorkflowInstance> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}

	async deleteByEntity(): Promise<void> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}
}

class FakeSpecificHazardTaxonomyRepository implements ISpecificHazardTaxonomyRepository {
	constructor(
		private readonly impl: () => ReadonlyMap<
			string,
			SpecificHazardTaxonomyNames
		> = () => new Map(),
	) {}

	async findNamesByIds(): Promise<
		ReadonlyMap<string, SpecificHazardTaxonomyNames>
	> {
		return this.impl();
	}

	async findBySourceRefIds(): Promise<never> {
		throw new Error("findBySourceRefIds is not used by this test");
	}

	async findAnySpecificHazardId(): Promise<never> {
		throw new Error("findAnySpecificHazardId is not used by this test");
	}

	async listAll(): Promise<HazardTaxonomyOptions> {
		throw new Error("not used by GetHazardousEventByIdUseCase's own tests");
	}
}

class FakeCausalChainRepository {
	readonly findCauseEdgeCalls: string[] = [];
	readonly findEffectEdgesCalls: string[] = [];

	constructor(
		private readonly result: {
			causeId: string;
			causalityExplanation: string | null;
		} | null = null,
		private readonly effectEdges: readonly {
			effectId: string;
			causalityExplanation: string | null;
		}[] = [],
	) {}

	async findCauseEdge(effectId: string) {
		this.findCauseEdgeCalls.push(effectId);
		return this.result;
	}

	async findEffectEdges(causeId: string) {
		this.findEffectEdgesCalls.push(causeId);
		return this.effectEdges;
	}
}

class FakeAuditLogPort {
	readonly findByRecordCalls: {
		tableName: string;
		recordId: string;
		countryAccountsId: string;
	}[] = [];

	constructor(
		private readonly rows: readonly {
			id: string;
			action: string;
			actorName: string;
			timestamp: Date;
		}[] = [],
	) {}

	async findByRecord(
		tableName: string,
		recordId: string,
		countryAccountsId: string,
	): Promise<
		{ id: string; action: string; actorName: string; timestamp: Date }[]
	> {
		this.findByRecordCalls.push({ tableName, recordId, countryAccountsId });
		return [...this.rows];
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
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
		);

		const result = await useCase.execute(makeQuery());

		expect(result.id).toBe(event.id);
		expect(result.workflowStatus).toBe(workflow.status);
		expect(result.currentSpatialObservation).toEqual(
			toSpatialObservationDto(record),
		);
	});

	it("resolves specificHazardName from the taxonomy repository, keyed by the event's own specificHazardId", async () => {
		const event = makeEvent({ specificHazardId: "hazard-X" });
		const workflow = makeWorkflow(event.id);
		const hazardousEventRepository = new FakeHazardousEventRepository([event]);
		const workflowRepository = new FakeWorkflowRepository([workflow]);
		const taxonomyRepository = new FakeSpecificHazardTaxonomyRepository(
			() =>
				new Map([
					[
						"hazard-X",
						{
							specificHazardName: "Cholera",
							hazardClusterName: "Infectious disease",
							hazardTypeName: "Biological",
							specificHazardCode: "code-1",
						},
					],
				]),
		);
		const useCase = new GetHazardousEventByIdUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			taxonomyRepository,
		);

		const result = await useCase.execute(makeQuery());

		expect(result.specificHazardName).toBe("Cholera");
		expect(result.hazardClusterName).toBe("Infectious disease");
		expect(result.hazardTypeName).toBe("Biological");
	});

	it("resolves specificHazardCode from the taxonomy repository, keyed by the event's own specificHazardId (design.md Decision 10, Fix 1)", async () => {
		const event = makeEvent({ specificHazardId: "hazard-X" });
		const workflow = makeWorkflow(event.id);
		const hazardousEventRepository = new FakeHazardousEventRepository([event]);
		const workflowRepository = new FakeWorkflowRepository([workflow]);
		const taxonomyRepository = new FakeSpecificHazardTaxonomyRepository(
			() =>
				new Map([
					[
						"hazard-X",
						{
							specificHazardName: "Cholera",
							hazardClusterName: "Infectious disease",
							hazardTypeName: "Biological",
							specificHazardCode: "MH0103",
						},
					],
				]),
		);
		const useCase = new GetHazardousEventByIdUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			taxonomyRepository,
		);

		const result = await useCase.execute(makeQuery());

		expect(result.specificHazardCode).toBe("MH0103");
	});

	it("resolves currentSpatialObservation as null and does not throw when no observation has been recorded", async () => {
		const event = makeEvent();
		const workflow = makeWorkflow(event.id);
		const hazardousEventRepository = new FakeHazardousEventRepository([event]);
		const workflowRepository = new FakeWorkflowRepository([workflow]);
		const useCase = new GetHazardousEventByIdUseCase(
			new FakeLogger(),
			hazardousEventRepository,
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
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
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
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
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
		);

		await expect(useCase.execute(makeQuery({ tenantId: "" }))).rejects.toThrow(
			"tenantId must not be empty",
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
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
		);
		const query = {
			id: 42 as unknown as string,
			tenantId: "tenant-1",
		} satisfies GetHazardousEventByIdQuery;

		await expect(useCase.execute(query)).rejects.toThrow(
			"id must not be empty",
		);

		expect(hazardousEventRepository.findByIdCalls).toHaveLength(0);
		expect(workflowRepository.findByEntityCalls).toHaveLength(0);
		expect(
			hazardousEventRepository.findCurrentSpatialObservationCalls,
		).toHaveLength(0);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("resolves with workflowStatus null and still performs the spatial-observation lookup when no WorkflowInstance exists for an otherwise-valid event (DEF-031)", async () => {
		const event = makeEvent();
		const record = makeObservationRecord();
		const hazardousEventRepository = new FakeHazardousEventRepository(
			[event],
			new Map([[event.id, record]]),
		);
		const workflowRepository = new FakeWorkflowRepository([]);
		const logger = new FakeLogger();
		const useCase = new GetHazardousEventByIdUseCase(
			logger,
			hazardousEventRepository,
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
		);

		const result = await useCase.execute(makeQuery());

		expect(result.workflowStatus).toBeNull();
		expect(result.currentSpatialObservation).toEqual(
			toSpatialObservationDto(record),
		);
		expect(hazardousEventRepository.findCurrentSpatialObservationCalls).toEqual(
			[{ hazardousEventId: event.id, tenantId: "tenant-1" }],
		);
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
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
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
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
		);

		await useCase.execute(makeQuery());

		expect(logger.info).toHaveBeenCalledOnce();
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "hazardous_event.fetched",
				hazardousEventId: event.id,
				tenantId: "tenant-1",
				hasCurrentSpatialObservation: false,
			}),
		);
	});

	it("logs workflowStatusMissing true, without throwing, when no WorkflowInstance exists (DEF-031)", async () => {
		const event = makeEvent();
		const hazardousEventRepository = new FakeHazardousEventRepository([event]);
		const workflowRepository = new FakeWorkflowRepository([]);
		const logger = new FakeLogger();
		const useCase = new GetHazardousEventByIdUseCase(
			logger,
			hazardousEventRepository,
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
		);

		await useCase.execute(makeQuery());

		expect(logger.info).toHaveBeenCalledOnce();
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ workflowStatusMissing: true }),
		);
	});

	it("does not log workflowStatusMissing when a WorkflowInstance exists", async () => {
		const event = makeEvent();
		const workflow = makeWorkflow(event.id);
		const hazardousEventRepository = new FakeHazardousEventRepository([event]);
		const workflowRepository = new FakeWorkflowRepository([workflow]);
		const logger = new FakeLogger();
		const useCase = new GetHazardousEventByIdUseCase(
			logger,
			hazardousEventRepository,
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
		);

		await useCase.execute(makeQuery());

		expect(logger.info).not.toHaveBeenCalledWith(
			expect.objectContaining({ workflowStatusMissing: true }),
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
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
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
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
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
			new GetWorkflowInstanceByEntityUseCase(workflowRepository),
			new FakeSpecificHazardTaxonomyRepository(),
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

	describe("cause (design.md Decision 9)", () => {
		it("resolves cause to null when the event has no cause edge", async () => {
			const event = makeEvent();
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				new FakeSpecificHazardTaxonomyRepository(),
				new FakeCausalChainRepository(null),
			);

			const result = await useCase.execute(makeQuery());

			expect(result.cause).toBeNull();
		});

		it("resolves cause's id/displayName/causalityExplanation when a cause edge exists", async () => {
			const event = makeEvent({ id: "event-A", specificHazardId: "hazard-A" });
			const causeEvent = makeEvent({
				id: "cause-1",
				specificHazardId: "hazard-cause",
			});
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
				causeEvent,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const taxonomyRepository = new FakeSpecificHazardTaxonomyRepository(
				() =>
					new Map([
						[
							"hazard-cause",
							{
								specificHazardName: "Flood",
								hazardClusterName: "",
								hazardTypeName: "",
								specificHazardCode: "code-1",
							},
						],
					]),
			);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				taxonomyRepository,
				new FakeCausalChainRepository({
					causeId: "cause-1",
					causalityExplanation: "upstream flooding",
				}),
			);

			const result = await useCase.execute(makeQuery({ id: "event-A" }));

			expect(result.cause).toEqual({
				id: "cause-1",
				displayName: "Flood",
				causalityExplanation: "upstream flooding",
				specificHazardCode: "code-1",
				description: "Original",
			});
		});

		it("falls back to an empty displayName when the cause's taxonomy name has no match", async () => {
			const event = makeEvent({ id: "event-A" });
			const causeEvent = makeEvent({
				id: "cause-1",
				specificHazardId: "hazard-cause",
			});
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
				causeEvent,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				new FakeSpecificHazardTaxonomyRepository(),
				new FakeCausalChainRepository({
					causeId: "cause-1",
					causalityExplanation: null,
				}),
			);

			const result = await useCase.execute(makeQuery({ id: "event-A" }));

			expect(result.cause).toEqual({
				id: "cause-1",
				displayName: "",
				causalityExplanation: null,
				specificHazardCode: null,
				description: "Original",
			});
		});

		it("propagates a non-NotFoundError from the cause lookup, instead of degrading to no cause (test-quality-auditor finding)", async () => {
			const event = makeEvent({ id: "event-A" });
			const hazardousEventRepository = new FakeHazardousEventRepository(
				[event],
				new Map(),
				undefined,
				{ id: "cause-1", error: new Error("transient DB error") },
			);
			const workflowRepository = new FakeWorkflowRepository([]);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				new FakeSpecificHazardTaxonomyRepository(),
				new FakeCausalChainRepository({
					causeId: "cause-1",
					causalityExplanation: null,
				}),
			);

			await expect(
				useCase.execute(makeQuery({ id: "event-A" })),
			).rejects.toThrow("transient DB error");
		});

		it("resolves taxonomy names for both the event's and the cause's specificHazardId (test-quality-auditor finding)", async () => {
			const event = makeEvent({ id: "event-A", specificHazardId: "hazard-A" });
			const causeEvent = makeEvent({
				id: "cause-1",
				specificHazardId: "hazard-cause",
			});
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
				causeEvent,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const findNamesByIdsSpy = vi.fn(
				async () => new Map<string, SpecificHazardTaxonomyNames>(),
			);
			const taxonomyRepository: ISpecificHazardTaxonomyRepository = {
				findNamesByIds: findNamesByIdsSpy,
				listAll: async () => {
					throw new Error("not used by this test");
				},
				findBySourceRefIds: async () => {
					throw new Error("not used by this test");
				},
				findAnySpecificHazardId: async () => {
					throw new Error("not used by this test");
				},
			};
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				taxonomyRepository,
				new FakeCausalChainRepository({
					causeId: "cause-1",
					causalityExplanation: null,
				}),
			);

			await useCase.execute(makeQuery({ id: "event-A" }));

			expect(findNamesByIdsSpy).toHaveBeenCalledWith([
				"hazard-A",
				"hazard-cause",
			]);
		});

		it("resolves cause's specificHazardCode and description from the already-resolved taxonomy lookup and causeEvent (design.md Decision 14, Finding 6)", async () => {
			const event = makeEvent({ id: "event-A", specificHazardId: "hazard-A" });
			const causeEvent = makeEvent({
				id: "cause-1",
				specificHazardId: "hazard-cause",
				description: "Flood description",
			});
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
				causeEvent,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const taxonomyRepository = new FakeSpecificHazardTaxonomyRepository(
				() =>
					new Map([
						[
							"hazard-cause",
							{
								specificHazardName: "Flood",
								hazardClusterName: "",
								hazardTypeName: "",
								specificHazardCode: "MH0103",
							},
						],
					]),
			);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				taxonomyRepository,
				new FakeCausalChainRepository({
					causeId: "cause-1",
					causalityExplanation: null,
				}),
			);

			const result = await useCase.execute(makeQuery({ id: "event-A" }));

			expect(result.cause?.specificHazardCode).toBe("MH0103");
			expect(result.cause?.description).toBe("Flood description");
		});

		it("resolves cause's specificHazardCode to null when no taxonomy match exists", async () => {
			const event = makeEvent({ id: "event-A" });
			const causeEvent = makeEvent({
				id: "cause-1",
				specificHazardId: "hazard-cause",
			});
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
				causeEvent,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				new FakeSpecificHazardTaxonomyRepository(),
				new FakeCausalChainRepository({
					causeId: "cause-1",
					causalityExplanation: null,
				}),
			);

			const result = await useCase.execute(makeQuery({ id: "event-A" }));

			expect(result.cause?.specificHazardCode).toBeNull();
		});
	});

	describe("effects (design.md Decision 8)", () => {
		it("resolves effects to an empty array when the event has no outgoing effect edges", async () => {
			const event = makeEvent();
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				new FakeSpecificHazardTaxonomyRepository(),
				new FakeCausalChainRepository(null, []),
			);

			const result = await useCase.execute(makeQuery());

			expect(result.effects).toEqual([]);
		});

		it("resolves each effect's id/displayName/causalityExplanation for a single outgoing edge", async () => {
			const event = makeEvent({ id: "event-A", specificHazardId: "hazard-A" });
			const effectEvent = makeEvent({
				id: "effect-1",
				specificHazardId: "hazard-effect",
			});
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
				effectEvent,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const taxonomyRepository = new FakeSpecificHazardTaxonomyRepository(
				() =>
					new Map([
						[
							"hazard-effect",
							{
								specificHazardName: "Landslide",
								hazardClusterName: "",
								hazardTypeName: "",
								specificHazardCode: "code-1",
							},
						],
					]),
			);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				taxonomyRepository,
				new FakeCausalChainRepository(null, [
					{ effectId: "effect-1", causalityExplanation: "downstream slope" },
				]),
			);

			const result = await useCase.execute(makeQuery({ id: "event-A" }));

			expect(result.effects).toEqual([
				{
					id: "effect-1",
					displayName: "Landslide",
					causalityExplanation: "downstream slope",
					specificHazardCode: "code-1",
					description: "Original",
				},
			]);
		});

		it("resolves every effect for multiple outgoing edges, in a single batched taxonomy lookup", async () => {
			const event = makeEvent({ id: "event-A", specificHazardId: "hazard-A" });
			const effect1 = makeEvent({
				id: "effect-1",
				specificHazardId: "hazard-effect-1",
			});
			const effect2 = makeEvent({
				id: "effect-2",
				specificHazardId: "hazard-effect-2",
			});
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
				effect1,
				effect2,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const findNamesByIdsSpy = vi.fn(
				async () => new Map<string, SpecificHazardTaxonomyNames>(),
			);
			const taxonomyRepository: ISpecificHazardTaxonomyRepository = {
				findNamesByIds: findNamesByIdsSpy,
				listAll: async () => {
					throw new Error("not used by this test");
				},
				findBySourceRefIds: async () => {
					throw new Error("not used by this test");
				},
				findAnySpecificHazardId: async () => {
					throw new Error("not used by this test");
				},
			};
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				taxonomyRepository,
				new FakeCausalChainRepository(null, [
					{ effectId: "effect-1", causalityExplanation: null },
					{ effectId: "effect-2", causalityExplanation: null },
				]),
			);

			const result = await useCase.execute(makeQuery({ id: "event-A" }));

			expect(result.effects).toHaveLength(2);
			expect(findNamesByIdsSpy).toHaveBeenCalledTimes(1);
			expect(findNamesByIdsSpy).toHaveBeenCalledWith([
				"hazard-A",
				"hazard-effect-1",
				"hazard-effect-2",
			]);
		});

		it("resolves each effect's specificHazardCode and description from the already-resolved taxonomy lookup and effectEvent (design.md Decision 14, Finding 6)", async () => {
			const event = makeEvent({ id: "event-A", specificHazardId: "hazard-A" });
			const effectEvent = makeEvent({
				id: "effect-1",
				specificHazardId: "hazard-effect",
				description: "Landslide description",
			});
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
				effectEvent,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const taxonomyRepository = new FakeSpecificHazardTaxonomyRepository(
				() =>
					new Map([
						[
							"hazard-effect",
							{
								specificHazardName: "Landslide",
								hazardClusterName: "",
								hazardTypeName: "",
								specificHazardCode: "MH0104",
							},
						],
					]),
			);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				taxonomyRepository,
				new FakeCausalChainRepository(null, [
					{ effectId: "effect-1", causalityExplanation: null },
				]),
			);

			const result = await useCase.execute(makeQuery({ id: "event-A" }));

			expect(result.effects[0].specificHazardCode).toBe("MH0104");
			expect(result.effects[0].description).toBe("Landslide description");
		});

		it("omits one unresolvable effect (dangling edge) without failing the rest of the page", async () => {
			const event = makeEvent({ id: "event-A" });
			const effect1 = makeEvent({ id: "effect-1" });
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
				effect1,
				// effect-2 intentionally not seeded -- findById rejects NotFoundError for it.
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				new FakeSpecificHazardTaxonomyRepository(),
				new FakeCausalChainRepository(null, [
					{ effectId: "effect-1", causalityExplanation: null },
					{ effectId: "effect-2", causalityExplanation: null },
				]),
			);

			const result = await useCase.execute(makeQuery({ id: "event-A" }));

			expect(result.effects).toEqual([
				{
					id: "effect-1",
					displayName: "",
					causalityExplanation: null,
					specificHazardCode: null,
					description: "Original",
				},
			]);
		});

		it("propagates a non-NotFoundError from an effect lookup, instead of degrading to omitted", async () => {
			const event = makeEvent({ id: "event-A" });
			const hazardousEventRepository = new FakeHazardousEventRepository(
				[event],
				new Map(),
				undefined,
				{ id: "effect-1", error: new Error("transient DB error") },
			);
			const workflowRepository = new FakeWorkflowRepository([]);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				new FakeSpecificHazardTaxonomyRepository(),
				new FakeCausalChainRepository(null, [
					{ effectId: "effect-1", causalityExplanation: null },
				]),
			);

			await expect(
				useCase.execute(makeQuery({ id: "event-A" })),
			).rejects.toThrow("transient DB error");
		});
	});

	describe("auditLog", () => {
		it("resolves auditLog to an empty array when the port resolves no rows", async () => {
			const event = makeEvent();
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				new FakeSpecificHazardTaxonomyRepository(),
				new FakeCausalChainRepository(),
				new FakeAuditLogPort([]),
			);

			const result = await useCase.execute(makeQuery());

			expect(result.auditLog).toEqual([]);
		});

		it("calls findByRecord with the hazardous_event table name, the event's own id, and tenantId", async () => {
			const event = makeEvent({ id: "event-A" });
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const auditLogPort = new FakeAuditLogPort([]);
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				new FakeSpecificHazardTaxonomyRepository(),
				new FakeCausalChainRepository(),
				auditLogPort,
			);

			await useCase.execute(makeQuery({ id: "event-A", tenantId: "tenant-1" }));

			expect(auditLogPort.findByRecordCalls).toEqual([
				{
					tableName: "hazardous_event",
					recordId: "event-A",
					countryAccountsId: "tenant-1",
				},
			]);
		});

		it("maps each row's id/action/actorName/timestamp onto the DTO, newest-first order unchanged", async () => {
			const event = makeEvent();
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const rows = [
				{
					id: "audit-2",
					action: "Update hazardous event",
					actorName: "Test",
					timestamp: new Date("2026-02-01T00:00:00.000Z"),
				},
				{
					id: "audit-1",
					action: "Create hazardous event",
					actorName: "Test",
					timestamp: new Date("2026-01-01T00:00:00.000Z"),
				},
			];
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				new FakeSpecificHazardTaxonomyRepository(),
				new FakeCausalChainRepository(),
				new FakeAuditLogPort(rows),
			);

			const result = await useCase.execute(makeQuery());

			expect(result.auditLog).toEqual([
				{
					id: "audit-2",
					action: "Update hazardous event",
					actorName: "Test",
					timestamp: "2026-02-01T00:00:00.000Z",
				},
				{
					id: "audit-1",
					action: "Create hazardous event",
					actorName: "Test",
					timestamp: "2026-01-01T00:00:00.000Z",
				},
			]);
		});

		it("humanizes an action string translateAuditLogAction doesn't already translate", async () => {
			const event = makeEvent();
			const hazardousEventRepository = new FakeHazardousEventRepository([
				event,
			]);
			const workflowRepository = new FakeWorkflowRepository([]);
			const rows = [
				{
					id: "audit-1",
					action: "submit-draft",
					actorName: "Test",
					timestamp: new Date("2026-01-01T00:00:00.000Z"),
				},
			];
			const useCase = new GetHazardousEventByIdUseCase(
				new FakeLogger(),
				hazardousEventRepository,
				new GetWorkflowInstanceByEntityUseCase(workflowRepository),
				new FakeSpecificHazardTaxonomyRepository(),
				new FakeCausalChainRepository(),
				new FakeAuditLogPort(rows),
			);

			const result = await useCase.execute(makeQuery());

			expect(result.auditLog[0].action).toBe("Submit draft");
		});
	});
});
