// PGlite mock MUST be the very first import — see NoticesModule.test.ts's own note.
import "../../db/setup";
// reflect-metadata MUST be the second import — NestJS decorators require the
// Reflect polyfill to be in place before any decorated class is evaluated.
import "reflect-metadata";

import { randomUUID } from "crypto";
import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { describe, it, expect, afterEach } from "vitest";
import { NotFoundError } from "~/shared/errors";
import {
	seedCountryAccount,
	seedSpecificHazard,
} from "../../db/models/hazardousEventTestHelpers";

import { HAZARDOUS_EVENT_REPOSITORY } from "~/domains/hazardous-events/infrastructure/HazardousEventRepositoryToken";
import { CAUSAL_CHAIN_REPOSITORY } from "~/domains/hazardous-events/infrastructure/CausalChainRepositoryToken";
import { HAZARD_TAXONOMY_REPOSITORY } from "~/domains/hazardous-events/infrastructure/HazardTaxonomyRepositoryToken";
import { DIVISION_REPOSITORY } from "~/domains/hazardous-events/infrastructure/DivisionRepositoryToken";
import { HazardousEventsModule } from "~/domains/hazardous-events/infrastructure/HazardousEventsModule.server";
import { DrizzleHazardousEventRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server";
import { DrizzleCausalChainRepository } from "~/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server";
import { DrizzleHazardTaxonomyRepository } from "~/domains/hazardous-events/infrastructure/DrizzleHazardTaxonomyRepository.server";
import { DrizzleDivisionRepository } from "~/domains/hazardous-events/infrastructure/DrizzleDivisionRepository.server";
import { TRANSACTION_RUNNER } from "~/infrastructure/TransactionRunnerToken";
import { DrizzleTransactionRunner } from "~/infrastructure/DrizzleTransactionRunner.server";
import { WORKFLOW_REPOSITORY } from "~/domains/validation-workflow/infrastructure/WorkflowRepositoryToken";
import { InitializeWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance";
import { DeleteWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/DeleteWorkflowInstance";
import { GetWorkflowInstanceByEntityUseCase } from "~/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity";
import { ListWorkflowInstancesByEntityIdsUseCase } from "~/domains/validation-workflow/application/use-cases/ListWorkflowInstancesByEntityIds";
import { EVENT_CAUSALITY_REPOSITORY } from "~/domains/event-causality/infrastructure/EventCausalityRepositoryToken";
import { DrizzleEventCausalityRepository } from "~/domains/event-causality/infrastructure/DrizzleEventCausalityRepository.server";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { CoreModule } from "~/infrastructure/CoreModule.server";
import { DrizzleProvider } from "~/infrastructure/DrizzleProvider.server";
import { NoticesModule } from "~/domains/notices/infrastructure/NoticesModule.server";
import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { ListHazardousEventsUseCase } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import { RecordSpatialObservationUseCase } from "~/domains/hazardous-events/application/use-cases/RecordSpatialObservation";
import { CreateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/CreateHazardousEvent";
import { DeleteHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEvent";
import { UpdateHazardousEventUseCase } from "~/domains/hazardous-events/application/use-cases/UpdateHazardousEvent";

describe("hazardous-events repository tokens", () => {
	it("HAZARDOUS_EVENT_REPOSITORY is a symbol-based token", () => {
		expect(typeof HAZARDOUS_EVENT_REPOSITORY).toBe("symbol");
	});

	it("CAUSAL_CHAIN_REPOSITORY is a symbol-based token", () => {
		expect(typeof CAUSAL_CHAIN_REPOSITORY).toBe("symbol");
	});

	it("HAZARD_TAXONOMY_REPOSITORY is a symbol-based token", () => {
		expect(typeof HAZARD_TAXONOMY_REPOSITORY).toBe("symbol");
	});

	it("DIVISION_REPOSITORY is a symbol-based token", () => {
		expect(typeof DIVISION_REPOSITORY).toBe("symbol");
	});
});

describe("HazardousEventsModule", () => {
	const modulesToClose: TestingModule[] = [];
	let module: TestingModule;

	afterEach(async () => {
		await Promise.all(modulesToClose.map((m) => m.close()));
		modulesToClose.length = 0;
	});

	it("compiles without error", async () => {
		module = await Test.createTestingModule({
			imports: [HazardousEventsModule],
		}).compile();
		modulesToClose.push(module);

		expect(module).toBeDefined();
	});

	describe("repository/runner token resolution", () => {
		it("HAZARDOUS_EVENT_REPOSITORY resolves to an instance of DrizzleHazardousEventRepository, and to the same singleton on repeated gets", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			expect(module.get(HAZARDOUS_EVENT_REPOSITORY)).toBeInstanceOf(
				DrizzleHazardousEventRepository,
			);
			expect(module.get(HAZARDOUS_EVENT_REPOSITORY)).toBe(
				module.get(HAZARDOUS_EVENT_REPOSITORY),
			);
		});

		it("CAUSAL_CHAIN_REPOSITORY resolves to an instance of DrizzleCausalChainRepository, and to the same singleton on repeated gets", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			expect(module.get(CAUSAL_CHAIN_REPOSITORY)).toBeInstanceOf(
				DrizzleCausalChainRepository,
			);
			expect(module.get(CAUSAL_CHAIN_REPOSITORY)).toBe(
				module.get(CAUSAL_CHAIN_REPOSITORY),
			);
		});

		it("HAZARD_TAXONOMY_REPOSITORY resolves to an instance of DrizzleHazardTaxonomyRepository, and to the same singleton on repeated gets", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			expect(module.get(HAZARD_TAXONOMY_REPOSITORY)).toBeInstanceOf(
				DrizzleHazardTaxonomyRepository,
			);
			expect(module.get(HAZARD_TAXONOMY_REPOSITORY)).toBe(
				module.get(HAZARD_TAXONOMY_REPOSITORY),
			);
		});

		it("DIVISION_REPOSITORY resolves to an instance of DrizzleDivisionRepository, and to the same singleton on repeated gets", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			expect(module.get(DIVISION_REPOSITORY)).toBeInstanceOf(
				DrizzleDivisionRepository,
			);
			expect(module.get(DIVISION_REPOSITORY)).toBe(
				module.get(DIVISION_REPOSITORY),
			);
		});

		it("TRANSACTION_RUNNER resolves to an instance of DrizzleTransactionRunner, and to the same singleton on repeated gets", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			expect(module.get(TRANSACTION_RUNNER)).toBeInstanceOf(
				DrizzleTransactionRunner,
			);
			expect(module.get(TRANSACTION_RUNNER)).toBe(
				module.get(TRANSACTION_RUNNER),
			);
		});
	});

	describe("cross-module imports", () => {
		it("InitializeWorkflowInstanceUseCase resolves to a defined instance inside the compiled module", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			expect(module.get(InitializeWorkflowInstanceUseCase)).toBeDefined();
		});

		it("DeleteWorkflowInstanceUseCase resolves to a defined instance inside the compiled module", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			expect(module.get(DeleteWorkflowInstanceUseCase)).toBeDefined();
		});

		it("GetWorkflowInstanceByEntityUseCase resolves to a defined instance inside the compiled module", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			expect(module.get(GetWorkflowInstanceByEntityUseCase)).toBeDefined();
		});

		it("ListWorkflowInstancesByEntityIdsUseCase resolves to a defined instance inside the compiled module", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			expect(module.get(ListWorkflowInstancesByEntityIdsUseCase)).toBeDefined();
		});

		it("EVENT_CAUSALITY_REPOSITORY resolves to an instance of DrizzleEventCausalityRepository inside the compiled module", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			expect(module.get(EVENT_CAUSALITY_REPOSITORY)).toBeInstanceOf(
				DrizzleEventCausalityRepository,
			);
		});
	});

	describe("six Phase 4 use cases", () => {
		it("GetHazardousEventByIdUseCase resolves with its two dependencies correctly positioned", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			const useCase = module.get(GetHazardousEventByIdUseCase);
			expect(useCase).toBeInstanceOf(GetHazardousEventByIdUseCase);

			// Cast to read private fields for identity assertion only.
			const fields = useCase as unknown as {
				logger: unknown;
				hazardousEventRepository: unknown;
				getWorkflowInstanceByEntityUseCase: unknown;
			};
			expect(fields.logger).toBe(getPinoLogger());
			expect(fields.hazardousEventRepository).toBe(
				module.get(HAZARDOUS_EVENT_REPOSITORY),
			);
			expect(fields.getWorkflowInstanceByEntityUseCase).toBe(
				module.get(GetWorkflowInstanceByEntityUseCase),
			);
		});

		it("ListHazardousEventsUseCase resolves with its two dependencies correctly positioned", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			const useCase = module.get(ListHazardousEventsUseCase);
			expect(useCase).toBeInstanceOf(ListHazardousEventsUseCase);

			// Cast to read private fields for identity assertion only.
			const fields = useCase as unknown as {
				logger: unknown;
				hazardousEventRepository: unknown;
				listWorkflowInstancesByEntityIdsUseCase: unknown;
			};
			expect(fields.logger).toBe(getPinoLogger());
			expect(fields.hazardousEventRepository).toBe(
				module.get(HAZARDOUS_EVENT_REPOSITORY),
			);
			expect(fields.listWorkflowInstancesByEntityIdsUseCase).toBe(
				module.get(ListWorkflowInstancesByEntityIdsUseCase),
			);
		});

		it("RecordSpatialObservationUseCase resolves with its two dependencies correctly positioned (no logger)", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			const useCase = module.get(RecordSpatialObservationUseCase);
			expect(useCase).toBeInstanceOf(RecordSpatialObservationUseCase);

			// Cast to read private fields for identity assertion only.
			const fields = useCase as unknown as {
				hazardousEventRepository: unknown;
				divisionRepository: unknown;
			};
			expect(fields.hazardousEventRepository).toBe(
				module.get(HAZARDOUS_EVENT_REPOSITORY),
			);
			expect(fields.divisionRepository).toBe(module.get(DIVISION_REPOSITORY));
		});

		it("CreateHazardousEventUseCase resolves with its six dependencies correctly positioned", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			const useCase = module.get(CreateHazardousEventUseCase);
			expect(useCase).toBeInstanceOf(CreateHazardousEventUseCase);

			// Cast to read private fields for identity assertion only.
			const fields = useCase as unknown as {
				logger: unknown;
				taxonomyRepository: unknown;
				hazardousEventRepository: unknown;
				initializeWorkflowInstanceUseCase: unknown;
				causalChainRepository: unknown;
				transactionRunner: unknown;
			};
			expect(fields.logger).toBe(getPinoLogger());
			expect(fields.taxonomyRepository).toBe(
				module.get(HAZARD_TAXONOMY_REPOSITORY),
			);
			expect(fields.hazardousEventRepository).toBe(
				module.get(HAZARDOUS_EVENT_REPOSITORY),
			);
			expect(fields.initializeWorkflowInstanceUseCase).toBe(
				module.get(InitializeWorkflowInstanceUseCase),
			);
			expect(fields.causalChainRepository).toBe(
				module.get(CAUSAL_CHAIN_REPOSITORY),
			);
			expect(fields.transactionRunner).toBe(module.get(TRANSACTION_RUNNER));
		});

		it("DeleteHazardousEventUseCase resolves with its five dependencies correctly positioned", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			const useCase = module.get(DeleteHazardousEventUseCase);
			expect(useCase).toBeInstanceOf(DeleteHazardousEventUseCase);

			// Cast to read private fields for identity assertion only.
			const fields = useCase as unknown as {
				logger: unknown;
				hazardousEventRepository: unknown;
				eventCausalityRepository: unknown;
				causalChainRepository: unknown;
				deleteWorkflowInstanceUseCase: unknown;
				transactionRunner: unknown;
			};
			expect(fields.logger).toBe(getPinoLogger());
			expect(fields.hazardousEventRepository).toBe(
				module.get(HAZARDOUS_EVENT_REPOSITORY),
			);
			expect(fields.eventCausalityRepository).toBe(
				module.get(EVENT_CAUSALITY_REPOSITORY),
			);
			expect(fields.causalChainRepository).toBe(
				module.get(CAUSAL_CHAIN_REPOSITORY),
			);
			expect(fields.deleteWorkflowInstanceUseCase).toBe(
				module.get(DeleteWorkflowInstanceUseCase),
			);
			expect(fields.transactionRunner).toBe(module.get(TRANSACTION_RUNNER));
		});

		it("UpdateHazardousEventUseCase resolves with its seven dependencies correctly positioned", async () => {
			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			const useCase = module.get(UpdateHazardousEventUseCase);
			expect(useCase).toBeInstanceOf(UpdateHazardousEventUseCase);

			// Cast to read private fields for identity assertion only.
			const fields = useCase as unknown as {
				logger: unknown;
				taxonomyRepository: unknown;
				hazardousEventRepository: unknown;
				getWorkflowInstanceByEntityUseCase: unknown;
				causalChainRepository: unknown;
				recordSpatialObservationUseCase: unknown;
				transactionRunner: unknown;
			};
			expect(fields.logger).toBe(getPinoLogger());
			expect(fields.taxonomyRepository).toBe(
				module.get(HAZARD_TAXONOMY_REPOSITORY),
			);
			expect(fields.hazardousEventRepository).toBe(
				module.get(HAZARDOUS_EVENT_REPOSITORY),
			);
			expect(fields.getWorkflowInstanceByEntityUseCase).toBe(
				module.get(GetWorkflowInstanceByEntityUseCase),
			);
			expect(fields.causalChainRepository).toBe(
				module.get(CAUSAL_CHAIN_REPOSITORY),
			);
			// Injected via its own provider token, not a repository token.
			expect(fields.recordSpatialObservationUseCase).toBe(
				module.get(RecordSpatialObservationUseCase),
			);
			expect(fields.transactionRunner).toBe(module.get(TRANSACTION_RUNNER));
		});
	});

	describe("hidden repository/runner tokens", () => {
		it("a second module importing HazardousEventsModule cannot resolve any of the five tokens via token injection", async () => {
			const hiddenTokens = [
				HAZARDOUS_EVENT_REPOSITORY,
				CAUSAL_CHAIN_REPOSITORY,
				HAZARD_TAXONOMY_REPOSITORY,
				DIVISION_REPOSITORY,
				TRANSACTION_RUNNER,
			];

			for (const token of hiddenTokens) {
				@Module({
					imports: [HazardousEventsModule],
					providers: [
						{
							provide: "CONSUMER",
							useFactory: (dep: unknown) => dep,
							inject: [token],
						},
					],
				})
				class ConsumerModule {}

				await expect(
					Test.createTestingModule({ imports: [ConsumerModule] }).compile(),
				).rejects.toThrow(/can't resolve dependencies/i);
			}
		});
	});

	describe("corrected cross-domain dependency shape", () => {
		it("no useFactory provider's inject array names WORKFLOW_REPOSITORY (design.md Decision 4)", () => {
			const providers = Reflect.getMetadata(
				MODULE_METADATA.PROVIDERS,
				HazardousEventsModule,
			) as { inject?: unknown[] }[];

			for (const provider of providers) {
				expect(provider.inject ?? []).not.toContain(WORKFLOW_REPOSITORY);
			}
		});
	});

	// Catches a swapped useFactory/inject slot that resolve-only assertions above cannot
	// (design.md Risks).
	describe("behavioral round-trip", () => {
		it("Create, read, list, update-with-spatial-observation, and delete all succeed in sequence against the correctly-wired module", async () => {
			const tenantId = (await seedCountryAccount()) as string;
			const specificHazardId = await seedSpecificHazard();
			const actingUserId = randomUUID();

			module = await Test.createTestingModule({
				imports: [HazardousEventsModule],
			}).compile();
			modulesToClose.push(module);

			const createUseCase = module.get(CreateHazardousEventUseCase);
			const getByIdUseCase = module.get(GetHazardousEventByIdUseCase);
			const listUseCase = module.get(ListHazardousEventsUseCase);
			const updateUseCase = module.get(UpdateHazardousEventUseCase);
			const deleteUseCase = module.get(DeleteHazardousEventUseCase);

			const created = await createUseCase.execute({
				tenantId,
				specificHazardId,
				startDate: "2026-01-01",
				endDate: "",
				nationalSpecification: "",
				description: "original description",
				chainsExplanation: "",
				magnitude: "",
				recordOriginator: "",
				dataSource: "",
				hazardousEventStatus: null,
				specificHazardLocalName: null,
				specificHazardNationalName: null,
				apiImportId: null,
				actingUserId,
				hazardDriverIds: [],
				attachments: [],
				fieldValues: [],
				customFieldValues: [],
			});
			expect(created.description).toBe("original description");

			const fetched = await getByIdUseCase.execute({
				id: created.id,
				tenantId,
			});
			expect(fetched.description).toBe("original description");
			expect(fetched.currentSpatialObservation).toBeNull();

			const list = await listUseCase.execute({
				tenantId,
				page: 1,
				pageSize: 10,
			});
			expect(list.map((item) => item.id)).toContain(created.id);

			const observationTime = new Date("2026-02-01T00:00:00.000Z");
			const updated = await updateUseCase.execute({
				id: created.id,
				tenantId,
				actingUserId,
				description: "updated description",
				spatialObservation: {
					observationTime,
					geometries: [],
					divisionIds: [],
				},
			});
			expect(updated.description).toBe("updated description");

			// Only step that would catch a DIVISION_REPOSITORY/TRANSACTION_RUNNER slot swap.
			const fetchedAfterUpdate = await getByIdUseCase.execute({
				id: created.id,
				tenantId,
			});
			expect(fetchedAfterUpdate.description).toBe("updated description");
			expect(fetchedAfterUpdate.currentSpatialObservation).not.toBeNull();
			expect(
				fetchedAfterUpdate.currentSpatialObservation?.observationTime,
			).toBe(observationTime.toISOString());

			await deleteUseCase.execute({ id: created.id, tenantId, actingUserId });

			await expect(
				getByIdUseCase.execute({ id: created.id, tenantId }),
			).rejects.toThrow(NotFoundError);
		});
	});

	describe("concurrent compilation", () => {
		it("two concurrent compile() calls each independently resolve all six use cases to distinct-per-container singletons", async () => {
			const [moduleA, moduleB] = await Promise.all([
				Test.createTestingModule({
					imports: [HazardousEventsModule],
				}).compile(),
				Test.createTestingModule({
					imports: [HazardousEventsModule],
				}).compile(),
			]);
			modulesToClose.push(moduleA, moduleB);

			const useCaseTokens = [
				CreateHazardousEventUseCase,
				UpdateHazardousEventUseCase,
				GetHazardousEventByIdUseCase,
				ListHazardousEventsUseCase,
				DeleteHazardousEventUseCase,
				RecordSpatialObservationUseCase,
			] as const;

			for (const token of useCaseTokens) {
				const fromA = moduleA.get(token);
				const fromB = moduleB.get(token);
				expect(fromA).toBeDefined();
				expect(fromB).toBeDefined();
				expect(fromA).not.toBe(fromB);
			}
		});
	});
});

