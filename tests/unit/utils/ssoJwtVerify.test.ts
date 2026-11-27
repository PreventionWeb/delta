import {
	generateKeyPairSync,
	sign as cryptoSign,
	type KeyObject,
} from "crypto";
import { describe, it, expect } from "vitest";
import { verifyJwtWithJwks, type JwkKey } from "~/utils/ssoJwtVerify.server";
import {
	getSafeSsoRedirectPath,
	verifySsoStateNonce,
} from "~/utils/ssoauzeb2c";

function signTestJwt(
	header: Record<string, unknown>,
	payload: Record<string, unknown>,
	privateKey: KeyObject,
	nodeAlg = "RSA-SHA256",
): string {
	const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
	const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, "utf8");
	const sig = cryptoSign(nodeAlg, signingInput, privateKey).toString(
		"base64url",
	);
	return `${headerB64}.${payloadB64}.${sig}`;
}

describe("Azure B2C JWT JWKS verification and OAuth state helpers", () => {
	const { publicKey, privateKey } = generateKeyPairSync("rsa", {
		modulusLength: 2048,
	});
	const jwk: JwkKey = {
		...publicKey.export({ format: "jwk" }),
		kid: "test-kid-1",
		use: "sig",
		alg: "RS256",
	};

	const now = Math.floor(Date.now() / 1000);
	const baseClaims = {
		iss: "https://example.b2clogin.com/tenant-guid/v2.0/",
		aud: "client-id-123",
		exp: now + 300,
		nbf: now - 10,
		nonce: "expected-nonce-xyz",
		emails: ["user@example.com"],
	};

	it("verifies a validly signed RS256 ID token with matching claims", () => {
		const token = signTestJwt(
			{ alg: "RS256", kid: "test-kid-1", typ: "JWT" },
			baseClaims,
			privateKey,
		);
		const verified = verifyJwtWithJwks(token, {
			expectedIssuer: baseClaims.iss,
			expectedAudience: baseClaims.aud,
			expectedNonce: baseClaims.nonce,
			jwks: [jwk],
			nowSeconds: now,
		});
		expect(verified.emails).toEqual(["user@example.com"]);
	});

	it("rejects alg=none unsigned tokens", () => {
		const headerB64 = Buffer.from(
			JSON.stringify({ alg: "none", kid: "test-kid-1" }),
		).toString("base64url");
		const payloadB64 = Buffer.from(JSON.stringify(baseClaims)).toString(
			"base64url",
		);
		const forged = `${headerB64}.${payloadB64}.fakesig`;

		expect(() =>
			verifyJwtWithJwks(forged, {
				expectedIssuer: baseClaims.iss,
				expectedAudience: baseClaims.aud,
				expectedNonce: baseClaims.nonce,
				jwks: [jwk],
				nowSeconds: now,
			}),
		).toThrow(/Unsupported JWT algorithm/);
	});

	it("rejects tokens with tampered payloads (invalid signature)", () => {
		const token = signTestJwt(
			{ alg: "RS256", kid: "test-kid-1" },
			baseClaims,
			privateKey,
		);
		const parts = token.split(".");
		const tamperedPayload = Buffer.from(
			JSON.stringify({ ...baseClaims, emails: ["admin@example.com"] }),
		).toString("base64url");
		const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

		expect(() =>
			verifyJwtWithJwks(tampered, {
				expectedIssuer: baseClaims.iss,
				expectedAudience: baseClaims.aud,
				expectedNonce: baseClaims.nonce,
				jwks: [jwk],
				nowSeconds: now,
			}),
		).toThrow(/Invalid JWT signature/);
	});

	it("rejects wrong issuer, wrong audience, expired exp, and mismatched nonce", () => {
		const wrongIss = signTestJwt(
			{ alg: "RS256", kid: "test-kid-1" },
			{ ...baseClaims, iss: "https://evil.example.com/" },
			privateKey,
		);
		expect(() =>
			verifyJwtWithJwks(wrongIss, {
				expectedIssuer: baseClaims.iss,
				expectedAudience: baseClaims.aud,
				expectedNonce: baseClaims.nonce,
				jwks: [jwk],
				nowSeconds: now,
			}),
		).toThrow(/Invalid JWT issuer/);

		const wrongAud = signTestJwt(
			{ alg: "RS256", kid: "test-kid-1" },
			{ ...baseClaims, aud: "other-client" },
			privateKey,
		);
		expect(() =>
			verifyJwtWithJwks(wrongAud, {
				expectedIssuer: baseClaims.iss,
				expectedAudience: baseClaims.aud,
				expectedNonce: baseClaims.nonce,
				jwks: [jwk],
				nowSeconds: now,
			}),
		).toThrow(/Invalid JWT audience/);

		const expired = signTestJwt(
			{ alg: "RS256", kid: "test-kid-1" },
			{ ...baseClaims, exp: now - 120 },
			privateKey,
		);
		expect(() =>
			verifyJwtWithJwks(expired, {
				expectedIssuer: baseClaims.iss,
				expectedAudience: baseClaims.aud,
				expectedNonce: baseClaims.nonce,
				jwks: [jwk],
				nowSeconds: now,
			}),
		).toThrow(/expired/);

		const wrongNonce = signTestJwt(
			{ alg: "RS256", kid: "test-kid-1" },
			{ ...baseClaims, nonce: "different-nonce" },
			privateKey,
		);
		expect(() =>
			verifyJwtWithJwks(wrongNonce, {
				expectedIssuer: baseClaims.iss,
				expectedAudience: baseClaims.aud,
				expectedNonce: baseClaims.nonce,
				jwks: [jwk],
				nowSeconds: now,
			}),
		).toThrow(/Invalid JWT nonce/);
	});

	it("validates state nonces and blocks protocol-relative open redirects", () => {
		expect(verifySsoStateNonce("abc123", "abc123")).toBe(true);
		expect(verifySsoStateNonce("abc123", "abc124")).toBe(false);
		expect(verifySsoStateNonce(undefined, "abc123")).toBe(false);

		expect(
			getSafeSsoRedirectPath("//evil.com/phish", "/admin/country-accounts"),
		).toBe("/admin/country-accounts");
		expect(
			getSafeSsoRedirectPath("/\\evil.com", "/admin/country-accounts"),
		).toBe("/admin/country-accounts");
		expect(
			getSafeSsoRedirectPath("https://evil.com", "/admin/country-accounts"),
		).toBe("/admin/country-accounts");
		expect(
			getSafeSsoRedirectPath(
				"/admin/country-accounts",
				"/admin/country-accounts",
			),
		).toBe("/admin/country-accounts");
	});
});
