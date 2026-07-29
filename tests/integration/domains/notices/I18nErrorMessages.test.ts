// PGlite mock must load before ~/db.server is imported anywhere.
import "../../db/setup";
// reflect-metadata must precede any decorated class.
import "reflect-metadata";

import { Test, type TestingModule } from "@nestjs/testing";
import { type INestApplication } from "@nestjs/common";
import supertest from "supertest";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CoreModule } from "~/infrastructure/CoreModule.server";
import { initCookieStorage } from "~/utils/session";

// Expected strings match the real committed locale JSON, not an inline mirror — this test
// exercises the real I18nModule reading real files from disk (design.md Decision 19).
describe("Notices API error messages are localized via nestjs-i18n", () => {
	let app: INestApplication;
	let request: ReturnType<typeof supertest>;
	let moduleRef: TestingModule;

	beforeEach(async () => {
		initCookieStorage();
		moduleRef = await Test.createTestingModule({
			imports: [CoreModule],
		}).compile();
		app = moduleRef.createNestApplication();
		await app.init();
		await app.listen(0);
		request = supertest(app.getHttpServer());
	});

	afterEach(async () => {
		await app.close();
		await moduleRef.close();
	});

	it("resolves the 401 message in French when Accept-Language: fr is sent", async () => {
		const res = await request.get("/notices").set("Accept-Language", "fr");

		expect(res.status).toBe(401);
		expect(res.body.error.message).toBe("Authentification requise.");
	});

	it("resolves the 401 message in English when no Accept-Language is sent", async () => {
		const res = await request.get("/notices");

		expect(res.status).toBe(401);
		expect(res.body.error.message).toBe("Authentication required.");
	});
});
