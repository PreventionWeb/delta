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
import { initCookieStorage } from "~/utils/session";
import { getRequestContext } from "~/utils/requestContext.server";
import { RequestContextMiddleware } from "~/infrastructure/RequestContextMiddleware.server";
import { DrizzleProvider } from "~/infrastructure/DrizzleProvider.server";
import {
	ApiKeyAuthGuard,
	SessionAuthGuard,
	ApiKeyOrSessionAuthGuard,
	type AuthenticatedRequest,
} from "~/infrastructure/guards";
import {
	insertTenant,
	insertUser,
	buildSessionCookie,
} from "../domains/notices/testHelpers";

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

@Controller("/composite-guard-test")
class StubController {
	@Get("/")
	@UseGuards(ApiKeyOrSessionAuthGuard)
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
	providers: [
		DrizzleProvider,
		ApiKeyAuthGuard,
		SessionAuthGuard,
		ApiKeyOrSessionAuthGuard,
		RequestContextMiddleware,
	],
})
class TestModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(RequestContextMiddleware).forRoutes(StubController);
	}
}

describe("ApiKeyOrSessionAuthGuard", () => {
	let app: INestApplication;
	let request: ReturnType<typeof supertest>;

	beforeAll(async () => {
		initCookieStorage();

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

	it("authenticates via valid X-Auth header when no cookie is present", async () => {
		const tenantId = await insertTenant();
		const userId = await insertUser();
		const secret = await insertApiKey({ userId, tenantId });

		const res = await request
			.get("/composite-guard-test/")
			.set("X-Auth", secret);

		expect(res.status).toBe(200);
		expect(res.body.tenantId).toBe(tenantId);
		expect(res.body.userId).toBe(userId);
		expect(res.body.contextTenantId).toBe(tenantId);
	});

	it("authenticates via valid session cookie when no X-Auth header is present", async () => {
		const tenantId = await insertTenant();
		const userId = await insertUser();
		const cookie = await buildSessionCookie({ userId, tenantId });

		const res = await request
			.get("/composite-guard-test/")
			.set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(res.body.tenantId).toBe(tenantId);
		expect(res.body.userId).toBe(userId);
		expect(res.body.contextTenantId).toBe(tenantId);
	});

	it("gives precedence to X-Auth when both X-Auth and cookie are present", async () => {
		const apiKeyTenantId = await insertTenant();
		const apiKeyUserId = await insertUser();
		const secret = await insertApiKey({
			userId: apiKeyUserId,
			tenantId: apiKeyTenantId,
		});

		const cookieTenantId = await insertTenant();
		const cookieUserId = await insertUser();
		const cookie = await buildSessionCookie({
			userId: cookieUserId,
			tenantId: cookieTenantId,
		});

		const res = await request
			.get("/composite-guard-test/")
			.set("X-Auth", secret)
			.set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(res.body.tenantId).toBe(apiKeyTenantId);
		expect(res.body.userId).toBe(apiKeyUserId);
	});

	it("rejects with 401 when neither X-Auth nor cookie is provided", async () => {
		const res = await request.get("/composite-guard-test/");
		expect(res.status).toBe(401);
		expect(res.body.message).toBe("Authentication required.");
	});

	it("rejects with 401 when an invalid X-Auth header is provided", async () => {
		const res = await request
			.get("/composite-guard-test/")
			.set("X-Auth", "invalid-key-99999");
		expect(res.status).toBe(401);
	});
});
