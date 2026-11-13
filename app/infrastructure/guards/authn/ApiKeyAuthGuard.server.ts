import {
	Inject,
	Injectable,
	Optional,
	UnauthorizedException,
	type CanActivate,
	type ExecutionContext,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { I18nContext, I18nService } from "nestjs-i18n";
import { type Dr } from "~/db.server";
import { apiKeyTable } from "~/drizzle/schema/apiKeyTable";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import {
	getRequestContext,
	writeSessionIntoContext,
} from "~/utils/requestContext.server";
import type { RoleId } from "~/frontend/user/roles";
import type { AuthenticatedRequest } from "../types";

/**
 * NestJS guard that authenticates machine-to-machine / external requests
 * carrying an `X-Auth` API key header against `apiKeyTable`.
 *
 * Enforces rule P1-22: strictly verifies that `countryAccountsId` is present
 * to maintain multi-tenant isolation.
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
	constructor(
		@Inject(DRIZZLE_CLIENT) private readonly db: Dr,
		@Optional() @Inject(I18nService) private readonly i18n?: I18nService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
		const apiKeyHeader = req.headers["x-auth"];

		if (!apiKeyHeader || typeof apiKeyHeader !== "string") {
			this.throwUnauthorized(context);
		}

		const keys = await this.db
			.select()
			.from(apiKeyTable)
			.where(eq(apiKeyTable.secret, apiKeyHeader.trim()));

		if (keys.length === 0) {
			this.throwUnauthorized(context);
		}

		const key = keys[0];
		if (
			typeof key.countryAccountsId !== "string" ||
			key.countryAccountsId.length === 0 ||
			typeof key.managedByUserId !== "string" ||
			key.managedByUserId.length === 0
		) {
			this.throwUnauthorized(context);
		}

		req.tenantId = key.countryAccountsId;
		req.userId = key.managedByUserId;

		// Resolve caller role within this tenant
		const userCountryAccounts = await this.db
			.select({ role: userCountryAccountsTable.role })
			.from(userCountryAccountsTable)
			.where(
				and(
					eq(userCountryAccountsTable.userId, key.managedByUserId),
					eq(userCountryAccountsTable.countryAccountsId, key.countryAccountsId),
				),
			);

		if (userCountryAccounts.length > 0) {
			req.role = userCountryAccounts[0].role as RoleId;
		}

		const ctx = getRequestContext();
		if (ctx) {
			writeSessionIntoContext(ctx, {
				tenantId: req.tenantId,
				userId: req.userId,
			});
		}

		return true;
	}

	private throwUnauthorized(context: ExecutionContext): never {
		const lang = I18nContext.current(context)?.lang;
		throw new UnauthorizedException(
			this.i18n?.t("common.error.authentication_required", { lang }) ??
				"Authentication required.",
		);
	}
}
