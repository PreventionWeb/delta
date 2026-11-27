import {
	createPublicKey,
	timingSafeEqual,
	verify as cryptoVerify,
	type JsonWebKeyInput,
} from "crypto";
import { configSsoAzureB2C } from "~/utils/config";
import { proxiedFetch } from "~/utils/proxied-fetch";

export type JwkKey = JsonWebKeyInput["key"] & {
	kid?: string;
	use?: string;
	alg?: string;
};

export interface VerifiedIdTokenClaims {
	iss: string;
	aud: string | string[];
	exp: number;
	nbf?: number;
	nonce?: string;
	sub?: string;
	idp?: string;
	emails?: string[] | string;
	given_name?: string;
	family_name?: string;
	idp_access_token?: string;
	[key: string]: unknown;
}

interface JwtHeader {
	alg?: string;
	kid?: string;
	typ?: string;
}

interface JwksResponse {
	keys: JwkKey[];
}

interface OidcMetadataCacheEntry {
	issuer: string;
	jwksUri: string;
	keys: JwkKey[];
	fetchedAt: number;
}

const ALLOWED_RSA_ALGS: Record<string, string> = {
	RS256: "RSA-SHA256",
	RS384: "RSA-SHA384",
	RS512: "RSA-SHA512",
};

const JWKS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const JWKS_MIN_REFRESH_INTERVAL_MS = 30 * 1000; // 30 seconds
const DEFAULT_CLOCK_TOLERANCE_SECONDS = 60;

const metadataCache = new Map<string, OidcMetadataCacheEntry>();

export function clearSsoJwksCache(): void {
	metadataCache.clear();
}

function decodeBase64UrlJson<T>(segment: string): T {
	const jsonStr = Buffer.from(segment, "base64url").toString("utf8");
	return JSON.parse(jsonStr) as T;
}

