/**
 * Express middleware that opens exactly one `withRequestContext` ALS scope for the whole
 * downstream chain — guards included, since NestJS guards run inside the Express middleware's
 * downstream chain, not before it. Extracted out of `NoticesModule.server.ts` so any future
 * NestJS module needing the same request-scoping can reuse it (design.md Decision 2 of the
 * notices-rest-controller change).
 */
import { Injectable } from "@nestjs/common";

import { withRequestContext } from "~/utils/requestContext.server";

@Injectable()
export class RequestContextMiddleware {
	use(
		_req: unknown,
		res: { on(event: "finish", cb: () => void): void },
		next: () => void,
	) {
		void withRequestContext(
			() =>
				new Promise<void>((resolve) => {
					next();
					res.on("finish", resolve);
				}),
			{ traceId: crypto.randomUUID() },
		);
	}
}
