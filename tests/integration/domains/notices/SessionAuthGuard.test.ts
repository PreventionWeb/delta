// PGlite mock must load before ~/db.server is imported anywhere.
import "../../db/setup";
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

import { initCookieStorage, getUserFromSession } from "~/utils/session";
import { getRequestContext } from "~/utils/requestContext.server";
import { RequestContextMiddleware } from "~/infrastructure/RequestContextMiddleware.server";
import {
	SessionAuthGuard,
	type AuthenticatedRequest,
} from "~/domains/notices/presentation/guards/SessionAuthGuard.server";
import { insertTenant, insertUser, buildSessionCookie } from "./testHelpers";

@Controller("/guard-test")
class StubController {
	@Get("/")
	@UseGuards(SessionAuthGuard)
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

// RequestContextMiddleware is applied here (not just providers) so an ALS scope is active
// when the guard runs — mirrors NoticesModule's own configure() (design.md Decision 2).
@Module({
	controllers: [StubController],
	providers: [SessionAuthGuard, RequestContextMiddleware],
})
class TestModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(RequestContextMiddleware).forRoutes(StubController);
	}
}

describe("SessionAuthGuard", () => {
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

	it("allows the request and populates request.tenantId/userId for a valid session", async () => {
		const tenantId = await insertTenant();
		const userId = await insertUser();
		const cookie = await buildSessionCookie({ userId, tenantId });

		const res = await request.get("/guard-test/").set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(res.body.tenantId).toBe(tenantId);
		expect(res.body.userId).toBe(userId);
	});

	it("populates the request-context store's tenantId/userId after a successful canActivate()", async () => {
		const tenantId = await insertTenant();
		const userId = await insertUser();
		const cookie = await buildSessionCookie({ userId, tenantId });

		const res = await request.get("/guard-test/").set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(res.body.contextTenantId).toBe(tenantId);
		expect(res.body.contextUserId).toBe(userId);
	});

	it("rejects a request with no Cookie header with 401", async () => {
		const res = await request.get("/guard-test/");
		expect(res.status).toBe(401);
	});

	// This TestModule has no I18nModule wired — I18nService is @Optional() on the guard, so
	// this covers the untranslated-default path (design.md Decision 19), not just the status code.
	it("uses the untranslated default message when I18nService isn't available", async () => {
		const res = await request.get("/guard-test/");
		expect(res.body.message).toBe("Authentication required.");
	});

	it("rejects a request whose session has timed out with 401", async () => {
		const tenantId = await insertTenant();
		const userId = await insertUser();
		// sessionActivityTimeoutMinutes is 40.
		const fiftyMinutesAgo = new Date(Date.now() - 50 * 60 * 1000);
		const cookie = await buildSessionCookie({
			userId,
			tenantId,
			lastActiveAt: fiftyMinutesAgo,
		});

		const res = await request.get("/guard-test/").set("Cookie", cookie);

		expect(res.status).toBe(401);
	});

	it("rejects a valid session with no resolvable countryAccountsId with 401", async () => {
		const userId = await insertUser();
		const cookie = await buildSessionCookie({ userId });

		const res = await request.get("/guard-test/").set("Cookie", cookie);

		expect(res.status).toBe(401);
	});

	it("resolves the same user getUserFromSession() would for an equivalent request", async () => {
		const tenantId = await insertTenant();
		const userId = await insertUser();
		const cookie = await buildSessionCookie({ userId, tenantId });

		const res = await request.get("/guard-test/").set("Cookie", cookie);
		expect(res.status).toBe(200);

		const directResult = await getUserFromSession(
			new Request("http://localhost/", { headers: { Cookie: cookie } }),
		);

		expect(res.body.userId).toBe(directResult?.user.id);
	});
});
