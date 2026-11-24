import { describe, it, expect } from "vitest";
import en from "../../../../../locales/en/hazardous-events.json";
import fr from "../../../../../locales/fr/hazardous-events.json";

// Spec table, "The error state is localised in English and French".
const EXPECTED = {
	en: {
		"not_found.title": "Hazardous event not found",
		"not_found.body":
			"The record does not exist or you do not have access to it.",
		"forbidden.title": "Access denied",
		"forbidden.body": "You do not have permission to do this.",
		"invalid_request.title": "The request could not be processed",
		"invalid_request.body": "Check the information you entered and try again.",
		"conflict.title": "The record could not be saved",
		"conflict.body":
			"It changed or is linked to other records. Reload the page and try again.",
		"unexpected.title": "Something went wrong",
		"unexpected.body": "An unexpected error occurred. Please try again later.",
		"trace.label": "Error reference",
		"trace.copy": "Copy error reference",
		"trace.copied": "Error reference copied",
	},
	fr: {
		"not_found.title": "Événement dangereux introuvable",
		"not_found.body":
			"L'enregistrement n'existe pas ou vous n'y avez pas accès.",
		"forbidden.title": "Accès refusé",
		"forbidden.body":
			"Vous n'avez pas l'autorisation d'effectuer cette action.",
		"invalid_request.title": "La demande n'a pas pu être traitée",
		"invalid_request.body": "Vérifiez les informations saisies et réessayez.",
		"conflict.title": "L'enregistrement n'a pas pu être enregistré",
		"conflict.body":
			"Il a été modifié ou est lié à d'autres enregistrements. Rechargez la page et réessayez.",
		"unexpected.title": "Une erreur s'est produite",
		"unexpected.body":
			"Une erreur inattendue s'est produite. Veuillez réessayer plus tard.",
		"trace.label": "Référence de l'erreur",
		"trace.copy": "Copier la référence de l'erreur",
		"trace.copied": "Référence de l'erreur copiée",
	},
} as const;

function lookup(bundle: unknown, path: string): unknown {
	return path
		.split(".")
		.reduce<unknown>(
			(node, key) =>
				typeof node === "object" && node !== null
					? (node as Record<string, unknown>)[key]
					: undefined,
			bundle,
		);
}

describe("hazardous-events error.* locale keys", () => {
	it.each([
		["en", en],
		["fr", fr],
	] as const)("%s has every spec key with the spec text", (lang, bundle) => {
		for (const [key, text] of Object.entries(EXPECTED[lang])) {
			expect(lookup(bundle, `error.${key}`), key).toBe(text);
		}
	});

	it.each([
		["en", en],
		["fr", fr],
	] as const)("%s error.* copy has no em dash", (_lang, bundle) => {
		expect(JSON.stringify(lookup(bundle, "error"))).not.toContain("—");
	});
});
