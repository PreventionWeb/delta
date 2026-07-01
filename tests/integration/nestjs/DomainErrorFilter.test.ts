// reflect-metadata MUST be the very first import so that the Reflect polyfill
// is in place before any NestJS decorator metadata is evaluated.
import "reflect-metadata";

import { Test } from "@nestjs/testing";
import {
	Controller,
	Get,
	Module,
	type INestApplication,
	NotFoundException,
} from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import supertest from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
	NotFoundError,
	ValidationError,
	AuthorizationError,
	ConflictError,
} from "~/shared/errors/DomainError";
import { DomainErrorFilter } from "~/infrastructure/DomainErrorFilter.server";

// ---------------------------------------------------------------------------
// Stub controller — one GET route per error type tested
// ---------------------------------------------------------------------------

@Controller("/test")
class StubController {
	@Get("/not-found")
	throwNotFound() {
		throw new NotFoundError("Notice", "abc-123");
	}

	@Get("/validation")
	throwValidation() {
		throw new ValidationError("Title must not be empty");
	}

	@Get("/authorization")
	throwAuthorization() {
		throw new AuthorizationError("Insufficient permissions");
	}

	@Get("/conflict")
	throwConflict() {
		throw new ConflictError("Notice already exists");
	}

	@Get("/unknown")
	throwUnknown() {
		throw new Error("Database connection lost");
	}

	@Get("/nest-exception")
	throwNestException() {
		// NestJS HttpException — passed through with its own status code wrapped in
		// the ADR-003 envelope (code: "HTTP_ERROR"). Not collapsed into 500 because
		// NestJS uses HttpException for legitimate infrastructure responses
		// (unmatched routes, ValidationPipe failures) that carry semantically
		// correct status codes.
		throw new NotFoundException();
	}
}

// ---------------------------------------------------------------------------
// Nested module — no filter registration here; relies solely on APP_FILTER
// propagation from the parent TestModule.
// ---------------------------------------------------------------------------

@Controller("/nested")
class NestedStubController {
	@Get("/not-found")
	throwNotFound() {
		throw new NotFoundError("Notice", "nested-456");
	}
}

@Module({
	controllers: [NestedStubController],
	// Deliberately no APP_FILTER provider — the filter must reach this module
	// only because it was registered with APP_FILTER in the parent TestModule.
})
class NestedModule {}

