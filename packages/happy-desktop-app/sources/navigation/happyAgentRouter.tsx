import {
    createRootRouteWithContext,
    createRoute,
    createRouter,
    Outlet,
    redirect,
    useNavigate,
    useParams,
    useRouteContext,
    useRouter,
} from "@tanstack/react-router";
import { happyAgentHistoryCreate, type HappyAgentRouterHistory } from "./happyAgentHistory";
import { happyAgentRoutePathParse } from "./happyAgentRoute";
import type {
    AppearanceStore,
    CommandPaletteStore,
    ExperimentsStore,
    HappyAgentGroupId,
    HappyAgentFileTabKind,
    HappyAgentNavigationOrderStore,
    HappyAgentSidebarCollapseStore,
    HappyAgentSessionId,
    HappyAgentSessionLocation,
    HappyAgentSettingsStore,
    TitleShimmerStore,
    HappyAgentWindowStore,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import type {
    BrowserContentRenderer,
    HtmlPreviewRenderer,
    LivePerformanceStore,
    MediaWindowOpener,
} from "happy-desktop-ui";
import {
    AppHappyAgentView,
    type AppBuildIdentity,
    type AppHappyAgentDirectoryStore,
    type AppHappyAgentUpdate,
} from "../AppHappyAgentView";
import {
    AppHappyAgentSettingsView,
    HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY,
    happyAgentSettingsCategoryExists,
    type AppHappyAgentDaemonStore,
    type AppHappyAgentDebugStore,
    type AppHappyAgentProfilerStore,
} from "../views/AppHappyAgentSettingsView";

/**
 * Everything the local route tree needs that the URL does not address: the
 * directory of Happy Agents this window can work in — each carrying its own connection,
 * workspace, host, clock, and model catalog — the window's own preferences, and
 * the appearance selection. It is the local counterpart of `AppRouterContext`
 * and is supplied to `RouterProvider` once the directory exists, so the router
 * can be constructed before any Happy Agent connects.
 */
export interface HappyAgentRouterContext {
    /** Native Chromium guest renderer, present only in packaged Electron. */
    readonly browserContent?: BrowserContentRenderer;
    /** Renders one HTML workspace file as a page, in a host that has an engine. */
    readonly htmlPreview?: HtmlPreviewRenderer;
    /**
     * Shows one workspace picture or recording in a window outside this one.
     * Present only in a shell that has separate windows to open, which is
     * packaged Electron.
     */
    readonly mediaWindow?: MediaWindowOpener;
    readonly debug?: AppHappyAgentDebugStore;
    /** Live renderer diagnostics, present only in an explicitly debug-launched desktop window. */
    readonly performance?: LivePerformanceStore;
    readonly daemon?: AppHappyAgentDaemonStore;
    readonly profiler?: AppHappyAgentProfilerStore;
    readonly happyAgents: AppHappyAgentDirectoryStore;
    /** This build's development identity; absent in the packaged product. */
    readonly buildIdentity?: AppBuildIdentity;
    readonly appearance: AppearanceStore;
    /** The window's own local preferences: default model, effort, and permissions. */
    readonly settings: HappyAgentSettingsStore;
    /**
     * Where this window remembers the order the reader arranged the sidebar's
     * pinned rows in. Absent in a host that keeps no such record, which leaves
     * the rows in the order the window offers them.
     */
    readonly navigationOrder?: HappyAgentNavigationOrderStore;
    /**
     * Where this window remembers which sidebar rows the reader folded shut.
     * Absent in a host that keeps no such record, which leaves every row open.
     */
    readonly sidebarCollapse?: HappyAgentSidebarCollapseStore;
    /**
     * Whether this window offers the features that are not finished yet. Absent
     * in a host that remembers no such choice, which withholds them.
     */
    readonly experiments?: ExperimentsStore;
    /** Window-local preference for animated activity titles. */
    readonly titleShimmer?: TitleShimmerStore;
    /**
     * What the window's command palette is showing and asking. Absent in a host
     * that offers no palette, which leaves Command-K unbound.
     */
    readonly commandPalette?: CommandPaletteStore;
    /**
     * Which shell hosts this router. The Electron window has no native title bar,
     * so the workspace draws the traffic-light inset and drag lanes itself; the
     * browser development mode renders ordinary web chrome.
     */
    readonly platform?: "desktop" | "web";
    /**
     * The window's own chrome state. Full screen takes the native controls away,
     * so the inset the workspace reserves for them has to follow the window
     * rather than the platform.
     */
    readonly windowState?: HappyAgentWindowStore;
    /** Desktop-shell update state; absent when this route tree runs as plain web UI. */
    readonly update?: AppHappyAgentUpdate;
    readonly onUpdateApply?: () => void;
}

const rootRoute = createRootRouteWithContext<HappyAgentRouterContext>()({
    component: () => <Outlet />,
});

/**
 * The Happy Agent a bare address lands on: the first one in the window, which is the
 * machine this window runs on. The default is read rather than written down so
 * this file never names one Happy Agent as special.
 */
function happyAgentDefaultId(context: HappyAgentRouterContext | undefined): string {
    return context?.happyAgents?.get().happyAgents[0]?.id ?? "local";
}

/**
 * Redirects to one machine's list. The router helper's generic path type does not
 * retain this locally assembled tree, so `happyAgentRouterCreate` checks the path here.
 */
function happyAgentListRedirect(happyAgentId: string): never {
    throw redirect({ params: { happyAgentId }, replace: true, to: "/chats/$happyAgentId" });
}

/** The addressed Happy Agent's workspace store, absent while that Happy Agent is not connected. */
function happyAgentWorkspace(
    context: HappyAgentRouterContext,
    happyAgentId: string,
): HappyAgentWorkspaceStore | undefined {
    context.happyAgents.happyAgentActivate(happyAgentId);
    return context.happyAgents
        .get()
        .happyAgents.find((happyAgent) => happyAgent.id === happyAgentId)?.session?.workspace;
}

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    beforeLoad: ({ context }) => happyAgentListRedirect(happyAgentDefaultId(context)),
});

const chatsRootRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/chats",
    beforeLoad: ({ context }) => happyAgentListRedirect(happyAgentDefaultId(context)),
});

/**
 * The workspace layout is pathless so the shell, session list, and open
 * transcript keep one instance while the addressed machine and conversation
 * change underneath them.
 */
const workspaceRoute = createRoute({
    component: HappyAgentWorkspaceLayout,
    getParentRoute: () => rootRoute,
    id: "_workspace",
});

/**
 * Addressing one Happy Agent without a conversation releases whichever one was open in
 * it. Materialization is a store concern applied on navigation; the URL alone
 * says which Happy Agent and which conversation that is.
 */
const chatsIndexRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    loader: ({ context, params }) => {
        happyAgentWorkspace(context, params.happyAgentId)?.conversationClose();
    },
    path: "/chats/$happyAgentId",
});

/**
 * Addressing a project or worktree without one of its sessions: the group's tabs
 * are on screen but no session is open, so any previous one is released.
 */
const groupRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    loader: ({ context, params }) => {
        happyAgentWorkspace(context, params.happyAgentId)?.groupOpen(
            params.groupId as HappyAgentGroupId,
        );
    },
    path: "/chats/$happyAgentId/$groupId",
});

/** Addressing one session materializes it, releasing the previous one. */
const chatRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    loader: ({ context, params }) => {
        const groupId = params.groupId as HappyAgentGroupId;
        happyAgentWorkspace(context, params.happyAgentId)?.conversationOpen(
            params.chatId as HappyAgentSessionId,
            groupId,
        );
    },
    path: "/chats/$happyAgentId/$groupId/$chatId",
});

/** A file presentation carried explicitly by its durable address. */
function happyAgentFileTabKindParse(value: string): HappyAgentFileTabKind | undefined {
    return value === "file" || value === "diff" || value === "media" || value === "document"
        ? value
        : undefined;
}

