import { describe, expect, it } from "vitest";
import { ConcurrentModificationError, ConflictError } from "./DomainError";

describe("ConcurrentModificationError", () => {
	it("is a ConflictError subtype, inheriting code/statusHint rather than overriding them (design.md Decision 5)", () => {
		const err = new ConcurrentModificationError("stale write rejected", {
			entityId: "entity-1",
		});

		expect(err).toBeInstanceOf(ConflictError);
		expect(err.code).toBe("CONFLICT");
		expect(err.statusHint).toBe(409);
	});
});