@Module({
	imports: [NestedModule],
	controllers: [StubController],
	providers: [
		{
			// Register the filter globally via the DI token so it applies to all
			// controllers without per-controller decoration (Decision 2).
			provide: APP_FILTER,
			useClass: DomainErrorFilter,
		},
	],
})
class TestModule {}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("DomainErrorFilter", () => {
	let app: INestApplication;
	let request: ReturnType<typeof supertest>;

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [TestModule],
		}).compile();

		// createNestApplication + listen(0) gives a real HTTP surface on an
		// ephemeral port — avoids port conflicts in parallel test runs.
		app = moduleRef.createNestApplication();
		await app.listen(0);
		request = supertest(app.getHttpServer());
	});

	afterAll(async () => {
		await app.close();
	});

	// -------------------------------------------------------------------------
	// Status code mapping
	// -------------------------------------------------------------------------

	it("NotFoundError maps to HTTP 404", async () => {
		const res = await request.get("/test/not-found");
		expect(res.status).toBe(404);
	});

	it("ValidationError maps to HTTP 422", async () => {
		const res = await request.get("/test/validation");
		expect(res.status).toBe(422);
	});

	it("AuthorizationError maps to HTTP 403", async () => {
		const res = await request.get("/test/authorization");
		expect(res.status).toBe(403);
	});

	it("ConflictError maps to HTTP 409", async () => {
		const res = await request.get("/test/conflict");
		expect(res.status).toBe(409);
	});

	// -------------------------------------------------------------------------
	// ErrorResponse body shape
	// -------------------------------------------------------------------------

	it("NotFoundError body has correct code and success=false", async () => {
		const res = await request.get("/test/not-found");
		expect(res.body).toMatchObject({
			success: false,
			error: {
				code: "NOT_FOUND",
				message: "Notice not found",
			},
		});
	});

	it("ValidationError body has correct code", async () => {
		const res = await request.get("/test/validation");
		expect(res.body).toMatchObject({
			success: false,
			error: { code: "VALIDATION_ERROR", message: "Title must not be empty" },
		});
	});

	it("AuthorizationError body has correct code", async () => {
		const res = await request.get("/test/authorization");
		expect(res.body).toMatchObject({
			success: false,
			error: { code: "FORBIDDEN", message: "Insufficient permissions" },
		});
	});

	it("ConflictError body has correct code", async () => {
		const res = await request.get("/test/conflict");
		expect(res.body).toMatchObject({
			success: false,
			error: { code: "CONFLICT", message: "Notice already exists" },
		});
	});

	// -------------------------------------------------------------------------
	// Context / details field
	// -------------------------------------------------------------------------

	it("NotFoundError includes error.details from context", async () => {
		// NotFoundError always sets context = { entity, id } in its constructor.
		const res = await request.get("/test/not-found");
		expect(res.body.error.details).toEqual({ entity: "Notice", id: "abc-123" });
	});

	it("ValidationError without context omits error.details", async () => {
		// ValidationError is constructed without a context argument above, so
		// context is undefined and details must not appear in the response.
		const res = await request.get("/test/validation");
		expect(res.body.error).not.toHaveProperty("details");
	});

	// -------------------------------------------------------------------------
	// traceId and timestamp
	// -------------------------------------------------------------------------

	it("traceId matches UUID v4 pattern", async () => {
		const res = await request.get("/test/not-found");
		expect(res.body.error.traceId).toMatch(/^[0-9a-f-]{36}$/i);
	});

	it("timestamp is a valid ISO 8601 date string", async () => {
		const res = await request.get("/test/not-found");
		const ts = res.body.error.timestamp;
		expect(typeof ts).toBe("string");
		expect(new Date(ts).toISOString()).toBe(ts);
	});

	// -------------------------------------------------------------------------
	// Unknown / non-DomainError exceptions
	// -------------------------------------------------------------------------

	it("unknown Error returns HTTP 500", async () => {
		const res = await request.get("/test/unknown");
		expect(res.status).toBe(500);
	});

	it("unknown Error body has INTERNAL_ERROR code and generic message", async () => {
		const res = await request.get("/test/unknown");
		expect(res.body).toMatchObject({
			success: false,
			error: {
				code: "INTERNAL_ERROR",
				message: "An unexpected error occurred. Please try again later.",
			},
		});
	});

	it("unknown Error body does NOT contain original error message", async () => {
		const res = await request.get("/test/unknown");
		expect(JSON.stringify(res.body)).not.toContain("Database connection lost");
	});

	it("unknown Error body does NOT contain a stack trace fragment", async () => {
		const res = await request.get("/test/unknown");
		const bodyStr = JSON.stringify(res.body);
		// Stack traces contain 'at ' followed by function name or file path.
		expect(bodyStr).not.toMatch(/\bat\s+\S/);
	});

	it("NestJS HttpException passes through its status code with HTTP_ERROR code", async () => {
		// NotFoundException is an HttpException with status 404. The filter must use
		// exception.getStatus() (not hard-code 500) so that infrastructure-level HTTP
		// semantics are preserved. The body must still conform to the ADR-003 envelope.
		const res = await request.get("/test/nest-exception");
		expect(res.status).toBe(404);
		expect(res.body).toMatchObject({
			success: false,
			error: {
				code: "HTTP_ERROR",
			},
		});
		expect(res.body.error.traceId).toMatch(/^[0-9a-f-]{36}$/i);
		expect(typeof res.body.error.timestamp).toBe("string");
	});

	// -------------------------------------------------------------------------
	// Concurrent requests produce distinct traceIds
	// -------------------------------------------------------------------------

	it("two concurrent requests produce distinct traceIds", async () => {
		const [res1, res2] = await Promise.all([
			request.get("/test/not-found"),
			request.get("/test/not-found"),
		]);
		expect(res1.body.error.traceId).not.toBe(res2.body.error.traceId);
	});

	// -------------------------------------------------------------------------
	// APP_FILTER propagation to nested modules (W1)
	// -------------------------------------------------------------------------

	it("APP_FILTER propagates to controllers in nested modules", async () => {
		// NestedModule has no APP_FILTER provider of its own — the filter must
		// reach NestedStubController solely via the APP_FILTER token in TestModule.
		// A switch from APP_FILTER to useGlobalFilters() would break this test
		// because useGlobalFilters() does not cover lazily-imported or nested
		// modules in the same way APP_FILTER (scoped to the DI container) does.
		const res = await request.get("/nested/not-found");
		expect(res.status).toBe(404);
		expect(res.body).toMatchObject({
			success: false,
			error: { code: "NOT_FOUND" },
		});
	});
});
