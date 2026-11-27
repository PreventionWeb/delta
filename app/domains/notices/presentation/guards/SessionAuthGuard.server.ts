import {
	ForbiddenException,
	Inject,
	Injectable,
	Optional,
	UnauthorizedException,
	type CanActivate,
	type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { and, eq } from "drizzle-orm";
import { I18nContext, I18nService } from "nestjs-i18n";
import { dr } from "~/db.server";
import {
	countryAccountsTable,
	countryAccountStatuses,
} from "~/drizzle/schema/countryAccountsTable";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { roleHasPermission, type PermissionId } from "~/frontend/user/roles";
import {
	getUserFromSession,
	getCountryAccountsIdFromSession,
} from "~/utils/session";
import {
	getRequestContext,
	writeSessionIntoContext,
} from "~/utils/requestContext.server";
import { REQUIRE_PERMISSION_KEY } from "./RequirePermission.server";

// Structural, not `import { Request } from "express"` — @types/express isn't installed (see DomainErrorFilter.server.ts).
export interface AuthenticatedRequest {
	url: string;
	headers: { cookie?: string; "accept-language"?: string };
	tenantId: string;
	userId: string;
	userRole?: string;
}

// Delegates to getUserFromSession()/getCountryAccountsIdFromSession() via a synthesized Fetch Request (design.md Decision 1).
@Injectable()
export class SessionAuthGuard implements CanActivate {
	// @Optional(): I18nModule is @Global() but only present when the compiled graph includes
	// CoreModule (design.md Decision 19) — tests that wire NoticesModule/this guard standalone
	// don't provide it, and the guard must still work, just with an untranslated default.
	constructor(
		@Optional() @Inject(I18nService) private readonly i18n?: I18nService,
		@Optional() @Inject(Reflector) private readonly reflector?: Reflector,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
		// Placeholder host only — Request() requires an absolute URL; only the Cookie header below is ever read.
		const fetchRequest = new Request(`http://placeholder.invalid${req.url}`, {
			headers: { Cookie: req.headers.cookie ?? "" },
		});

		const [userSession, tenantId] = await Promise.all([
			getUserFromSession(fetchRequest),
			getCountryAccountsIdFromSession(fetchRequest),
		]);

		if (
			!userSession ||
			typeof tenantId !== "string" ||
			tenantId.length === 0 ||
			(userSession.user.totpEnabled && !userSession.session.totpAuthed)
		) {
			const lang = I18nContext.current(context)?.lang;
			throw new UnauthorizedException(
				this.i18n?.t("common.error.authentication_required", { lang }) ??
					"Authentication required.",
			);
		}

		const [membership] = await dr
			.select({
				role: userCountryAccountsTable.role,
				status: countryAccountsTable.status,
			})
			.from(userCountryAccountsTable)
			.innerJoin(
				countryAccountsTable,
				eq(userCountryAccountsTable.countryAccountsId, countryAccountsTable.id),
			)
			.where(
				and(
					eq(userCountryAccountsTable.userId, userSession.user.id),
					eq(userCountryAccountsTable.countryAccountsId, tenantId),
				),
			)
			.limit(1);

		if (
			!membership ||
			membership.status !== countryAccountStatuses.ACTIVE
		) {
			throw new ForbiddenException("Access denied.");
		}

		const requiredPermission =
			this.reflector?.getAllAndOverride<PermissionId | undefined>(
				REQUIRE_PERMISSION_KEY,
				[context.getHandler(), context.getClass()],
			) ??
			(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, context.getHandler()) as
				| PermissionId
				| undefined) ??
			(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, context.getClass()) as
				| PermissionId
				| undefined);

		if (
			requiredPermission &&
			!roleHasPermission(membership.role, requiredPermission)
		) {
			throw new ForbiddenException("Insufficient permissions.");
		}

		req.tenantId = tenantId;
		req.userId = userSession.user.id;
		req.userRole = membership.role;

		// Mutate the live ALS store (not just the Express request) so PinoLogger's
		// contextMixin() can attribute tenantId/userId per ADR-004 (design.md Decision 11).
		const ctx = getRequestContext();
		if (ctx) {
			writeSessionIntoContext(ctx, { tenantId, userId: req.userId });
		}

		return true;
	}
}