/** A file opened over an empty workspace, with no session behind it. */
const groupFileRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    loader: ({ context, params }) => {
        const groupId = params.groupId as HappyAgentGroupId;
        const workspace = happyAgentWorkspace(context, params.happyAgentId);
        const fileKind = happyAgentFileTabKindParse(params.fileKind);
        if (!fileKind)
            throw redirect({
                params: { groupId, happyAgentId: params.happyAgentId },
                replace: true,
                to: "/chats/$happyAgentId/$groupId",
            });
        workspace?.groupOpen(groupId);
        workspace?.filePreview(groupId, params.filePath, fileKind);
    },
    path: "/chats/$happyAgentId/$groupId/file/$fileKind/$filePath",
});

/** A file opened over one addressed session in its workspace. */
const chatFileRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    loader: ({ context, params }) => {
        const groupId = params.groupId as HappyAgentGroupId;
        const workspace = happyAgentWorkspace(context, params.happyAgentId);
        const fileKind = happyAgentFileTabKindParse(params.fileKind);
        if (!fileKind)
            throw redirect({
                params: {
                    chatId: params.chatId,
                    groupId,
                    happyAgentId: params.happyAgentId,
                },
                replace: true,
                to: "/chats/$happyAgentId/$groupId/$chatId",
            });
        workspace?.conversationOpen(params.chatId as HappyAgentSessionId, groupId);
        workspace?.filePreview(groupId, params.filePath, fileKind);
    },
    path: "/chats/$happyAgentId/$groupId/$chatId/file/$fileKind/$filePath",
});

/**
 * Where a session is started on one machine. Arriving materializes the draft —
 * the task written on a previous visit is offered back, because the store keeps
 * it until a session actually starts — and the surface then holds the whole
 * content region until the reader goes somewhere else or the new session takes
 * them there.
 */
const sessionCreateRoute = createRoute({
    component: HappyAgentCreateRoute,
    getParentRoute: () => rootRoute,
    loader: ({ context, params }) => {
        happyAgentWorkspace(context, params.happyAgentId)?.createOpen();
    },
    path: "/create/$happyAgentId",
});

/**
 * One machine's inbox of agent questions. The Happy Agent is in the address because the
 * queue is that machine's — its agents are the ones waiting — so the window's
 * back and forward move between machines' inboxes rather than between two views
 * of one ambiguous list.
 */
const inboxRoute = createRoute({
    component: HappyAgentInboxRoute,
    getParentRoute: () => rootRoute,
    path: "/inbox/$happyAgentId",
});

/** One machine's enrolled Happy Social friends and requests. */
const socialRoute = createRoute({
    component: HappyAgentSocialRoute,
    getParentRoute: () => rootRoute,
    path: "/social/$happyAgentId",
});

/**
 * The component workbench, addressed without a Happy Agent because it renders component
 * pages rather than anything a machine holds. The route is registered only in a
 * development build, which is also the only build whose sidebar offers it.
 */
const blueprintRoute = createRoute({
    component: HappyAgentBlueprintRoute,
    getParentRoute: () => rootRoute,
    path: "/blueprint",
});

const settingsIndexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    beforeLoad: () => {
        throw redirect({
            params: { section: HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY },
            replace: true,
            to: "/settings/$section",
        });
    },
});

/**
 * One settings category, addressed the same way a conversation is: the URL names
 * which category is open, so the window's back/forward and its permanent category
 * column agree without a second selection living in a store.
 */
const settingsSectionRoute = createRoute({
    component: HappyAgentSettingsRoute,
    getParentRoute: () => rootRoute,
    path: "/settings/$section",
    beforeLoad: ({ params }) => {
        if (!happyAgentSettingsCategoryExists(params.section))
            throw redirect({
                params: { section: HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY },
                replace: true,
                to: "/settings/$section",
            });
    },
});

const routeTree = rootRoute.addChildren([
    indexRoute,
    chatsRootRoute,
    workspaceRoute.addChildren([
        chatsIndexRoute,
        groupRoute,
        chatRoute,
        groupFileRoute,
        chatFileRoute,
    ]),
    inboxRoute,
    socialRoute,
    sessionCreateRoute,
    ...(import.meta.env.DEV ? [blueprintRoute] : []),
    settingsIndexRoute,
    settingsSectionRoute,
]);

