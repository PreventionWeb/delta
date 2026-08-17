import { authLoaderWithPerm } from "~/utils/auth";
import { MainContainer } from "~/frontend/container";
import { ViewContext } from "~/frontend/context";

export const loader = authLoaderWithPerm("ViewApiDocs", async () => {
	return {};
});

export default function Screen() {
	const ctx = new ViewContext();
	const sections = [
		{
			title: "Top level records",
			items: [
				{ label: "Disaster events", href: "/api/disaster-event" },
				{ label: "Hazardous events", href: "/api/hazardous-event" },
				{ label: "Disaster records", href: "/api/disaster-record" },
			],
		},
		{
			title: "Disaster record data",
			items: [
				{
					label: "Sector Disaster Record Relation",
					href: "/api/sector-disaster-record-relation",
				},
				{ label: "Damages", href: "/api/damage" },
				{ label: "Disruptions", href: "/api/disruption" },
				{ label: "Human effects", href: "/api/human-effects" },
				{ label: "Losses", href: "/api/losses" },
				{ label: "Non Economic Losses", href: "/api/nonecolosses" },
			],
		},
		{
			title: "Reference data",
			items: [
				{ label: "Assets", href: "/api/asset" },
				{ label: "HIPS", href: "/api/hips" },
				{ label: "Geographic division", href: "/api/division" },
				{ label: "Sector", href: "/api/sector" },
			],
		},
	];

	return (
		<MainContainer title="API Endpoints">
			<div className="space-y-8 pb-10">
				<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
					<p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
						Data access
					</p>
					<h2 className="mt-3 text-2xl font-semibold text-slate-900">
						Import and export endpoints
					</h2>
					<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
						Use these API endpoints to access the data model, upload records,
						and extract structured information for downstream systems.
					</p>
				</div>

				<div className="grid gap-6 lg:grid-cols-3">
					{sections.map((section) => (
						<section
							key={section.title}
							className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
						>
							<div className="mb-4 border-b border-slate-200 pb-3">
								<h3 className="text-base font-semibold text-slate-900">
									{section.title}
								</h3>
							</div>
							<ul className="space-y-2.5">
								{section.items.map((item) => (
									<li key={item.label}>
										<a
											href={ctx.url(item.href)}
											className="group flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
										>
											<span>{item.label}</span>
											<span className="text-slate-400 transition group-hover:text-sky-700">
												→
											</span>
										</a>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>

				<div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
					<h3 className="text-base font-semibold text-slate-900">
						Other internal APIs and WIP
					</h3>
					<ul className="mt-4 grid gap-2 sm:grid-cols-2">
						<li>
							<a
								href={ctx.url("/api/analytics")}
								className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:text-sky-800"
							>
								Analytics
							</a>
						</li>
						<li>
							<a
								href={ctx.url("/api/qrcode")}
								className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:text-sky-800"
							>
								QR Code
							</a>
						</li>
					</ul>
				</div>
			</div>
		</MainContainer>
	);
}
