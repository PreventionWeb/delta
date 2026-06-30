// PGlite mock MUST be the very first import so the vi.mock("~/db.server") is
// registered before any NestJS module factory runs and imports ~/db.server.
import "../../db/setup";
// reflect-metadata MUST be the second import — NestJS decorators require the
// Reflect polyfill to be in place before any decorated class is evaluated.
import "reflect-metadata";

import { Test, type TestingModule } from "@nestjs/testing";
import { describe, it, expect, afterEach } from "vitest";

import { NoticesModule } from "~/domains/notices/infrastructure/NoticesModule.server";
import { NOTICE_REPOSITORY } from "~/domains/notices/infrastructure/NoticeRepositoryToken";
import { DrizzleNoticeRepository } from "~/domains/notices/infrastructure/DrizzleNoticeRepository.server";
import { CreateNoticeUseCase } from "~/domains/notices/application/use-cases/CreateNotice";
import { ListNoticesUseCase } from "~/domains/notices/application/use-cases/ListNotices";
import { GetNoticeByIdUseCase } from "~/domains/notices/application/use-cases/GetNoticeById";
import { CoreModule } from "~/infrastructure/CoreModule.server";

describe("NoticesModule", () => {
	const modulesToClose: TestingModule[] = [];

	afterEach(async () => {
		await Promise.all(modulesToClose.map((m) => m.close()));
		modulesToClose.length = 0;
	});

	it("compiles without error", async () => {
		// Verifies notices-module-wiring spec: NoticesModule compiles.
		const module = await Test.createTestingModule({
			imports: [NoticesModule],
		}).compile();
		modulesToClose.push(module);

		expect(module).toBeDefined();
	});

	it("NOTICE_REPOSITORY resolves to an instance of DrizzleNoticeRepository", async () => {
		// Verifies notices-module-wiring spec: Token resolves to the correct adapter.
		const module = await Test.createTestingModule({
			imports: [NoticesModule],
		}).compile();
		modulesToClose.push(module);

		const repo = module.get(NOTICE_REPOSITORY);
		expect(repo).toBeInstanceOf(DrizzleNoticeRepository);
	});

	it("NOTICE_REPOSITORY token resolves to the same singleton on repeated gets", async () => {
		// Verifies notices-module-wiring spec: Token resolves to the same singleton.
		// NestJS default scope is Singleton, so two gets must return the exact same reference.
		const module = await Test.createTestingModule({
			imports: [NoticesModule],
		}).compile();
		modulesToClose.push(module);

		const first = module.get(NOTICE_REPOSITORY);
		const second = module.get(NOTICE_REPOSITORY);
		expect(first).toBe(second);
	});

	it("NOTICE_REPOSITORY is a symbol-based token", () => {
		// Verifies notices-module-wiring spec: Token identity — symbol not string.
		// A plain string token and a Symbol token are different provider keys in NestJS;
		// the Symbol prevents accidental injection via a string literal.
		expect(typeof NOTICE_REPOSITORY).toBe("symbol");
	});

	it("CreateNoticeUseCase resolves to a defined instance", async () => {
		// Verifies notices-module-wiring spec: CreateNoticeUseCase resolves to a defined instance.
		const module = await Test.createTestingModule({
			imports: [NoticesModule],
		}).compile();
		modulesToClose.push(module);

		const useCase = module.get(CreateNoticeUseCase);
		expect(useCase).toBeDefined();
	});

	it("ListNoticesUseCase resolves to a defined instance", async () => {
		// Verifies notices-module-wiring spec: ListNoticesUseCase resolves to a defined instance.
		const module = await Test.createTestingModule({
			imports: [NoticesModule],
		}).compile();
		modulesToClose.push(module);

		const useCase = module.get(ListNoticesUseCase);
		expect(useCase).toBeDefined();
	});

	it("GetNoticeByIdUseCase resolves to a defined instance", async () => {
		// Verifies notices-module-wiring spec: GetNoticeByIdUseCase resolves to a defined instance.
		const module = await Test.createTestingModule({
			imports: [NoticesModule],
		}).compile();
		modulesToClose.push(module);

		const useCase = module.get(GetNoticeByIdUseCase);
		expect(useCase).toBeDefined();
	});

	it("concurrent NoticesModule compilations resolve all providers independently", async () => {
		// Verifies notices-module-wiring spec: Concurrent compilation produces independent containers.
		// Each compile() creates an isolated NestJS container; both must resolve all tokens
		// to defined values without interfering with each other.
		const [moduleA, moduleB] = await Promise.all([
			Test.createTestingModule({ imports: [NoticesModule] }).compile(),
			Test.createTestingModule({ imports: [NoticesModule] }).compile(),
		]);
		modulesToClose.push(moduleA, moduleB);

		expect(moduleA.get(CreateNoticeUseCase)).toBeDefined();
		expect(moduleA.get(ListNoticesUseCase)).toBeDefined();
		expect(moduleA.get(GetNoticeByIdUseCase)).toBeDefined();
		expect(moduleA.get(NOTICE_REPOSITORY)).toBeDefined();

		expect(moduleB.get(CreateNoticeUseCase)).toBeDefined();
		expect(moduleB.get(ListNoticesUseCase)).toBeDefined();
		expect(moduleB.get(GetNoticeByIdUseCase)).toBeDefined();
		expect(moduleB.get(NOTICE_REPOSITORY)).toBeDefined();
	});
});

describe("NoticesModule — CoreModule resolution", () => {
	const modulesToClose: TestingModule[] = [];

	afterEach(async () => {
		await Promise.all(modulesToClose.map((m) => m.close()));
		modulesToClose.length = 0;
	});

	it("CoreModule still compiles after importing NoticesModule", async () => {
		// Verifies core-module spec: CoreModule still compiles after importing NoticesModule.
		// Adding NoticesModule to CoreModule's imports must not break existing compilation.
		const module = await Test.createTestingModule({
			imports: [CoreModule],
		}).compile();
		modulesToClose.push(module);

		expect(module).toBeDefined();
	});

	it("CreateNoticeUseCase resolves from CoreModule context", async () => {
		// Verifies core-module spec: CreateNoticeUseCase resolves from CoreModule context.
		const module = await Test.createTestingModule({
			imports: [CoreModule],
		}).compile();
		modulesToClose.push(module);

		const useCase = module.get(CreateNoticeUseCase);
		expect(useCase).toBeDefined();
	});

	it("ListNoticesUseCase resolves from CoreModule context", async () => {
		// Verifies core-module spec: ListNoticesUseCase resolves from CoreModule context.
		const module = await Test.createTestingModule({
			imports: [CoreModule],
		}).compile();
		modulesToClose.push(module);

		const useCase = module.get(ListNoticesUseCase);
		expect(useCase).toBeDefined();
	});

	it("GetNoticeByIdUseCase resolves from CoreModule context", async () => {
		// Verifies core-module spec: GetNoticeByIdUseCase resolves from CoreModule context.
		const module = await Test.createTestingModule({
			imports: [CoreModule],
		}).compile();
		modulesToClose.push(module);

		const useCase = module.get(GetNoticeByIdUseCase);
		expect(useCase).toBeDefined();
	});
});