/**
 * The inbox address renders the same window a conversation does: the shell and
 * its sidebar stay, and only the content area changes, so working through
 * questions is not leaving the workspace.
 */
function HappyAgentInboxRoute() {
    return <HappyAgentWorkspaceLayout inbox />;
}

function HappyAgentSocialRoute() {
    return <HappyAgentWorkspaceLayout social />;
}

/**
 * The Create address renders the same window a conversation does: the shell and
 * its sidebar stay, and only the content area changes, so starting a session is
 * not leaving the workspace.
 */
function HappyAgentCreateRoute() {
    return <HappyAgentWorkspaceLayout create />;
}

/**
 * The workbench address renders the same window a conversation does: the shell
 * and its sidebar stay, and only the content area changes.
 */
function HappyAgentBlueprintRoute() {
    return <HappyAgentWorkspaceLayout blueprint />;
}

function HappyAgentWorkspaceLayout(
    props: {
        blueprint?: boolean;
        create?: boolean;
        inbox?: boolean;
        social?: boolean;
    } = {},
) {
    // Read loosely because this component renders under several routes, which
    // makes every context member optional; the provider supplies all of them
    // together, so it is read back as the whole context it was given.
    const context = useRouteContext({ strict: false }) as unknown as HappyAgentRouterContext;
    const navigate = useNavigate();
    const router = useRouter();
    // `strict: false` because a Happy Agent's list carries only `happyAgentId`, and a group
    // carries no `chatId`.
    const params = useParams({ strict: false });
    // The router is constructed before RouterProvider supplies the real context,
    // so the very first render of a deep-linked URL can arrive with an empty
    // context; the provider's context lands on the next synchronous pass.
    if (!context.happyAgents) return null;
    return (
        <AppHappyAgentView
            appearance={context.appearance}
            browserContent={context.browserContent}
            buildIdentity={context.buildIdentity}
            performance={context.performance}
            htmlPreview={context.htmlPreview}
            mediaWindow={context.mediaWindow}
            chatId={params.chatId}
            groupId={params.groupId}
            {...(context.daemon ? { daemon: context.daemon } : {})}
            {...(context.experiments ? { experiments: context.experiments } : {})}
            {...(context.titleShimmer ? { titleShimmer: context.titleShimmer } : {})}
            {...(context.commandPalette ? { commandPalette: context.commandPalette } : {})}
            {...(context.navigationOrder ? { navigationOrder: context.navigationOrder } : {})}
            {...(context.sidebarCollapse ? { sidebarCollapse: context.sidebarCollapse } : {})}
            createOpen={props.create}
            inboxOpen={props.inbox}
            socialOpen={props.social}
            blueprintOpen={props.blueprint}
            // Offered only where the route exists, which is what puts the
            // workbench row in a development sidebar and nowhere else.
            {...(import.meta.env.DEV
                ? { onBlueprintOpen: () => void navigate({ to: "/blueprint" }) }
                : {})}
            onCreateOpen={() =>
                void navigate({
                    params: { happyAgentId: params.happyAgentId ?? happyAgentDefaultId(context) },
                    to: "/create/$happyAgentId",
                })
            }
            onInboxOpen={() =>
                void navigate({
                    params: { happyAgentId: params.happyAgentId ?? happyAgentDefaultId(context) },
                    to: "/inbox/$happyAgentId",
                })
            }
            onSocialOpen={() =>
                void navigate({
                    params: { happyAgentId: params.happyAgentId ?? happyAgentDefaultId(context) },
                    to: "/social/$happyAgentId",
                })
            }
            onUpdateApply={context.onUpdateApply}
            platform={context.platform}
            happyAgentId={params.happyAgentId ?? happyAgentDefaultId(context)}
            happyAgents={context.happyAgents}
            update={context.update}
            windowState={context.windowState}
            onChatSelect={(happyAgentId, groupId, chatId, replace) =>
                void navigate(
                    groupId === undefined
                        ? { params: { happyAgentId }, replace, to: "/chats/$happyAgentId" }
                        : chatId
                          ? {
                                params: { chatId, groupId, happyAgentId },
                                replace,
                                to: "/chats/$happyAgentId/$groupId/$chatId",
                            }
                          : {
                                params: { groupId, happyAgentId },
                                replace,
                                to: "/chats/$happyAgentId/$groupId",
                            },
                )
            }
            onChatClose={(happyAgentId, groupId, chatId, fallbackChatId) => {
                const changed = router.history.sessionForget(
                    happyAgentId,
                    groupId,
                    chatId,
                    fallbackChatId,
                );
                if (changed && router.history.subscribers.size === 0)
                    void router.load({ action: { type: "REPLACE" } });
                return changed;
            }}
            onFileClose={(happyAgentId, groupId, path) => {
                // The route helper owns history repair; the surface owns the
                // tab bytes and closes those immediately after this callback.
                happyAgentRouterFileForget(router, happyAgentId, groupId, path);
            }}
            onFileSelect={(happyAgentId, groupId, chatId, path, fileKind, replace) => {
                if (chatId) {
                    void navigate({
                        params: { chatId, fileKind, filePath: path, groupId, happyAgentId },
                        replace,
                        to: "/chats/$happyAgentId/$groupId/$chatId/file/$fileKind/$filePath",
                    });
                    return;
                }
                void navigate({
                    params: { fileKind, filePath: path, groupId, happyAgentId },
                    replace,
                    to: "/chats/$happyAgentId/$groupId/file/$fileKind/$filePath",
                });
            }}
            onSettingsOpen={() =>
                void navigate({
                    params: { section: HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY },
                    to: "/settings/$section",
                })
            }
            // Settings has one destination per category, and the palette offers
            // them by name. The address stays this file's business: the view is
            // handed the one destination it asked for and never the router.
            onSettingsSectionOpen={(section) =>
                void navigate({
                    params: {
                        section: happyAgentSettingsCategoryExists(section)
                            ? section
                            : HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY,
                    },
                    to: "/settings/$section",
                })
            }
        />
    );
}

