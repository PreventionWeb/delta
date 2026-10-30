import "reflect-metadata";

import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { createRequestHandler } from "@react-router/express";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";

import { mountOpenApiDocs } from "./app/init.server";
import { CoreModule } from "./app/infrastructure/CoreModule.server";
import { API_GLOBAL_PREFIX } from "./app/shared/openApiDocsPath";
import { pathToFileURL } from "node:url";

export async function createUnifiedServer() {
	process.env.API_HTTP_SERVER_ENABLED = "false";
	const isProduction = process.env.NODE_ENV === "production";
	const app = express();
	app.disable("x-powered-by");

	let viteDevServer: import("vite").ViteDevServer | undefined;
	if (!isProduction) {
		const { createServer } = await import("vite");
		const vite = await createServer({
			server: { middlewareMode: true },
			appType: "custom",
		});
		viteDevServer = vite;
		app.use(
			vite.middlewares as unknown as (
				req: Request,
				res: Response,
				next: NextFunction,
			) => unknown,
		);
	}

	app.get("/healthz", (_req: Request, res: Response) => {
		res.status(200).json({ ok: true, status: "healthy" });
	});

	app.get("/readyz", (_req: Request, res: Response) => {
		res.status(200).json({ ok: true, status: "ready" });
	});

	const reactHandler = createRequestHandler({
		build: (isProduction
			? () => import("./build/server/index.js")
			: () =>
					viteDevServer!.ssrLoadModule(
						"virtual:react-router/server-build",
					)) as any,
		mode: isProduction ? "production" : "development",
	});

	app.use((req: Request, res: Response, next: NextFunction) => {
		if (req.path === "/api" || req.path.startsWith("/api/")) {
			return next();
		}

		return reactHandler(req, res, next);
	});

	const adapter = new ExpressAdapter(app);
	const nestApp = await NestFactory.create(CoreModule, adapter, {
		logger: false,
	});
	nestApp.setGlobalPrefix(API_GLOBAL_PREFIX);
	mountOpenApiDocs(nestApp);
	await nestApp.init();

	return {
		app,
		nestApp,
		port: Number(process.env.PORT ?? 3000),
	};
}

async function startServer() {
	const { app, port } = await createUnifiedServer();
	app.listen(port, "0.0.0.0", () => {
		console.info({ msg: "Unified DELTA server listening", port });
	});
}

const isDirectExecution =
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
	void startServer();
}
