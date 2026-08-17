import type { ReactNode } from "react";

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
	return (
		<div
			className={`flex items-start justify-between rounded-lg border border-slate-200 px-4 py-3 ${className}`.trim()}
		>
			<div className="flex w-full items-start gap-3">
				{leading ? <div>{leading}</div> : null}
				<div>
					<p className="text-[14px] font-semibold text-slate-700">{item.name}</p>
					<p>UUID: {item.code.substring(0, 8)}</p>
					{showHip && item.hip ? (
						<p className="mt-1 text-[12px] text-slate-500">{item.hip}</p>
					) : null}
					{showDate ? <p>Date: {item.dateLabel || "-"}</p> : null}
					{showDivision ? (
						<p>Division: {item.divisionNamesLabel || "-"}</p>
					) : null}
				</div>
			</div>
			{trailing ? <div className="ml-3">{trailing}</div> : null}
		</div>
	);
}