/**
 * Local route glue. Leaving settings addresses the conversation list rather than
 * popping history, so the way out is the same wherever the window was opened
 * from — including a cold start straight onto a settings URL.
 */
function HappyAgentSettingsRoute() {
    const context = useRouteContext({ strict: false }) as unknown as HappyAgentRouterContext;
    const navigate = useNavigate();
    const params = useParams({ strict: false });
    return (
        <AppHappyAgentSettingsView
            appearance={context.appearance}
            {...(context.daemon ? { daemon: context.daemon } : {})}
            {...(context.debug ? { debug: context.debug } : {})}
            {...(context.profiler ? { profiler: context.profiler } : {})}
            {...(context.experiments ? { experiments: context.experiments } : {})}
            onCategorySelect={(section) =>
                void navigate({ params: { section }, to: "/settings/$section" })
            }
            onClose={() => void navigate({ to: "/chats" })}
            happyAgents={context.happyAgents}
            platform={context.platform}
            section={params.section ?? HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY}
            settings={context.settings}
            {...(context.titleShimmer ? { titleShimmer: context.titleShimmer } : {})}
            windowState={context.windowState}
        />
    );
}

/**
 * Creates the router that owns the local window's location lifetime. Local
 * sessions are grouped by the daemon's projects, so their address is the group —
 * the project, or the worktree inside it, by the durable id the daemon assigned
 * it, which keeps a filesystem layout out of the URL and survives a rename — and
 * then the session inside it. The machine comes first, because the same project
 * name may exist on several of them: `/chats/$happyAgentId/$groupId/$chatId`. It stays
 * one stable address, so the UI never keeps a second competing selection in a
 * store.
 */
