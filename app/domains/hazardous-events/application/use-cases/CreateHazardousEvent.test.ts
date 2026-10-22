import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "../../domain/HazardousEvent";
import type { CausalEdge } from "../../domain/CausalChain";
import type { Tx } from "~/db.server";
import { ConflictError, NotFoundError, ValidationError } from "~/shared/errors";
import type { ILogger } from "~/shared/logging/ILogger";
import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";
import { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import { InitializeWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance";
import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ICausalChainRepository } from "../ports/ICausalChainRepository";
import type { IHazardTaxonomyRepository } from "../ports/IHazardTaxonomyRepository";
import {
	CreateHazardousEventUseCase,
	type CreateHazardousEventCommand,
} from "./CreateHazardousEvent";

/** No real transaction semantics — just invokes fn with a placeholder tx, matching this
 * codebase's own inline-fake convention for every other port these use cases fake. */
const fakeTx = {} as Tx;

class FakeTransactionRunner implements ITransactionRunner {
	runCalls = 0;

	constructor(private readonly callLog: string[] = []) {}

	async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
		this.runCalls += 1;
		const result = await fn(fakeTx);
		// A genuine tick between fn resolving and run() itself resolving -- lets a test tell
		// "logged after run() resolves" apart from "logged as fn's own last line" (the two
		// produce an identical callLog order without this marker, since there's otherwise no
		// gap between them).
		await Promise.resolve();
		this.callLog.push("transactionRunner.run.resolving");
		return result;
	}
}

class FakeLogger implements ILogger {
	info = vi.fn(() => {
		this.callLog?.push("logger.info");
	});
	warn = vi.fn();
	error = vi.fn();
	debug = vi.fn();

	constructor(private readonly callLog?: string[]) {}
}

/** Fake conformance matches ICausalChainRepository.test.ts's own fake but adds call-arg capture + configurable behavior, needed to exercise CreateHazardousEventUseCase's branches. */
class FakeCausalChainRepository implements ICausalChainRepository {
	readonly findReachableEdgesFromCalls: string[] = [];
	readonly saveEdgeCalls: {
		edge: CausalEdge;
		causalityExplanation: string | null;
		tx?: Tx;
	}[] = [];
	/** Needed to construct a contrived cycle regardless of the internally-generated id. */
	findReachableEdgesFromBehavior:
		| readonly CausalEdge[]
		| Error
		| ((nodeId: string) => readonly CausalEdge[]) = [];
	saveEdgeBehavior: "succeed" | Error = "succeed";

	constructor(private readonly callLog: string[] = []) {}

	async findReachableEdgesFrom(nodeId: string): Promise<readonly CausalEdge[]> {
		this.findReachableEdgesFromCalls.push(nodeId);
		if (this.findReachableEdgesFromBehavior instanceof Error) {
			throw this.findReachableEdgesFromBehavior;
		}
		if (typeof this.findReachableEdgesFromBehavior === "function") {
			return this.findReachableEdgesFromBehavior(nodeId);
		}
		return this.findReachableEdgesFromBehavior;
	}

	async saveEdge(
		edge: CausalEdge,
		causalityExplanation: string | null,
		tx?: Tx,
	): Promise<void> {
		this.saveEdgeCalls.push({ edge, causalityExplanation, tx });
		this.callLog.push("causalChain.saveEdge");
		if (this.saveEdgeBehavior instanceof Error) {
			throw this.saveEdgeBehavior;
		}
	}

	readonly replaceCauseEdgeCalls: string[] = [];

	async replaceCauseEdge(effectId: string): Promise<void> {
		this.replaceCauseEdgeCalls.push(effectId);
	}

