import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "../../domain/HazardousEvent";
import type { CausalEdge } from "../../domain/CausalChain";
import { ConflictError, NotFoundError, ValidationError } from "~/shared/errors";
import type { ILogger } from "~/shared/logging/ILogger";
import { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ICausalChainRepository } from "../ports/ICausalChainRepository";
import type { IHazardTaxonomyRepository } from "../ports/IHazardTaxonomyRepository";
import type {
	RecordSpatialObservationCommand,
	RecordSpatialObservationUseCase,
} from "./RecordSpatialObservation";
import type { SpatialObservationDto } from "../dto/SpatialObservationDto";
import {
	UpdateHazardousEventUseCase,
	type UpdateHazardousEventCommand,
} from "./UpdateHazardousEvent";

class FakeLogger implements ILogger {
	info = vi.fn();
	warn = vi.fn();
	error = vi.fn();
	debug = vi.fn();
}

interface TaxonomyLookupCall {
	ids: readonly string[];
	tenantId: string;
}

class FakeHazardTaxonomyRepository implements IHazardTaxonomyRepository {
	readonly findValidHazardDriverIdsCalls: TaxonomyLookupCall[] = [];
	readonly findValidCustomFieldDefinitionIdsCalls: TaxonomyLookupCall[] = [];

	constructor(
		private readonly validHazardDriverIds: ReadonlySet<string>,
		private readonly validCustomFieldDefinitionIds: ReadonlySet<string>,
	) {}

