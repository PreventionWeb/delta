// PGlite mock must load before ~/db.server is imported anywhere.
import "../db/setup";
// reflect-metadata must precede any decorated class.
import "reflect-metadata";

import { Test } from "@nestjs/testing";
import {
	Controller,
	Get,
	Module,
	Req,
	UseGuards,
	type INestApplication,
	type MiddlewareConsumer,
	type NestModule,
} from "@nestjs/common";
import supertest from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { dr } from "~/db.server";
import { apiKeyTable } from "~/drizzle/schema/apiKeyTable";
import { getRequestContext } from "~/utils/requestContext.server";
import { RequestContextMiddleware } from "~/infrastructure/RequestContextMiddleware.server";
import { DrizzleProvider } from "~/infrastructure/DrizzleProvider.server";
import {
	ApiKeyAuthGuard,
	type AuthenticatedRequest,
} from "~/infrastructure/guards";
import { insertTenant, insertUser } from "../domains/notices/testHelpers";

async function insertApiKey(options: {
	userId: string;
	tenantId?: string | null;
	secret?: string;
}): Promise<string> {
	const secret = options.secret ?? `delta_test_key_${crypto.randomUUID()}`;
	await dr.insert(apiKeyTable).values({
		secret,
		name: "Test API Key",
		managedByUserId: options.userId,
		countryAccountsId: options.tenantId ?? null,
	});
	return secret;
}

@Controller("/api-key-guard-test")
class StubController {
	@Get("/")
	@UseGuards(ApiKeyAuthGuard)
	echo(@Req() req: unknown) {
		const authedReq = req as AuthenticatedRequest;
		const ctx = getRequestContext();
		return {
			tenantId: authedReq.tenantId,
			userId: authedReq.userId,
			contextTenantId: ctx?.tenantId ?? null,
			contextUserId: ctx?.userId ?? null,
		};
	}
}

@Module({
	controllers: [StubController],
	providers: [DrizzleProvider, ApiKeyAuthGuard, RequestContextMiddleware],
})
class TestModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(RequestContextMiddleware).forRoutes(StubController);
	}
}

describe("ApiKeyAuthGuard", () => {
	let app: INestApplication;
	let request: ReturnType<typeof supertest>;

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [TestModule],
		}).compile();

		app = moduleRef.createNestApplication();
		await app.listen(0);
		request = supertest(app.getHttpServer());
	});

	afterAll(async () => {
		await app.close();
	});

	it("allows the request and populates request.tenantId/userId for a valid X-Auth key", async () => {
		const tenantId = await insertTenant();
		const userId = await insertUser();
		const secret = await insertApiKey({ userId, tenantId });

		const res = await request.get("/api-key-guard-test/").set("X-Auth", secret);

		expect(res.status).toBe(200);
		expect(res.body.tenantId).toBe(tenantId);
		expect(res.body.userId).toBe(userId);
	});

	it("populates the request-context store's tenantId/userId after a successful canActivate()", async () => {
		const tenantId = await insertTenant();
		const userId = await insertUser();
		const secret = await insertApiKey({ userId, tenantId });

		const res = await request.get("/api-key-guard-test/").set("X-Auth", secret);

		expect(res.status).toBe(200);
		expect(res.body.contextTenantId).toBe(tenantId);
		expect(res.body.contextUserId).toBe(userId);
	});

	it("rejects a request with no X-Auth header with 401", async () => {
		const res = await request.get("/api-key-guard-test/");
		expect(res.status).toBe(401);
		expect(res.body.message).toBe("Authentication required.");
	});

	it("rejects an invalid/non-existent X-Auth key with 401", async () => {
		const res = await request
			.get("/api-key-guard-test/")
			.set("X-Auth", "invalid-secret-key-12345");
		expect(res.status).toBe(401);
	});

	it("rejects an API key that has no associated countryAccountsId (tenant isolation)", async () => {
		const userId = await insertUser();
		const secret = await insertApiKey({ userId, tenantId: null });

		const res = await request.get("/api-key-guard-test/").set("X-Auth", secret);

		expect(res.status).toBe(401);
	});
});
