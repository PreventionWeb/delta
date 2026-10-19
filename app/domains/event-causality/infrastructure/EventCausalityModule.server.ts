import { Module } from "@nestjs/common";

import { DrizzleProvider } from "~/infrastructure/DrizzleProvider.server";
import { DrizzleEventCausalityRepository } from "./DrizzleEventCausalityRepository.server";
import { EVENT_CAUSALITY_REPOSITORY } from "./EventCausalityRepositoryToken";

/**
 * No use case of its own — unlike NoticesModule, which hides NOTICE_REPOSITORY behind one — so
 * EVENT_CAUSALITY_REPOSITORY is exported directly for other domains to inject.
 */
@Module({
	providers: [
		DrizzleProvider,
		{
			provide: EVENT_CAUSALITY_REPOSITORY,
			useClass: DrizzleEventCausalityRepository,
		},
	],
	exports: [EVENT_CAUSALITY_REPOSITORY],
})
export class EventCausalityModule {}
