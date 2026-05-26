import { Outlet, useLoaderData } from "react-router";
import { DisasterEventRepository } from "~/db/queries/disasterEventRepository";
import DisasterEventsPage from "~/frontend/disaster-event/DisasterEventsPage";
import { authLoaderWithPerm } from "~/utils/auth";
import {
    getCountryAccountsIdFromSession,
    getUserIdFromSession,
} from "~/utils/session";
import { paginationQueryFromURL } from "~/frontend/pagination/api.server";
import { CountryRepository } from "~/db/queries/countriesRepository";
import { CountryAccountsRepository } from "~/db/queries/countryAccountsRepository";
import { HipClassRepository } from "~/db/queries/hipClassRepository";
import { HipClusterRepository } from "~/db/queries/hipClusterRepository";
import { HipHazardRepository } from "~/db/queries/hipHazardRepository";

function shouldShowListingBackground(pathname: string): boolean {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
        return false;
    }

    // /:lang/disaster-event
    if (segments.length === 2 && segments[1] === "disaster-event") {
        return true;
    }

    // /:lang/disaster-event/delete/:id
    if (
        segments[1] === "disaster-event" &&
        segments[2] === "delete" &&
        segments.length >= 4
    ) {
        return true;
    }

    return false;
}

export const loader = authLoaderWithPerm(
    "ViewDisasterEvents",
    async ({ request }) => {
        const url = new URL(request.url);
        const showListing = shouldShowListingBackground(url.pathname);
        if (!showListing) {
            return {
                showListing,
                items: [],
                hipTypes: [] as Array<{ id: string; name: string }>,
                hipClusters: [] as Array<{ id: string; typeId: string; name: string }>,
                hipHazards: [] as Array<{
                    id: string;
                    clusterId: string;
                    code: string;
                    name: string;
                }>,
                pagination: {
                    totalItems: 0,
                    itemsOnThisPage: 0,
                    page: 1,
                    pageSize: 25,
                },
                countryName: "",
                filters: {
                    disasterEventName: "",
                    recordingOrganization: "",
                    recordStatus: "",
                    hazardType: "",
                    hazardCluster: "",
                    specificHazard: "",
                    viewMyRecords: false,
                    pendingMyAction: false,
                },
            };
        }

        const disasterEventName =
            url.searchParams.get("disasterEventName")?.trim() || "";
        const recordingOrganization =
            url.searchParams.get("recordingOrganization")?.trim() || "";
        const recordStatus = url.searchParams.get("recordStatus")?.trim() || "";
        const hazardType = url.searchParams.get("hazardType")?.trim() || "";
        const hazardCluster =
            url.searchParams.get("hazardCluster")?.trim() || "";
        const specificHazard =
            url.searchParams.get("specificHazard")?.trim() || "";
        const viewMyRecords = url.searchParams.get("viewMyRecords") === "true";
        const pendingMyAction =
            url.searchParams.get("pendingMyAction") === "true";

        const countryAccountsId = await getCountryAccountsIdFromSession(request);
        if (!countryAccountsId) {
            throw new Response("Unauthorized", { status: 401 });
        }
        const countryAccounts = await CountryAccountsRepository.getById(
            countryAccountsId,
        );
        if (!countryAccounts) {
            throw new Response("Country accounts not found", { status: 404 });
        }
        const country = await CountryRepository.getById(countryAccounts.countryId);
        if (!country) {
            throw new Response("Country not found", { status: 404 });
        }

        const { viewData } = paginationQueryFromURL(request, []);
        const userId = await getUserIdFromSession(request);

        const result =
            await DisasterEventRepository.getByCountryAccountsIdPaginated(
                countryAccountsId,
                viewData.page,
                viewData.pageSize,
                {
                    disasterEventName,
                    recordingOrganization,
                    recordStatus,
                    hazardType,
                    hazardCluster,
                    specificHazard,
                    createdByUserId: viewMyRecords ? userId : undefined,
                    pendingMyAction:
                        pendingMyAction && userId ? { userId } : undefined,
                },
            );

        const lang = url.pathname.split("/").filter(Boolean)[0] || "en";
        const hipTypesRaw = await HipClassRepository.getAll();
        const hipTypes: Array<{ id: string; name: string }> = hipTypesRaw.map(
            (hipType) => ({
                id: hipType.id,
                name: String(
                    hipType.name[lang] ||
                    hipType.name.en ||
                    Object.values(hipType.name)[0] ||
                    hipType.id,
                ),
            }),
        );

        const hipClustersRaw = await HipClusterRepository.getAll();
        const hipClusters: Array<{ id: string; typeId: string; name: string }> =
            hipClustersRaw.map((hipCluster) => ({
                id: hipCluster.id,
                typeId: hipCluster.typeId,
                name: String(
                    hipCluster.name[lang] ||
                    hipCluster.name.en ||
                    Object.values(hipCluster.name)[0] ||
                    hipCluster.id,
                ),
            }));

        const hipHazardsRaw = await HipHazardRepository.getAll();
        const hipHazards: Array<{
            id: string;
            clusterId: string;
            code: string;
            name: string;
        }> =
            hipHazardsRaw.map((hipHazard) => ({
                id: hipHazard.id,
                clusterId: hipHazard.clusterId,
                code: hipHazard.code,
                name: String(
                    hipHazard.name[lang] ||
                    hipHazard.name.en ||
                    Object.values(hipHazard.name)[0] ||
                    hipHazard.id,
                ),
            }));

        return {
            showListing,
            hipClusters,
            hipHazards,
            ...result,
            hipTypes,
            countryName: country.name,
            filters: {
                disasterEventName,
                recordingOrganization,
                recordStatus,
                hazardType,
                hazardCluster,
                specificHazard,
                viewMyRecords,
                pendingMyAction,
            },
        };
    },
);

export default function DisasterEventLayoutRoute() {
    const {
        showListing,
        items,
        hipTypes,
        hipClusters,
        hipHazards,
        pagination,
        countryName,
        filters,
    } =
        useLoaderData<typeof loader>();

    if (!showListing) {
        return <Outlet />;
    }

    return (
        <>
            <DisasterEventsPage
                data={items}
                hipTypes={hipTypes}
                hipClusters={hipClusters}
                hipHazards={hipHazards}
                pagination={pagination}
                countryName={countryName}
                filters={filters}
            />
            <Outlet />
        </>
    );
}