export function happyAgentRouterCreate(history: HappyAgentRouterHistory = defaultHistory()) {
    return createRouter({
        context: undefined as unknown as HappyAgentRouterContext,
        defaultPreload: false,
        history,
        routeTree,
        // The application owns scrolling inside its own scrollports; letting the
        // router restore or reset window scroll would fight them.
        scrollRestoration: () => false,
        scrollToTopSelectors: [],
    });
}

/**
 * Addresses one local session: the single place that turns a session's location
 * into a local URL. The desktop shell never hand-builds one.
 */
export function happyAgentRouterConversationOpen(
    router: HappyAgentRouter,
    happyAgentId: string,
    location: HappyAgentSessionLocation,
): void {
    void router.navigate({
        params: { chatId: location.sessionId, groupId: location.groupId, happyAgentId },
        to: "/chats/$happyAgentId/$groupId/$chatId",
    });
}

/**
 * Addresses a group that holds no conversation yet, such as a worktree the
 * reader has just added. The conversation started in it re-addresses the same
 * group through `happyAgentRouterConversationOpen` once it exists.
 */
export function happyAgentRouterGroupOpen(
    router: HappyAgentRouter,
    happyAgentId: string,
    groupId: string,
): void {
    void router.navigate({
        params: { groupId, happyAgentId },
        to: "/chats/$happyAgentId/$groupId",
    });
}

/**
 * Removes a closed file tab from this window's navigation stack. A current file
 * lands on the nearest surviving destination; a file that was the window's only
 * destination uncovers its addressed session or workspace.
 */
export function happyAgentRouterFileForget(
    router: HappyAgentRouter,
    happyAgentId: string,
    groupId: string,
    path: string,
): void {
    const changed = router.history.fileForget(happyAgentId, groupId, path);
    if (changed && router.history.subscribers.size === 0)
        void router.load({ action: { type: "REPLACE" } });
}

/**
 * Takes a group that stopped existing out of this window's navigation — archived
 * here, or from another window or machine.
 *
 * Every remembered address naming it goes, not just the one on screen: one
 * archive kills the workspace and each conversation opened inside it. The stack
 * is an array rather than the browser's, so they are removed outright.
 *
 * It moves nobody who was not standing on what went. A Happy Agent reports the removal
 * whether or not this window shows it, so a reader on another project, the Happy Agent's
 * list, or settings keeps their place while dead addresses drop from behind.
 */
export function happyAgentRouterGroupForget(
    router: HappyAgentRouter,
    happyAgentId: string,
    groupId: string,
): void {
    const changed = router.history.groupForget(happyAgentId, groupId);
    // A rendered window is subscribed to its own history and reloads from the
    // notification above. One that is not — a window still starting up — has to
    // be told, the same way the router tells itself when it commits a location
    // with nothing listening.
    if (changed && router.history.subscribers.size === 0)
        void router.load({ action: { type: "REPLACE" } });
}

/**
 * Creates deterministic local-router history for application and navigation
 * tests. The starting point is given as a URL because that is what those tests
 * are about — which place a URL addresses — and it is parsed here exactly as one
 * arriving from the document would be.
 */
export function happyAgentMemoryHistoryCreate(
    initialUrl = "/chats/local",
): HappyAgentRouterHistory {
    const route = happyAgentRoutePathParse(initialUrl);
    return happyAgentHistoryCreate({ initialEntries: route ? [route] : [] });
}

/**
 * The stack every window navigates. It is this application's own array rather
 * than the browser's, so an address that stops existing can be removed from it;
 * the document URL only mirrors where the reader is. A window given somewhere to
 * keep it reopens where it was left.
 */
function defaultHistory(): HappyAgentRouterHistory {
    return happyAgentHistoryCreate();
}

export type HappyAgentRouter = ReturnType<typeof happyAgentRouterCreate>;

/**
 * Registers this window's route tree as the one every router helper is typed
 * against. There is exactly one router in this application, so `navigate`,
 * `redirect`, and `useParams` can name its addresses directly and a path or
 * parameter that does not exist stops being a compile error waiting to happen.
 */
declare module "@tanstack/react-router" {
    interface Register {
        router: HappyAgentRouter;
    }
}