	async countEdgesTouching(): Promise<number> {
		throw new Error("not used by CreateHazardousEventUseCase's own tests");
	}
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

/** Rebuilds a full HazardousEventProps snapshot from an entity's own getters -- needed to construct an "enriched on write" clone without bypassing HazardousEvent.create()'s validation. */
function snapshotProps(entity: HazardousEvent): HazardousEventProps {
	return {
		id: entity.id,
		tenantId: entity.tenantId,
		specificHazardId: entity.specificHazardId,
		startDate: entity.startDate,
		endDate: entity.endDate,
		nationalSpecification: entity.nationalSpecification,
		description: entity.description,
		chainsExplanation: entity.chainsExplanation,
		magnitude: entity.magnitude,
		recordOriginator: entity.recordOriginator,
		dataSource: entity.dataSource,
		hazardousEventStatus: entity.hazardousEventStatus,
		specificHazardLocalName: entity.specificHazardLocalName,
		specificHazardNationalName: entity.specificHazardNationalName,
		apiImportId: entity.apiImportId,
		createdByUserId: entity.createdByUserId,
		updatedByUserId: entity.updatedByUserId,
		submittedByUserId: entity.submittedByUserId,
		submittedAt: entity.submittedAt,
		createdAt: entity.createdAt,
		updatedAt: entity.updatedAt,
		hazardDriverIds: entity.hazardDriverIds,
		attachments: entity.attachments,
		fieldValues: entity.fieldValues,
		customFieldValues: entity.customFieldValues,
	};
}

/** insert() returns a distinct "enriched on write" clone -- proves callers use the resolved value. */
class FakeHazardousEventRepository implements IHazardousEventRepository {
	readonly insertCalls: HazardousEvent[] = [];
	readonly insertTxCalls: (Tx | undefined)[] = [];
	readonly findByIdCalls: { id: string; tenantId: string }[] = [];
	insertBehavior: "succeed" | Error = "succeed";
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
		throw new Error("not used by CreateHazardousEventUseCase's own tests");
	}

	async delete(): Promise<void> {
		throw new Error("not used by CreateHazardousEventUseCase's own tests");
	}

	async countReferencingDisasterEvents(): Promise<number> {
		throw new Error("not used by CreateHazardousEventUseCase's own tests");
	}

	async findByIdForUpdate(): Promise<HazardousEvent> {
		throw new Error("not used by CreateHazardousEventUseCase's own tests");
	}

	async findCurrentSpatialObservation(): Promise<never> {
		throw new Error("not used by CreateHazardousEventUseCase's own tests");
	}

	async findSpatialObservationByTime(): Promise<never> {
		throw new Error("not used by CreateHazardousEventUseCase's own tests");
	}

	async saveSpatialObservation(): Promise<never> {
		throw new Error("not used by CreateHazardousEventUseCase's own tests");
	}

	async insert(entity: HazardousEvent, tx?: Tx): Promise<HazardousEvent> {
		this.insertCalls.push(entity);
		this.insertTxCalls.push(tx);
		if (this.insertBehavior instanceof Error) {
			throw this.insertBehavior;
		}
		const saved = HazardousEvent.create(
			{
				...snapshotProps(entity),
				dataSource: `${entity.dataSource} (saved)`,
			},
			new Set(entity.hazardDriverIds),
			new Set(
				entity.customFieldValues.map(
					(cfv) => cfv.hazardTypeCustomFieldDefinitionId,
				),
			),
		);
		this.store.set(this.key(saved.id, saved.tenantId), saved);
		this.callLog.push("hazardousEvent.insert");
		return saved;
	}

	async update(): Promise<never> {
		throw new Error(
			"CreateHazardousEventUseCase never calls update() — it only ever inserts",
		);
	}
}

class FakeWorkflowRepository implements IWorkflowRepository {
	readonly insertCalls: WorkflowInstance[] = [];
	readonly insertTxCalls: (Tx | undefined)[] = [];
	insertBehavior: "succeed" | "succeed-enriched" | Error = "succeed";

	constructor(private readonly callLog: string[] = []) {}

	async findByEntity(): Promise<WorkflowInstance | null> {
		return null;
	}

	async findByEntityIds(): Promise<WorkflowInstance[]> {
		return [];
	}

	async deleteByEntity(): Promise<void> {
		throw new Error("not used by CreateHazardousEventUseCase's own tests");
	}

	async update(): Promise<never> {
		throw new Error(
			"CreateHazardousEventUseCase never calls update() — it only ever inserts",
		);
	}

