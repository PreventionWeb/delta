import "../setup";
import { eq } from "drizzle-orm";
import { describe, expect, it, beforeEach } from "vitest";
import { dr, type Dr } from "~/db.server";
// noticesTable imported from app barrel to prove the barrel export works
// and because DrizzleNoticeRepository uses the same schema
import { noticesTable } from "~/drizzle/schema";
// countriesTable and countryAccounts imported from testSchema — the PGlite
// in-memory DB is built from testSchema, not the app schema barrel, so these
// helpers must target the same table definitions PGlite knows about.
import { countriesTable } from "../testSchema/countriesTable";
import { countryAccounts } from "../testSchema/countryAccounts";
import { DrizzleNoticeRepository } from "~/domains/notices/infrastructure/DrizzleNoticeRepository.server";
import { Notice } from "~/domains/notices/domain/Notice";
import { NotFoundError, ConflictError } from "~/shared/errors/DomainError";

/** Helper: insert a countries row and return its id. */
async function insertCountry(suffix: string): Promise<string> {
	const [row] = await dr
		.insert(countriesTable)
		.values({ name: `Test Country ${suffix}` })
		.returning({ id: countriesTable.id });
	return row.id;
}

/** Helper: insert a countryAccounts row and return its id. */
async function insertCountryAccount(countryId: string): Promise<string> {
	const [row] = await dr
		.insert(countryAccounts)
		.values({ shortDescription: "TST", countryId })
		.returning({ id: countryAccounts.id });
	return row.id;
}

/** Helper: build a minimal valid Notice entity for a given tenant. */
function makeNotice(
	tenantId: string,
	overrides: Partial<Parameters<typeof Notice.create>[0]> = {},
): Notice {
	return Notice.create({
		id: crypto.randomUUID(),
		tenantId,
		titleJson: { en: "Test Notice" },
		bodyJson: null,
		isPublished: false,
		audience: "private",
		publishedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	});
}