	async findValidHazardDriverIds(
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>> {
		this.findValidHazardDriverIdsCalls.push({ ids, tenantId });
		return new Set(ids.filter((id) => this.validHazardDriverIds.has(id)));
	}

	async findValidCustomFieldDefinitionIds(
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>> {
		this.findValidCustomFieldDefinitionIdsCalls.push({ ids, tenantId });
		return new Set(
			ids.filter((id) => this.validCustomFieldDefinitionIds.has(id)),
		);
	}
}

class FakeHazardousEventRepository implements IHazardousEventRepository {
	readonly saveCalls: HazardousEvent[] = [];
	readonly findByIdCalls: { id: string; tenantId: string }[] = [];
	private readonly store = new Map<string, HazardousEvent>();

	constructor(
		seed: readonly HazardousEvent[] = [],
		private readonly callLog: string[] = [],
	) {
		for (const entity of seed) {
			this.store.set(this.key(entity.id, entity.tenantId), entity);
		}
	}

	private key(id: string, tenantId: string): string {
		return `${tenantId}:${id}`;
	}

	async findById(id: string, tenantId: string): Promise<HazardousEvent> {
		this.findByIdCalls.push({ id, tenantId });
		const found = this.store.get(this.key(id, tenantId));
		if (!found) {
			throw new NotFoundError("HazardousEvent", id);
		}
		return found;
	}

	async findAll(): Promise<HazardousEvent[]> {
		throw new Error("not used by UpdateHazardousEventUseCase's own tests");
	}

	async delete(): Promise<void> {
		throw new Error("not used by UpdateHazardousEventUseCase's own tests");
	}

	async findCurrentSpatialObservation(): Promise<never> {
		throw new Error("not used by UpdateHazardousEventUseCase's own tests");
	}

	async findSpatialObservationByTime(): Promise<never> {
		throw new Error("not used by UpdateHazardousEventUseCase's own tests");
	}

	async saveSpatialObservation(): Promise<never> {
		throw new Error("not used by UpdateHazardousEventUseCase's own tests");
	}

	async save(entity: HazardousEvent): Promise<HazardousEvent> {
		this.saveCalls.push(entity);
		this.store.set(this.key(entity.id, entity.tenantId), entity);
		this.callLog.push("hazardousEvent.save");
		return entity;
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
		throw new Error("not used by UpdateHazardousEventUseCase's own tests");
	}

	async save(): Promise<WorkflowInstance> {
		throw new Error(
			"UpdateHazardousEventUseCase never writes a WorkflowInstance",
		);
	}
}

/** An opt-in barrier lets concurrent callers be driven to observe the same pre-write snapshot. */
class FakeCausalChainRepository implements ICausalChainRepository {
	readonly findReachableEdgesFromCalls: string[] = [];
	readonly saveEdgeCalls: {
		edge: CausalEdge;
		causalityExplanation: string | null;
	}[] = [];
	readonly deleteCauseEdgesCalls: string[] = [];
	findReachableEdgesFromBehavior:
		| readonly CausalEdge[]
		| Error
		| ((nodeId: string) => readonly CausalEdge[])
		| undefined;
	concurrentBarrierSize = 0;
	private edges: CausalEdge[];
	private readonly barrierResolvers: (() => void)[] = [];

	constructor(seedEdges: readonly CausalEdge[] = []) {
		this.edges = [...seedEdges];
	}

	async findReachableEdgesFrom(nodeId: string): Promise<readonly CausalEdge[]> {
		this.findReachableEdgesFromCalls.push(nodeId);
		if (this.concurrentBarrierSize > 0) {
			await this.awaitBarrier();
		}
		if (this.findReachableEdgesFromBehavior instanceof Error) {
			throw this.findReachableEdgesFromBehavior;
		}
		if (typeof this.findReachableEdgesFromBehavior === "function") {
			return this.findReachableEdgesFromBehavior(nodeId);
		}
		if (this.findReachableEdgesFromBehavior !== undefined) {
			return this.findReachableEdgesFromBehavior;
		}
		return this.realReachableEdgesFrom(nodeId);
	}

	private awaitBarrier(): Promise<void> {
		return new Promise<void>((resolve) => {
			this.barrierResolvers.push(resolve);
			if (this.barrierResolvers.length >= this.concurrentBarrierSize) {
				const resolvers = this.barrierResolvers.splice(0);
				for (const resolver of resolvers) resolver();
			}
		});
	}

	private realReachableEdgesFrom(nodeId: string): readonly CausalEdge[] {
		const adjacency = new Map<string, CausalEdge[]>();
		for (const edge of this.edges) {
			const existing = adjacency.get(edge.causeId);
			if (existing) {
				existing.push(edge);
			} else {
				adjacency.set(edge.causeId, [edge]);
			}
		}
		const visited = new Set<string>([nodeId]);
		const queue = [nodeId];
		const reachable: CausalEdge[] = [];
		let head = 0;
		while (head < queue.length) {
			const current = queue[head++];
			for (const edge of adjacency.get(current) ?? []) {
				reachable.push(edge);
				if (!visited.has(edge.effectId)) {
					visited.add(edge.effectId);
					queue.push(edge.effectId);
				}
			}
		}
		return reachable;
	}

	async saveEdge(
		edge: CausalEdge,
		causalityExplanation: string | null,
	): Promise<void> {
		this.saveEdgeCalls.push({ edge, causalityExplanation });
		this.edges.push(edge);
	}

	async deleteCauseEdges(effectId: string): Promise<void> {
		this.deleteCauseEdgesCalls.push(effectId);
		this.edges = this.edges.filter((edge) => edge.effectId !== effectId);
	}

	all(): readonly CausalEdge[] {
		return [...this.edges];
	}
}

class FakeRecordSpatialObservationUseCase implements Pick<
	RecordSpatialObservationUseCase,
	"execute"
> {
	readonly executeCalls: RecordSpatialObservationCommand[] = [];
	executeBehavior: "succeed" | Error = "succeed";

	constructor(private readonly callLog: string[] = []) {}

	async execute(
		command: RecordSpatialObservationCommand,
	): Promise<SpatialObservationDto> {
		this.executeCalls.push(command);
		this.callLog.push("spatialObservation.execute");
		if (this.executeBehavior instanceof Error) {
			throw this.executeBehavior;
		}
		const now = new Date().toISOString();
		return {
			id: "observation-1",
			hazardousEventId: command.hazardousEventId,
			observationTime: (command.observationTime ?? new Date()).toISOString(),
			note: command.note ?? null,
			geometries: command.geometries,
			divisionIds: command.divisionIds,
			createdAt: now,
			updatedAt: now,
		};
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

function makeCommand(
	overrides: Partial<UpdateHazardousEventCommand> & {
		id: string;
		tenantId: string;
	},
): UpdateHazardousEventCommand {
	return { actingUserId: "user-2", ...overrides };
}

interface HarnessOptions {
	seedEvents?: readonly HazardousEvent[];
	seedWorkflows?: readonly WorkflowInstance[];
	seedCausalEdges?: readonly CausalEdge[];
	validHazardDriverIds?: ReadonlySet<string>;
	validCustomFieldDefinitionIds?: ReadonlySet<string>;
}

function createHarness(options: HarnessOptions = {}) {
	const callLog: string[] = [];
	const logger = new FakeLogger();
	const taxonomyRepository = new FakeHazardTaxonomyRepository(
		options.validHazardDriverIds ?? new Set(["driver-a"]),
		options.validCustomFieldDefinitionIds ?? new Set(["custom-a"]),
	);
	const hazardousEventRepository = new FakeHazardousEventRepository(
		options.seedEvents ?? [makeEvent()],
		callLog,
	);
	const workflowRepository = new FakeWorkflowRepository(
		options.seedWorkflows ?? [makeWorkflow("event-A")],
	);
	const causalChainRepository = new FakeCausalChainRepository(
		options.seedCausalEdges ?? [],
	);
	const recordSpatialObservationUseCase =
		new FakeRecordSpatialObservationUseCase(callLog);
	const useCase = new UpdateHazardousEventUseCase(
		logger,
		taxonomyRepository,
		hazardousEventRepository,
		workflowRepository,
		causalChainRepository,
		recordSpatialObservationUseCase,
	);
	return {
		callLog,
		logger,
		taxonomyRepository,
		hazardousEventRepository,
		workflowRepository,
		causalChainRepository,
		recordSpatialObservationUseCase,
		useCase,
	};
}

describe("UpdateHazardousEventUseCase", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("partial-patch semantics", () => {
		it("replaces a present scalar field and leaves every other field unchanged", async () => {
			const harness = createHarness();

			const dto = await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					description: "Updated",
				}),
			);

			expect(dto.description).toBe("Updated");
			expect(dto.magnitude).toBe("5.2");
			expect(dto.nationalSpecification).toBe("national spec");
			expect(dto.specificHazardLocalName).toBe("Local name");
		});

		it("leaves an absent scalar field unchanged", async () => {
			const harness = createHarness();

			const dto = await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					description: "Updated",
				}),
			);

			expect(dto.magnitude).toBe("5.2");
		});