	async insert(instance: WorkflowInstance, tx?: Tx): Promise<WorkflowInstance> {
		this.insertCalls.push(instance);
		this.insertTxCalls.push(tx);
		this.callLog.push("workflow.insert");
		if (this.insertBehavior instanceof Error) {
			throw this.insertBehavior;
		}
		if (this.insertBehavior === "succeed-enriched") {
			// Contrived, test-only enrichment -- proves toHazardousEventDto uses insert()'s resolved WorkflowInstance, not the pre-insert one (mirrors FakeHazardousEventRepository's own dataSource-suffix enrichment).
			return WorkflowInstance.create({
				id: instance.id,
				entityId: instance.entityId,
				entityType: instance.entityType,
				status: "SUBMITTED",
				submittedByUserId: "enrichment-marker",
				submittedAt: instance.createdAt,
				validatedByUserId: null,
				validatedAt: null,
				approvedByUserId: null,
				approvedAt: null,
				publishedByUserId: null,
				publishedAt: null,
				createdAt: instance.createdAt,
				updatedAt: instance.updatedAt,
			});
		}
		return instance;
	}
}

const baseCommand: CreateHazardousEventCommand = {
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
	hazardousEventStatus: null,
	specificHazardLocalName: null,
	specificHazardNationalName: null,
	apiImportId: null,
	actingUserId: "user-1",
	hazardDriverIds: [],
	attachments: [],
	fieldValues: [],
	customFieldValues: [],
};

function makeCommand(
	overrides: Partial<CreateHazardousEventCommand> = {},
): CreateHazardousEventCommand {
	return { ...baseCommand, ...overrides };
}

const causeHazardousEventProps: HazardousEventProps = {
	id: "cause-1",
	tenantId: "tenant-1",
	specificHazardId: "hazard-cause",
	startDate: "2025-12-01",
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
	createdAt: new Date("2025-12-01T00:00:00.000Z"),
	updatedAt: null,
	hazardDriverIds: [],
	attachments: [],
	fieldValues: [],
	customFieldValues: [],
};

function makeCauseEvent(
	overrides: Partial<HazardousEventProps> = {},
): HazardousEvent {
	return HazardousEvent.create(
		{ ...causeHazardousEventProps, ...overrides },
		new Set(),
		new Set(),
	);
}

interface HarnessOptions {
	seedCauseEvents?: readonly HazardousEvent[];
	validHazardDriverIds?: ReadonlySet<string>;
	validCustomFieldDefinitionIds?: ReadonlySet<string>;
}

function createHarness(options: HarnessOptions = {}) {
	const callLog: string[] = [];
	const logger = new FakeLogger(callLog);
	const taxonomyRepository = new FakeHazardTaxonomyRepository(
		options.validHazardDriverIds ?? new Set(),
		options.validCustomFieldDefinitionIds ?? new Set(),
	);
	const hazardousEventRepository = new FakeHazardousEventRepository(
		options.seedCauseEvents ?? [],
		callLog,
	);
	const workflowRepository = new FakeWorkflowRepository(callLog);
	const causalChainRepository = new FakeCausalChainRepository(callLog);
	const transactionRunner = new FakeTransactionRunner(callLog);
	const useCase = new CreateHazardousEventUseCase(
		logger,
		taxonomyRepository,
		hazardousEventRepository,
		new InitializeWorkflowInstanceUseCase(workflowRepository),
		causalChainRepository,
		transactionRunner,
	);
	return {
		callLog,
		logger,
		taxonomyRepository,
		hazardousEventRepository,
		workflowRepository,
		causalChainRepository,
		transactionRunner,
		useCase,
	};
}

