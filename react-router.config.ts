import type { Config } from "@react-router/dev/config";

export default {
	future: {
		v8_middleware: true,
		v8_splitRouteModules: true,
		v8_viteEnvironmentApi: true,
		v8_passThroughRequests: false,
		v8_trailingSlashAwareDataRequests: false,
	},
} satisfies Config;
