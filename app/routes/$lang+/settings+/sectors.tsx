import { sql } from "drizzle-orm";
import { type MetaFunction, useLoaderData } from "react-router";
import { BackendContext } from "~/backend.server/context";
import { dr } from "~/db.server";
import { sectorTable } from "~/drizzle/schema/sectorTable";
import { ViewContext } from "~/frontend/context";
import type { SectorRow } from "~/frontend/sectorsTree";
import SectorsPage from "~/pages/SectorsPage";
import { authLoaderWithPerm } from "~/utils/auth";
import { htmlTitle } from "~/utils/htmlmeta";

export const handle = { useDesignSystemCanvas: true };

export const meta: MetaFunction = ({ params }) => {
	const ctx = new ViewContext({ lang: params.lang || "en" });

	return [
		{
			title: htmlTitle(
				ctx,
				ctx.t({
					code: "nav.analysis.sectors",
					msg: "Sectors",
				}),
			),
		},
		{
			name: "description",
			content: ctx.t({
				code: "settings.sectors.subtitle",
				msg: "The sectors used to classify losses and damages. The list is the same for every country and cannot be changed here.",
			}),
		},
	];
};

export const loader = authLoaderWithPerm(
	"ManageSectorSettings",
	async (loaderArgs) => {
		const ctx = new BackendContext(loaderArgs);

		const sectors: SectorRow[] = await dr
			.select({
				id: sectorTable.id,
				name: sql<string>`dts_jsonb_localized(${sectorTable.name}, ${ctx.lang})`.as(
					"name",
				),
				description: sql<
					string | null
				>`dts_jsonb_localized(${sectorTable.description}, ${ctx.lang})`.as(
					"description",
				),
				level: sectorTable.level,
				parentId: sectorTable.parentId,
			})
			.from(sectorTable)
			.orderBy(sql`name`, sectorTable.id);

		return {
			sectors,
			lang: ctx.lang,
		};
	},
);

export default function SettingsSectorsRoute() {
	const { sectors, lang } = useLoaderData<typeof loader>();
	return <SectorsPage sectors={sectors} lang={lang} />;
}
