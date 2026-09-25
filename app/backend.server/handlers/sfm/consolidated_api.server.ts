import { apiAuth } from "~/backend.server/models/api_key";
import {
	getConsolidatedCountIndicator,
	SupportedIndicator,
} from "~/backend.server/services/sfm/consolidated.server";

function emptyLegacyResponse(reason: string, debugEnabled: boolean): Response {
	if (!debugEnabled) {
		return new Response(null, { status: 200 });
	}

	return new Response(null, {
		status: 200,
		headers: {
			"X-DIX-Legacy-Empty": "1",
			"X-DIX-Legacy-Reason": reason,
		},
	});
}

function bearerTokenFromAuthorizationHeader(
	authorizationHeader: string | null,
): string | null {
	if (!authorizationHeader) return null;
	const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
	if (scheme?.toLowerCase() !== "bearer") return null;
	if (!token) return null;
	return token;
}

async function apiAuthSupportingBearer(request: Request) {
	const fromXAuth = request.headers.get("X-Auth");
	if (fromXAuth) {
		return apiAuth(request);
	}

	const fromBearer = bearerTokenFromAuthorizationHeader(
		request.headers.get("Authorization"),
	);
	if (!fromBearer) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const headers = new Headers(request.headers);
	headers.set("X-Auth", fromBearer);
	const requestWithXAuth = new Request(request.url, {
		method: request.method,
		headers,
	});
	return apiAuth(requestWithXAuth);
}

export async function handleConsolidatedRequest(request: Request): Promise<Response> {
	const apiKey = await apiAuthSupportingBearer(request);
	const countryAccountsId = apiKey.countryAccountsId;
	if (!countryAccountsId) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const url = new URL(request.url);
	const debugEnabled =
		process.env.NODE_ENV !== "production" &&
		(url.searchParams.get("debug") === "1" ||
			request.headers.get("X-DIX-Debug") === "1");
	const country = url.searchParams.get("country") ?? "";
	const year = url.searchParams.get("year") ?? "";
	const indicator = url.searchParams.get("indicator") ?? "";
	const supportedIndicators = [
		"a2a",
		"a3a",
		"b2",
		"b3",
		"b3a",
		"b4",
		"b4a",
		"b5",
		"c4",
		"c5a",
		"c5b",
		"c5c",
		"d6",
		"d7",
		"d8",
	] as const;

	if (!country || !year || !indicator) {
		return emptyLegacyResponse("missing_required_params", debugEnabled);
	}
	if (!/^[a-z]{3}$/.test(country) || !/^\d{4}$/.test(year)) {
		return emptyLegacyResponse("invalid_param_format", debugEnabled);
	}
	if (
		!supportedIndicators.includes(
			indicator as (typeof supportedIndicators)[number],
		)
	) {
		return emptyLegacyResponse("unsupported_indicator", debugEnabled);
	}

	const data = await getConsolidatedCountIndicator({
		country,
		year,
		indicator: indicator as SupportedIndicator,
		countryAccountsId,
	});

	if (!data) {
		return emptyLegacyResponse("country_tenant_mismatch_or_no_data", debugEnabled);
	}

	if (debugEnabled) {
		const headers = new Headers({
			"X-DIX-Legacy-Debug": "1",
			"X-DIX-Legacy-Path": "json_payload",
			"Content-Type": "application/json",
		});
		return new Response(JSON.stringify(data), {
			status: 200,
			headers,
		});
	}

	return Response.json(data);
}
