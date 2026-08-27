import { describe, expect, it } from "vitest";
import {
	AuthorizationError,
	ConflictError,
	DomainError,
	NotFoundError,
	ValidationError,
} from "~/shared/errors";

// ---------------------------------------------------------------------------
// Helper: a minimal concrete subclass used only in the base-class tests so we
// can exercise the abstract class without testing through a specific subclass.
// ---------------------------------------------------------------------------
class TestError extends DomainError {
	readonly code = "TEST_CODE";
	readonly statusHint = 500;

	constructor(message: string, context?: Record<string, unknown>) {
		super(message, context);
	}
}

// ---------------------------------------------------------------------------
// DomainError (base class behaviour, via TestError)
// ---------------------------------------------------------------------------
describe("DomainError base class", () => {
	it("sets name to the concrete class name, not 'Error'", () => {
		const err = new TestError("something went wrong");
		expect(err.name).toBe("TestError");
	});

	it("sets message correctly", () => {
		const err = new TestError("something went wrong");
		expect(err.message).toBe("something went wrong");
	});

	it("leaves context undefined when not provided", () => {
		const err = new TestError("no context here");
		expect(err.context).toBeUndefined();
	});

	it("preserves context when provided", () => {
		const ctx = { key: "value", count: 42 };
		const err = new TestError("with context", ctx);
		expect(err.context).toEqual(ctx);
	});

	it("instanceof DomainError is true", () => {
		const err = new TestError("check");
		expect(err instanceof DomainError).toBe(true);
	});

	it("instanceof Error is true", () => {
		const err = new TestError("check");
		expect(err instanceof Error).toBe(true);
	});

	it("instanceof TestError (concrete subclass) is true", () => {
		const err = new TestError("check");
		expect(err instanceof TestError).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// NotFoundError
// ---------------------------------------------------------------------------
describe("NotFoundError", () => {
	const err = new NotFoundError("Notice", "123");

	it("has code NOT_FOUND", () => {
		expect(err.code).toBe("NOT_FOUND");
	});

	it("has statusHint 404", () => {
		expect(err.statusHint).toBe(404);
	});

	it("derives message from entity name", () => {
		expect(err.message).toBe("Notice not found");
	});

	it("populates context with entity and id", () => {
		expect(err.context).toEqual({ entity: "Notice", id: "123" });
	});

	it("sets name to NotFoundError", () => {
		expect(err.name).toBe("NotFoundError");
	});

	it("instanceof DomainError is true", () => {
		expect(err instanceof DomainError).toBe(true);
	});

	it("instanceof Error is true", () => {
		expect(err instanceof Error).toBe(true);
	});

	it("instanceof NotFoundError is true", () => {
		expect(err instanceof NotFoundError).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------
describe("ValidationError", () => {
	it("has code VALIDATION_ERROR", () => {
		const err = new ValidationError("Name is required");
		expect(err.code).toBe("VALIDATION_ERROR");
	});

	it("has statusHint 422", () => {
		const err = new ValidationError("Name is required");
		expect(err.statusHint).toBe(422);
	});

	it("passes message through", () => {
		const err = new ValidationError("Name is required");
		expect(err.message).toBe("Name is required");
	});

	it("passes context through when provided", () => {
		const err = new ValidationError("Invalid", { field: "name" });
		expect(err.context).toEqual({ field: "name" });
	});

	it("leaves context undefined when not provided", () => {
		const err = new ValidationError("Name is required");
		expect(err.context).toBeUndefined();
	});

	it("sets name to ValidationError", () => {
		const err = new ValidationError("Name is required");
		expect(err.name).toBe("ValidationError");
	});

	it("instanceof DomainError is true", () => {
		const err = new ValidationError("Name is required");
		expect(err instanceof DomainError).toBe(true);
	});

	it("instanceof Error is true", () => {
		const err = new ValidationError("Name is required");
		expect(err instanceof Error).toBe(true);
	});

	it("instanceof ValidationError is true", () => {
		const err = new ValidationError("Name is required");
		expect(err instanceof ValidationError).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AuthorizationError
// ---------------------------------------------------------------------------
describe("AuthorizationError", () => {
	const err = new AuthorizationError("Insufficient permissions");

	it("has code FORBIDDEN", () => {
		expect(err.code).toBe("FORBIDDEN");
	});

	it("has statusHint 403", () => {
		expect(err.statusHint).toBe(403);
	});

	it("passes message through", () => {
		expect(err.message).toBe("Insufficient permissions");
	});

	it("sets name to AuthorizationError", () => {
		expect(err.name).toBe("AuthorizationError");
	});

	it("instanceof DomainError is true", () => {
		expect(err instanceof DomainError).toBe(true);
	});

	it("instanceof Error is true", () => {
		expect(err instanceof Error).toBe(true);
	});

	it("instanceof AuthorizationError is true", () => {
		expect(err instanceof AuthorizationError).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// ConflictError
// ---------------------------------------------------------------------------
describe("ConflictError", () => {
	const err = new ConflictError("Notice already exists");

	it("has code CONFLICT", () => {
		expect(err.code).toBe("CONFLICT");
	});

	it("has statusHint 409", () => {
		expect(err.statusHint).toBe(409);
	});

	it("passes message through", () => {
		expect(err.message).toBe("Notice already exists");
	});

	it("sets name to ConflictError", () => {
		expect(err.name).toBe("ConflictError");
	});

	it("instanceof DomainError is true", () => {
		expect(err instanceof DomainError).toBe(true);
	});

	it("instanceof Error is true", () => {
		expect(err instanceof Error).toBe(true);
	});

	it("instanceof ConflictError is true", () => {
		expect(err instanceof ConflictError).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Barrel export — verify all five names importable from ~/shared/errors
// ---------------------------------------------------------------------------
describe("Barrel export", () => {
	it("exports DomainError", () => {
		expect(DomainError).toBeDefined();
	});

	it("exports NotFoundError", () => {
		expect(NotFoundError).toBeDefined();
	});

	it("exports ValidationError", () => {
		expect(ValidationError).toBeDefined();
	});

	it("exports AuthorizationError", () => {
		expect(AuthorizationError).toBeDefined();
	});

	it("exports ConflictError", () => {
		expect(ConflictError).toBeDefined();
	});

	it("instanceof check holds when both sides imported from barrel", () => {
		const err = new NotFoundError("Item", "42");
		expect(err instanceof DomainError).toBe(true);
	});
});
