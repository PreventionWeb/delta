import { SelectApiKey } from "~/drizzle/schema/apiKeyTable";
import { ApiKeyRepository } from "~/db/queries/apiKeyRepository";
import { CountryAccountsRepository } from "~/db/queries/countryAccountsRepository";
import { countryAccountStatuses } from "~/drizzle/schema/countryAccountsTable";

// Used by frontend/api_key.tsx
export interface UserCentricApiKeyFields extends Omit<
	SelectApiKey,
	"id" | "secret" | "createdAt" | "updatedAt"
> {
	assignedToUserId?: string;
}

// Used by frontend/api_key.tsx
export type ApiKeyViewModel = NonNullable<
	Awaited<ReturnType<typeof ApiKeyRepository.getById>>
>;

export async function apiAuth(request: Request): Promise<SelectApiKey> {
	const authToken = request.headers.get("X-Auth")?.trim();

	if (!authToken) {
		throw new Response("Unauthorized", { status: 401 });
	}
	const keys = await ApiKeyRepository.getBySecret(authToken);

	if (!keys || keys.length === 0 || !keys[0]) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const key = keys[0];
	if (key.countryAccountsId) {
		const countryAccount = await CountryAccountsRepository.getById(
			key.countryAccountsId,
		);
		if (
			!countryAccount ||
			countryAccount.status !== countryAccountStatuses.ACTIVE
		) {
			throw new Response("Forbidden", { status: 403 });
		}
	}

	return key;
}