describe("CreateHazardousEventUseCase", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("happy path with no causeId", () => {
		it("persists a HazardousEvent whose every scalar field matches the command, and makes no causal-chain call", async () => {
			const harness = createHarness();
			const command = makeCommand();

			await harness.useCase.execute(command);

			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(1);
			const savedEntity = harness.hazardousEventRepository.insertCalls[0];
			expect(savedEntity.tenantId).toBe(command.tenantId);
			expect(savedEntity.specificHazardId).toBe(command.specificHazardId);
			expect(savedEntity.startDate).toBe(command.startDate);
			expect(savedEntity.endDate).toBe(command.endDate);
			expect(savedEntity.nationalSpecification).toBe(
				command.nationalSpecification,
			);
			expect(savedEntity.description).toBe(command.description);
			expect(savedEntity.chainsExplanation).toBe(command.chainsExplanation);
			expect(savedEntity.magnitude).toBe(command.magnitude);
			expect(savedEntity.recordOriginator).toBe(command.recordOriginator);
			expect(savedEntity.dataSource).toBe(command.dataSource);
			expect(savedEntity.hazardousEventStatus).toBe(
				command.hazardousEventStatus,
			);
			expect(savedEntity.specificHazardLocalName).toBe(
				command.specificHazardLocalName,
			);
			expect(savedEntity.specificHazardNationalName).toBe(
				command.specificHazardNationalName,
			);
			expect(savedEntity.apiImportId).toBe(command.apiImportId);
			expect(
				harness.causalChainRepository.findReachableEdgesFromCalls,
			).toHaveLength(0);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
		});

		it("computes valid id sets via IHazardTaxonomyRepository scoped to command.tenantId, and persists only ids present in those sets", async () => {
			const harness = createHarness({
				validHazardDriverIds: new Set(["driver-1"]),
				validCustomFieldDefinitionIds: new Set(["custom-1"]),
			});
			const command = makeCommand({
				hazardDriverIds: ["driver-1"],
				customFieldValues: [
					{ hazardTypeCustomFieldDefinitionId: "custom-1", value: "v1" },
				],
			});

			await harness.useCase.execute(command);

			expect(harness.taxonomyRepository.findValidHazardDriverIdsCalls).toEqual([
				{ ids: ["driver-1"], tenantId: "tenant-1" },
			]);
			expect(
				harness.taxonomyRepository.findValidCustomFieldDefinitionIdsCalls,
			).toEqual([{ ids: ["custom-1"], tenantId: "tenant-1" }]);
			const savedEntity = harness.hazardousEventRepository.insertCalls[0];
			expect(savedEntity.hazardDriverIds).toEqual(["driver-1"]);
			expect(savedEntity.customFieldValues).toEqual(command.customFieldValues);
		});

		it("survives a non-array hazardDriverIds without a raw TypeError, surfacing HazardousEvent.create()'s own ValidationError, and queries the taxonomy repository with an empty id list", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				hazardDriverIds: "not-an-array",
			} as unknown as CreateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(harness.taxonomyRepository.findValidHazardDriverIdsCalls).toEqual([
				{ ids: [], tenantId: "tenant-1" },
			]);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("passes only well-typed string ids to the taxonomy repository query when hazardDriverIds contains a non-string element (the filter's own consumer, independent of HazardousEvent.create()'s later re-validation of the raw array)", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				hazardDriverIds: ["driver-1", 42, "driver-2"],
			} as unknown as CreateHazardousEventCommand;

			// HazardousEvent.create() still rejects the raw (unsanitized) array on its own membership/shape checks -- this test is about what the taxonomy query received, which happens strictly before that.
			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(harness.taxonomyRepository.findValidHazardDriverIdsCalls).toEqual([
				{ ids: ["driver-1", "driver-2"], tenantId: "tenant-1" },
			]);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("survives a non-array customFieldValues without a raw TypeError, surfacing HazardousEvent.create()'s own ValidationError, and queries the taxonomy repository with an empty id list", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				customFieldValues: "not-an-array",
			} as unknown as CreateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(
				harness.taxonomyRepository.findValidCustomFieldDefinitionIdsCalls,
			).toEqual([{ ids: [], tenantId: "tenant-1" }]);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("survives a null element in customFieldValues without a raw TypeError, surfacing HazardousEvent.create()'s own ValidationError", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				customFieldValues: [null],
			} as unknown as CreateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("survives an undefined element in customFieldValues without a raw TypeError, surfacing HazardousEvent.create()'s own ValidationError", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				customFieldValues: [undefined],
			} as unknown as CreateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("survives a non-string hazardTypeCustomFieldDefinitionId without a raw TypeError, surfacing HazardousEvent.create()'s own ValidationError", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				customFieldValues: [
					{ hazardTypeCustomFieldDefinitionId: 123, value: "v" },
				],
			} as unknown as CreateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("throws ValidationError when causeId is present but not a string (e.g. deserialized JSON from an untyped caller)", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				causeId: 12345,
			} as unknown as CreateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				new ValidationError("causeId must be a string when present"),
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(harness.hazardousEventRepository.findByIdCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("throws ValidationError for a non-string tenantId (e.g. deserialized JSON from an untyped caller), with zero writes", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				tenantId: 12345,
			} as unknown as CreateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				new ValidationError("tenantId must not be empty"),
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(
				harness.taxonomyRepository.findValidHazardDriverIdsCalls,
			).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("throws ValidationError for a non-string actingUserId, with zero writes", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				actingUserId: 12345,
			} as unknown as CreateHazardousEventCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				new ValidationError("actingUserId must not be empty"),
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("throws ValidationError for an empty-string actingUserId, with zero writes", async () => {
			const harness = createHarness();
			const command = makeCommand({ actingUserId: "" });

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				new ValidationError("actingUserId must not be empty"),
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("generates id internally, sets createdByUserId from actingUserId, updatedAt null, and a single internally-computed createdAt", async () => {
			const harness = createHarness();
			const command = makeCommand();

			await harness.useCase.execute(command);

			const savedEntity = harness.hazardousEventRepository.insertCalls[0];
			expect(savedEntity.id).toEqual(expect.any(String));
			expect(savedEntity.id.length).toBeGreaterThan(0);
			expect(savedEntity.createdByUserId).toBe(command.actingUserId);
			expect(savedEntity.updatedAt).toBeNull();
			expect(savedEntity.createdAt.toISOString()).toBe(
				"2026-02-01T10:00:00.000Z",
			);
		});
	});

	describe("transaction wrapping (design.md Decision 1 — ITransactionRunner)", () => {
		it("calls transactionRunner.run exactly once, passing the same tx to insert, workflow insert, and saveEdge", async () => {
			const harness = createHarness({ seedCauseEvents: [makeCauseEvent()] });
			const command = makeCommand({ causeId: "cause-1" });

			await harness.useCase.execute(command);

			expect(harness.transactionRunner.runCalls).toBe(1);
			expect(harness.hazardousEventRepository.insertTxCalls).toEqual([fakeTx]);
			expect(harness.workflowRepository.insertTxCalls).toEqual([fakeTx]);
			expect(harness.causalChainRepository.saveEdgeCalls[0].tx).toBe(fakeTx);
		});

		it("emits the structured log only after run() resolves, not as the last operation inside the transaction callback", async () => {
			const harness = createHarness();
			const command = makeCommand();

			await harness.useCase.execute(command);

			expect(harness.callLog).toEqual([
				"hazardousEvent.insert",
				"workflow.insert",
				"transactionRunner.run.resolving",
				"logger.info",
			]);
		});
	});

	it("propagates the ValidationError HazardousEvent.create() throws, without saving", async () => {
		const harness = createHarness({ validHazardDriverIds: new Set() });
		const command = makeCommand({ hazardDriverIds: ["driver-not-in-set"] });

		await expect(harness.useCase.execute(command)).rejects.toThrow(
			ValidationError,
		);
		expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
		expect(harness.logger.info).not.toHaveBeenCalled();
	});

	it("treats an empty-string causeId as absent, same as omitted", async () => {
		const harness = createHarness();
		const command = makeCommand({ causeId: "" });

		await harness.useCase.execute(command);

		expect(harness.hazardousEventRepository.findByIdCalls).toHaveLength(0);
		expect(
			harness.causalChainRepository.findReachableEdgesFromCalls,
		).toHaveLength(0);
		expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
		expect(harness.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ hasCause: false }),
		);
	});

	it("propagates a generic Error from the HazardousEvent save, with no later write", async () => {
		const harness = createHarness();
		harness.hazardousEventRepository.insertBehavior = new Error(
			"boom-hazardous-event-save",
		);
		const command = makeCommand();

		await expect(harness.useCase.execute(command)).rejects.toThrow(
			"boom-hazardous-event-save",
		);
		expect(harness.workflowRepository.insertCalls).toHaveLength(0);
		expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
		expect(harness.logger.info).not.toHaveBeenCalled();
	});

	describe("with a valid causeId", () => {
		function harnessWithCause(): ReturnType<typeof createHarness> {
			return createHarness({ seedCauseEvents: [makeCauseEvent()] });
		}

		it("persists the event, then the workflow instance, then the edge, in that order", async () => {
			const harness = harnessWithCause();
			const command = makeCommand({
				causeId: "cause-1",
				causalityExplanation: "upstream flooding",
			});

			await harness.useCase.execute(command);

			expect(harness.callLog).toEqual([
				"hazardousEvent.insert",
				"workflow.insert",
				"causalChain.saveEdge",
				"transactionRunner.run.resolving",
				"logger.info",
			]);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(1);
			const [edgeCall] = harness.causalChainRepository.saveEdgeCalls;
			const savedEntityId = harness.hazardousEventRepository.insertCalls[0].id;
			expect(edgeCall.edge).toEqual({
				causeId: "cause-1",
				effectId: savedEntityId,
			});
			expect(edgeCall.causalityExplanation).toBe("upstream flooding");
		});

		it("uses the fetched cause entity's own id for the saved edge, not the raw causeId input", async () => {
			const harness = harnessWithCause();
			const canonicalCause = makeCauseEvent({ id: "cause-1-canonical" });
			harness.hazardousEventRepository.findById = async () => canonicalCause;
			const command = makeCommand({ causeId: "cause-1" });

			await harness.useCase.execute(command);

			const [edgeCall] = harness.causalChainRepository.saveEdgeCalls;
			expect(edgeCall.edge.causeId).toBe("cause-1-canonical");
		});

		it("defaults a null causalityExplanation when omitted from the command", async () => {
			const harness = harnessWithCause();
			const command = makeCommand({ causeId: "cause-1" });

			await harness.useCase.execute(command);

			expect(
				harness.causalChainRepository.saveEdgeCalls[0].causalityExplanation,
			).toBeNull();
		});

		it("calls findReachableEdgesFrom with the newly-generated id, not causeId, and proceeds with an empty (real-adapter-shaped) edge set", async () => {
			const harness = harnessWithCause();
			const command = makeCommand({ causeId: "cause-1" });
			harness.causalChainRepository.findReachableEdgesFromBehavior = [];

			await harness.useCase.execute(command);

			const savedEntityId = harness.hazardousEventRepository.insertCalls[0].id;
			expect(harness.causalChainRepository.findReachableEdgesFromCalls).toEqual(
				[savedEntityId],
			);
			expect(savedEntityId).not.toBe("cause-1");
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(1);
		});

		it("propagates NotFoundError from findById when the cause does not exist, with zero writes", async () => {
			const harness = createHarness();
			const command = makeCommand({ causeId: "missing-cause" });

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				NotFoundError,
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(harness.workflowRepository.insertCalls).toHaveLength(0);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("rejects a causeId belonging to a different tenant (same-tenant-only, design.md Decision 4), with zero writes", async () => {
			const harness = createHarness({
				seedCauseEvents: [makeCauseEvent({ tenantId: "tenant-2" })],
			});
			const command = makeCommand({
				tenantId: "tenant-1",
				causeId: "cause-1",
			});

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				NotFoundError,
			);
			expect(harness.hazardousEventRepository.findByIdCalls).toContainEqual({
				id: "cause-1",
				tenantId: "tenant-1",
			});
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(harness.workflowRepository.insertCalls).toHaveLength(0);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("propagates a ConflictError from a contrived cycle and blocks every write", async () => {
			const harness = harnessWithCause();
			const command = makeCommand({ causeId: "cause-1" });
			// Contrived per design.md Decision 1's own test implication: a real adapter can never produce this for a brand-new id, but the branch must still be exercisable.
			harness.causalChainRepository.findReachableEdgesFromBehavior = (
				nodeId,
			) => [{ causeId: nodeId, effectId: "cause-1" }];

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ConflictError,
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(harness.workflowRepository.insertCalls).toHaveLength(0);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("propagates a generic Error from findReachableEdgesFrom rejecting, blocking every write (fail-closed, design.md Decision 2)", async () => {
			const harness = harnessWithCause();
			harness.causalChainRepository.findReachableEdgesFromBehavior = new Error(
				"boom-find-reachable",
			);
			const command = makeCommand({ causeId: "cause-1" });

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				"boom-find-reachable",
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(0);
			expect(harness.workflowRepository.insertCalls).toHaveLength(0);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		// The real adapter now rolls the HazardousEvent insert back too (DEF-026, Task 7.4's
		// PGlite test proves it) — a fake transactionRunner has no rollback semantics to assert
		// against, so this only checks the error propagates and the edge save never runs.
		it("propagates a generic Error from the workflow insert, blocking the edge save", async () => {
			const harness = harnessWithCause();
			harness.workflowRepository.insertBehavior = new Error(
				"boom-workflow-save",
			);
			const command = makeCommand({ causeId: "cause-1" });

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				"boom-workflow-save",
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(1);
			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("propagates a generic Error from the edge save", async () => {
			const harness = harnessWithCause();
			harness.causalChainRepository.saveEdgeBehavior = new Error(
				"boom-edge-save",
			);
			const command = makeCommand({ causeId: "cause-1" });

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				"boom-edge-save",
			);
			expect(harness.hazardousEventRepository.insertCalls).toHaveLength(1);
			expect(harness.workflowRepository.insertCalls).toHaveLength(1);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("supports two same-cause creates in one Promise.all, each producing its own distinct effectId/edge (no shared mutable state to race over)", async () => {
			const harness = harnessWithCause();
			const commandOne = makeCommand({
				causeId: "cause-1",
				specificHazardId: "hazard-A",
			});
			const commandTwo = makeCommand({
				causeId: "cause-1",
				specificHazardId: "hazard-B",
			});

			await Promise.all([
				harness.useCase.execute(commandOne),
				harness.useCase.execute(commandTwo),
			]);

			expect(harness.causalChainRepository.saveEdgeCalls).toHaveLength(2);
			const effectIds = harness.causalChainRepository.saveEdgeCalls.map(
				(call) => call.edge.effectId,
			);
			expect(new Set(effectIds).size).toBe(2);
			for (const call of harness.causalChainRepository.saveEdgeCalls) {
				expect(call.edge.causeId).toBe("cause-1");
			}
		});
	});

	it("initializes and persists a WorkflowInstance at DRAFT with every attribution field null", async () => {
		const harness = createHarness();
		const command = makeCommand();

		await harness.useCase.execute(command);

		expect(harness.workflowRepository.insertCalls).toHaveLength(1);
		const savedWorkflow = harness.workflowRepository.insertCalls[0];
		const savedEntityId = harness.hazardousEventRepository.insertCalls[0].id;
		expect(savedWorkflow.entityId).toBe(savedEntityId);
		expect(savedWorkflow.entityType).toBe("HE");
		expect(savedWorkflow.status).toBe("DRAFT");
		expect(savedWorkflow.submittedByUserId).toBeNull();
		expect(savedWorkflow.submittedAt).toBeNull();
		expect(savedWorkflow.validatedByUserId).toBeNull();
		expect(savedWorkflow.validatedAt).toBeNull();
		expect(savedWorkflow.approvedByUserId).toBeNull();
		expect(savedWorkflow.approvedAt).toBeNull();
		expect(savedWorkflow.publishedByUserId).toBeNull();
		expect(savedWorkflow.publishedAt).toBeNull();
		expect(savedWorkflow.createdAt.toISOString()).toBe(
			savedWorkflow.updatedAt.toISOString(),
		);
	});

	it("returns a DTO with workflowStatus DRAFT that reflects save()'s resolved values, not the pre-save instances", async () => {
		const harness = createHarness();
		const command = makeCommand();

		const dto = await harness.useCase.execute(command);

		const savedEntity = harness.hazardousEventRepository.insertCalls[0];
		expect(dto.workflowStatus).toBe("DRAFT");
		expect(dto.id).toBe(savedEntity.id);
		expect(dto.createdAt).toBe(savedEntity.createdAt.toISOString());
		expect(dto.dataSource).toBe(`${command.dataSource} (saved)`);
		expect(dto.dataSource).not.toBe(command.dataSource);
	});

	it("returns a DTO whose workflowStatus reflects workflowRepository.insert()'s resolved value, not the pre-insert DRAFT instance", async () => {
		const harness = createHarness();
		harness.workflowRepository.insertBehavior = "succeed-enriched";
		const command = makeCommand();

		const dto = await harness.useCase.execute(command);

		expect(dto.workflowStatus).toBe("SUBMITTED");
	});

	it("logs hazardous_event.created exactly once on success, with the exact expected payload", async () => {
		const harness = createHarness();
		const command = makeCommand();

		await harness.useCase.execute(command);

		const savedEntity = harness.hazardousEventRepository.insertCalls[0];
		expect(harness.logger.info).toHaveBeenCalledTimes(1);
		expect(harness.logger.info).toHaveBeenCalledWith({
			msg: "hazardous_event.created",
			hazardousEventId: savedEntity.id,
			tenantId: command.tenantId,
			hasCause: false,
		});
	});

	it("logs hasCause: true when a causeId is present", async () => {
		const harness = createHarness({ seedCauseEvents: [makeCauseEvent()] });
		const command = makeCommand({ causeId: "cause-1" });

		await harness.useCase.execute(command);

		expect(harness.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ hasCause: true }),
		);
	});
});
