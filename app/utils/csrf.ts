import { randomBytes, timingSafeEqual } from "crypto";

/**
 * Generates a CSRF (Cross-Site Request Forgery) token.
 *
 * CSRF tokens are used to prevent unauthorized requests from being made to a web application.
 * This function generates a 100-byte random string encoded in base64 format to be used as a CSRF token.
 *
 * @returns {string} A CSRF token.
 */
export function createCSRFToken(): string {
	// Generate 100 random bytes using the `randomBytes` function from the crypto module and
	// encode the random bytes in base64 format and return the result

	return randomBytes(100).toString("base64");
}

/**
 * Verifies a submitted CSRF token against the expected session token.
 * Fails closed whenever either token is missing, non-string, or empty.
 */
export function verifyCSRFToken(submitted: unknown, expected: unknown): boolean {
	if (
		typeof submitted !== "string" ||
		typeof expected !== "string" ||
		submitted.length === 0 ||
		expected.length === 0
	) {
		return false;
	}
	const submittedBuf = Buffer.from(submitted, "utf8");
	const expectedBuf = Buffer.from(expected, "utf8");
	if (submittedBuf.length !== expectedBuf.length) {
		return false;
	}
	return timingSafeEqual(submittedBuf, expectedBuf);
}
