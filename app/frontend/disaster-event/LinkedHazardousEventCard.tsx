import type { ReactNode } from "react";
import { ViewContext } from "~/frontend/context";

type LinkedHazardousEventCardItem = {
	id: string;
	name: string;
	code: string;
	hip?: string;
	dateLabel?: string;
	divisionNamesLabel?: string;
};

type LinkedHazardousEventCardProps = {
	item: LinkedHazardousEventCardItem;
	leading?: ReactNode;
	trailing?: ReactNode;
	className?: string;
	showHip?: boolean;
	showDate?: boolean;
	showDivision?: boolean;
};

export default function LinkedHazardousEventCard({
	item,
	leading,
	trailing,
	className = "",
	showHip = true,
	showDate = true,
	showDivision = true,
}: LinkedHazardousEventCardProps) {
	const ctx = new ViewContext();

	return (
		<div
			className={`flex items-start justify-between rounded-lg border border-slate-200 px-4 py-3 ${className}`.trim()}
		>
			<div className="flex w-full items-start gap-3">
				{leading ? <div>{leading}</div> : null}
				<div>
					<p className="text-[14px] font-semibold text-slate-700">{item.name}</p>
					<p>
						{ctx.t({ code: "common.uuid", msg: "UUID" })}: {item.code.substring(0, 8)}
					</p>
					{showHip && item.hip ? (
						<p className="mt-1 text-[12px] text-slate-500">{item.hip}</p>
					) : null}
					{showDate ? (
						<p>
							{ctx.t({ code: "common.date", msg: "Date" })}: {item.dateLabel || "-"}
						</p>
					) : null}
					{showDivision ? (
						<p>
							{ctx.t({
								code: "spatial_footprint.geographic_level",
								msg: "Geographic level",
							})}
							: {item.divisionNamesLabel || "-"}
						</p>
					) : null}
				</div>
			</div>
			{trailing ? <div className="ml-3">{trailing}</div> : null}
		</div>
	);
}
