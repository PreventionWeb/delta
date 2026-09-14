// Shared seed helpers for the hazard-type field-definition/value schema tests
// (hazardTypeFieldDefinition.test.ts, hazardousEventFieldValue.test.ts).
import { randomUUID } from "crypto";
import { dr } from "~/db.server";
import { fieldDataTypeTable } from "~/domains/hazardous-events/infrastructure/fieldDataTypeTable";
import { fieldUnitTable } from "~/domains/hazardous-events/infrastructure/fieldUnitTable";
import { hazardTypeTable } from "../testSchema/hazardTypeTable";
import { hipsVersionTable } from "../testSchema/hipsVersionTable";
import { countryAccounts } from "../testSchema/countryAccounts";
import { countriesTable } from "../testSchema/countriesTable";

export async function seedHazardType() {
	const [hipsVersion] = await dr
		.insert(hipsVersionTable)
		.values({ versionNo: `HIPs ${randomUUID()}` })
		.returning();
	const [hazardType] = await dr
		.insert(hazardTypeTable)
		.values({
			name: `Hazard Type ${randomUUID()}`,
			hipsVersionId: hipsVersion.id,
		})
		.returning();
	return hazardType;
}

export async function seedCountryAccount() {
	const [country] = await dr
		.insert(countriesTable)
		.values({ name: `Country ${randomUUID()}` })
		.returning();
	const [account] = await dr
		.insert(countryAccounts)
		.values({ shortDescription: "Test", countryId: country.id })
		.returning();
	return account;
}

export async function seedFieldDataType() {
	const [row] = await dr
		.insert(fieldDataTypeTable)
		.values({ type: `type-${randomUUID()}` })
		.returning();
	return row;
}

export async function seedFieldUnit() {
	const [row] = await dr
		.insert(fieldUnitTable)
		.values({ unit: `unit-${randomUUID()}` })
		.returning();
	return row;
}

export async function seedFieldDefinitionDeps() {
	const [hazardType, dataType, unit] = await Promise.all([
		seedHazardType(),
		seedFieldDataType(),
		seedFieldUnit(),
	]);
	return { hazardType, dataType, unit };
}
