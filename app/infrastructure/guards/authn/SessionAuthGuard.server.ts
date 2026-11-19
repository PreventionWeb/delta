import {
	Inject,
	Injectable,
	Optional,
	UnauthorizedException,
	type CanActivate,
	type ExecutionContext,
} from "@nestjs/common";
import { I18nContext, I18nService } from "nestjs-i18n";
import {
	getUserFromSession,
	getCountryAccountsIdFromSession,
	getUserRoleFromSession,
} from "~/utils/session";
import {
	getRequestContext,
	writeSessionIntoContext,
} from "~/utils/requestContext.server";
import type { RoleId } from "~/frontend/user/roles";
import type { AuthenticatedRequest } from "../types";

// Delegates to getUserFromSession()/getCountryAccountsIdFromSession() via a synthesized Fetch Request.
@Injectable()
export class SessionAuthGuard implements CanActivate {
	constructor(
		@Optional() @Inject(I18nService) private readonly i18n?: I18nService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
		// Placeholder host only — Request() requires an absolute URL; only the Cookie header below is ever read.
		const fetchRequest = new Request(`http://placeholder.invalid${req.url}`, {
			headers: { Cookie: req.headers.cookie ?? "" },
		});

		const [userSession, tenantId, userRole] = await Promise.all([
			getUserFromSession(fetchRequest),
			getCountryAccountsIdFromSession(fetchRequest),
			getUserRoleFromSession(fetchRequest),
		]);

		if (!userSession || typeof tenantId !== "string" || tenantId.length === 0) {
			const lang = I18nContext.current(context)?.lang;
			throw new UnauthorizedException(
				this.i18n?.t("common.error.authentication_required", { lang }) ??
					"Authentication required.",
			);
		}

		req.tenantId = tenantId;
		req.userId = userSession.user.id;
		req.role = (userRole as RoleId) ?? undefined;

		// Mutate the live ALS store (not just the Express request) so PinoLogger's
		// contextMixin() can attribute tenantId/userId per ADR-004.
		const ctx = getRequestContext();
		if (ctx) {
			writeSessionIntoContext(ctx, { tenantId, userId: req.userId });
		}

		return true;
	}
}
