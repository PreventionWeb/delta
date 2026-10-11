// PGlite mock MUST be the very first import — see NoticesModule.test.ts's own note.
import "../../db/setup";
import "reflect-metadata";

import { Module, type InjectionToken } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";

import { EventCausalityModule } from "~/domains/event-causality/infrastructure/EventCausalityModule.server";
import { EVENT_CAUSALITY_REPOSITORY } from "~/domains/event-causality/infrastructure/EventCausalityRepositoryToken";
import { DrizzleEventCausalityRepository } from "~/domains/event-causality/infrastructure/DrizzleEventCausalityRepository.server";
import type { IEventCausalityRepository } from "~/domains/event-causality/application/ports/IEventCausalityRepository";

const PROBE: InjectionToken<IEventCausalityRepository> = Symbol("PROBE");

describe("EventCausalityModule", () => {
	const modulesToClose: TestingModule[] = [];

	afterEach(async () => {
		await Promise.all(modulesToClose.map((m) => m.close()));
		modulesToClose.length = 0;
	});

	it("compiles and resolves EVENT_CAUSALITY_REPOSITORY to an instance of DrizzleEventCausalityRepository", async () => {
		const module = await Test.createTestingModule({
			imports: [EventCausalityModule],
		}).compile();
		modulesToClose.push(module);

		expect(module.get(EVENT_CAUSALITY_REPOSITORY)).toBeInstanceOf(
			DrizzleEventCausalityRepository,
		);
	});

	// Non-strict testing-module resolution ignores `exports`, so the test above alone doesn't
	// prove the token is exported. A consumer module that only imports EventCausalityModule does:
	// it fails to compile if EVENT_CAUSALITY_REPOSITORY is ever dropped from `exports`.
	it("exports EVENT_CAUSALITY_REPOSITORY so a second module can inject it directly", async () => {
		@Module({
			imports: [EventCausalityModule],
			providers: [
				{
					provide: PROBE,
					useFactory: (repo: IEventCausalityRepository) => repo,
					inject: [EVENT_CAUSALITY_REPOSITORY],
				},
			],
		})
		class ConsumerModule {}

		const module = await Test.createTestingModule({
			imports: [ConsumerModule],
		}).compile();
		modulesToClose.push(module);

		expect(module.get(PROBE)).toBe(module.get(EVENT_CAUSALITY_REPOSITORY));
	});
});
