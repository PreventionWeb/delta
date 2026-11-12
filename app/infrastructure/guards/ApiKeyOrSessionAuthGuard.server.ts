import {
	Inject,
	Injectable,
	type CanActivate,
	type ExecutionContext,
} from "@nestjs/common";
import { ApiKeyAuthGuard } from "./ApiKeyAuthGuard.server";
import { SessionAuthGuard } from "./SessionAuthGuard.server";
import type { AuthenticatedRequest } from "./AuthenticatedRequest";

/**
 * Composite NestJS guard implementing logical OR authentication.
 *
 * If the request carries an `X-Auth` header, it delegates to `ApiKeyAuthGuard`.
 * Otherwise, it delegates to `SessionAuthGuard` to verify the cookie session.
 */
@Injectable()
export class ApiKeyOrSessionAuthGuard implements CanActivate {
	constructor(
		@Inject(ApiKeyAuthGuard) private readonly apiKeyGuard: ApiKeyAuthGuard,
		@Inject(SessionAuthGuard) private readonly sessionGuard: SessionAuthGuard,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
		const apiKeyHeader = req.headers["x-auth"];

		if (apiKeyHeader !== undefined && apiKeyHeader.trim().length > 0) {
			return this.apiKeyGuard.canActivate(context);
		}

		return this.sessionGuard.canActivate(context);
	}
}
