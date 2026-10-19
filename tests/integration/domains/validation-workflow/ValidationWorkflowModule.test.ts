// Order matters: PGlite mock before any module factory imports ~/db.server, and
// reflect-metadata before any decorated class is evaluated.
import "../../db/setup";
import "reflect-metadata";

import { Module } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { Test, type TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { ValidationWorkflowModule } from "~/domains/validation-workflow/infrastructure/ValidationWorkflowModule.server";
import { WORKFLOW_REPOSITORY } from "~/domains/validation-workflow/infrastructure/WorkflowRepositoryToken";
import { NOTIFICATION_PORT } from "~/domains/validation-workflow/infrastructure/NotificationPortToken";
import { DrizzleWorkflowRepository } from "~/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server";
import { EmailNotificationAdapter } from "~/domains/validation-workflow/infrastructure/EmailNotificationAdapter.server";
import { ProcessWorkflowActionUseCase } from "~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction";
import { CoreModule } from "~/infrastructure/CoreModule.server";
import { DrizzleProvider } from "~/infrastructure/DrizzleProvider.server";
import { NoticesModule } from "~/domains/notices/infrastructure/NoticesModule.server";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";

describe("ValidationWorkflowModule", () => {
	const modulesToClose: TestingModule[] = [];
	let module: TestingModule;

	beforeEach(async () => {
		module = await Test.createTestingModule({
			imports: [ValidationWorkflowModule],
		}).compile();
		modulesToClose.push(module);
	});

	afterEach(async () => {
		await Promise.all(modulesToClose.map((m) => m.close()));
		modulesToClose.length = 0;
	});

	it("compiles without error", () => {
		expect(module).toBeDefined();
	});

	it("WORKFLOW_REPOSITORY is a symbol-based token", () => {
		expect(typeof WORKFLOW_REPOSITORY).toBe("symbol");
	});

	it("NOTIFICATION_PORT is a symbol-based token", () => {
		expect(typeof NOTIFICATION_PORT).toBe("symbol");
	});

	it('a plain string "WORKFLOW_REPOSITORY" does not resolve the same provider as the Symbol token', () => {
		expect(() => module.get("WORKFLOW_REPOSITORY")).toThrow();
	});

	it('a plain string "NOTIFICATION_PORT" does not resolve the same provider as the Symbol token', () => {
		expect(() => module.get("NOTIFICATION_PORT")).toThrow();
	});

	it("WORKFLOW_REPOSITORY resolves to an instance of DrizzleWorkflowRepository", () => {
		expect(module.get(WORKFLOW_REPOSITORY)).toBeInstanceOf(
			DrizzleWorkflowRepository,
		);
	});

	it("WORKFLOW_REPOSITORY resolves to the same singleton on repeated gets", () => {
		expect(module.get(WORKFLOW_REPOSITORY)).toBe(
			module.get(WORKFLOW_REPOSITORY),
		);
	});

	it("NOTIFICATION_PORT resolves to an instance of EmailNotificationAdapter without compile() throwing", () => {
		expect(module.get(NOTIFICATION_PORT)).toBeInstanceOf(
			EmailNotificationAdapter,
		);
	});

	it("NOTIFICATION_PORT resolves to the same singleton on repeated gets", () => {
		expect(module.get(NOTIFICATION_PORT)).toBe(module.get(NOTIFICATION_PORT));
	});

	it("ProcessWorkflowActionUseCase resolves to a defined instance", () => {
		expect(module.get(ProcessWorkflowActionUseCase)).toBeInstanceOf(
			ProcessWorkflowActionUseCase,
		);
	});

	it("ProcessWorkflowActionUseCase's useFactory constructs its logger via getPinoLogger(), not NoOpLogger", () => {
		// Cast to read a private field for identity assertion only.
		const useCase = module.get(ProcessWorkflowActionUseCase) as unknown as {
			logger: unknown;
		};
		expect(useCase.logger).toBe(getPinoLogger());
	});

	it("ProcessWorkflowActionUseCase's injected dependencies are the module's own singletons", () => {
		// Cast to read private fields for identity assertion only.
		const useCase = module.get(ProcessWorkflowActionUseCase) as unknown as {
			workflowRepository: unknown;
			notificationPort: unknown;
		};
		expect(useCase.workflowRepository).toBe(module.get(WORKFLOW_REPOSITORY));
		expect(useCase.notificationPort).toBe(module.get(NOTIFICATION_PORT));
	});

	describe("hidden port tokens", () => {
		it("a second module importing ValidationWorkflowModule cannot resolve WORKFLOW_REPOSITORY via token injection", async () => {
			// Generic provider name avoids a false match on the regex below.
			@Module({
				imports: [ValidationWorkflowModule],
				providers: [
					{
						provide: "CONSUMER",
						useFactory: (repo: unknown) => repo,
						inject: [WORKFLOW_REPOSITORY],
					},
				],
			})
			class ConsumerModule {}

			await expect(
				Test.createTestingModule({ imports: [ConsumerModule] }).compile(),
			).rejects.toThrow(/Symbol\(WORKFLOW_REPOSITORY\)/);
		});

		it("a second module importing ValidationWorkflowModule cannot resolve NOTIFICATION_PORT via token injection", async () => {
			// Generic provider name avoids a false match on the regex below.
			@Module({
				imports: [ValidationWorkflowModule],
				providers: [
					{
						provide: "CONSUMER",
						useFactory: (port: unknown) => port,
						inject: [NOTIFICATION_PORT],
					},
				],
			})
			class ConsumerModule {}

			await expect(
				Test.createTestingModule({ imports: [ConsumerModule] }).compile(),
			).rejects.toThrow(/Symbol\(NOTIFICATION_PORT\)/);
		});
	});

	describe("exports metadata", () => {
		it("exports only ProcessWorkflowActionUseCase", () => {
			const exported = Reflect.getMetadata(
				MODULE_METADATA.EXPORTS,
				ValidationWorkflowModule,
			) as unknown[];
			expect(exported).toEqual([ProcessWorkflowActionUseCase]);
		});
	});

	describe("concurrent compilation", () => {
		it("produces independent containers that do not share singleton instances", async () => {
			const [moduleA, moduleB] = await Promise.all([
				Test.createTestingModule({
					imports: [ValidationWorkflowModule],
				}).compile(),
				Test.createTestingModule({
					imports: [ValidationWorkflowModule],
				}).compile(),
			]);
			modulesToClose.push(moduleA, moduleB);

			expect(moduleA.get(ProcessWorkflowActionUseCase)).toBeInstanceOf(
				ProcessWorkflowActionUseCase,
			);
			expect(moduleA.get(WORKFLOW_REPOSITORY)).toBeDefined();
			expect(moduleA.get(NOTIFICATION_PORT)).toBeDefined();

			expect(moduleB.get(ProcessWorkflowActionUseCase)).toBeInstanceOf(
				ProcessWorkflowActionUseCase,
			);
			expect(moduleB.get(WORKFLOW_REPOSITORY)).toBeDefined();
			expect(moduleB.get(NOTIFICATION_PORT)).toBeDefined();

			expect(moduleA.get(ProcessWorkflowActionUseCase)).not.toBe(
				moduleB.get(ProcessWorkflowActionUseCase),
			);
			expect(moduleA.get(WORKFLOW_REPOSITORY)).not.toBe(
				moduleB.get(WORKFLOW_REPOSITORY),
			);
			expect(moduleA.get(NOTIFICATION_PORT)).not.toBe(
				moduleB.get(NOTIFICATION_PORT),
			);
		});
	});
});

describe("ValidationWorkflowModule — CoreModule resolution", () => {
	const modulesToClose: TestingModule[] = [];

	afterEach(async () => {
		await Promise.all(modulesToClose.map((m) => m.close()));
		modulesToClose.length = 0;
	});

	it("CoreModule still compiles after importing ValidationWorkflowModule", async () => {
		const module = await Test.createTestingModule({
			imports: [CoreModule],
		}).compile();
		modulesToClose.push(module);

		expect(module).toBeDefined();
	});

	it("ProcessWorkflowActionUseCase resolves from CoreModule context", async () => {
		const module = await Test.createTestingModule({
			imports: [CoreModule],
		}).compile();
		modulesToClose.push(module);

		expect(module.get(ProcessWorkflowActionUseCase)).toBeInstanceOf(
			ProcessWorkflowActionUseCase,
		);
	});

	it("CoreModule's exports array contains DrizzleProvider and NoticesModule but not ValidationWorkflowModule", () => {
		const exported = Reflect.getMetadata(
			MODULE_METADATA.EXPORTS,
			CoreModule,
		) as unknown[];
		expect(exported).toContain(DrizzleProvider);
		expect(exported).toContain(NoticesModule);
		expect(exported).not.toContain(ValidationWorkflowModule);
	});
});