		it("sets a nullable field to null on an explicit null", async () => {
			const harness = createHarness();

			const dto = await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					specificHazardLocalName: null,
				}),
			);

			expect(dto.specificHazardLocalName).toBeNull();
		});

		it("fully replaces a present collection field", async () => {
			const harness = createHarness({
				validHazardDriverIds: new Set(["driver-c"]),
			});

			const dto = await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					hazardDriverIds: ["driver-c"],
				}),
			);

			expect(dto.hazardDriverIds).toEqual(["driver-c"]);
		});

		it("carries attachments/fieldValues over unchanged when absent, and fully replaces them when present", async () => {
			const existingAttachment = {
				id: "attachment-1",
				title: "Original",
				fileKey: "key-1",
				fileName: "file-1.pdf",
				fileType: "application/pdf",
				fileSize: 100,
			};
			const existingFieldValue = {
				hazardTypeFieldDefinitionId: "field-1",
				value: "original value",
			};
			const harness = createHarness({
				seedEvents: [
					makeEvent({
						attachments: [existingAttachment],
						fieldValues: [existingFieldValue],
					}),
				],
			});

			const unchangedDto = await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					description: "Updated",
				}),
			);
			expect(unchangedDto.attachments).toEqual([existingAttachment]);
			expect(unchangedDto.fieldValues).toEqual([existingFieldValue]);

			const newAttachment = {
				id: "attachment-2",
				title: "New",
				fileKey: "key-2",
				fileName: "file-2.pdf",
				fileType: "application/pdf",
				fileSize: 200,
			};
			const newFieldValue = {
				hazardTypeFieldDefinitionId: "field-2",
				value: "new value",
			};
			const replacedDto = await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					attachments: [newAttachment],
					fieldValues: [newFieldValue],
				}),
			);
			expect(replacedDto.attachments).toEqual([newAttachment]);
			expect(replacedDto.fieldValues).toEqual([newFieldValue]);
		});

		it("re-validates a carried-over collection id and throws if it is no longer valid", async () => {
			const harness = createHarness({
				validHazardDriverIds: new Set(),
				validCustomFieldDefinitionIds: new Set(["custom-a"]),
			});

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						description: "Updated",
					}),
				),
			).rejects.toThrow(/hazardDriverId driver-a/);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
		});

		it("re-validates a carried-over customFieldValues definition id and throws if it is no longer valid", async () => {
			const harness = createHarness({
				validHazardDriverIds: new Set(["driver-a"]),
				validCustomFieldDefinitionIds: new Set(),
			});

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						description: "Updated",
					}),
				),
			).rejects.toThrow(/hazardTypeCustomFieldDefinitionId custom-a/);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
		});

		it("surfaces HazardousEvent.create()'s ValidationError for a non-array hazardDriverIds, querying taxonomy with an empty id list", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				hazardDriverIds: "not-an-array",
			} as unknown as UpdateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(harness.taxonomyRepository.findValidHazardDriverIdsCalls).toEqual([
				{ ids: [], tenantId: "tenant-1" },
			]);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
		});

		it("surfaces HazardousEvent.create()'s ValidationError for a non-array customFieldValues, querying taxonomy with an empty id list", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				customFieldValues: "not-an-array",
			} as unknown as UpdateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(
				harness.taxonomyRepository.findValidCustomFieldDefinitionIdsCalls,
			).toEqual([{ ids: [], tenantId: "tenant-1" }]);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
		});

		it("strips a non-string element from hazardDriverIds before querying the taxonomy repository, surfacing HazardousEvent.create()'s own ValidationError for the raw array", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				hazardDriverIds: ["driver-a", 42],
			} as unknown as UpdateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(harness.taxonomyRepository.findValidHazardDriverIdsCalls).toEqual([
				{ ids: ["driver-a"], tenantId: "tenant-1" },
			]);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
		});

		it("surfaces HazardousEvent.create()'s ValidationError for a null element in customFieldValues", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				customFieldValues: [null],
			} as unknown as UpdateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
		});

		it("re-validates startDate/endDate ordering against the merged values", async () => {
			const harness = createHarness({
				seedEvents: [
					makeEvent({ startDate: "2026-01-01", endDate: "2026-06" }),
				],
			});

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						startDate: "2026-07-01",
					}),
				),
			).rejects.toThrow(ValidationError);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
		});

		it("replaces every present field with the command's value", async () => {
			const harness = createHarness({
				validHazardDriverIds: new Set(["driver-z"]),
				validCustomFieldDefinitionIds: new Set(["custom-z"]),
			});

			const dto = await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					specificHazardId: "hazard-2",
					startDate: "2026-03-01",
					endDate: "2026-03-10",
					nationalSpecification: "new national spec",
					description: "new description",
					chainsExplanation: "new chains",
					magnitude: "7.0",
					recordOriginator: "new originator",
					dataSource: "new source",
					hazardousEventStatus: "ongoing",
					specificHazardLocalName: "new local",
					specificHazardNationalName: "new national",
					hazardDriverIds: ["driver-z"],
					attachments: [],
					fieldValues: [],
					customFieldValues: [
						{ hazardTypeCustomFieldDefinitionId: "custom-z", value: "new" },
					],
				}),
			);

			expect(dto.specificHazardId).toBe("hazard-2");
			expect(dto.startDate).toBe("2026-03-01");
			expect(dto.endDate).toBe("2026-03-10");
			expect(dto.nationalSpecification).toBe("new national spec");
			expect(dto.description).toBe("new description");
			expect(dto.chainsExplanation).toBe("new chains");
			expect(dto.magnitude).toBe("7.0");
			expect(dto.recordOriginator).toBe("new originator");
			expect(dto.dataSource).toBe("new source");
			expect(dto.hazardousEventStatus).toBe("ongoing");
			expect(dto.specificHazardLocalName).toBe("new local");
			expect(dto.specificHazardNationalName).toBe("new national");
			expect(dto.hazardDriverIds).toEqual(["driver-z"]);
			expect(dto.customFieldValues).toEqual([
				{ hazardTypeCustomFieldDefinitionId: "custom-z", value: "new" },
			]);
		});

		it("leaves every field at its existing value when only id/tenantId/actingUserId are present", async () => {
			const harness = createHarness();

			const dto = await harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			);

			expect(dto.specificHazardId).toBe("hazard-1");
			expect(dto.startDate).toBe("2026-01-01");
			expect(dto.endDate).toBe("");
			expect(dto.nationalSpecification).toBe("national spec");
			expect(dto.description).toBe("Original");
			expect(dto.chainsExplanation).toBe("chains");
			expect(dto.magnitude).toBe("5.2");
			expect(dto.recordOriginator).toBe("originator");
			expect(dto.dataSource).toBe("source");
			expect(dto.hazardousEventStatus).toBeNull();
			expect(dto.specificHazardLocalName).toBe("Local name");
			expect(dto.specificHazardNationalName).toBeNull();
			expect(dto.hazardDriverIds).toEqual(["driver-a"]);
			expect(dto.customFieldValues).toEqual([
				{ hazardTypeCustomFieldDefinitionId: "custom-a", value: "orig" },
			]);
			expect(dto.apiImportId).toBeNull();
			expect(dto.createdByUserId).toBe("user-1");
			expect(dto.submittedByUserId).toBeNull();
			expect(dto.submittedAt).toBeNull();
			expect(dto.createdAt).toBe("2026-01-01T00:00:00.000Z");
		});

		it("always sets updatedByUserId to actingUserId and updatedAt to the current time, regardless of which other fields change", async () => {
			const harness = createHarness();

			const dto = await harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			);

			expect(dto.updatedByUserId).toBe("user-2");
			expect(dto.updatedAt).toBe("2026-02-01T10:00:00.000Z");
		});

		it("sets hazardousEventStatus and specificHazardNationalName to null on an explicit null", async () => {
			const harness = createHarness({
				seedEvents: [makeEvent({ hazardousEventStatus: "ongoing" })],
			});

			const dto = await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					hazardousEventStatus: null,
					specificHazardNationalName: null,
				}),
			);

			expect(dto.hazardousEventStatus).toBeNull();
			expect(dto.specificHazardNationalName).toBeNull();
		});
	});

	it("throws NotFoundError with zero writes when command.id does not exist under command.tenantId", async () => {
		const harness = createHarness();

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "missing-event", tenantId: "tenant-1" }),
			),
		).rejects.toThrow(NotFoundError);
		expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
		expect(
			harness.taxonomyRepository.findValidHazardDriverIdsCalls,
		).toHaveLength(0);
	});

	it("throws NotFoundError with zero writes for a cross-tenant command.id", async () => {
		const harness = createHarness();

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-2" }),
			),
		).rejects.toThrow(NotFoundError);
		expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
	});

	it("throws NotFoundError for a missing WorkflowInstance before any merge/validation work runs", async () => {
		const harness = createHarness({ seedWorkflows: [] });

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			),
		).rejects.toThrow(NotFoundError);
		expect(
			harness.taxonomyRepository.findValidHazardDriverIdsCalls,
		).toHaveLength(0);
		expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
	});

	it("throws ValidationError for a non-string id, with zero writes", async () => {
		const harness = createHarness();
		const command = {
			...makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			id: 12345,
		} as unknown as UpdateHazardousEventCommand;

		await expect(harness.useCase.execute(command)).rejects.toThrow(
			ValidationError,
		);
		expect(harness.hazardousEventRepository.findByIdCalls).toHaveLength(0);
	});

	it("throws ValidationError for a non-string tenantId, with zero writes", async () => {
		const harness = createHarness();
		const command = {
			...makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			tenantId: 12345,
		} as unknown as UpdateHazardousEventCommand;

		await expect(harness.useCase.execute(command)).rejects.toThrow(
			ValidationError,
		);
		expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
	});

	it("throws ValidationError for a non-string actingUserId, with zero writes", async () => {
		const harness = createHarness();
		const command = {
			...makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			actingUserId: 12345,
		} as unknown as UpdateHazardousEventCommand;

		await expect(harness.useCase.execute(command)).rejects.toThrow(
			new ValidationError("actingUserId must not be empty"),
		);
		expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
		expect(harness.hazardousEventRepository.findByIdCalls).toHaveLength(0);
	});

	it("throws ValidationError for an empty-string actingUserId, with zero writes", async () => {
		const harness = createHarness();
		const command = makeCommand({
			id: "event-A",
			tenantId: "tenant-1",
			actingUserId: "",
		});

		await expect(harness.useCase.execute(command)).rejects.toThrow(
			new ValidationError("actingUserId must not be empty"),
		);
		expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
		expect(harness.hazardousEventRepository.findByIdCalls).toHaveLength(0);
	});

	it("rejects a runtime-bypassing null on a non-nullable field, with zero writes", async () => {
		const harness = createHarness();
		const command = {
			...makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			startDate: null,
		} as unknown as UpdateHazardousEventCommand;

		await expect(harness.useCase.execute(command)).rejects.toThrow(
			ValidationError,
		);
		expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
	});

	it("propagates a generic Error from the HazardousEvent save, with no causal-chain write", async () => {
		const harness = createHarness();
		harness.hazardousEventRepository.save = async () => {
			throw new Error("boom-hazardous-event-save");
		};

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1", causeId: null }),
			),
		).rejects.toThrow("boom-hazardous-event-save");
		expect(harness.causalChainRepository.deleteCauseEdgesCalls).toHaveLength(0);
	});

	describe("a changed causal link", () => {
		function harnessWithCause(
			overrides: Partial<HarnessOptions> = {},
		): ReturnType<typeof createHarness> {
			return createHarness({
				seedEvents: [
					makeEvent({ id: "event-A", startDate: "2026-01-01" }),
					makeEvent({ id: "cause-1", startDate: "2025-12-01" }),
				],
				seedWorkflows: [makeWorkflow("event-A"), makeWorkflow("cause-1")],
				...overrides,
			});
		}

		it("rejects a non-existent causeId, with zero writes", async () => {
			const harness = harnessWithCause();

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						causeId: "missing-cause",
					}),
				),
			).rejects.toThrow(NotFoundError);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
			expect(
				harness.causalChainRepository.findReachableEdgesFromCalls,
			).toHaveLength(0);
			expect(harness.causalChainRepository.deleteCauseEdgesCalls).toHaveLength(
				0,
			);
		});

		it("rejects a causeId belonging to a different tenant, with zero writes", async () => {
			const harness = createHarness({
				seedEvents: [
					makeEvent({ id: "event-A", startDate: "2026-01-01" }),
					makeEvent({
						id: "cause-2",
						tenantId: "tenant-2",
						startDate: "2025-01-01",
					}),
				],
				seedWorkflows: [makeWorkflow("event-A")],
			});

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						causeId: "cause-2",
					}),
				),
			).rejects.toThrow(NotFoundError);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
			expect(harness.causalChainRepository.deleteCauseEdgesCalls).toHaveLength(
				0,
			);
		});

		it("rejects a causeId that would close a cycle, with zero writes", async () => {
			const harness = harnessWithCause();
			harness.causalChainRepository.findReachableEdgesFromBehavior = (
				nodeId,
			) => [{ causeId: nodeId, effectId: "cause-1" }];

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						causeId: "cause-1",
					}),
				),
			).rejects.toThrow(ConflictError);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
			expect(harness.causalChainRepository.deleteCauseEdgesCalls).toHaveLength(
				0,
			);
		});

		it("propagates a generic Error from findReachableEdgesFrom rejecting, with zero writes", async () => {
			const harness = harnessWithCause();
			harness.causalChainRepository.findReachableEdgesFromBehavior = new Error(
				"boom-find-reachable",
			);

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						causeId: "cause-1",
					}),
				),
			).rejects.toThrow("boom-find-reachable");
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
			expect(harness.causalChainRepository.deleteCauseEdgesCalls).toHaveLength(
				0,
			);
		});

		it("rejects a causeId whose startDate is later than the updated event's own startDate", async () => {
			const harness = harnessWithCause({
				seedEvents: [
					makeEvent({ id: "event-A", startDate: "2026-01-01" }),
					makeEvent({ id: "cause-1", startDate: "2026-06-01" }),
				],
			});

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						causeId: "cause-1",
					}),
				),
			).rejects.toThrow(ConflictError);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
			expect(harness.causalChainRepository.deleteCauseEdgesCalls).toHaveLength(
				0,
			);
		});

		it("re-checks the cycle/temporal rules against the merged startDate when both startDate and causeId change together", async () => {
			const harness = harnessWithCause({
				seedEvents: [
					makeEvent({ id: "event-A", startDate: "2020-01-01" }),
					makeEvent({ id: "cause-1", startDate: "2026-06-01" }),
				],
			});

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						startDate: "2026-12-01",
						causeId: "cause-1",
					}),
				),
			).resolves.toBeDefined();
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(1);
		});

		it("accepts a causeId whose startDate equals the updated event's own startDate", async () => {
			const harness = harnessWithCause({
				seedEvents: [
					makeEvent({ id: "event-A", startDate: "2026-01-01" }),
					makeEvent({ id: "cause-1", startDate: "2026-01-01" }),
				],
			});

			await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					causeId: "cause-1",
				}),
			);

			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(1);
		});

		it("defaults a null causalityExplanation when omitted from the command", async () => {
			const harness = harnessWithCause();

			await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					causeId: "cause-1",
				}),
			);

			expect(
				harness.causalChainRepository.saveEdgeCalls[0].causalityExplanation,
			).toBeNull();
		});

		it("persists a given causalityExplanation on the new edge", async () => {
			const harness = harnessWithCause();

			await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					causeId: "cause-1",
					causalityExplanation: "upstream flooding",
				}),
			);

			expect(
				harness.causalChainRepository.saveEdgeCalls[0].causalityExplanation,
			).toBe("upstream flooding");
		});

		it("does not block on the temporal check when either startDate is malformed", async () => {
			const harness = harnessWithCause({
				seedEvents: [
					makeEvent({ id: "event-A", startDate: "2020-01-01" }),
					makeEvent({ id: "cause-1", startDate: "2026-9-1" }),
				],
			});

			await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					causeId: "cause-1",
				}),
			);

			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(1);
		});

		it("rejects a self-cause (causeId equal to the event's own id)", async () => {
			const harness = harnessWithCause();

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						causeId: "event-A",
					}),
				),
			).rejects.toThrow(ConflictError);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
		});

		it("does not re-trigger the cycle or temporal check, and does not alter the existing link, when startDate changes but causeId is omitted", async () => {
			const harness = harnessWithCause({
				seedCausalEdges: [{ causeId: "cause-1", effectId: "event-A" }],
			});

			await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					startDate: "2027-01-01",
				}),
			);

			expect(
				harness.causalChainRepository.findReachableEdgesFromCalls,
			).toHaveLength(0);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
			expect(harness.causalChainRepository.deleteCauseEdgesCalls).toHaveLength(
				0,
			);
			expect(harness.causalChainRepository.all()).toEqual([
				{ causeId: "cause-1", effectId: "event-A" },
			]);
		});
	});

	describe("causeId tri-state", () => {
		it("performs no causal-chain read or write when causeId is absent, leaving the existing link untouched", async () => {
			const harness = createHarness({
				seedCausalEdges: [{ causeId: "cause-1", effectId: "event-A" }],
			});

			await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					description: "Updated",
				}),
			);

			expect(
				harness.causalChainRepository.findReachableEdgesFromCalls,
			).toHaveLength(0);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
			expect(harness.causalChainRepository.deleteCauseEdgesCalls).toHaveLength(
				0,
			);
			expect(harness.causalChainRepository.all()).toEqual([
				{ causeId: "cause-1", effectId: "event-A" },
			]);
		});

		it("clears an existing causal link with no replacement on an explicit null", async () => {
			const harness = createHarness({
				seedCausalEdges: [{ causeId: "cause-1", effectId: "event-A" }],
			});

			await harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1", causeId: null }),
			);

			expect(harness.causalChainRepository.deleteCauseEdgesCalls).toEqual([
				"event-A",
			]);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
			expect(harness.causalChainRepository.all()).toEqual([]);
		});

		it("clears an existing causal link identically on an empty string", async () => {
			const harness = createHarness({
				seedCausalEdges: [{ causeId: "cause-1", effectId: "event-A" }],
			});

			await harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1", causeId: "" }),
			);

			expect(harness.causalChainRepository.deleteCauseEdgesCalls).toEqual([
				"event-A",
			]);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
			expect(harness.causalChainRepository.all()).toEqual([]);
		});

		it("replaces an existing causal link with a new one, keyed on the fetched cause entity's own id", async () => {
			const harness = createHarness({
				seedEvents: [
					makeEvent({ id: "event-A", startDate: "2026-01-01" }),
					makeEvent({ id: "cause-2", startDate: "2025-01-01" }),
				],
				seedWorkflows: [makeWorkflow("event-A"), makeWorkflow("cause-2")],
				seedCausalEdges: [{ causeId: "cause-1", effectId: "event-A" }],
			});
			const canonicalCause = makeEvent({
				id: "cause-2-canonical",
				startDate: "2025-01-01",
			});
			const realFindById = harness.hazardousEventRepository.findById.bind(
				harness.hazardousEventRepository,
			);
			harness.hazardousEventRepository.findById = async (id, tenantId) =>
				id === "cause-2" ? canonicalCause : realFindById(id, tenantId);

			await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					causeId: "cause-2",
				}),
			);

			expect(harness.causalChainRepository.deleteCauseEdgesCalls).toEqual([
				"event-A",
			]);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(1);
			expect(harness.causalChainRepository.saveEdgeCalls[0].edge).toEqual({
				causeId: "cause-2-canonical",
				effectId: "event-A",
			});
			expect(harness.causalChainRepository.all()).toEqual([
				{ causeId: "cause-2-canonical", effectId: "event-A" },
			]);
		});

		it("propagates a generic Error from deleteCauseEdges, after the HazardousEvent save already happened", async () => {
			const harness = createHarness();
			harness.causalChainRepository.deleteCauseEdges = async () => {
				throw new Error("boom-delete-cause-edges");
			};

			await expect(
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1", causeId: null }),
				),
			).rejects.toThrow("boom-delete-cause-edges");
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(1);
		});

		it("propagates a generic Error from saveEdge, leaving the prior edge already deleted", async () => {
			const harness = createHarness({
				seedEvents: [
					makeEvent({ id: "event-A", startDate: "2026-01-01" }),
					makeEvent({ id: "cause-1", startDate: "2025-01-01" }),
				],
				seedWorkflows: [makeWorkflow("event-A"), makeWorkflow("cause-1")],
			});
			harness.causalChainRepository.saveEdge = async () => {
				throw new Error("boom-save-edge");
			};

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						causeId: "cause-1",
					}),
				),
			).rejects.toThrow("boom-save-edge");
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(1);
			expect(harness.causalChainRepository.deleteCauseEdgesCalls).toEqual([
				"event-A",
			]);
		});

		it("throws ValidationError when causeId is present but not a string", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				causeId: 12345,
			} as unknown as UpdateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(0);
		});
	});

	describe("a bundled spatial reading", () => {
		it("delegates to the collaborator with tenantId/hazardousEventId from the command, overriding any value planted in spatialObservation", async () => {
			const harness = createHarness();
			const observationTime = new Date("2026-03-01T00:00:00.000Z");
			const command = {
				...makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					spatialObservation: {
						observationTime,
						geometries: [{ type: "Point" }],
						divisionIds: ["division-1"],
						note: "a note",
						confirmReplace: true,
					},
				}),
				spatialObservation: {
					tenantId: "attacker-tenant",
					hazardousEventId: "attacker-event",
					observationTime,
					geometries: [{ type: "Point" }],
					divisionIds: ["division-1"],
					note: "a note",
					confirmReplace: true,
				},
			} as unknown as UpdateHazardousEventCommand;

			await harness.useCase.execute(command);

			expect(harness.recordSpatialObservationUseCase.executeCalls).toHaveLength(
				1,
			);
			const [call] = harness.recordSpatialObservationUseCase.executeCalls;
			expect(call.tenantId).toBe("tenant-1");
			expect(call.hazardousEventId).toBe("event-A");
			expect(call.observationTime).toBe(observationTime);
			expect(call.geometries).toEqual([{ type: "Point" }]);
			expect(call.divisionIds).toEqual(["division-1"]);
			expect(call.note).toBe("a note");
			expect(call.confirmReplace).toBe(true);
		});

		it("makes no call to the collaborator when spatialObservation is absent", async () => {
			const harness = createHarness();

			await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					description: "Updated",
				}),
			);

			expect(harness.recordSpatialObservationUseCase.executeCalls).toHaveLength(
				0,
			);
		});

		it("propagates a ConflictError from the delegated call, after the HazardousEvent's own field and causal-link changes have already been persisted", async () => {
			const harness = createHarness({
				seedEvents: [
					makeEvent({ id: "event-A", startDate: "2026-01-01" }),
					makeEvent({ id: "cause-1", startDate: "2025-01-01" }),
				],
				seedWorkflows: [makeWorkflow("event-A"), makeWorkflow("cause-1")],
			});
			harness.recordSpatialObservationUseCase.executeBehavior =
				new ConflictError("duplicate observationTime", {});

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						causeId: "cause-1",
						spatialObservation: { geometries: [], divisionIds: [] },
					}),
				),
			).rejects.toThrow(ConflictError);
			expect(harness.hazardousEventRepository.saveCalls).toHaveLength(1);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(1);
			expect(harness.callLog).toEqual([
				"hazardousEvent.save",
				"spatialObservation.execute",
			]);
		});
	});

	describe("concurrent callers racing to set each other's causeId", () => {
		function seedRacingEvents(): HarnessOptions {
			return {
				seedEvents: [
					makeEvent({ id: "event-A", startDate: "2026-01-01" }),
					makeEvent({ id: "event-B", startDate: "2026-01-01" }),
				],
				seedWorkflows: [makeWorkflow("event-A"), makeWorkflow("event-B")],
			};
		}

		it("lets each call's cycle check evaluate correctly against its own stale snapshot, jointly writing a cycle", async () => {
			const harness = createHarness(seedRacingEvents());
			harness.causalChainRepository.concurrentBarrierSize = 2;

			const results = await Promise.allSettled([
				harness.useCase.execute(
					makeCommand({
						id: "event-A",
						tenantId: "tenant-1",
						causeId: "event-B",
					}),
				),
				harness.useCase.execute(
					makeCommand({
						id: "event-B",
						tenantId: "tenant-1",
						causeId: "event-A",
					}),
				),
			]);

			expect(results[0].status).toBe("fulfilled");
			expect(results[1].status).toBe("fulfilled");
			const finalEdges = harness.causalChainRepository.all();
			expect(finalEdges).toContainEqual({
				causeId: "event-B",
				effectId: "event-A",
			});
			expect(finalEdges).toContainEqual({
				causeId: "event-A",
				effectId: "event-B",
			});
		});

		it("control: run the same two updates sequentially, and the second rejects with ConflictError", async () => {
			const harness = createHarness(seedRacingEvents());

			await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					causeId: "event-B",
				}),
			);

			await expect(
				harness.useCase.execute(
					makeCommand({
						id: "event-B",
						tenantId: "tenant-1",
						causeId: "event-A",
					}),
				),
			).rejects.toThrow(ConflictError);
		});
	});

	it("returns a HazardousEventDto reflecting the merged, persisted state and the existing, unmodified workflowStatus", async () => {
		const harness = createHarness({
			seedWorkflows: [
				WorkflowInstance.create({
					id: "workflow-event-A",
					entityId: "event-A",
					entityType: "HE",
					status: "SUBMITTED",
					submittedByUserId: "user-1",
					submittedAt: new Date("2026-01-02T00:00:00.000Z"),
					validatedByUserId: null,
					validatedAt: null,
					approvedByUserId: null,
					approvedAt: null,
					publishedByUserId: null,
					publishedAt: null,
					createdAt: new Date("2026-01-01T00:00:00.000Z"),
					updatedAt: new Date("2026-01-01T00:00:00.000Z"),
				}),
			],
		});

		const dto = await harness.useCase.execute(
			makeCommand({
				id: "event-A",
				tenantId: "tenant-1",
				description: "Updated",
			}),
		);

		expect(dto.description).toBe("Updated");
		expect(dto.workflowStatus).toBe("SUBMITTED");
	});

	it("reads the WorkflowInstance by entityType HE", async () => {
		const harness = createHarness();

		await harness.useCase.execute(
			makeCommand({ id: "event-A", tenantId: "tenant-1" }),
		);

		expect(harness.workflowRepository.findByEntityCalls).toEqual([
			{ entityId: "event-A", entityType: "HE" },
		]);
	});

	it("logs hazardous_event.updated exactly once on success, with the exact expected payload", async () => {
		const harness = createHarness();

		await harness.useCase.execute(
			makeCommand({
				id: "event-A",
				tenantId: "tenant-1",
				description: "Updated",
			}),
		);

		expect(harness.logger.info).toHaveBeenCalledTimes(1);
		expect(harness.logger.info).toHaveBeenCalledWith({
			msg: "hazardous_event.updated",
			hazardousEventId: "event-A",
			tenantId: "tenant-1",
			causeAction: "unchanged",
			spatialObservationIncluded: false,
		});
	});

	it("logs spatialObservationIncluded: true when a spatialObservation is bundled", async () => {
		const harness = createHarness();

		await harness.useCase.execute(
			makeCommand({
				id: "event-A",
				tenantId: "tenant-1",
				spatialObservation: { geometries: [], divisionIds: [] },
			}),
		);

		expect(harness.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ spatialObservationIncluded: true }),
		);
	});
});
