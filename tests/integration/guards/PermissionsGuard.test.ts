// PGlite mock must load before ~/db.server is imported anywhere.
import "../db/setup";
// reflect-metadata must precede any decorated class.
import "reflect-metadata";

import { Test, type TestingModule } from "@nestjs/testing";
import {
	Controller,
	Get,
	Post,
	HttpCode,
	UseGuards,
	type INestApplication,
} from "@nestjs/common";
import supertest from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
	PermissionsGuard,
	RequirePermission,
	type AuthenticatedRequest,
} from "~/infrastructure/guards";

@Controller("/permissions-test")
class StubController {
	@Get("/unannotated")
	@UseGuards(PermissionsGuard)
	unannotated() {
		return { ok: true, access: "public" };
	}

	@Get("/view-data")
	@UseGuards(PermissionsGuard)
	@RequirePermission("ViewData")
	viewData() {
		return { ok: true, access: "view-data" };
	}

	@Post("/edit-data")
	@HttpCode(200)
	@UseGuards(PermissionsGuard)
	@RequirePermission("EditData")
	editData() {
		return { ok: true, access: "edit-data" };
	}

	@Post("/multi-perm")
	@HttpCode(200)
	@UseGuards(PermissionsGuard)
	@RequirePermission("ViewData", "EditData")
	multiPerm() {
		return { ok: true, access: "multi-perm" };
	}
}

describe("PermissionsGuard", () => {
	let app: INestApplication;
	let moduleRef: TestingModule;
	let currentRole: string | undefined;

	beforeAll(async () => {
		const dynamicAuthGuard = {
			canActivate: (context: any) => {
				const req = context.switchToHttp().getRequest() as AuthenticatedRequest;
				req.tenantId = "test-tenant-123";
				req.userId = "test-user-456";
				req.role = currentRole as any;
				return true;
			},
		};

		moduleRef = await Test.createTestingModule({
			controllers: [StubController],
			providers: [PermissionsGuard],
		})
			.overrideGuard(PermissionsGuard)
			.useClass(PermissionsGuard)
			.compile();

		app = moduleRef.createNestApplication();
		// Global mock auth guard simulating earlier authn in the chain
		app.use((req: any, _res: any, next: any) => {
			dynamicAuthGuard.canActivate({
				switchToHttp: () => ({ getRequest: () => req }),
			});
			next();
		});

		await app.listen(0);
	});

	afterAll(async () => {
		await app.close();
		await moduleRef.close();
	});

	it("allows access to an unannotated endpoint regardless of role", async () => {
		currentRole = undefined;
		const res = await supertest(app.getHttpServer()).get(
			"/permissions-test/unannotated",
		);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});

	it("allows access to a ViewData endpoint for role data-viewer", async () => {
		currentRole = "data-viewer";
		const res = await supertest(app.getHttpServer()).get(
			"/permissions-test/view-data",
		);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});

	it("rejects access to an EditData endpoint for role data-viewer with 403 Forbidden", async () => {
		currentRole = "data-viewer";
		const res = await supertest(app.getHttpServer()).post(
			"/permissions-test/edit-data",
		);
		expect(res.status).toBe(403);
		expect(res.body.message).toBe("Forbidden");
	});

	it("allows access to an EditData endpoint for role data-collector", async () => {
		currentRole = "data-collector";
		const res = await supertest(app.getHttpServer()).post(
			"/permissions-test/edit-data",
		);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});

	it("allows access to multi-permission endpoint when role has all required permissions", async () => {
		currentRole = "data-collector";
		const res = await supertest(app.getHttpServer()).post(
			"/permissions-test/multi-perm",
		);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});

	it("rejects access to multi-permission endpoint when role lacks one of the required permissions", async () => {
		currentRole = "data-viewer"; // Has ViewData, lacks EditData
		const res = await supertest(app.getHttpServer()).post(
			"/permissions-test/multi-perm",
		);
		expect(res.status).toBe(403);
	});

	it("rejects request with 403 when role is missing/undefined on a protected endpoint", async () => {
		currentRole = undefined;
		const res = await supertest(app.getHttpServer()).get(
			"/permissions-test/view-data",
		);
		expect(res.status).toBe(403);
	});
});