function constantTimeEquals(a: string, b: string): boolean {
	const bufA = Buffer.from(a, "utf8");
	const bufB = Buffer.from(b, "utf8");
	if (bufA.length !== bufB.length) {
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}

async function fetchOidcMetadataAndJwks(
	tenant: string,
	userflow: string,
	forceRefresh = false,
): Promise<OidcMetadataCacheEntry> {
	const cacheKey = `${tenant}:${userflow}`;
	const now = Date.now();
	const cached = metadataCache.get(cacheKey);

	if (cached) {
		const age = now - cached.fetchedAt;
		if (!forceRefresh && age < JWKS_CACHE_TTL_MS) {
			return cached;
		}
		if (forceRefresh && age < JWKS_MIN_REFRESH_INTERVAL_MS) {
			return cached;
		}
	}

	const discoveryUrl = `https://${encodeURIComponent(tenant)}.b2clogin.com/${encodeURIComponent(tenant)}.onmicrosoft.com/${encodeURIComponent(userflow)}/v2.0/.well-known/openid-configuration`;
	const discoveryRes = await proxiedFetch(discoveryUrl);
	if (!discoveryRes.ok) {
		throw new Error(
			`Failed to fetch Azure B2C OIDC discovery metadata (status ${discoveryRes.status})`,
		);
	}

	const discoveryJson = (await discoveryRes.json()) as {
		issuer?: string;
		jwks_uri?: string;
	};
	if (!discoveryJson.issuer || !discoveryJson.jwks_uri) {
		throw new Error("Invalid Azure B2C OIDC discovery metadata");
	}

	const expectedHost = `${tenant}.b2clogin.com`.toLowerCase();
	const parsedJwksUri = new URL(discoveryJson.jwks_uri);
	if (
		parsedJwksUri.protocol !== "https:" ||
		parsedJwksUri.hostname.toLowerCase() !== expectedHost
	) {
		throw new Error("Untrusted JWKS URI in Azure B2C OIDC metadata");
	}

	const jwksRes = await proxiedFetch(discoveryJson.jwks_uri);
	if (!jwksRes.ok) {
		throw new Error(
			`Failed to fetch Azure B2C JWKS (status ${jwksRes.status})`,
		);
	}

	const jwksJson = (await jwksRes.json()) as JwksResponse;
	if (!Array.isArray(jwksJson.keys) || jwksJson.keys.length === 0) {
		throw new Error("Azure B2C JWKS response contained no keys");
	}

	const entry: OidcMetadataCacheEntry = {
		issuer: discoveryJson.issuer,
		jwksUri: discoveryJson.jwks_uri,
		keys: jwksJson.keys,
		fetchedAt: now,
	};
	metadataCache.set(cacheKey, entry);
	return entry;
}

export interface VerifyJwtOptions {
	expectedIssuer: string;
	expectedAudience: string;
	expectedNonce: string;
	jwks: JwkKey[];
	nowSeconds?: number;
	clockToleranceSeconds?: number;
}

/**
 * Verifies a compact JWS ID token (header.payload.signature) using Node's native crypto
 * against a provided JWKS set, enforcing algorithm allowlist, signature, issuer, audience,
 * expiration, not-before, and cryptographic nonce.
 */
export function verifyJwtWithJwks(
	token: string,
	options: VerifyJwtOptions,
): VerifiedIdTokenClaims {
	if (!token || typeof token !== "string") {
		throw new Error("ID token is required");
	}

	const parts = token.split(".");
	if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
		throw new Error("Malformed JWT");
	}

	const [headerSegment, payloadSegment, signatureSegment] = parts;
	let header: JwtHeader;
	let payload: VerifiedIdTokenClaims;
	try {
		header = decodeBase64UrlJson<JwtHeader>(headerSegment);
		payload = decodeBase64UrlJson<VerifiedIdTokenClaims>(payloadSegment);
	} catch {
		throw new Error("Malformed JWT encoding");
	}

	if (!header.alg || !(header.alg in ALLOWED_RSA_ALGS)) {
		throw new Error(`Unsupported JWT algorithm: ${String(header.alg)}`);
	}
	const nodeAlg = ALLOWED_RSA_ALGS[header.alg];

	const matchingKey = header.kid
		? options.jwks.find((k) => k.kid === header.kid)
		: options.jwks.length === 1
			? options.jwks[0]
			: undefined;

	if (!matchingKey) {
		throw new Error("No matching JWKS key found for token kid");
	}

	const publicKey = createPublicKey({ key: matchingKey, format: "jwk" });
	const signingInput = Buffer.from(
		`${headerSegment}.${payloadSegment}`,
		"utf8",
	);
	const signatureBytes = Buffer.from(signatureSegment, "base64url");

	const validSignature = cryptoVerify(
		nodeAlg,
		signingInput,
		publicKey,
		signatureBytes,
	);
	if (!validSignature) {
		throw new Error("Invalid JWT signature");
	}

	const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
	const clockTolerance =
		options.clockToleranceSeconds ?? DEFAULT_CLOCK_TOLERANCE_SECONDS;

	if (
		typeof payload.iss !== "string" ||
		payload.iss !== options.expectedIssuer
	) {
		throw new Error("Invalid JWT issuer");
	}

	const audMatches = Array.isArray(payload.aud)
		? payload.aud.includes(options.expectedAudience)
		: payload.aud === options.expectedAudience;
	if (!audMatches) {
		throw new Error("Invalid JWT audience");
	}

	if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
		throw new Error("Missing JWT expiration");
	}
	if (nowSeconds >= payload.exp + clockTolerance) {
		throw new Error("JWT has expired");
	}

	if (payload.nbf !== undefined) {
		if (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf)) {
			throw new Error("Invalid JWT nbf claim");
		}
		if (nowSeconds + clockTolerance < payload.nbf) {
			throw new Error("JWT is not yet valid");
		}
	}

	if (
		!options.expectedNonce ||
		typeof payload.nonce !== "string" ||
		!constantTimeEquals(payload.nonce, options.expectedNonce)
	) {
		throw new Error("Invalid JWT nonce");
	}

	return payload;
}

/**
 * Verifies an Azure B2C ID token against the configured tenant's OIDC JWKS endpoint.
 * Automatically refreshes cached JWKS once if a key rotation introduces an unseen `kid`.
 */
export async function verifyAzureB2CIdToken(
	idToken: string,
	expectedNonce: string,
): Promise<VerifiedIdTokenClaims> {
	const cfg = configSsoAzureB2C();
	if (!cfg.tenant || !cfg.login_userflow || !cfg.client_id) {
		throw new Error("Azure B2C SSO configuration is incomplete");
	}

	let metadata = await fetchOidcMetadataAndJwks(
		cfg.tenant,
		cfg.login_userflow,
		false,
	);

	try {
		return verifyJwtWithJwks(idToken, {
			expectedIssuer: metadata.issuer,
			expectedAudience: cfg.client_id,
			expectedNonce,
			jwks: metadata.keys,
		});
	} catch (err) {
		if (
			err instanceof Error &&
			err.message === "No matching JWKS key found for token kid"
		) {
			metadata = await fetchOidcMetadataAndJwks(
				cfg.tenant,
				cfg.login_userflow,
				true,
			);
			return verifyJwtWithJwks(idToken, {
				expectedIssuer: metadata.issuer,
				expectedAudience: cfg.client_id,
				expectedNonce,
				jwks: metadata.keys,
			});
		}
		throw err;
	}
}