describe("HazardousEventsModule — CoreModule resolution", () => {
	const modulesToClose: TestingModule[] = [];

	afterEach(async () => {
		await Promise.all(modulesToClose.map((m) => m.close()));
		modulesToClose.length = 0;
	});

	it("CoreModule still compiles after importing HazardousEventsModule", async () => {
		const module = await Test.createTestingModule({
			imports: [CoreModule],
		}).compile();
		modulesToClose.push(module);

		expect(module).toBeDefined();
	});

	it("each of the six Phase 4 use cases resolves to a defined instance from CoreModule context", async () => {
		const module = await Test.createTestingModule({
			imports: [CoreModule],
		}).compile();
		modulesToClose.push(module);

		expect(module.get(CreateHazardousEventUseCase)).toBeDefined();
		expect(module.get(UpdateHazardousEventUseCase)).toBeDefined();
		expect(module.get(GetHazardousEventByIdUseCase)).toBeDefined();
		expect(module.get(ListHazardousEventsUseCase)).toBeDefined();
		expect(module.get(DeleteHazardousEventUseCase)).toBeDefined();
		expect(module.get(RecordSpatialObservationUseCase)).toBeDefined();
	});

	it("CoreModule's exports array contains DrizzleProvider and NoticesModule but not HazardousEventsModule", () => {
		const exported = Reflect.getMetadata(
			MODULE_METADATA.EXPORTS,
			CoreModule,
		) as unknown[];
		expect(exported).toContain(DrizzleProvider);
		expect(exported).toContain(NoticesModule);
		expect(exported).not.toContain(HazardousEventsModule);
	});
});