describe("DrizzleNoticeRepository", () => {
	let tenantId: string;
	let repo: DrizzleNoticeRepository;

	beforeEach(async () => {
		const countryId = await insertCountry(crypto.randomUUID().slice(0, 8));
		tenantId = await insertCountryAccount(countryId);
		// Instantiated directly — no NestJS container needed in tests (Decision 7)
		repo = new DrizzleNoticeRepository(dr);
	});

	// ---- save → INSERT ----

	it("(1) save INSERT — persists all fields and returns the entity", async () => {
		const notice = makeNotice(tenantId, {
			titleJson: { en: "My Notice", fr: "Ma Notice" },
		});

		const saved = await repo.save(notice);

		// Verify the returned entity reflects the persisted state
		expect(saved.id).toBe(notice.id);
		expect(saved.tenantId).toBe(tenantId);
		expect(saved.titleJson).toEqual({ en: "My Notice", fr: "Ma Notice" });

		// Verify the row exists in the DB with the correct countryAccountsId
		const rows = await dr
			.select()
			.from(noticesTable)
			.where(eq(noticesTable.id, notice.id));
		expect(rows).toHaveLength(1);
		expect(rows[0].countryAccountsId).toBe(tenantId);
		expect(rows[0].titleJson).toEqual({ en: "My Notice", fr: "Ma Notice" });
	});

	// ---- save → UPDATE ----

	it("(2) save UPDATE — updates mutable fields and advances updatedAt", async () => {
		const notice = makeNotice(tenantId, {
			updatedAt: new Date("2026-01-01T00:00:00Z"),
		});
		await repo.save(notice);

		// Small delay to ensure updatedAt advances
		await new Promise((r) => setTimeout(r, 5));

		const updated = Notice.create({
			id: notice.id,
			tenantId,
			titleJson: { en: "Updated Title" },
			bodyJson: null,
			isPublished: false,
			audience: "private",
			publishedAt: null,
			createdAt: notice.createdAt,
			updatedAt: new Date(),
		});

		const saved = await repo.save(updated);

		expect(saved.titleJson).toEqual({ en: "Updated Title" });
		// updatedAt on the returned entity must be newer than the original
		expect(saved.updatedAt.getTime()).toBeGreaterThan(
			new Date("2026-01-01T00:00:00Z").getTime(),
		);
	});

	// ---- save → concurrent upsert ----

	it("(3) save concurrent — two concurrent saves with same id leave exactly one row", async () => {
		const notice = makeNotice(tenantId);

		await Promise.all([repo.save(notice), repo.save(notice)]);

		const rows = await dr
			.select({ id: noticesTable.id })
			.from(noticesTable)
			.where(eq(noticesTable.id, notice.id));

		// The upsert must be idempotent: second call updates the row the first created
		expect(rows).toHaveLength(1);
	});

	// ---- findById — happy path ----

	it("(4) findById — returns the entity when found", async () => {
		const notice = makeNotice(tenantId, { titleJson: { en: "Hello" } });
		await repo.save(notice);

		const found = await repo.findById(notice.id, tenantId);

		expect(found.id).toBe(notice.id);
		expect(found.tenantId).toBe(tenantId);
		expect(found.titleJson).toEqual({ en: "Hello" });
	});

	// ---- findById — not found ----

	it("(5) findById — throws NotFoundError when id does not exist", async () => {
		const unknownId = crypto.randomUUID();

		await expect(repo.findById(unknownId, tenantId)).rejects.toThrow(
			NotFoundError,
		);
	});

	// ---- findById — tenant isolation ----

	it("(6) findById — throws NotFoundError when id belongs to a different tenant", async () => {
		// Insert notice for tenantId
		const notice = makeNotice(tenantId);
		await repo.save(notice);

		// Create a second tenant
		const countryId2 = await insertCountry(crypto.randomUUID().slice(0, 8));
		const tenantId2 = await insertCountryAccount(countryId2);

		// Looking up the notice under tenantId2 must not return tenantId's notice
		await expect(repo.findById(notice.id, tenantId2)).rejects.toThrow(
			NotFoundError,
		);
	});

	// ---- findAll — scoped + newest-first ----

	it("(7) findAll — returns notices for tenant in newest-first order, excludes other tenants", async () => {
		// Create a second tenant with its own notice
		const countryId2 = await insertCountry(crypto.randomUUID().slice(0, 8));
		const tenantId2 = await insertCountryAccount(countryId2);

		const noticeA = makeNotice(tenantId, {
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
		});
		// noticeB created later — should appear first
		const noticeB = makeNotice(tenantId, {
			createdAt: new Date("2026-06-01T00:00:00Z"),
			updatedAt: new Date("2026-06-01T00:00:00Z"),
		});
		const otherNotice = makeNotice(tenantId2);

		// Sequential inserts to guarantee distinct DB-stamped createdAt values
		await repo.save(noticeA);
		await repo.save(noticeB);
		await repo.save(otherNotice);

		const results = await repo.findAll(tenantId, { page: 1, pageSize: 10 });

		expect(results).toHaveLength(2);
		// Newest first
		expect(results[0].id).toBe(noticeB.id);
		expect(results[1].id).toBe(noticeA.id);
		// No cross-tenant data
		const ids = results.map((n) => n.id);
		expect(ids).not.toContain(otherNotice.id);
	});

	// ---- findAll — empty ----

	it("(8) findAll — returns [] when tenant has no notices", async () => {
		const results = await repo.findAll(tenantId, { page: 1, pageSize: 10 });

		expect(results).toEqual([]);
	});

	// ---- findAll — pagination page 2 ----

	it("(9) findAll — page 2 with pageSize 1 returns the older notice", async () => {
		const noticeA = makeNotice(tenantId, {
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
		});
		const noticeB = makeNotice(tenantId, {
			createdAt: new Date("2026-06-01T00:00:00Z"),
			updatedAt: new Date("2026-06-01T00:00:00Z"),
		});

		await repo.save(noticeA);
		await repo.save(noticeB);

		const results = await repo.findAll(tenantId, { page: 2, pageSize: 1 });

		// Page 1 = noticeB (newest), Page 2 = noticeA (oldest)
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe(noticeA.id);
	});

	// ---- delete — removes notice ----

	it("(10) delete — removes the notice and subsequent findById throws NotFoundError", async () => {
		const notice = makeNotice(tenantId);
		await repo.save(notice);

		await repo.delete(notice.id, tenantId);

		await expect(repo.findById(notice.id, tenantId)).rejects.toThrow(
			NotFoundError,
		);
	});

	// ---- delete — idempotent ----

	it("(11) delete — does not throw when notice does not exist", async () => {
		const unknownId = crypto.randomUUID();

		// Must resolve void without throwing (Decision 6)
		await expect(repo.delete(unknownId, tenantId)).resolves.toBeUndefined();
	});

	// ---- delete — tenant isolation ----

	it("(12) delete — does not delete a notice belonging to a different tenant", async () => {
		const countryId2 = await insertCountry(crypto.randomUUID().slice(0, 8));
		const tenantId2 = await insertCountryAccount(countryId2);
		const notice = makeNotice(tenantId);
		await repo.save(notice);

		// Delete under tenantId2 — must not affect tenantId's notice
		await repo.delete(notice.id, tenantId2);

		const stillThere = await repo.findById(notice.id, tenantId);
		expect(stillThere.id).toBe(notice.id);
	});

	// ---- save → ConflictError on "23505" ----

	it("(13) save — maps PostgreSQL unique_violation (23505) to ConflictError", async () => {
		// WHY a mock db here instead of PGlite: the only unique constraint on
		// noticesTable is `id`, which onConflictDoUpdate intercepts before the error
		// propagates as an exception. There is no second unique constraint to trigger
		// a real "23505" via PGlite. The mock exercises the catch branch directly.
		const pgUniqueViolation = Object.assign(new Error("unique_violation"), {
			code: "23505",
		});
		const mockDb = {
			insert: () => ({
				values: () => ({
					onConflictDoUpdate: () => ({
						returning: () => Promise.reject(pgUniqueViolation),
					}),
				}),
			}),
		};
		// Double cast required: mockDb is intentionally a partial stub that satisfies
		// only the insert chain used by save(); full Dr type is not needed here.
		const mockRepo = new DrizzleNoticeRepository(mockDb as unknown as Dr);
		const notice = makeNotice("any-tenant");

		await expect(mockRepo.save(notice)).rejects.toThrow(ConflictError);
	});

	// ---- full field round-trip ----

	it("(14) full field round-trip — save and findById preserve all mapped fields", async () => {
		const publishedAt = new Date("2026-03-15T10:00:00Z");
		const notice = makeNotice(tenantId, {
			titleJson: { en: "Full Round-Trip", fr: "Aller-retour complet" },
			bodyJson: { en: "Body text", fr: "Corps du texte" },
			isPublished: true,
			audience: "public",
			publishedAt,
		});

		await repo.save(notice);
		const found = await repo.findById(notice.id, tenantId);

		expect(found.id).toBe(notice.id);
		expect(found.tenantId).toBe(tenantId);
		expect(found.titleJson).toEqual(notice.titleJson);
		expect(found.bodyJson).toEqual(notice.bodyJson);
		expect(found.isPublished).toBe(true);
		expect(found.audience).toBe("public");
		expect(found.publishedAt?.toISOString()).toBe(publishedAt.toISOString());
		expect(found.createdAt).toBeInstanceOf(Date);
		expect(found.updatedAt).toBeInstanceOf(Date);
	});
});
