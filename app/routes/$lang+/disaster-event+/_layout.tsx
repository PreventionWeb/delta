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
                    viewMyRecords: false,
                    pendingMyAction: false,
                },
            };
        }

        const disasterEventName =
            url.searchParams.get("disasterEventName")?.trim() || "";
        const recordingOrganization =
            url.searchParams.get("recordingOrganization")?.trim() || "";
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
                    createdByUserId: viewMyRecords ? userId : undefined,
                    pendingMyAction:
                        pendingMyAction && userId ? { userId } : undefined,
                },
            );

        return {
            showListing,
            ...result,
            countryName: country.name,
            filters: {
                disasterEventName,
                recordingOrganization,
                viewMyRecords,
                pendingMyAction,
            },
        };
    },
);

export default function DisasterEventLayoutRoute() {
    const { showListing, items, pagination, countryName, filters } =
        useLoaderData<typeof loader>();

    if (!showListing) {
        return <Outlet />;
    }

    return (
        <>
            <DisasterEventsPage
                data={items}
                pagination={pagination}
                countryName={countryName}
                filters={filters}
            />
            <Outlet />
        </>
    );
}
