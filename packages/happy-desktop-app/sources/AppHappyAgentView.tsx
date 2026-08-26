import { useCallback, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type {
    AppearanceStore,
    ConversationEntry,
    ComposerSnapshot,
    ExperimentsStore,
    ConversationToolCall,
    HappyAgentClockStore,
    HappyAgentCloudStore,
    HappyAgentFileTabKind,
    HappyAgentFileTabSnapshot,
    HappyAgentConnectionStore,
    HappyAgentDebugLogStore,
    HappyAgentConversationSnapshot,
    HappyAgentFileLayout,
    HappyAgentWorkspaceFiles,
    HappyAgentFileScope,
    HappyAgentFileViewMode,
    HappyAgentHost,
    HappyAgentIntegrationStore,
    HappyAgentGroupId,
    HappyAgentMenusSnapshot,
    HappyAgentModelStore,
    HappyAgentModelSelection,
    HappyAgentNavigationOrderStore,
    HappyAgentSidebarCollapseStore,
    HappyAgentPanelSnapshot,
    HappyAgentProjectAddSnapshot,
    HappyAgentPanelStore,
    HappyAgentPanelTabId,
    HappyAgentPanelTabSnapshot,
    HappyAgentPermissionMode,
    HappyAgentProfileStore,
    HappyAgentInboxItem,
    HappyAgentInboxSnapshot,
    HappyAgentInboxStore,
    HappyAgentInstructionsStore,
    HappyAgentSecurityPolicyStore,
    HappyAgentAvailabilitySnapshot,
    HappyAgentProviderUsageStore,
    HappyAgentProvidersStore,
    HappyAgentGroupLifecycle,
    HappyAgentProjectGroup,
    HappyAgentProjectId,
    HappyAgentServiceTier,
    HappyAgentSessionCreateInput,
    HappyAgentSessionId,
    SubagentSummary,
    HappyAgentTerminalStore,
    HappyAgentThinkingLevel,
    TitleShimmerStore,
    HappyAgentWindowStore,
    HappyAgentWorkspaceSnapshot,
    HappyAgentWorkspaceStore,
    HappyAgentWorkingWait,
    HappyAgentWorktreeId,
} from "happy-desktop-state";
import {
    HAPPY_AGENT_PANEL_FILE_VIEW_ID,
    agentAuthor,
    experimentsStoreNoop,
    happyAgentInboxStoreNoop,
    happyAgentNavigationOrderApply,
    happyAgentAvailabilityProject,
    happyAgentNavigationOrderStoreNoop,
    happyAgentSidebarCollapseStoreNoop,
    happyAgentHumanMessageAuthor,
    happyAgentSessionGroupIdOf,
    happyAgentOwnerAuthor,
    happyAgentWindowStoreNoop,
    titleShimmerStoreNoop,
} from "happy-desktop-state";
import {
    type AgentWaitStatus,
    AppShell,
    APP_SHELL_PANEL_DEFAULT_WIDTH,
    type AppShellFocusedPane,
    Banner,
    BrowserPanel,
    DevBuildMenu,
    type BrowserContentRenderer,
    HtmlPreviewFrame,
    type HtmlPreviewRenderer,
    type MediaWindowOpener,
    Button,
    ChannelHeader,
    ContextMeter,
    ChangedFileDiff,
    ComposerFooterBar,
    ComposerModelControl,
    ConversationView,
    DeferredPane,
    EmptyState,
    FileBrowser,
    FileEditor,
    FilePreview,
    type FilePreviewKind,
    filePreviewKind,
    Lightbox,
    MarkdownDocument,
    MenuButton,
    Modal,
    ModalOverlay,
    HappyAgentActivityControl,
    HappyAgentActivityPanel,
    HappyAgentControlMenu,
    fileTreeBuild,
    fileTreeExpanded,
    fileTreeFlatten,
    fileNameCompare,
    type FileTreeExpansion,
    type FileTreeBuildEntry,
    HappyAgentCreateSessionDialog,
    HappyAgentProjectCloneDialog,
    HappyAgentProjectSettingsDialog,
    HappyAgentSessionControls,
    type HappyAgentUserInputAnswerMap,
    HappyAgentUsagePanel,
    PanelHeader,
    Sidebar,
    SidebarFooter,
    SidebarUpdateAction,
    HappyAgentInboxPage,
    TabbedPane,
    TextField,
    TerminalPanel,
    ToolCallPreview,
    TransferZone,
    type TabTransferTarget,
    WindowDragRegion,
    happyAgentComposerModelControlProps,
    sidebarReorderMove,
    type MenuItem,
    type FileTreeNode,
    type KeyboardShortcut,
    type SidebarItem,
    type SidebarNumberShortcutTarget,
    type SidebarReorder,
    type SidebarSection,
    type TabItem,
    WindowShortcuts,
    WorkspaceLifecycleLane,
    WorkspaceLifecycleNotice,
    type WorkspaceLifecyclePhase,
    commandShortcut,
} from "happy-desktop-ui";
import { openExternalLink } from "./externalLink";
import { reactFrameInputUpdate, reactFrameSubscribe } from "./reactFrameSubscribe";
import { BlueprintView } from "./views/BlueprintView";
import type {
    AppHappyAgentDaemonSnapshot,
    AppHappyAgentDaemonStore,
} from "./views/AppHappyAgentSettingsView";

const sidebarDaemonUnavailable: AppHappyAgentDaemonSnapshot = {
    install: { phase: "idle" },
    managed: false,
    operation: "idle",
    runtime: "stopped",
    updateAvailable: false,
    versions: [],
};

/** Stands in wherever no machine-local agent is managed, such as a browser. */
const sidebarDaemonStoreNoop: AppHappyAgentDaemonStore = {
    daemonCheck: () => undefined,
    daemonInstall: () => undefined,
    daemonInstallDismiss: () => undefined,
    daemonInstallKill: () => undefined,
    daemonRestart: () => undefined,
    daemonUpgrade: () => undefined,
    daemonVersionSelect: () => undefined,
    get: () => sidebarDaemonUnavailable,
    subscribe: () => () => undefined,
};

/**
 * What the sidebar has to say about the agent, if anything.
 *
 * Only two things are worth a row: a version being fetched, and one already
 * fetched and waiting to be installed. A check finding nothing, or an agent
 * managed outside Happy, is not news and takes no space.
 */
function agentUpdateOffer(daemon: AppHappyAgentDaemonSnapshot):
    | {
          readonly detail?: string;
          readonly status: "downloading" | "downloaded";
          readonly version: string;
      }
    | undefined {
    if (!daemon.managed || daemon.install.phase !== "idle") return undefined;
    if (daemon.readyVersion !== undefined)
        return { status: "downloaded", version: daemon.readyVersion };
    if (daemon.operation === "downloading" && daemon.availableVersion !== undefined) {
        return {
            ...(daemon.message ? { detail: daemon.message } : {}),
            status: "downloading",
            version: daemon.availableVersion,
        };
    }
    return undefined;
}

export interface AppHappyAgentUpdate {
    readonly action: "refresh" | "restart";
    readonly detail?: string;
    readonly status: "available" | "downloading" | "downloaded";
    readonly version?: string;
}

/** One Happy Agent this window can address, with its own catalog and surface stores. */
export interface AppHappyAgentEntry {
    readonly id: string;
    readonly label: string;
    readonly status: "connecting" | "connected" | "disconnected" | "error";
    readonly message?: string;
    readonly version?: string;
    readonly projects: readonly HappyAgentProjectGroup[];
    readonly projectsStatus: "loading" | "ready" | "error";
    /**
     * Where adding a folder to this Happy Agent as a project stands. Absent on a host
     * that does not report it, which reads as nothing being added — the same way
     * a host with no live stores supplies no `session`.
     */
    readonly projectAdd?: HappyAgentProjectAddSnapshot;
    /** The live stores for this Happy Agent, present once its connection is up. */
    readonly session?: AppHappyAgentSession;
}

export interface AppHappyAgentSession {
    readonly clock: HappyAgentClockStore;
    readonly connection: HappyAgentConnectionStore;
    /** This Happy Agent installation's Happy Social account. */
    readonly cloud?: () => HappyAgentCloudStore;
    /** This Happy Agent's retained connection, reconciliation, and SSE diagnostics. */
    readonly debugLog?: HappyAgentDebugLogStore;
    readonly host: HappyAgentHost;
    /** This Happy Agent's own model catalog, read by the settings window's pickers. */
    readonly models: HappyAgentModelStore;
    /** This Happy Agent installation's live Happy Mobile integration. */
    readonly happyIntegration?: () => HappyAgentIntegrationStore;
    readonly workspace: HappyAgentWorkspaceStore;
    /**
     * Every question this Happy Agent's agents are waiting on. Absent when the machine
     * offers no question feed, which is why the inbox row is absent too rather
     * than opening onto an empty queue that means nothing.
     */
    readonly inbox?: HappyAgentInboxStore;
    /**
     * How much of each provider account's plan this machine has spent, read by
     * the Usage settings category. Absent when the machine reports no usage,
     * which leaves that category saying so rather than listing accounts that
     * mean nothing.
     */
    readonly providerUsage?: HappyAgentProviderUsageStore;
    /** The identity this Happy Agent authors work as, as its profile settings edit it. */
    readonly profile?: () => HappyAgentProfileStore | undefined;
    /**
     * Which model providers this machine will use, as the Providers settings
     * category reads and switches them. Absent on a host that cannot change the
     * machine's configuration, which leaves that category saying so.
     */
    readonly providers?: HappyAgentProvidersStore;
    /** This Happy Agent's machine-wide instructions, as the settings window edits them. */
    readonly instructions?: HappyAgentInstructionsStore;
    /** This Happy Agent's machine-wide permission-review policy. */
    readonly securityPolicy?: HappyAgentSecurityPolicyStore;
}

export interface AppHappyAgentDirectorySnapshot {
    /**
     * The Happy Agent this window is addressing, as `happyAgentActivate` last recorded it. It
     * is the synchronous authority on which machine is on screen, for the
     * decisions that cannot be taken at render time — whether an agent's
     * contribution may still be performed when someone presses it. A host that
     * records no addressed Happy Agent supplies nothing here, and such a press is inert
     * rather than aimed at a guess.
     */
    readonly activeHappyAgentId?: string;
    readonly happyAgents: readonly AppHappyAgentEntry[];
}

/** The Happy Agents this window can address. */
export interface AppHappyAgentDirectoryStore {
    get(): AppHappyAgentDirectorySnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Records which Happy Agent the window is addressing. The URL decides it; the store
     * is told so that window-level events with no Happy Agent of their own — a URL handed
     * to the app to open — land in the workspace on screen.
     */
    happyAgentActivate(id: string): void;
}

/**
 * What a development window calls itself: the worktree or branch it was built
 * from, and the checkout worth copying out of it. A packaged Happy supplies
 * none — the product has one identity and does not have to announce it.
 */
export interface AppBuildIdentity {
    readonly branch: string;
    readonly label: string;
    readonly path: string;
}

export interface AppHappyAgentViewProps {
    /** The host Happy Agent this window is an interface onto, and what it currently holds. */
    happyAgents: AppHappyAgentDirectoryStore;
    /**
     * This build's development identity, shown in the sidebar footer menu.
     * Absent in the packaged product, where there is nothing to tell apart.
     */
    buildIdentity?: AppBuildIdentity;
    /** Which Happy Agent the URL addresses; its projects and sessions fill the window. */
    happyAgentId: string;
    /** Theme selection behind the sidebar footer's appearance toggle. */
    appearance: AppearanceStore;
    /**
     * Where this surface is running. In the Electron shell the window has no
     * native title bar, so the shell owns the traffic-light inset and the drag
     * lanes and the sidebar heading gives its space up to them; the browser
     * development mode keeps the ordinary branded heading.
     */
    platform?: "desktop" | "web";
    /**
     * The window's own chrome. Entering macOS full screen takes the traffic
     * lights away, so the lane reserved for them closes with them and the sidebar
     * toggle returns to the window's left edge. The browser shell supplies no
     * such store and stays windowed.
     */
    windowState?: HappyAgentWindowStore;
    /**
     * Where this window remembers the order the reader arranged its pinned rows
     * in. A host that keeps no such record supplies none, and the rows stay in
     * the order the window offers them rather than being arrangeable into an
     * order the next launch would forget.
     */
    navigationOrder?: HappyAgentNavigationOrderStore;
    /**
     * Where this window remembers which projects and folders the reader folded
     * shut. A host that keeps no such record supplies none, and every row stays
     * open rather than offering a fold the next launch would forget.
     */
    sidebarCollapse?: HappyAgentSidebarCollapseStore;
    /**
     * Whether this window offers the features that are not finished yet. A host
     * that remembers no such choice supplies none, and they stay withheld.
     */
    experiments?: ExperimentsStore;
    /**
     * Whether running session, project, and workspace titles shimmer. A host
     * without this preference uses the current product default.
     */
    titleShimmer?: TitleShimmerStore;
    /** Native or hosted-renderer update projected by the desktop host. */
    update?: AppHappyAgentUpdate;
    /** Applies the ready update. Absent in a plain browser surface. */
    onUpdateApply?: () => void;
    /**
     * The machine-local Happy Agent, supplied only by the native desktop shell.
     * The sidebar reads it to offer a downloaded agent update; a browser surface
     * manages no agent and is given none.
     */
    daemon?: AppHappyAgentDaemonStore;
    /** Native page renderer supplied only by the packaged Electron host. */
    browserContent?: BrowserContentRenderer;
    /**
     * Renders one HTML workspace file as a page. Supplied only by a host with an
     * engine to run it in; without one an HTML file opens as its source.
     */
    htmlPreview?: HtmlPreviewRenderer;
    /**
     * Shows one workspace picture or recording in a window of the host's own.
     * Supplied only by a host that has such a window; without one the file stays
     * in place.
     */
    mediaWindow?: MediaWindowOpener;
    /**
     * The addressed group — a project or one of its worktrees — and conversation,
     * read from the route by the caller. This surface never decides what is
     * shown; it renders the addressed group's sessions and asks for a different
     * address through `onChatSelect`.
     */
    groupId?: string;
    chatId?: string;
    /**
     * Addresses a Happy Agent, a group in it, and optionally one of that group's
     * sessions; no group means that Happy Agent's list.
     */
    onChatSelect(
        happyAgentId: string,
        groupId: string | undefined,
        chatId?: string,
        replace?: boolean,
    ): void;
    /** Removes an archived session's dead destinations from Back/Forward history. */
    onChatClose?(
        happyAgentId: string,
        groupId: string,
        chatId: string,
        fallbackChatId?: string,
    ): boolean;
    /** Removes every history visit to a file tab that the reader closed. */
    onFileClose(happyAgentId: string, groupId: string, path: string): void;
    /**
     * Addresses a file tab over the session currently visible in its workspace.
     * An absent chat is the empty-workspace form of the same destination.
     */
    onFileSelect(
        happyAgentId: string,
        groupId: string,
        chatId: string | undefined,
        path: string,
        kind: HappyAgentFileTabKind,
        replace?: boolean,
    ): void;
    /** Opens the local settings destination from the pinned sidebar footer. */
    onSettingsOpen(): void;
    /** Whether the URL addresses the addressed Happy Agent's inbox of agent questions. */
    inboxOpen?: boolean;
    /** Addresses that inbox. */
    onInboxOpen?(): void;
    /** Whether the URL addresses the component workbench, in a development build. */
    blueprintOpen?: boolean;
    /** Addresses the workbench. */
    onBlueprintOpen?(): void;
}

/**
 * What the tab strip needs about the addressed group, flattened so a project and
 * a worktree open the same way. `create` is what a new session in it takes: the
 * project's root, or the worktree's checkout and its id.
 */
interface OpenGroup {
    readonly id: HappyAgentGroupId;
    readonly name: string;
    /**
     * The catch-all project for sessions started outside any repository. It is
     * addressed as a place rather than as a path, so the surface names it by its
     * house glyph and never spells its `~` out.
     */
    readonly home: boolean;
    readonly conversations: HappyAgentProjectGroup["conversations"];
    readonly changes: NonNullable<HappyAgentProjectGroup["changes"]>;
    readonly create?: HappyAgentSessionCreateInput;
    /**
     * Where the open group's checkout is in its own life, for a worktree. A
     * project has none: it is a directory Happy Agent adopted rather than one it made,
     * so there is no moment at which it is being prepared.
     */
    readonly lifecycle?: HappyAgentGroupLifecycle;
    /** The checkout's path, so a notice about it can name the directory. */
    readonly path: string;
}

const APP_SHORTCUTS = {
    panelToggle: commandShortcut("j"),
    panelToggleAlternate: commandShortcut("b", { alt: true }),
    sessionCreate: commandShortcut("t"),
    tabClose: commandShortcut("w"),
    tabCloseUndo: commandShortcut("z"),
    workspaceCreate: commandShortcut("n"),
} as const;
const PANEL_TOGGLE_HINT = {
    aria: `${APP_SHORTCUTS.panelToggle.aria} ${APP_SHORTCUTS.panelToggleAlternate.aria}`,
    caps: APP_SHORTCUTS.panelToggle.caps,
} as const;
const RECENT_SESSIONS_LABEL = "Show recent sessions";
const PANEL_HIDE_LABEL = "Hide panel";
const HISTORY_SESSION_PREFIX = "session:";
const CLOSED_TAB_HISTORY_LIMIT = 100;

type HappyAgentClosedTab =
    | {
          readonly type: "session";
          readonly groupId: HappyAgentGroupId;
          readonly sessionId: HappyAgentSessionId;
      }
    | {
          readonly type: "sessionAddress";
          readonly groupId: HappyAgentGroupId;
          readonly sessionId: HappyAgentSessionId;
      }
    | {
          readonly type: "file";
          readonly fileKind: HappyAgentFileTabKind;
          readonly groupId: HappyAgentGroupId;
          readonly path: string;
          readonly placement: "main" | "panel";
          readonly preview: boolean;
      }
    | { readonly type: "panel" };

/**
 * The rows one project contributes: the project itself, then a nested row per
 * worktree that has work in it. A row is the project's name and its picture,
 * both the daemon's — derived from the git remote — so a reader recognizes a
 * repository at a glance. Its path is deliberately not here: it is long enough
 * to crowd out the name it is supposed to disambiguate, and the heading over the
 * open project states it in full. The home project is the exception both ways:
 * it has no remote to derive a picture from, and an "H" plaque would read as one
 * more repository, so it wears a house instead.
 */
function sidebarItems(
    project: HappyAgentProjectGroup,
    titleShimmerEnabled: boolean,
    newWorkspaceShortcut: boolean,
): SidebarItem[] {
    const projectHasLineChanges = (project.addedLines ?? 0) > 0 || (project.deletedLines ?? 0) > 0;
    return [
        {
            id: project.id,
            kind: "project",
            label: project.name,
            labelShimmer: titleShimmerEnabled,
            initials: project.name.slice(0, 1).toUpperCase(),
            ...(project.kind === "home" ? { icon: "home" as const } : {}),
            ...(project.avatar ? { imageUrl: project.avatar.url } : {}),
            // The + always waits for hover, so a project at rest ends with its
            // delta on the same column as every other row and nothing is
            // holding a place open for a control the reader is not reaching for.
            action: {
                disabled: project.lifecycle.phase !== "ready",
                icon: "plus" as const,
                label: `New workspace in ${project.name}`,
                ...(newWorkspaceShortcut ? { shortcut: APP_SHORTCUTS.workspaceCreate } : {}),
                reveal: "hover" as const,
            },
            ...sidebarLifecycle(project.lifecycle),
            // Settings waits for hover beside the +, both laid over the lane
            // rather than placed in it. The home project is left out — its name
            // and its path are the machine's, so there is nothing there for the
            // reader to set.
            ...(project.kind === "home"
                ? {}
                : {
                      secondaryAction: {
                          icon: "settings" as const,
                          label: `Settings for ${project.name}`,
                          reveal: "hover" as const,
                      },
                  }),
            // A row only carries a status while one of its sessions is live.
            // Waiting is the low-priority modifier: any session doing real work
            // makes the row spin, and only an all-waiting row wears the clock.
            ...(project.activity === "running"
                ? { status: "working" as const }
                : project.activity === "waiting"
                  ? { status: "waiting" as const }
                  : {}),
            ...(project.conversations.some((conversation) => conversation.unread)
                ? { unread: true }
                : {}),
            ...(projectHasLineChanges
                ? {
                      changeStats: {
                          added: project.addedLines ?? 0,
                          deleted: project.deletedLines ?? 0,
                      },
                  }
                : {}),
        },
        ...project.worktrees.map((worktree) => ({
            id: worktree.id,
            kind: "workspace" as const,
            depth: 1,
            label: worktree.name,
            labelShimmer: titleShimmerEnabled,
            // Archiving throws away a checkout, so it stays out of sight until
            // the reader is actually on the row.
            action: {
                icon: "archive" as const,
                label: `Archive ${worktree.name}`,
                reveal: "hover" as const,
            },
            // A worktree whose checkout is still being made, could not be made,
            // or is no longer there says so on the row: the reader is looking at
            // a place they may be about to send work into.
            ...sidebarLifecycle(worktree.lifecycle),
            ...(worktree.activity === "running"
                ? { status: "working" as const }
                : worktree.activity === "waiting"
                  ? { status: "waiting" as const }
                  : {}),
            ...(worktree.conversations.some((conversation) => conversation.unread)
                ? { unread: true }
                : {}),
            ...((worktree.addedLines ?? 0) > 0 || (worktree.deletedLines ?? 0) > 0
                ? {
                      changeStats: {
                          added: worktree.addedLines ?? 0,
                          deleted: worktree.deletedLines ?? 0,
                      },
                  }
                : {}),
        })),
    ];
}

/**
 * The row treatment one worktree phase asks for, as `SidebarItem` names them.
 *
 * A ready worktree contributes nothing: it is an ordinary row, and the row is
 * then free to report the work happening inside it. The other three replace that
 * report, because a place that does not exist yet has nothing running in it and
 * a place that has gone is not somewhere to send work.
 */
function sidebarLifecycle(
    lifecycle: HappyAgentGroupLifecycle,
): Pick<SidebarItem, "lifecycle" | "lifecycleLabel"> {
    if (lifecycle.phase === "creating")
        return { lifecycle: "creating", lifecycleLabel: "creating" };
    if (lifecycle.phase === "failed") return { lifecycle: "failed", lifecycleLabel: "failed" };
    if (lifecycle.phase === "missing")
        return { lifecycle: "unavailable", lifecycleLabel: "missing" };
    return {};
}

/**
 * The phase a screen showing this worktree has to interrupt the reader with.
 *
 * A ready worktree and a project both answer `undefined`: the place is simply
 * there, and a notice saying so would sit permanently over every screen in the
 * application. The notice's own type leaves `ready` out for the same reason.
 */
function workspaceLifecyclePhase(
    lifecycle: HappyAgentGroupLifecycle | undefined,
): WorkspaceLifecyclePhase | undefined {
    if (lifecycle === undefined || lifecycle.phase === "ready") return undefined;
    return lifecycle.phase;
}

/** The row action ids the sidebar's context menu dispatches back to this surface. */
const ROW_MENU_ARCHIVE = "archive";
/**
 * Opens the row's naming surface: the settings dialog for a project, which is
 * where its name is set, and the rename field for a worktree, whose name is the
 * only thing there is to say about it.
 */
const ROW_MENU_RENAME = "rename";

/**
 * The context menu one sidebar row offers. Archiving is the only thing on it,
 * and it is a menu rather than a visible control because it throws work away:
 * archiving a project closes its conversations and removes every one of its
 * worktree checkouts. The home project is left out — it is the machine's default
 * place rather than a repository the reader adopted, so hiding it would only
 * bring it straight back the next time a session starts there.
 */
function rowMenuItems(projects: readonly HappyAgentProjectGroup[], item: SidebarItem): MenuItem[] {
    const owner = rowOwnerFind(projects, item.id);
    if (!owner) return [];
    if (owner.worktreeId)
        return [
            { kind: "item", id: ROW_MENU_RENAME, label: "Rename workspace", icon: "edit" },
            { kind: "separator" },
            {
                kind: "item",
                id: ROW_MENU_ARCHIVE,
                label: "Archive workspace",
                icon: "archive",
                danger: true,
            },
        ];
    // The home project's name is the machine's, not the reader's to set, so it
    // offers neither renaming nor archiving.
    if (owner.project.kind === "home") return [];
    return [
        { kind: "item", id: ROW_MENU_RENAME, label: "Project settings…", icon: "settings" },
        { kind: "separator" },
        {
            kind: "item",
            id: ROW_MENU_ARCHIVE,
            label: "Archive project",
            icon: "archive",
            danger: true,
        },
    ];
}

/**
 * The two regions a tab can be moved between, named once so the strip that
 * offers the move and the region that accepts it cannot drift apart.
 */
const TRANSFER_ZONE_MAIN = "happy-agent-main";
const TRANSFER_ZONE_PANEL = "happy-agent-panel";

/** Where a tab in the panel's strip can go: the main content, to its leading side. */
const PANEL_TRANSFER_TARGETS: readonly TabTransferTarget[] = [
    { zone: TRANSFER_ZONE_MAIN, label: "the main content", side: "leading" },
];

/** Where a tab in the main strip can go: the panel, to its trailing side. */
const MAIN_TRANSFER_TARGETS: readonly TabTransferTarget[] = [
    { zone: TRANSFER_ZONE_PANEL, label: "the side panel", side: "trailing" },
];

/** The live tool tabs currently drawn on one side of the workspace. */
function toolTabsPlaced(
    panel: HappyAgentPanelSnapshot,
    placement: "panel" | "main",
): readonly HappyAgentPanelTabSnapshot[] {
    return panel.tabs.filter((tab) => tab.placement === placement);
}

function panelCloseTargetFind(panel: HappyAgentPanelSnapshot): string | undefined {
    if (!panel.open || panel.activeViewId === "files") return undefined;
    if (panel.activeViewId === "activity") return "activity";
    if (panel.activeViewId === "usage") return "usage";
    if (panel.activeViewId === "preview") return panel.previewEntryId ? "preview" : undefined;
    if (panel.activeViewId === "file") return panel.fileViewOpen ? "file" : undefined;
    const tab = panel.tabs.find(
        (entry) => entry.id === panel.activeViewId && entry.placement === "panel",
    );
    return tab?.id;
}

/** One tab per tool, iconed by what it holds. */
function toolTabItems(tabs: readonly HappyAgentPanelTabSnapshot[]): TabItem[] {
    return tabs.map((tab) => ({
        closable: true,
        id: tab.id,
        label: tab.label,
        icon: tab.kind === "terminal" ? ("terminal" as const) : ("globe" as const),
    }));
}

/** The project a sidebar row belongs to, and whether the row is one of its worktrees. */
function rowOwnerFind(
    projects: readonly HappyAgentProjectGroup[],
    id: string,
):
    | { readonly project: HappyAgentProjectGroup; readonly worktreeId?: HappyAgentWorktreeId }
    | undefined {
    for (const project of projects) {
        if (project.id === id) return { project };
        for (const worktree of project.worktrees)
            if (worktree.id === id) return { project, worktreeId: worktree.id };
    }
    return undefined;
}

/** A group with no conversation has no transcript; the constant keeps the prop stable. */
const NO_ENTRIES: readonly ConversationEntry[] = [];

/** Resolves the selected preview against the current immutable conversation snapshot. */
function previewToolFind(
    conversation: HappyAgentWorkspaceSnapshot["conversation"],
    entryId: string | undefined,
): ConversationToolCall | undefined {
    if (entryId === undefined || conversation.type !== "ready") return undefined;
    const entry = conversation.value.entries.find(
        (candidate) => candidate.kind === "agentActivity" && candidate.id === entryId,
    );
    return entry?.kind === "agentActivity" && entry.activity.kind === "tool"
        ? entry.activity.tool
        : undefined;
}

/** One tab per session in the open group, marked while the agent is working. */
function sessionTabs(group: OpenGroup, titleShimmerEnabled: boolean): TabItem[] {
    return group.conversations.map((summary) => ({
        id: summary.id,
        label: summary.title,
        labelShimmer: titleShimmerEnabled,
        // The session's own id, so the mark survives every rename of the title.
        avatarId: summary.id,
        // Both are stated even when false: a session tab holds its leading lane
        // open, so work starting or finishing makes the mark appear and go
        // without sliding the title sideways under the reader.
        busy: summary.activity === "running",
        waiting: summary.activity === "waiting",
        unread: summary.unread === true,
    }));
}

/**
 * The group's tabs in the order the workspace records. Tabs it has no position
 * for follow in the order they arrived, so one opened this instant lands at the
 * end of the strip instead of appearing somewhere in the middle of it.
 */
function tabsOrdered(items: readonly TabItem[], order: readonly string[]): TabItem[] {
    const remaining = new Map(items.map((item) => [item.id, item]));
    const placed = order.flatMap((id) => {
        const item = remaining.get(id);
        if (!item) return [];
        remaining.delete(id);
        return [item];
    });
    return [...placed, ...remaining.values()];
}

/** The tab action ids the strip's context menu dispatches back to this surface. */
const TAB_MENU_CLOSE = "close";
const TAB_MENU_CLOSE_OTHERS = "close-others";
const TAB_MENU_CLOSE_LEFT = "close-left";
const TAB_MENU_CLOSE_RIGHT = "close-right";
const TAB_MENU_CLOSE_ALL = "close-all";
const fileDocumentIdentities = new WeakMap<object, number>();
let fileDocumentIdentityNext = 0;

/**
 * The context menu one tab offers: the usual sweeps — this tab, the others,
 * everything to one side, the whole strip. Closing a session tab archives the
 * session, so a session tab's menu says "archive", while a file tab, whose
 * closing throws nothing away, says "close". A sweep still applies each tab's
 * own close semantics whatever the word on the item that started it. A sweep
 * with nothing to act on stays visible but disabled, so the menu keeps one
 * shape wherever it opens.
 */
function tabStripMenu(verb: "Archive" | "Close", left: number, right: number): MenuItem[] {
    return [
        { kind: "item", id: TAB_MENU_CLOSE, label: `${verb} tab` },
        { kind: "separator" },
        {
            kind: "item",
            id: TAB_MENU_CLOSE_OTHERS,
            label: `${verb} other tabs`,
            disabled: left + right === 0,
        },
        {
            kind: "item",
            id: TAB_MENU_CLOSE_LEFT,
            label: `${verb} tabs to the left`,
            disabled: left === 0,
        },
        {
            kind: "item",
            id: TAB_MENU_CLOSE_RIGHT,
            label: `${verb} tabs to the right`,
            disabled: right === 0,
        },
        { kind: "separator" },
        { kind: "item", id: TAB_MENU_CLOSE_ALL, label: `${verb} all tabs` },
    ];
}

function fileTabDirty(tab: HappyAgentFileTabSnapshot): boolean {
    if (tab.draft === undefined || tab.document.type !== "ready") return false;
    const document = tab.document.value;
    const saved =
        "newContent" in document
            ? document.newContent
            : "content" in document
              ? document.content
              : undefined;
    return saved !== undefined && tab.draft !== saved;
}

/** The same familiar file-type glyph whether a file is open or in tab history. */
function fileTabIcon(
    path: string,
    kind: HappyAgentFileTabKind,
): "doc" | "globe" | "image" | "play" {
    const preview = kind === "media" ? filePreviewKind(path) : undefined;
    return kind === "document"
        ? "globe"
        : preview === "image"
          ? "image"
          : preview === "video" || preview === "audio"
            ? "play"
            : "doc";
}

/**
 * Exact identity of the ready document a file tab is currently drawing.
 *
 * A Git revision can advance before its replacement read settles while the old
 * ready document deliberately stays visible. Keying the editor from the loaded
 * object keeps that old parsed state attached to the old content until the new
 * document actually arrives. Weak keys add no lifetime beyond the tab/cache.
 */
function fileDocumentKey(tabId: string, document: object): string {
    let identity = fileDocumentIdentities.get(document);
    if (identity === undefined) {
        fileDocumentIdentityNext += 1;
        identity = fileDocumentIdentityNext;
        fileDocumentIdentities.set(document, identity);
    }
    return `${tabId}\u0000${String(identity)}`;
}

function fileTabItem(tab: HappyAgentFileTabSnapshot): TabItem {
    // A tab of a picture says picture. Wearing the document glyph over every
    // open file made the strip a row of identical marks with only the name to
    // tell them apart.
    return {
        id: tab.id,
        label: tab.path.split("/").at(-1) ?? tab.path,
        dirty: fileTabDirty(tab),
        icon: fileTabIcon(tab.path, tab.kind),
        preview: tab.preview,
    };
}

/**
 * How opening one file should show it.
 *
 * A picture, a video, or an archive has no text view worth offering, and asking
 * for one only produced "Binary files cannot be opened in the editor." over the
 * thing the reader just clicked. Ordinary source asks for a file; the workspace
 * state upgrades that intent to a diff only when its live Git snapshot says the
 * path is changed.
 */
function fileTabKind(path: string): HappyAgentFileTabKind {
    const kind = filePreviewKind(path);
    if (kind === "image" || kind === "video" || kind === "audio" || kind === "pdf") return "media";
    if (kind === "binary") return "media";
    // An HTML file is text that is also a page. It opens as the page, with its
    // source a toggle away, even out of the changed list: someone opening a
    // document wants to see the document.
    if (kind === "html") return "document";
    return "file";
}

function fileHighlightLanguageKey(path: string): string {
    const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
    // Pierre resolves language from the complete basename. Keeping the
    // complete name avoids treating `component.d.ts` and `component.ts` as
    // interchangeable cache entries just because their final extension agrees.
    return name;
}

/** Compact identity shared by saved source previews with the same bytes/language. */
function fileHighlightCacheKey(path: string, hash: string): string {
    return `h:${hash}:${fileHighlightLanguageKey(path)}`;
}

function markdownHighlightCacheKey(path: string, hash: string): string {
    return `m:${hash}:${fileHighlightLanguageKey(path)}`;
}

/**
 * One path as the checkout addresses it. A transcript names files the way the
 * agent saw them, which is usually an absolute path on the machine running the
 * session; the host reads paths inside the checkout, so its root is stripped
 * when the path is under it and the path is otherwise passed through unchanged.
 * A leading `./` is the same file written the way a shell prompt writes it, and
 * the host addresses that file without it.
 */
function workspacePathRelative(path: string, root: string | undefined): string {
    const normalized = path.replaceAll("\\", "/").replace(/^(?:\.\/)+/u, "");
    if (root === undefined) return normalized;
    const base = root.replaceAll("\\", "/").replace(/\/+$/u, "");
    return base.length > 0 && normalized.startsWith(`${base}/`)
        ? normalized.slice(base.length + 1)
        : normalized;
}

/**
 * A link inside a rendered document, resolved against the document holding it.
 * `../DESIGN.md` in `docs/guide.md` is `DESIGN.md`, which is the file the reader
 * asked for; an absolute path names itself.
 */
function documentLinkResolve(from: string, href: string): string {
    if (href.startsWith("/")) return href;
    const segments = from.split("/").slice(0, -1);
    for (const segment of href.split("/")) {
        if (segment === "" || segment === ".") continue;
        if (segment === "..") segments.pop();
        else segments.push(segment);
    }
    return segments.join("/");
}

/** Resolves an addressed group id against the list, matching projects and worktrees alike. */
function openGroupFind(
    projects: readonly HappyAgentProjectGroup[],
    groupId: string | undefined,
): OpenGroup | undefined {
    if (groupId === undefined) return undefined;
    for (const project of projects) {
        if (project.id === groupId)
            return {
                id: project.id,
                name: project.name,
                home: project.kind === "home",
                conversations: project.conversations,
                changes: project.changes ?? [],
                create: { cwd: project.path },
                lifecycle: project.lifecycle,
                path: project.displayPath,
            };
        for (const worktree of project.worktrees)
            if (worktree.id === groupId)
                return {
                    id: worktree.id,
                    name: worktree.name,
                    home: false,
                    conversations: worktree.conversations,
                    changes: worktree.changes ?? [],
                    create: { cwd: worktree.path, worktreeId: worktree.id },
                    lifecycle: worktree.lifecycle,
                    path: worktree.displayPath,
                };
    }
    return undefined;
}

/**
 * The composer prompt names where the message lands. A window holds several
 * projects and worktrees at once, and their names read as anything from `happy`
 * to `Fix login redirect`, so the group is quoted rather than glued into a
 * sentence that only reads well for one kind of title.
 */
function composerPlaceholder(groupName: string | undefined): string {
    return groupName === undefined ? "Message Happy…" : `Message Happy in “${groupName}”…`;
}

/**
 * The composer prompt for a chat the reader may only read. It names the agent
 * holding the conversation, because that is the fact the reader needs: this work
 * belongs to something already running and is not waiting on a message. A chat
 * whose title has not been written yet says the same thing without a name rather
 * than falling back to jargon about what kind of chat it is.
 */
function conversationLockedPlaceholder(title: string | undefined): string {
    return title === undefined || title === "" ? "Running…" : `${title} is running this chat…`;
}

/** A sidebar row's id: which Happy Agent it belongs to, then the group inside it. */
function happyAgentItemId(happyAgentId: string, id: string): string {
    return `${happyAgentId}/${id}`;
}

function happyAgentItemParse(value: string): {
    readonly happyAgentId: string;
    readonly id: string;
} {
    const boundary = value.indexOf("/");
    return boundary < 0
        ? { id: "", happyAgentId: value }
        : { id: value.slice(boundary + 1), happyAgentId: value.slice(0, boundary) };
}

/**
 * The window's Happy Agents, each with its own projects, as one sidebar. Every row is
 * addressed by its Happy Agent and then by the group inside it, so a project on another
 * machine is selected, renamed, archived, and reordered through exactly the same
 * controls as one on this machine — against that machine's own workspace store.
 *
 * A machine that is not connected keeps the projects and work last confirmed
 * from it. Those rows remain navigation targets while their Happy Agent-backed actions
 * are disabled; reachability changes the section's state, not its membership.
 */
/**
 * The pinned rows in the order this window keeps them. A row the reader has
 * never moved — a newly reachable machine, for example — stays where the window
 * offered it, so an arrangement is a decision about the rows it was made about
 * and nothing else.
 */
function pinnedArrange(rows: readonly SidebarItem[], order: readonly string[]): SidebarItem[] {
    const byId = new Map(rows.map((row) => [row.id, row]));
    return happyAgentNavigationOrderApply(
        rows.map((row) => row.id),
        order,
    ).flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
    });
}

function happyAgentSidebarItemAvailability(
    item: SidebarItem,
    happyAgent: AppHappyAgentEntry,
): Pick<SidebarItem, "action" | "secondaryAction"> {
    const disconnected = happyAgent.status !== "connected";
    return {
        ...(item.action && disconnected
            ? { action: { ...item.action, disabled: true } }
            : item.action
              ? { action: item.action }
              : {}),
        ...(item.secondaryAction && disconnected
            ? { secondaryAction: { ...item.secondaryAction, disabled: true } }
            : item.secondaryAction
              ? { secondaryAction: item.secondaryAction }
              : {}),
    };
}

/**
 * The sections with the reader's folding applied, marked on the rows that carry
 * something nested under them.
 *
 * Said once over the finished sections rather than inside each builder above:
 * every one of them states rows with a depth, the row ids are only their final
 * ones by the time they reach here, and folding is one fact about the sidebar
 * rather than something a project, a folder and a contact list should each have
 * to remember. A row nothing is nested under is left alone, so it never claims a
 * fold that would do nothing.
 */
function sectionsCollapsed(
    sections: readonly SidebarSection[],
    collapsed: ReadonlySet<string>,
): SidebarSection[] {
    if (collapsed.size === 0) return sections as SidebarSection[];
    return sections.map((section) => ({
        ...section,
        items: section.items.map((item, index) =>
            collapsed.has(item.id) && (section.items[index + 1]?.depth ?? 0) > (item.depth ?? 0)
                ? { ...item, collapsed: true }
                : item,
        ),
    }));
}

function happyAgentSections(
    directory: AppHappyAgentDirectorySnapshot,
    titleShimmerEnabled: boolean,
    shortcutProject?: { readonly projectId: HappyAgentProjectId; readonly happyAgentId: string },
): SidebarSection[] {
    return directory.happyAgents.map((happyAgent) => ({
        id: `happy-agent:${happyAgent.id}`,
        label: happyAgent.label,
        status: happyAgentConnectionState(happyAgent),
        items: happyAgent.projects
            .flatMap((project) =>
                sidebarItems(
                    project,
                    titleShimmerEnabled,
                    shortcutProject?.happyAgentId === happyAgent.id &&
                        shortcutProject.projectId === project.id,
                ),
            )
            .map((item) => ({
                ...item,
                id: happyAgentItemId(happyAgent.id, item.id),
                ...happyAgentSidebarItemAvailability(item, happyAgent),
            })),
        // Project creation belongs to the Happy Agent named by this section.
        ...(happyAgent.status === "connected" && happyAgent.session
            ? {
                  action: {
                      busy: happyAgent.projectAdd?.pending === true,
                      icon: "plus" as const,
                      label: "Add project",
                      reveal: "always" as const,
                  },
                  ...(happyAgent.projectAdd?.error !== undefined
                      ? { error: happyAgent.projectAdd.error }
                      : {}),
              }
            : {}),
        // What a Happy Agent said when it failed belongs under its own heading.
        ...(happyAgent.status === "error" && happyAgent.message !== undefined
            ? { error: happyAgent.message }
            : {}),
        ...(happyAgent.projects.length === 0
            ? {
                  empty:
                      happyAgent.status === "connected"
                          ? {
                                description: "Choose a repository folder on this Mac.",
                                icon: "plus" as const,
                                title: "No projects yet",
                            }
                          : {
                                description: happyAgentEmptyDescription(happyAgent),
                                icon: "link" as const,
                                title: happyAgentStatusLabel(happyAgent),
                                actionLabel: "Open settings",
                            },
              }
            : {}),
    }));
}

/**
 * Command-number destinations prioritize the project somebody is working in:
 * its main checkout is always first, followed by its visible workspaces. Any
 * remaining digits focus other projects in the sidebar's ordinary top-to-bottom
 * Happy Agent/project order. Sidebar intersects this order with the rows it actually
 * draws, so a folded workspace consumes no number.
 */
function projectShortcutTargets(
    directory: AppHappyAgentDirectorySnapshot,
    activeHappyAgentId: string | undefined,
    activeProjectId: HappyAgentProjectId | undefined,
): readonly SidebarNumberShortcutTarget[] {
    const activeHappyAgent = directory.happyAgents.find(
        (happyAgent) => happyAgent.id === activeHappyAgentId,
    );
    const activeProject = activeHappyAgent?.projects.find(
        (project) => project.id === activeProjectId,
    );
    const target = (
        happyAgent: AppHappyAgentEntry,
        id: HappyAgentProjectId | HappyAgentWorktreeId,
    ): SidebarNumberShortcutTarget => ({
        itemId: happyAgentItemId(happyAgent.id, id),
        sectionId: `happy-agent:${happyAgent.id}`,
    });
    return [
        ...(activeHappyAgent && activeProject
            ? [
                  target(activeHappyAgent, activeProject.id),
                  ...activeProject.worktrees.map((worktree) =>
                      target(activeHappyAgent, worktree.id),
                  ),
              ]
            : []),
        ...directory.happyAgents.flatMap((happyAgent) =>
            happyAgent.projects.flatMap((project) =>
                happyAgent.id === activeHappyAgent?.id && project.id === activeProject?.id
                    ? []
                    : [target(happyAgent, project.id)],
            ),
        ),
    ];
}

/**
 * One Happy Agent's heading marker, projected from its connection state.
 */
function happyAgentConnectionState(happyAgent: AppHappyAgentEntry) {
    return happyAgent.status;
}

/** One directory entry's unified inner-health and outer-route availability. */
function happyAgentEntryAvailability(
    happyAgent: AppHappyAgentEntry,
): HappyAgentAvailabilitySnapshot | undefined {
    if (!happyAgent.session) return undefined;
    return happyAgentAvailabilityProject(happyAgent.session.connection.get(), true, {
        status: happyAgent.status,
        ...(happyAgent.message === undefined ? {} : { message: happyAgent.message }),
    });
}

/** The primary Happy Agent backing window-wide settings and chrome. */
export function hostHappyAgent(
    directory: AppHappyAgentDirectorySnapshot,
): AppHappyAgentEntry | undefined {
    return directory.happyAgents[0];
}

/**
 * What a section says when it is standing empty because its machine has not
 * answered.
 *
 * It does not say there is nothing there. Whatever that machine holds is
 * unknown while the connection is down, and telling the reader their work is
 * gone would be a worse mistake than telling them nothing. So this says only
 * where the connection stands; the failure itself is already stated under the
 * heading, and is not repeated here.
 */
function happyAgentEmptyDescription(happyAgent: AppHappyAgentEntry): string {
    if (happyAgent.status === "connecting") return "Connecting to this machine…";
    if (happyAgent.status === "error") return "Its projects will appear once it answers again.";
    return "Connect this machine to see its projects.";
}

function happyAgentStatusLabel(happyAgent: AppHappyAgentEntry): string {
    if (happyAgent.status === "connected") return "Connected";
    if (happyAgent.status === "connecting") return "Connecting…";
    return happyAgent.status === "error" ? "Not reachable" : "Disconnected";
}

/**
 * The pinned row that opens the addressed Happy Agent's inbox. It belongs with the
 * pinned rows rather than under a project because the questions it collects come
 * from every session on that machine at once, and the person answering them is
 * working through a queue rather than visiting a repository.
 */
const INBOX_ITEM = "inbox";

/**
 * The workspace window. It owns no product state: it subscribes to the directory
 * of Happy Agents, renders their projects as one sidebar, and hands the addressed Happy Agent's
 * own stores to the surface below. A Happy Agent that is still connecting, or one the
 * reader has disconnected from, keeps the sidebar and states itself in the
 * content area instead of taking the window away.
 */
export function AppHappyAgentView(props: AppHappyAgentViewProps) {
    const directory = useSyncExternalStore(
        props.happyAgents.subscribe,
        props.happyAgents.get,
        props.happyAgents.get,
    );
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    const titleShimmerStore = props.titleShimmer ?? titleShimmerStoreNoop;
    const titleShimmerEnabled = useSyncExternalStore(
        titleShimmerStore.subscribe,
        titleShimmerStore.get,
        titleShimmerStore.get,
    ).titleShimmerEnabled;
    // The order the reader arranged the pinned rows in belongs to the window
    // rather than to any one Happy Agent, so a machine going away rearranges nothing.
    const experimentsStore = props.experiments ?? experimentsStoreNoop;
    // The inbox and folders are still being built, so they are offered only to
    // a reader who has asked for unfinished work in settings. The switch is
    // read here so their routes, sidebar rows, and dialogs cannot disagree
    // about whether the surfaces exist.
    const experimental = useSyncExternalStore(
        experimentsStore.subscribe,
        experimentsStore.get,
        experimentsStore.get,
    ).experimentalFeaturesEnabled;
    const navigationOrderStore = props.navigationOrder ?? happyAgentNavigationOrderStoreNoop;
    const navigationOrder = useSyncExternalStore(
        navigationOrderStore.subscribe,
        navigationOrderStore.get,
        navigationOrderStore.get,
    );
    // Which projects and folders the reader folded shut. Like the order above it
    // this belongs to the window: a machine going away must not unfold the tree
    // somebody arranged, and coming back must not fold it again.
    const sidebarCollapseStore = props.sidebarCollapse ?? happyAgentSidebarCollapseStoreNoop;
    const sidebarCollapse = useSyncExternalStore(
        sidebarCollapseStore.subscribe,
        sidebarCollapseStore.get,
        sidebarCollapseStore.get,
    );
    const windowStateStore = props.windowState ?? happyAgentWindowStoreNoop;
    const windowState = useSyncExternalStore(
        windowStateStore.subscribe,
        windowStateStore.get,
        windowStateStore.get,
    );
    const active =
        directory.happyAgents.find((happyAgent) => happyAgent.id === props.happyAgentId) ??
        directory.happyAgents[0] ??
        undefined;
    const viewerId = happyAgentOwnerAuthor.id;
    const activeAvailability = active ? happyAgentEntryAvailability(active) : undefined;
    const addressedProject =
        active && props.groupId ? rowOwnerFind(active.projects, props.groupId)?.project : undefined;
    const shortcutProject = activeAvailability?.online ? addressedProject : undefined;
    const workspaceCreateTarget =
        active && shortcutProject?.lifecycle.phase === "ready"
            ? { projectId: shortcutProject.id, happyAgentId: active.id }
            : undefined;
    const activeHappyAgentOnline = (): boolean => {
        const current = props.happyAgents.get();
        const happyAgent =
            current.happyAgents.find((entry) => entry.id === props.happyAgentId) ??
            current.happyAgents[0] ??
            undefined;
        return happyAgent ? (happyAgentEntryAvailability(happyAgent)?.online ?? false) : false;
    };
    const happyAgentOf = (happyAgentId: string) =>
        directory.happyAgents.find((happyAgent) => happyAgent.id === happyAgentId);
    // The pinned row carries a live count, so the window subscribes to the
    // addressed Happy Agent's inbox whether or not the inbox itself is open: the point of
    // the count is to be seen while the reader is doing something else.
    const inboxStore = active?.session?.inbox ?? happyAgentInboxStoreNoop;
    const inbox = useSyncExternalStore(inboxStore.subscribe, inboxStore.get, inboxStore.get);
    const daemonStore = props.daemon ?? sidebarDaemonStoreNoop;
    const daemon = useSyncExternalStore(daemonStore.subscribe, daemonStore.get, daemonStore.get);
    const inboxPending = inbox.pending.length;
    const desktop = props.platform === "desktop";
    // Happy's own update wins the row. Restarting the app is the larger event of
    // the two, and it carries the agent with it, so the agent states its case
    // once there is nothing bigger waiting.
    const agentUpdate = props.update ? undefined : agentUpdateOffer(daemon);
    const sidebarUpdate = props.update ? (
        <SidebarUpdateAction
            action={props.update.action}
            detail={props.update.detail}
            onAction={props.update.status === "downloaded" ? props.onUpdateApply : undefined}
            status={props.update.status}
            subject="application"
            version={props.update.version}
        />
    ) : agentUpdate ? (
        <SidebarUpdateAction
            action="install"
            detail={agentUpdate.detail}
            onAction={agentUpdate.status === "downloaded" ? daemonStore.daemonInstall : undefined}
            status={agentUpdate.status}
            subject="happyAgent"
            version={agentUpdate.version}
        />
    ) : undefined;
    // The pinned rows as the window offers them. What the reader has made of
    // that order is applied below, so this list only ever states which rows this
    // window has and what each one is.
    // The inbox belongs to the addressed machine, so it appears only while that
    // machine is reachable: a queue of questions is meaningless from a Happy Agent that
    // cannot say what it is waiting on.
    const pinnedOffered: SidebarItem[] =
        experimental && active?.session?.inbox
            ? [
                  {
                      badge: inboxPending,
                      icon: "bell",
                      id: INBOX_ITEM,
                      kind: "action",
                      label: "Inbox",
                  },
              ]
            : [];
    const pinned = pinnedArrange(pinnedOffered, navigationOrder.order);
    const sidebar = (
        <Sidebar
            actions={pinned}
            numberShortcuts="navigate"
            numberShortcutTargets={projectShortcutTargets(
                directory,
                active?.id,
                addressedProject?.id,
            )}
            activeItemId={
                experimental && props.inboxOpen
                    ? INBOX_ITEM
                    : props.groupId
                      ? happyAgentItemId(props.happyAgentId, props.groupId)
                      : ""
            }
            // The desktop window puts the traffic lights and the sidebar
            // toggle in this heading, so the product mark stands down and the
            // row becomes the window's drag lane. Full screen takes the lights
            // away, and the whole lockup heads the sidebar there — on the same
            // lane as the rows beneath it — rather than leaving the window's
            // top-left corner empty.
            brand={desktop ? windowState.fullScreen : true}
            composeLabel="Create"
            footer={
                <SidebarFooter
                    actions={sidebarUpdate}
                    appearance={appearance.appearance}
                    devMenu={
                        props.buildIdentity ? (
                            <DevBuildMenu
                                branch={props.buildIdentity.branch}
                                label={props.buildIdentity.label}
                                onBlueprintOpen={props.onBlueprintOpen}
                                onCopyPath={() =>
                                    void navigator.clipboard
                                        .writeText(props.buildIdentity!.path)
                                        .catch(() => undefined)
                                }
                                path={props.buildIdentity.path}
                            />
                        ) : undefined
                    }
                    onAppearanceToggle={() => props.appearance.appearanceToggle()}
                    onSettingsOpen={props.onSettingsOpen}
                />
            }
            headerAccessory={
                // Reachability is the window's line, not the sidebar's — see the
                // band at the top. What stays here is what only this list can
                // say: that the Happy Agent is up and still did not hand over its
                // sessions.
                active?.status === "connected" && active.projectsStatus === "error" ? (
                    <Banner
                        action={{
                            label: "Retry",
                            onClick: () => active.session?.workspace.conversationListRetry(),
                        }}
                        tone="danger"
                        title="Sessions unavailable"
                    >
                        {`${active.label} did not return its projects.`}
                    </Banner>
                ) : active?.status === "connected" && active.projectsStatus === "loading" ? (
                    // Also only while the Happy Agent is up. Losing it resets the list to
                    // loading, and "Loading sessions…" under a band saying the
                    // machine is unreachable is a promise nothing is keeping.
                    <Banner tone="neutral">Loading sessions…</Banner>
                ) : undefined
            }
            itemMenuItems={(item) => {
                const row = happyAgentItemParse(item.id);
                const happyAgent = happyAgentOf(row.happyAgentId);
                if (happyAgent?.status !== "connected") return [];
                return rowMenuItems(happyAgent.projects, { ...item, id: row.id });
            }}
            // Create is the window's, not a screen's: the dialog is mounted
            // beside whatever is showing, so this row answers from every route.
            // It is offered only while there is a machine to start a session on,
            // because a Create that opened nothing would be worse than no row.
            {...(activeAvailability?.online === true && active?.session?.workspace
                ? { onCompose: () => active.session?.workspace.createOpen() }
                : {})}
            // The section action adds a project to the Happy Agent named by that section.
            onSectionAction={(sectionId) => {
                const happyAgent = happyAgentOf(sectionId.slice("happy-agent:".length));
                if (happyAgent?.status !== "connected") {
                    props.onSettingsOpen();
                    return;
                }
                const workspace = happyAgent.session?.workspace;
                if (!workspace) return;
                workspace.projectAdd();
            }}
            onItemMenuSelect={(item, actionId) => {
                const row = happyAgentItemParse(item.id);
                const happyAgent = happyAgentOf(row.happyAgentId);
                if (!happyAgent) return;
                if (happyAgent.status !== "connected") return;
                const workspace = happyAgent.session?.workspace;
                const owner = rowOwnerFind(happyAgent.projects, row.id);
                if (!owner || !workspace) return;
                if (actionId === ROW_MENU_RENAME) {
                    workspace.renameOpen(owner.project.id, owner.worktreeId);
                    return;
                }
                if (actionId !== ROW_MENU_ARCHIVE) return;
                // Deliberately no navigation here. An archive that the host
                // refuses would have ejected the reader from a project that is
                // still there, and an archive performed from another window or
                // another machine would not have moved them at all. Leaving the
                // addressed group is one thing, driven by the host's own catalog
                // no longer holding it, and the workspace reports that.
                void (
                    owner.worktreeId
                        ? workspace.worktreeArchive(owner.project.id, owner.worktreeId)
                        : workspace.projectArchive(owner.project.id)
                ).catch(() => undefined);
            }}
            // Addressing a group opens the tab it was left on, so a list row
            // lands back where the reader was rather than on an empty screen.
            // Once every remembered tab is gone, its first session is what the
            // group still has to show.
            onItemSelect={(id) => {
                if (id === INBOX_ITEM) {
                    props.onInboxOpen?.();
                    return;
                }
                const row = happyAgentItemParse(id);
                const happyAgent = happyAgentOf(row.happyAgentId);
                if (!happyAgent) return;
                const groupId = row.id as HappyAgentGroupId;
                props.onChatSelect(
                    happyAgent.id,
                    row.id,
                    // A workspace that has not recorded where this project was
                    // left falls back to its most recent conversation, which is
                    // also what a workspace without the memory at all does.
                    happyAgent.session?.workspace.get().groupResume?.get(groupId) ??
                        openGroupFind(happyAgent.projects, row.id)?.conversations[0]?.id,
                );
            }}
            onItemAction={(id) => {
                const row = happyAgentItemParse(id);
                const happyAgent = happyAgentOf(row.happyAgentId);
                if (!happyAgent) return;
                if (happyAgent.status !== "connected") return;
                const workspace = happyAgent.session?.workspace;
                const owner = rowOwnerFind(happyAgent.projects, row.id);
                if (!owner || !workspace) return;
                // The plus on a project adds a worktree; the control on a
                // worktree archives it.
                void (
                    owner.worktreeId
                        ? workspace.worktreeArchive(owner.project.id, owner.worktreeId)
                        : workspace.worktreeCreate(owner.project.id)
                ).catch(() => undefined);
            }}
            // The cog on a project row. Only project rows carry one, and the
            // settings surface is the same one the row's menu opens.
            onItemSecondaryAction={(id) => {
                const row = happyAgentItemParse(id);
                const happyAgent = happyAgentOf(row.happyAgentId);
                if (!happyAgent) return;
                if (happyAgent.status !== "connected") return;
                const workspace = happyAgent.session?.workspace;
                const owner = rowOwnerFind(happyAgent.projects, row.id);
                if (!owner || owner.worktreeId || !workspace) return;
                workspace.renameOpen(owner.project.id, undefined);
            }}
            {...(props.navigationOrder
                ? {
                      onActionReorder: (move: SidebarReorder) => {
                          props.navigationOrder?.itemReorder(
                              move.id,
                              move.afterId,
                              pinned.map((row) => row.id),
                          );
                      },
                  }
                : {})}
            onItemReorder={(sectionId, move) => {
                const happyAgent = happyAgentOf(sectionId.slice("happy-agent:".length));
                if (happyAgent?.status !== "connected") return;
                const workspace = happyAgent?.session?.workspace;
                if (!workspace) return;
                const moved = happyAgentItemParse(move.id).id;
                const after = move.afterId === null ? null : happyAgentItemParse(move.afterId).id;
                // A drag inside a project rearranges its worktrees; a drag
                // at the top level rearranges the projects themselves.
                void (
                    move.parentId
                        ? workspace.worktreeReorder(
                              happyAgentItemParse(move.parentId).id as HappyAgentProjectId,
                              moved as HappyAgentWorktreeId,
                              after as HappyAgentWorktreeId | null,
                          )
                        : workspace.projectReorder(
                              moved as HappyAgentProjectId,
                              after as HappyAgentProjectId | null,
                          )
                ).catch(() => undefined);
            }}
            // A row is folded shut by this window's own record, so a project
            // whose checkouts are hidden stays hidden as its Happy Agent comes and goes.
            {...(props.sidebarCollapse
                ? {
                      onItemCollapseToggle: (id: string) => {
                          sidebarCollapseStore.rowCollapseToggle(id);
                      },
                  }
                : {})}
            sections={sectionsCollapsed(
                happyAgentSections(directory, titleShimmerEnabled, workspaceCreateTarget),
                sidebarCollapse.collapsed,
            )}
        />
    );

    // Which screen the window is showing. It is a value rather than a set of
    // early returns because the window's own dialogs are mounted beside it: a
    // surface that answers on one route and not another is not a window-level
    // surface at all.
    const routeContent = (): ReactNode => {
        // The workbench belongs to no machine and needs no connection: it renders the
        // component pages themselves, so it is independent of every Happy Agent.
        if (props.blueprintOpen)
            return (
                <>
                    {desktop ? <WindowDragRegion /> : null}
                    <BlueprintView />
                </>
            );

        // The inbox belongs to the addressed machine, so it is shown only while that
        // machine has stores to answer through.
        if (experimental && props.inboxOpen && active?.session?.inbox)
            return (
                <>
                    {desktop ? <WindowDragRegion /> : null}
                    <HappyAgentInboxSurface
                        onOpenSession={(happyAgentId, groupId, chatId) =>
                            props.onChatSelect(happyAgentId, groupId, chatId)
                        }
                        projects={active.projects}
                        happyAgentId={active.id}
                        happyAgentOnline={activeHappyAgentOnline}
                        snapshot={inbox}
                        store={active.session.inbox}
                        {...(activeAvailability?.refusal === undefined
                            ? {}
                            : { unavailable: activeAvailability.refusal })}
                    />
                </>
            );

        if (active?.session)
            return (
                <HappyAgentWorkspaceSurface
                    availability={
                        activeAvailability ??
                        happyAgentAvailabilityProject(active.session.connection.get(), true, {
                            status: active.status,
                            ...(active.message === undefined ? {} : { message: active.message }),
                        })
                    }
                    appearance={props.appearance}
                    browserContent={props.browserContent}
                    htmlPreview={props.htmlPreview}
                    mediaWindow={props.mediaWindow}
                    chatId={props.chatId}
                    clock={active.session.clock}
                    groupId={props.groupId}
                    key={active.id}
                    onChatSelect={(groupId, chatId, replace) =>
                        props.onChatSelect(active.id, groupId, chatId, replace)
                    }
                    onChatClose={(groupId, chatId, fallbackChatId) =>
                        props.onChatClose?.(active.id, groupId, chatId, fallbackChatId) ?? false
                    }
                    onFileClose={(groupId, path) => props.onFileClose(active.id, groupId, path)}
                    onFileSelect={(groupId, chatId, path, kind, replace) =>
                        props.onFileSelect(active.id, groupId, chatId, path, kind, replace)
                    }
                    platform={props.platform}
                    projects={active.projects}
                    happyAgentOnline={activeHappyAgentOnline}
                    titleShimmerEnabled={titleShimmerEnabled}
                    viewerId={viewerId}
                    workspace={active.session.workspace}
                    {...(workspaceCreateTarget
                        ? { workspaceCreateProjectId: workspaceCreateTarget.projectId }
                        : {})}
                />
            );
        // The host Happy Agent has no live stores yet — it is still connecting, or it could
        // not be reached. The sidebar stays so the window keeps its shape while
        // that resolves; anything the reader can do about it is a settings act,
        // which is where the control points.
        return (
            <>
                {desktop ? <WindowDragRegion /> : null}
                <EmptyState
                    action={{
                        label: "Open settings",
                        icon: "settings",
                        onClick: props.onSettingsOpen,
                    }}
                    description={
                        active
                            ? (active.message ??
                              (active.status === "connecting"
                                  ? `Connecting to ${active.label}…`
                                  : `${active.label} is disconnected.`))
                            : "Waiting for this machine's Happy Agent."
                    }
                    icon={active?.status === "error" ? "shield" : "link"}
                    size="panel"
                    title={active ? active.label : "No machine"}
                />
            </>
        );
    };

    return (
        <>
            {/* Window chrome has one lifetime. Happy Agent workspaces keep their own
                keyed lifetimes inside its content region, so changing machines
                resets machine-owned UI without rebuilding this sidebar's DOM,
                focus, width, collapsed state, or scroll position. */}
            <AppShell
                sidebarCollapsible
                shortcutHints="interactive"
                windowControls={desktop}
                windowFullScreen={windowState.fullScreen}
                sidebar={sidebar}
            >
                {routeContent()}
            </AppShell>
            {/* The window's own dialogs, mounted once beside whatever screen is
                showing rather than inside one of them. Naming a row belongs to
                the sidebar, and Create belongs to the window: both are reached
                from chrome that is on every route, so a cog or a Create that
                answered on the workspace and did nothing on the inbox would not
                be a control. Being outside the screen is also what lets a task
                being written survive the route notifications underneath it. */}
            {active?.session?.workspace ? (
                <HappyAgentWindowDialogs
                    projects={active.projects}
                    happyAgentOnline={activeHappyAgentOnline}
                    workspace={active.session.workspace}
                    {...(activeAvailability?.refusal === undefined
                        ? {}
                        : { unavailable: activeAvailability.refusal })}
                />
            ) : null}
        </>
    );
}

/**
 * One Happy Agent's inbox inside the window's shell. It subscribes to nothing: the
 * window already reads this store for the sidebar count, so the queue and the
 * badge are one subscription and can never disagree about how many questions
 * are waiting.
 *
 * Naming an item's location and opening the session that asked are addressing
 * acts, which is why they live here rather than in the page: the page renders
 * questions, the window decides where they came from and where they lead.
 */
function HappyAgentInboxSurface(props: {
    onOpenSession(happyAgentId: string, groupId: string, chatId: string): void;
    projects: readonly HappyAgentProjectGroup[];
    happyAgentId: string;
    happyAgentOnline: () => boolean;
    snapshot: HappyAgentInboxSnapshot;
    store: HappyAgentInboxStore;
    unavailable?: string;
}) {
    const locate = (item: HappyAgentInboxItem) => {
        const scope = item.scope;
        if (!scope) return undefined;
        const project = props.projects.find((candidate) => candidate.id === scope.projectId);
        if (!project) return undefined;
        if (scope.kind === "project") return project.name;
        const worktree = project.worktrees.find((candidate) => candidate.id === scope.worktreeId);
        return worktree ? `${project.name} · ${worktree.name}` : project.name;
    };
    return (
        <HappyAgentInboxPage
            answered={props.snapshot.answered}
            {...(props.snapshot.error ? { error: props.snapshot.error } : {})}
            itemLocation={locate}
            itemTime={(item) =>
                inboxItemTime(item.status === "answered" ? item.resolvedAt : item.createdAt)
            }
            loading={props.snapshot.loading}
            messages={props.snapshot.messages}
            onAnswer={(itemId, answers) => {
                if (props.happyAgentOnline()) props.store.itemAnswer(itemId, answers);
            }}
            onMessageChange={(itemId, text) => props.store.itemMessageUpdate(itemId, text)}
            onMessageSubmit={(itemId) => {
                if (props.happyAgentOnline()) props.store.itemMessageSubmit(itemId);
            }}
            onSelectionChange={(itemId, answers) =>
                props.store.itemSelectionUpdate(itemId, answers)
            }
            selections={props.snapshot.selections}
            onOpenSession={(item) => {
                if (!item.scope) return;
                props.onOpenSession(
                    props.happyAgentId,
                    happyAgentSessionGroupIdOf(item.scope),
                    item.sessionId,
                );
            }}
            pending={props.snapshot.pending}
            submissions={props.snapshot.submissions}
            {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
        />
    );
}

/** When a question was asked or settled, as an absolute local time. */
function inboxItemTime(value: number | undefined): string | undefined {
    if (value === undefined) return undefined;
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
    );
}

interface HappyAgentWorkspaceSurfaceProps {
    /** Unified outer route and daemon health for this already materialized Happy Agent. */
    availability: HappyAgentAvailabilitySnapshot;
    /** Re-reads unified availability when a retained network handler fires. */
    happyAgentOnline: () => boolean;
    /** Joined conversation-list + active-conversation product store. */
    workspace: HappyAgentWorkspaceStore;
    /**
     * The Happy Agent's projects, for the surfaces that address a project the window is
     * not currently open on — the settings dialog reached from any row.
     */
    projects: readonly HappyAgentProjectGroup[];
    /** Ticking clock feeding relative timestamps in the conversation list. */
    clock: HappyAgentClockStore;
    appearance: AppearanceStore;
    platform?: "desktop" | "web";
    browserContent?: BrowserContentRenderer;
    htmlPreview?: HtmlPreviewRenderer;
    mediaWindow?: MediaWindowOpener;
    /** Whether active session titles shimmer in the tab strip. */
    titleShimmerEnabled: boolean;
    /** Identity of the human reading and writing this Happy Agent. */
    viewerId: string;
    groupId?: string;
    chatId?: string;
    /** Ready online project that Cmd-N and its sidebar cap both address. */
    workspaceCreateProjectId?: HappyAgentProjectId;
    onChatSelect(groupId: string | undefined, chatId?: string, replace?: boolean): void;
    onChatClose(groupId: string, chatId: string, fallbackChatId?: string): boolean;
    onFileClose(groupId: string, path: string): void;
    onFileSelect(
        groupId: string,
        chatId: string | undefined,
        path: string,
        kind: HappyAgentFileTabKind,
        replace?: boolean,
    ): void;
}

/**
 * One Happy Agent's workspace. It subscribes once each to that Happy Agent's connection,
 * workspace, panel, clock, and appearance stores (no local React state) and
 * composes the shared `happy-desktop-ui` components, including `ConversationView`
 * for the selected conversation and the desktop affordances (the model and
 * effort pickers beneath the composer, the settings
 * dialog holding the view toggles and access pickers, and the usage and activity
 * panels) passed into that surface.
 *
 * The right panel is the workspace's tool column: terminals now, other kinds of
 * tab later. It is a second subscription rather than part of the workspace
 * snapshot because a live terminal repaints far faster than the conversation does
 * and must not drag this whole surface through a render to do it.
 *
 * Until this Happy Agent's daemon connection is live it shows the connection status with
 * a retry. Which conversation is shown comes from the route through `chatId`, and
 * choosing another one is a navigation request; materialization and every draft
 * keystroke live in the workspace store outside React, so this component stays a
 * pure projection.
 */
function HappyAgentWorkspaceSurface(props: HappyAgentWorkspaceSurfaceProps) {
    const workspaceFocusedPane = useRef<AppShellFocusedPane>("workspace");
    const closedTabs = useRef<HappyAgentClosedTab[]>([]);
    // AppShell's panel callback ref treats this callback's identity as the
    // panel lifetime, so ordinary store renders must keep it stable.
    const workspaceFocusedPaneChange = useCallback((pane: AppShellFocusedPane): void => {
        workspaceFocusedPane.current = pane;
    }, []);
    const workspace = useSyncExternalStore(
        reactFrameSubscribe(props.workspace),
        props.workspace.get,
        props.workspace.get,
    );
    const panel = useSyncExternalStore(
        props.workspace.panel.subscribe,
        props.workspace.panel.get,
        props.workspace.panel.get,
    );
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    // A materialized workspace is a Happy Agent lifetime, not a connection lifetime.
    // Health only changes what this mounted surface may do and what it says
    // about the state already on screen.
    const availability = props.availability;
    const connectionRefusal = availability.refusal;
    const happyAgentOnline = props.happyAgentOnline;
    const paneFocusSchedule = (pane: AppShellFocusedPane, groupId?: HappyAgentGroupId): void => {
        workspaceFocusedPane.current = pane;
        if (typeof window === "undefined") return;
        window.requestAnimationFrame(() => {
            if (groupId !== undefined && props.workspace.get().address.groupId !== groupId) return;
            const shell = document.querySelector<HTMLElement>(
                '[data-happy-desktop-ui="app-shell"][data-embedded]',
            );
            const region = shell?.querySelector<HTMLElement>(
                pane === "panel"
                    ? '[data-happy-desktop-ui="app-shell-panel"]'
                    : '[data-happy-desktop-ui="app-shell-workspace"]',
            );
            const selectedTab = region?.querySelector<HTMLElement>(
                '[data-happy-desktop-ui="tab"][aria-selected="true"]',
            );
            // An empty workspace has no selected tab, and a just-opened panel
            // can render its viewer one frame after its chrome. These stable
            // controls complete the pane handoff in either interim state.
            const paneFallback =
                pane === "workspace"
                    ? region?.querySelector<HTMLElement>(`[aria-label="${RECENT_SESSIONS_LABEL}"]`)
                    : region?.querySelector<HTMLElement>(`[aria-label="${PANEL_HIDE_LABEL}"]`);
            (selectedTab ?? paneFallback)?.focus({ preventScroll: true });
        });
    };
    const closedTabRemember = (tab: HappyAgentClosedTab): void => {
        closedTabs.current.push(tab);
        if (closedTabs.current.length > CLOSED_TAB_HISTORY_LIMIT) closedTabs.current.shift();
    };
    const closedTabUndoAvailable = (): boolean => {
        const tab = closedTabs.current.at(-1);
        return tab !== undefined && (tab.type !== "session" || happyAgentOnline());
    };
    const closedTabUndo = (): void => {
        const tab = closedTabs.current.pop();
        if (!tab) return;
        if (tab.type === "panel") {
            if (!props.workspace.panel.get().open) props.workspace.panel.panelToggle();
            paneFocusSchedule("panel");
            return;
        }
        if (tab.type === "file") {
            if (tab.placement === "panel") {
                props.workspace.filePanelOpen(tab.groupId, tab.path, tab.fileKind);
                paneFocusSchedule("panel", tab.groupId);
                return;
            }
            const current = props.workspace.get().address;
            // Route application opens a preview. Seed a permanent tab first
            // when that is what was closed; the preview application then finds
            // the same tab and deliberately cannot demote it.
            if (!tab.preview) props.workspace.fileOpen(tab.groupId, tab.path, tab.fileKind);
            props.onFileSelect(
                tab.groupId,
                current.groupId === tab.groupId ? current.conversationId : undefined,
                tab.path,
                tab.fileKind,
            );
            paneFocusSchedule("workspace", tab.groupId);
            return;
        }
        if (tab.type === "sessionAddress") {
            props.onChatSelect(tab.groupId, tab.sessionId);
            paneFocusSchedule("workspace", tab.groupId);
            return;
        }
        void props.workspace
            .conversationRestore(tab.sessionId)
            .then(() => {
                props.onChatSelect(tab.groupId, tab.sessionId);
                paneFocusSchedule("workspace", tab.groupId);
            })
            .catch(() => closedTabRemember(tab));
    };
    const terminalHappyAgentAvailability = availability.online
        ? undefined
        : availability.state === "reconnecting"
          ? ("reconnecting" as const)
          : ("unavailable" as const);

    // Inside an open project the directory is already decided, so every "new
    // session" affordance here starts one in it rather than asking again.
    const groupConversationCreate = (group: OpenGroup) => {
        if (!happyAgentOnline() || !group.create) return;
        void props.workspace.conversationCreate(group.id, group.create).catch(() => undefined);
    };

    const projects = workspace.list.projects;
    const rows = projects.type === "ready" ? projects.value : [];
    // What may be done in the addressed checkout, as the state decided it.
    // Connection health stays separate: each control combines the relevant
    // durable refusal with connection state at the boundary where it acts.
    const access = workspace.groupAccess;
    // Why a chat cannot be started here or sent to. A workspace whose checkout
    // Happy Agent is still preparing refuses the second and not the first, so the two
    // reasons are kept apart all the way down to the controls: a composer reads
    // this one, while file and terminal actions read the write refusal above it.
    const openGroupChatRefusal = access.conversationRefusal;
    const openGroup = openGroupFind(rows, props.groupId);
    // Whether another session may be added here. A workspace whose checkout is
    // still being prepared already has the one it was made with and can take no
    // second: Happy Agent does not queue an agent against a checkout that is not there,
    // so the control is disabled until it arrives rather than offering a tab
    // that could not open.
    const sessionCreateAvailable =
        openGroup?.create !== undefined &&
        connectionRefusal === undefined &&
        openGroupChatRefusal === undefined &&
        workspaceLifecyclePhase(openGroup.lifecycle) !== "creating";
    const workspaceCreateProjectId = props.workspaceCreateProjectId;
    // The worktree phase this screen has to say something about. `ready` and a
    // project both leave it absent: there is nothing to interrupt the reader
    // with when the place they are looking at is simply there.
    const openGroupPhase = workspaceLifecyclePhase(openGroup?.lifecycle);
    // Whether that phase is the whole screen rather than a lane over it. It is,
    // and only is, when nothing has ever run here and nothing ever can: an empty
    // workspace that failed, was refused, or has lost its folder has no composer
    // worth drawing. One that is merely being prepared does — it takes chats
    // already — so the phase goes in the lane above it instead.
    const openGroupNotice =
        openGroup !== undefined &&
        openGroup.conversations.length === 0 &&
        openGroupPhase !== undefined &&
        !access.canConverse;
    // The one phase that takes the body of the first chat rather than a strip
    // above it. A workspace is addressed the instant it is asked for, so this is
    // the screen the reader lands on straight after clicking: the checkout being
    // prepared is the only thing happening here, so it is the only thing shown,
    // with the composer still live underneath it. Every control that would act
    // on a directory that is not there yet is withheld for the same reason —
    // there is nothing behind them to act on until the checkout arrives.
    const openGroupPreparing = openGroupPhase === "creating";
    // The address the reader was sent to when a creation was accepted locally
    // and then refused. There is no row at it any more — happy-agent-connect withdrew
    // the one it had predicted — so the address answers for itself here rather
    // than falling through to "no project open".
    const refusedCreate =
        openGroup === undefined && props.groupId !== undefined
            ? workspace.list.worktreeCreateFailures.get(props.groupId as HappyAgentWorktreeId)
            : undefined;
    const groupFileTabs = openGroup
        ? workspace.fileTabs.filter(
              (tab) => tab.groupId === openGroup.id && tab.placement === "main",
          )
        : [];
    const activeFile = groupFileTabs.find((tab) => tab.id === workspace.activeMainViewId);
    const displayedFileTab = groupFileTabs.find((tab) => tab.id === workspace.displayedMainViewId);
    const displayedFile =
        displayedFileTab?.displayedDocument === undefined
            ? displayedFileTab
            : {
                  ...displayedFileTab,
                  kind: displayedFileTab.displayedKind ?? displayedFileTab.kind,
                  path: displayedFileTab.displayedPath ?? displayedFileTab.path,
                  document: {
                      type: "ready" as const,
                      value: displayedFileTab.displayedDocument,
                  },
              };
    const pendingFile =
        activeFile &&
        (workspace.displayedMainViewId !== activeFile.id ||
            (activeFile.displayedPresentationId !== activeFile.presentationId &&
                (activeFile.document.type !== "ready" ||
                    activeFile.document.value !== activeFile.displayedDocument)))
            ? activeFile
            : undefined;
    // Terminals and pages the reader moved out of the panel. They belong to the
    // addressed group the way the panel does, so they are listed and drawn here
    // only while that group is the one open.
    const mainTools = openGroup ? toolTabsPlaced(panel, "main") : [];
    const activeMainTool = mainTools.find((tab) => tab.id === workspace.activeMainViewId);
    const displayedMainTool = mainTools.find((tab) => tab.id === workspace.displayedMainViewId);
    const openInRecent = workspace.openInRecent;
    const conversation = workspace.conversation;
    // A chat that belongs to another session rather than to this group's strip.
    // The state says so outright — the host gives such a session no place in an
    // order — because the alternatives all lie at the moment it matters: a
    // session is addressed the instant it is named, so it is legitimately
    // missing from the rows for a moment after the reader creates it, and
    // reading that absence as delegation locked them out of their own new chat
    // and put someone else's name on it.
    const detachedConversationId =
        workspace.conversationDelegated && props.chatId ? props.chatId : undefined;
    const detachedConversation =
        detachedConversationId && conversation.type === "ready" ? conversation.value : undefined;
    const detachedConversationTab: TabItem | undefined = detachedConversationId
        ? {
              id: detachedConversationId,
              // The chat's own mark and the chat's own name, exactly as every
              // other session tab wears them. A shared glyph and the word
              // "Subagent" told the reader which category of thing they had
              // opened, which they already knew, while taking away the one thing
              // that tells this chat apart from the next one.
              avatarId: detachedConversationId,
              label: detachedConversation?.title ?? "Untitled",
              labelShimmer: props.titleShimmerEnabled,
              ...(detachedConversation !== undefined &&
              happyAgentConversationWorking(detachedConversation)
                  ? { busy: true }
                  : {}),
          }
        : undefined;
    // Sessions without a list position are delegated children. They remain
    // readable by id, but their runner owns their input and configuration.
    // A workspace that cannot take a chat cannot take a message into an old
    // conversation either: the session is pointed at a checkout that will never
    // be usable, so what it read before stays readable and its input closes with
    // the reason it closed for. A checkout merely still being prepared is not
    // that: Happy Agent holds the message until the directory arrives, so the input
    // stays open and the reader can keep writing.
    const conversationReadOnly =
        detachedConversationId !== undefined || openGroupChatRefusal !== undefined;
    const conversationReadOnlyReason =
        detachedConversationId !== undefined
            ? conversationLockedPlaceholder(detachedConversation?.title)
            : openGroupChatRefusal;
    // Stopping is not writing. An unusable checkout still has whatever was
    // already running in it, and leaving the reader unable to end that would be
    // work they can see, cannot write to, and cannot stop either.
    const conversationCanAbort =
        availability.online && detachedConversationId === undefined && access.canAbort;
    // One strip, holding the group's sessions and its open files together in
    // the single order the reader arranged. A detached subagent is addressed by
    // id rather than listed, so it is not part of that order and follows it.
    const groupTabs: TabItem[] = [
        ...tabsOrdered(
            openGroup
                ? [
                      ...sessionTabs(openGroup, props.titleShimmerEnabled).map((tab) =>
                          availability.online ? tab : { ...tab, closable: false },
                      ),
                      ...groupFileTabs.map(fileTabItem),
                      ...toolTabItems(mainTools),
                  ]
                : [],
            workspace.tabOrder,
        ),
        ...(detachedConversationTab ? [detachedConversationTab] : []),
    ];
    const historyMenuItems = (): readonly MenuItem[] => {
        if (!openGroup) return [];
        // One list in one order: every session this workspace has, open or
        // closed, most recently active first. It is the session list as the
        // host keeps it — the open rows are the strip's sessions, the closed
        // ones are the archived rows the list still remembers — so the menu
        // answers "what was I just working on here" by time, the way Xcode's
        // recents do, rather than replaying local clicks.
        const openSessionIds = new Set(openGroup.conversations.map((summary) => summary.id));
        const rows = [
            ...openGroup.conversations.map((summary) => ({
                sessionId: summary.id as HappyAgentSessionId,
                title: summary.title,
                updatedAt: summary.updatedAt,
                open: true,
            })),
            ...workspace.list.archivedSessions
                .filter(
                    (session) =>
                        session.parentSessionId === undefined &&
                        happyAgentSessionGroupIdOf(session) === openGroup.id &&
                        !openSessionIds.has(session.id),
                )
                .map((session) => ({
                    sessionId: session.id,
                    title: session.title?.trim() || `Session ${session.id.slice(0, 8)}`,
                    updatedAt: session.lastMessageAt ?? session.updatedAt,
                    open: false,
                })),
        ].sort((left, right) => right.updatedAt - left.updatedAt);
        if (rows.length === 0)
            return [
                {
                    disabled: true,
                    icon: "history",
                    id: "empty",
                    kind: "item",
                    label: "No sessions yet",
                },
            ];
        return rows.map(
            (row): MenuItem => ({
                // Selecting an open session is local navigation and works
                // offline; reopening a closed one asks the host.
                disabled: !row.open && !availability.online,
                icon: row.open ? "chat" : "history",
                id: `${HISTORY_SESSION_PREFIX}${row.sessionId}`,
                kind: "item",
                label: row.title,
            }),
        );
    };
    // Closing a tab archives the session behind it, while a file tab simply
    // closes. The close control and every context-menu sweep funnel through
    // this one routine, so a sweep behaves exactly like closing each tab by
    // hand. History is repaired before the session leaves the list. It chooses
    // the most recently visited survivor in this workspace; a requested keeper
    // or the nearest surviving session to the left is its fallback.
    const groupTabsClose = (tabIds: readonly string[], keepId?: string) => {
        const current = props.workspace.get();
        const currentRows =
            current.list.projects.type === "ready" ? current.list.projects.value : [];
        const currentGroup = openGroupFind(currentRows, current.address.groupId);
        if (!currentGroup) return;
        const panelNow = props.workspace.panel.get();
        const online = happyAgentOnline();
        const sessionIds = new Set(currentGroup.conversations.map((summary) => summary.id));
        const fileIds = new Set(
            current.fileTabs
                .filter((tab) => tab.groupId === currentGroup.id && tab.placement === "main")
                .map((tab) => tab.id),
        );
        const toolIds = new Set<string>(
            panelNow.tabs.filter((tab) => tab.placement === "main").map((tab) => tab.id),
        );
        const closeableIds = tabIds.filter(
            (tabId) =>
                fileIds.has(tabId) ||
                toolIds.has(tabId) ||
                (online && sessionIds.has(tabId as HappyAgentSessionId)),
        );
        const targets = new Set(closeableIds);
        const selectedMainViewId = current.activeMainViewId ?? current.address.conversationId;
        const selectedMainViewClosed =
            selectedMainViewId !== undefined && targets.has(selectedMainViewId);
        const rest = currentGroup.conversations.filter((summary) => !targets.has(summary.id));
        const selectedSessionIndex = current.address.conversationId
            ? currentGroup.conversations.findIndex(
                  (summary) => summary.id === current.address.conversationId,
              )
            : -1;
        const leftFallbackSessionId =
            selectedSessionIndex < 1
                ? undefined
                : currentGroup.conversations
                      .slice(0, selectedSessionIndex)
                      .reverse()
                      .find((summary) => !targets.has(summary.id))?.id;
        const fallbackSessionId =
            keepId !== undefined && rest.some((summary) => summary.id === keepId)
                ? keepId
                : (leftFallbackSessionId ?? rest[0]?.id);
        let selectedHistoryRepaired = false;
        for (const tabId of closeableIds) {
            if (fileIds.has(tabId)) {
                const file = current.fileTabs.find((tab) => tab.id === tabId);
                if (file) {
                    closedTabRemember({
                        type: "file",
                        fileKind: file.kind,
                        groupId: file.groupId,
                        path: file.path,
                        placement: "main",
                        preview: file.preview,
                    });
                    props.onFileClose(file.groupId, file.path);
                }
                props.workspace.fileClose(tabId);
                continue;
            }
            // A terminal or a page closes where it is drawn: it was moved here,
            // not copied, so this is the only tab it has and closing it ends
            // the shell or the page rather than sending it back.
            if (toolIds.has(tabId)) {
                // A closed terminal has ended and cannot truthfully be
                // reconstructed. It is a new close boundary, so Cmd-Z must not
                // reach past it and revive an unrelated older tab.
                closedTabs.current.length = 0;
                props.workspace.panel.tabClose(tabId as HappyAgentPanelTabId);
                continue;
            }
            closedTabRemember({
                type: "session",
                groupId: currentGroup.id,
                sessionId: tabId as HappyAgentSessionId,
            });
            const repaired = props.onChatClose(currentGroup.id, tabId, fallbackSessionId);
            if (tabId === current.address.conversationId) selectedHistoryRepaired = repaired;
            void props.workspace
                .conversationArchive(tabId as HappyAgentSessionId)
                .catch(() => undefined);
        }
        // A router-backed window repairs and lands through its navigation stack,
        // which preserves the most recently visited survivor. Standalone
        // Blueprint composition has no history owner, so it receives the same
        // left-tab/workspace fallback directly.
        if (
            current.address.conversationId &&
            targets.has(current.address.conversationId) &&
            !selectedHistoryRepaired
        )
            props.onChatSelect(currentGroup.id, fallbackSessionId, true);
        if (selectedMainViewClosed) paneFocusSchedule("workspace", currentGroup.id);
    };
    const groupTabClose = (tabId: string) => {
        // A detached subagent's tab is an address, not a member of the list:
        // closing it only steps back to the sessions that are listed.
        if (tabId === detachedConversationId) {
            if (openGroup) {
                closedTabRemember({
                    type: "sessionAddress",
                    groupId: openGroup.id,
                    sessionId: tabId as HappyAgentSessionId,
                });
                paneFocusSchedule("workspace", openGroup.id);
            }
            props.onChatSelect(openGroup?.id, openGroup?.conversations[0]?.id, true);
            return;
        }
        groupTabsClose([tabId]);
    };
    const panelViewClose = (viewId: string) => {
        if (viewId === "changes" || viewId === "files") {
            // Both file scopes are permanent sections. Closing either one
            // closes their pane, so the tab is waiting in the same scope when
            // the pane is opened again rather than disappearing forever.
            closedTabRemember({ type: "panel" });
            props.workspace.panel.panelToggle();
            paneFocusSchedule("workspace", openGroup?.id);
            return;
        }
        if (viewId === "file") {
            const file = props.workspace.get().panelFile;
            if (file)
                closedTabRemember({
                    type: "file",
                    fileKind: file.kind,
                    groupId: file.groupId,
                    path: file.path,
                    placement: "panel",
                    preview: false,
                });
            props.workspace.filePanelClose();
            paneFocusSchedule("panel", file?.groupId ?? openGroup?.id);
            return;
        }
        // These transient views can be selected again, so dismissing one does
        // not erase recoverable file/session history. A live terminal or
        // browser, by contrast, ends at its close below and cannot be reopened
        // truthfully; that irreversible close is a new history boundary.
        if (viewId === "activity") props.workspace.activityPanelClose();
        else if (viewId === "usage") props.workspace.usagePanelClose();
        else if (viewId === "preview") props.workspace.panel.previewClose();
        else {
            closedTabs.current.length = 0;
            props.workspace.panel.tabClose(viewId as HappyAgentPanelTabId);
        }
        paneFocusSchedule("panel", openGroup?.id);
    };
    const activeTabClose = () => {
        const panelNow = props.workspace.panel.get();
        const panelTarget = openGroupPreparing ? undefined : panelCloseTargetFind(panelNow);
        if (workspaceFocusedPane.current === "panel" && panelNow.open && !openGroupPreparing) {
            if (panelTarget) panelViewClose(panelTarget);
            else {
                // The active file scope is permanent. Its close command still
                // dismisses the pane and returns the keyboard to the main tab.
                panelViewClose(panelNow.activeViewId === "files" ? "files" : "changes");
            }
            return;
        }
        const current = props.workspace.get();
        const tabId = current.activeMainViewId ?? current.address.conversationId;
        if (tabId) groupTabClose(tabId);
        else if (openGroup) props.workspace.groupArchiveOpen(openGroup.id);
    };
    // The strip in the order it is drawn, without the detached subagent: it is
    // addressed rather than listed, so a sweep over "the tabs beside this one"
    // never reaches it.
    const sweepableTabs = groupTabs.filter((entry) => entry.id !== detachedConversationId);
    const previewTool = previewToolFind(conversation, panel.previewEntryId);
    const desktop = props.platform === "desktop";

    // Whether the chat this workspace was made with is what is on screen. That
    // chat carries the checkout's phase itself, so the lane above the tab strip
    // does not: a file or a terminal open here is not that chat, and those keep
    // the lane. It is suppressed even when the chat says nothing at all — a new
    // workspace is an ordinary empty chat, and the sidebar row is already
    // showing that its checkout is being prepared.
    const preparingChatOnScreen =
        openGroupPreparing &&
        openGroup !== undefined &&
        activeMainTool === undefined &&
        activeFile === undefined;
    const mainFileBody = (file: HappyAgentFileTabSnapshot): ReactNode => (
        <HappyAgentFileBody
            appearance={appearance.appearance}
            file={file}
            {...(props.htmlPreview ? { htmlPreview: props.htmlPreview } : {})}
            key={`${file.id}:${file.kind}`}
            {...(props.mediaWindow ? { mediaWindow: props.mediaWindow } : {})}
            mode={workspace.fileViewMode}
            happyAgentOnline={happyAgentOnline}
            onMainFileOpen={(path, kind) =>
                props.onFileSelect(file.groupId, props.chatId, path, kind)
            }
            wrap={workspace.fileViewWrap}
            {...(access.writeRefusal === undefined ? {} : { writeRefusal: access.writeRefusal })}
            {...(connectionRefusal === undefined ? {} : { saveRefusal: connectionRefusal })}
            workspace={props.workspace}
        />
    );
    const mainConversationBody =
        openGroup === undefined ? undefined : openGroup.conversations.length === 0 &&
          workspace.groupComposer ? (
            // Files or tools are open here, but no session exists yet. The body
            // under the strip is the same composer that starts the first one.
            <HappyAgentGroupComposer
                composer={workspace.groupComposer}
                {...(workspace.groupSessionDraft
                    ? { draftMenus: workspace.groupSessionDraft.menus }
                    : {})}
                focusOnType
                groupId={openGroup.id}
                groupName={openGroup.name}
                happyAgentOnline={happyAgentOnline}
                {...(connectionRefusal === undefined ? {} : { unavailable: connectionRefusal })}
                workspace={props.workspace}
            />
        ) : (
            <HappyAgentConversationBody
                activitySelected={panel.open && panel.activeViewId === "activity"}
                conversation={conversation}
                focusOnType
                groupId={openGroup.id}
                groupName={openGroup.name}
                now={now}
                {...(connectionRefusal === undefined &&
                openGroupChatRefusal === undefined &&
                openGroup.create !== undefined
                    ? { onCreate: () => groupConversationCreate(openGroup) }
                    : {})}
                onChatSelect={props.onChatSelect}
                onFileOpen={(path) => {
                    if (!happyAgentOnline() || !openGroup.create) return;
                    const target = workspacePathRelative(path, openGroup.create.cwd);
                    props.workspace.filePanelOpen(openGroup.id, target, fileTabKind(target));
                    // Opening something into the other pane is a focus handoff,
                    // not only a state change. Without it the viewer is visibly
                    // selected while Cmd-W still belongs to the transcript.
                    paneFocusSchedule("panel", openGroup.id);
                }}
                onPanelFocus={() => paneFocusSchedule("panel", openGroup.id)}
                canAbort={conversationCanAbort}
                readOnly={conversationReadOnly}
                happyAgentOnline={happyAgentOnline}
                {...(connectionRefusal === undefined ? {} : { unavailable: connectionRefusal })}
                {...(conversationReadOnlyReason === undefined
                    ? {}
                    : { readOnlyReason: conversationReadOnlyReason })}
                {...(connectionRefusal === undefined && openGroupChatRefusal === undefined
                    ? {}
                    : { writeRefusal: connectionRefusal ?? openGroupChatRefusal })}
                viewerId={props.viewerId}
                workspace={props.workspace}
            />
        );

    return (
        <AppShell
            embedded
            panelResizable
            // The width this checkout was last left at, or the shell's own
            // default where nobody has sized it. Passed on every render rather
            // than seeded once, so moving to another project shows that
            // project's width instead of carrying this one's across.
            panelWidth={workspace.panelWidth ?? APP_SHELL_PANEL_DEFAULT_WIDTH}
            onFocusedPaneChange={workspaceFocusedPaneChange}
            onPanelWidthChange={(width) => {
                if (openGroup) props.workspace.panelWidthUpdate(openGroup.id, width);
            }}
            panel={
                // The panel reads and writes the checkout: a file tree, a diff,
                // a terminal. None of them has anything to open until the
                // checkout is there, so while it is being prepared the panel is
                // not drawn at all rather than drawn empty. It comes back on its
                // own — the reader's choice to have it open is untouched here.
                panel.open && !openGroupPreparing ? (
                    <HappyAgentPanelBody
                        closeShortcut={APP_SHORTCUTS.tabClose}
                        activity={conversation.type === "ready" ? conversation.value : undefined}
                        canStartTerminal={availability.online && props.chatId !== undefined}
                        browserContent={props.browserContent}
                        htmlPreview={props.htmlPreview}
                        mediaWindow={props.mediaWindow}
                        sessionId={props.chatId}
                        changes={openGroup?.changes ?? []}
                        expanded={workspace.fileTreeExpanded}
                        collapsed={workspace.fileTreeCollapsed}
                        layout={workspace.fileLayout}
                        onFileSelect={(path) => {
                            if (openGroup && happyAgentOnline())
                                props.onFileSelect(
                                    openGroup.id,
                                    props.chatId,
                                    path,
                                    fileTabKind(path),
                                );
                        }}
                        onFileOpen={(path) => {
                            if (openGroup && happyAgentOnline()) {
                                const kind = fileTabKind(path);
                                // A double click pins the preview; the address
                                // is unchanged when the first click already
                                // selected this file.
                                props.workspace.fileOpen(openGroup.id, path, kind);
                                props.onFileSelect(openGroup.id, props.chatId, path, kind);
                            }
                        }}
                        onFilePreprocess={(path) => {
                            if (openGroup && happyAgentOnline())
                                props.workspace.filePreprocess(
                                    openGroup.id,
                                    path,
                                    fileTabKind(path),
                                );
                        }}
                        onLayoutChange={(layout) => {
                            if (openGroup) props.workspace.fileLayoutUpdate(openGroup.id, layout);
                        }}
                        now={now}
                        {...(availability.online
                            ? {
                                  onActivityProcessStop: (processId: number) => {
                                      void props.workspace
                                          .backgroundProcessStop(processId)
                                          .catch(() => undefined);
                                  },
                              }
                            : {})}
                        onActivityOpen={() => props.workspace.activityPanelOpen()}
                        onUsageOpen={() => props.workspace.usagePanelOpen()}
                        {...(openGroup
                            ? {
                                  onSubagentSelect: (sessionId: string) => {
                                      props.workspace.activityPanelClose();
                                      props.onChatSelect(
                                          openGroup.id,
                                          sessionId as HappyAgentSessionId,
                                      );
                                  },
                              }
                            : {})}
                        onPanelClose={() => props.workspace.panel.panelToggle()}
                        {...(workspace.panelFile ? { panelFile: workspace.panelFile } : {})}
                        fileBody={mainFileBody}
                        onPanelFileClose={() => props.workspace.filePanelClose()}
                        onViewClose={panelViewClose}
                        onScopeChange={(scope) => {
                            if (
                                openGroup &&
                                (scope === "changed" ||
                                    workspace.workspaceFiles !== undefined ||
                                    happyAgentOnline())
                            )
                                props.workspace.fileScopeUpdate(openGroup.id, scope);
                        }}
                        onToggle={(path, expanded) =>
                            props.workspace.fileTreeExpandedUpdate(path, expanded)
                        }
                        onDirectoryPrefetch={(path) =>
                            props.workspace.fileTreeDirectoryPrefetch(path)
                        }
                        onLoadMore={(path) => props.workspace.fileTreeLoadMore(path)}
                        onViewTransfer={(viewId) => {
                            const file =
                                viewId === HAPPY_AGENT_PANEL_FILE_VIEW_ID
                                    ? workspace.panelFile
                                    : workspace.fileTabs.find((tab) => tab.id === viewId);
                            props.workspace.viewPlacementUpdate(viewId, "main");
                            if (file)
                                props.onFileSelect(
                                    file.groupId,
                                    props.chatId,
                                    file.path,
                                    file.kind,
                                );
                        }}
                        panel={panel}
                        previewTool={previewTool}
                        {...(terminalHappyAgentAvailability === undefined
                            ? {}
                            : {
                                  happyAgentAvailability: terminalHappyAgentAvailability,
                                  happyAgentAvailabilityReason: availability.message,
                              })}
                        scope={workspace.fileScope}
                        selectedPath={activeFile?.path}
                        store={props.workspace.panel}
                        workspaceFiles={workspace.workspaceFiles}
                        workspaceFilesLoading={workspace.workspaceFilesLoading}
                    />
                ) : undefined
            }
        >
            {openGroup ? (
                <>
                    {/* The heading names the project, not the session: every tab
                        beneath it is another session in this one project, so it
                        stays put as they are switched. */}
                    <ChannelHeader
                        // The panel toggle is the mirror of the sidebar's: the same
                        // act at the other edge of the window, so it wears the same
                        // glyph flipped and sits in the header rather than down in
                        // the tab strip. It only appears once the project has a
                        // session, because a panel with no conversation behind it has
                        // nowhere to run a terminal and the control would do nothing.
                        //
                        // Both of them address the checkout, so a workspace
                        // still being prepared carries neither: handing a folder
                        // that does not exist to an editor, or opening a panel
                        // onto it, are the two things this header could offer
                        // that would fail on arrival.
                        actions={
                            openGroupPreparing ? undefined : (
                                <>
                                    {/* Hands this project's directory to another
                                    application, or puts its path on the
                                    clipboard. The path is no longer spelled out
                                    in the header — it said nothing the project's
                                    name did not — so copying it is how it is
                                    still reachable when it is genuinely needed. */}
                                    <HappyAgentControlMenu
                                        items={[
                                            ...workspace.openInTargets.map((target) => ({
                                                id: target.id,
                                                kind: "item" as const,
                                                label: target.label,
                                                disabled: !availability.online,
                                                ...(target.iconUrl
                                                    ? { iconUrl: target.iconUrl }
                                                    : {}),
                                            })),
                                            ...(workspace.openInTargets.length > 0
                                                ? [{ kind: "separator" as const }]
                                                : []),
                                            {
                                                id: "copy-path",
                                                kind: "item" as const,
                                                label: "Copy path",
                                                icon: "doc" as const,
                                            },
                                        ]}
                                        label="Open in"
                                        // The control wears whatever was opened last,
                                        // so the answer to "again, please" is already
                                        // on screen instead of one menu away — and
                                        // once it is worn, the label side hands the
                                        // project straight back to that application
                                        // while only the chevron opens the list.
                                        leadingIconUrl={openInRecent?.iconUrl}
                                        menuAlign="end"
                                        {...(openInRecent && availability.online && openGroup.create
                                            ? {
                                                  onPrimary: () => {
                                                      if (happyAgentOnline())
                                                          void props.workspace.openIn(
                                                              openGroup.id,
                                                              openInRecent,
                                                          );
                                                  },
                                                  primaryLabel: `Open in ${openInRecent.label}`,
                                              }
                                            : {})}
                                        onSelect={(id: string) => {
                                            if (id === "copy-path") {
                                                if (openGroup.create)
                                                    void navigator.clipboard?.writeText(
                                                        openGroup.create.cwd,
                                                    );
                                                return;
                                            }
                                            const target = workspace.openInTargets.find(
                                                (candidate) => candidate.id === id,
                                            );
                                            if (target && happyAgentOnline() && openGroup.create)
                                                void props.workspace.openIn(openGroup.id, target);
                                        }}
                                    />
                                    {!panel.open ? (
                                        <Button
                                            aria-label="Show panel"
                                            aria-pressed={false}
                                            icon="panel-expand"
                                            iconOnly
                                            onClick={() => props.workspace.panel.panelToggle()}
                                            shortcut={PANEL_TOGGLE_HINT}
                                            size="small"
                                            variant="ghost"
                                        />
                                    ) : null}
                                </>
                            )
                        }
                        icon={openGroup.home ? "home" : "inbox"}
                        title={openGroup.name}
                    />
                    {/* No banner for an unreachable Happy Agent. The window says that
                        once, in the band across its top, and repeating it here
                        pushed the transcript down for something the reader was
                        already told — in the one surface where the shift is
                        most expensive. What this conversation still owes is the
                        local part: its composer and actions go read-only, which
                        they do on `availability` without any chrome of their
                        own. */}
                    <WindowShortcuts
                        actions={[
                            // Cmd-W is consistently the workspace's close
                            // command. The live handler simply has nothing to
                            // do when Files or an offline session is the only
                            // current target.
                            { run: activeTabClose, shortcut: APP_SHORTCUTS.tabClose },
                            {
                                enabled: closedTabUndoAvailable,
                                preserveTextEditing: true,
                                run: closedTabUndo,
                                shortcut: APP_SHORTCUTS.tabCloseUndo,
                            },
                            ...(openGroupPreparing
                                ? []
                                : [
                                      {
                                          run: () => props.workspace.panel.panelToggle(),
                                          shortcut: APP_SHORTCUTS.panelToggle,
                                      },
                                      {
                                          run: () => props.workspace.panel.panelToggle(),
                                          shortcut: APP_SHORTCUTS.panelToggleAlternate,
                                      },
                                  ]),
                            ...(sessionCreateAvailable
                                ? [
                                      {
                                          run: () => groupConversationCreate(openGroup),
                                          shortcut: APP_SHORTCUTS.sessionCreate,
                                      },
                                  ]
                                : []),
                            ...(workspaceCreateProjectId
                                ? [
                                      {
                                          run: () => {
                                              if (happyAgentOnline())
                                                  void props.workspace
                                                      .worktreeCreate(workspaceCreateProjectId)
                                                      .catch(() => undefined);
                                          },
                                          shortcut: APP_SHORTCUTS.workspaceCreate,
                                      },
                                  ]
                                : []),
                        ]}
                    />
                    {/* A worktree with work already in it keeps its tab strip and
                        its transcripts, so its phase is stated in the lane above
                        them rather than in place of them: the reader can still
                        read what ran there before the checkout went away. The
                        lane is mounted in every phase, including the ready one,
                        so arriving at or leaving a phase never rebuilds the
                        strip and transcripts underneath it.

                        A checkout being prepared is the exception, whenever its
                        own chat is the thing on screen: that phase is stated
                        inside the chat instead, above its messages and where the
                        reader is already looking, so the lane stays empty rather
                        than saying the same thing twice. */}
                    <WorkspaceLifecycleLane
                        {...(openGroup.lifecycle?.phase === "failed" &&
                        openGroup.lifecycle.reason !== undefined
                            ? { detail: openGroup.lifecycle.reason }
                            : {})}
                        name={openGroup.name}
                        {...(openGroup.path ? { path: openGroup.path } : {})}
                        {...(openGroupPhase !== undefined &&
                        !openGroupNotice &&
                        !preparingChatOnScreen
                            ? { phase: openGroupPhase }
                            : {})}
                    />
                    {openGroupNotice ? (
                        // Nothing has run here and the place itself will never
                        // take one: a composer would collect a message for a
                        // checkout that is not coming. What happened to the
                        // workspace is the whole screen instead.
                        //
                        // A checkout Happy Agent is still preparing is deliberately not
                        // this case. Happy Agent has already said where it will be and
                        // holds a session's work until it is there, so an empty
                        // new workspace shows its composer immediately with the
                        // lane above saying what is happening to it.
                        <WorkspaceLifecycleNotice
                            {...(openGroup.lifecycle?.phase === "failed" &&
                            openGroup.lifecycle.reason !== undefined
                                ? { detail: openGroup.lifecycle.reason }
                                : {})}
                            name={openGroup.name}
                            {...(openGroup.path ? { path: openGroup.path } : {})}
                            phase={openGroupPhase}
                        />
                    ) : (
                        <TabbedPane
                            actions={
                                /* A tab is a session, so adding one creates it
                                   directly in the addressed project or worktree
                                   instead of opening the task form. It follows
                                   the last tab, the way an editor's "new tab"
                                   does. A workspace that cannot host one keeps
                                   the control and disables it: the strip is the
                                   same strip throughout a checkout being
                                   prepared, so the button goes grey for a moment
                                   rather than appearing out of nowhere when it
                                   arrives. */
                                <Button
                                    aria-label="Create a session in this project"
                                    disabled={!sessionCreateAvailable}
                                    icon="plus"
                                    iconOnly
                                    onClick={() => groupConversationCreate(openGroup)}
                                    shortcut={APP_SHORTCUTS.sessionCreate}
                                    size="small"
                                    variant="ghost"
                                />
                            }
                            trailing={
                                /* The strip's own control, not the next thing
                                   after the last tab: it offers everything this
                                   workspace has closed, however many tabs are
                                   open. So it holds the bar's far edge, in the
                                   same column as the header control above it,
                                   instead of sliding along with the tabs. */
                                <MenuButton
                                    align="end"
                                    icon="history"
                                    iconSize={12}
                                    items={historyMenuItems}
                                    label={RECENT_SESSIONS_LABEL}
                                    menuMaxHeight={420}
                                    menuLabel="Recent sessions"
                                    menuPageSize={100}
                                    menuWidth={300}
                                    onSelect={(id) => {
                                        if (!id.startsWith(HISTORY_SESSION_PREFIX)) return;
                                        const sessionId = id.slice(
                                            HISTORY_SESSION_PREFIX.length,
                                        ) as HappyAgentSessionId;
                                        // A session still in the strip is a
                                        // plain selection. A closed one is asked
                                        // of the host by id: it stopped listing
                                        // the agent when it was archived, so
                                        // there is no catalog entry left to
                                        // check the request against first.
                                        if (
                                            openGroup.conversations.some(
                                                (summary) => summary.id === sessionId,
                                            )
                                        ) {
                                            props.onChatSelect(openGroup.id, sessionId);
                                            return;
                                        }
                                        void props.workspace
                                            .conversationRestore(sessionId)
                                            .then(() => props.onChatSelect(openGroup.id, sessionId))
                                            .catch(() => undefined);
                                    }}
                                />
                            }
                            activeId={workspace.activeMainViewId ?? props.chatId ?? ""}
                            closeLabel="Close tab"
                            closeShortcut={APP_SHORTCUTS.tabClose}
                            onClose={groupTabClose}
                            onDoubleClick={(tabId) => {
                                const file = groupFileTabs.find((tab) => tab.id === tabId);
                                if (file)
                                    props.workspace.fileOpen(file.groupId, file.path, file.kind);
                            }}
                            onReorder={(tabIds: readonly string[]) => {
                                // A detached subagent has no place in the
                                // order, so it is taken out of both sides of
                                // the comparison rather than dragged into one.
                                const orderable = (ids: readonly string[]) =>
                                    ids.filter((id) => id !== detachedConversationId);
                                const move = sidebarReorderMove(
                                    orderable(groupTabs.map((tab) => tab.id)),
                                    orderable(tabIds),
                                );
                                if (!move) return;
                                props.workspace.tabReorder(move.id, move.afterId);
                            }}
                            onSelect={(tabId) => {
                                const file = groupFileTabs.find((tab) => tab.id === tabId);
                                if (file) {
                                    props.onFileSelect(
                                        file.groupId,
                                        props.chatId,
                                        file.path,
                                        file.kind,
                                    );
                                    return;
                                }
                                if (mainTools.some((tab) => tab.id === tabId)) {
                                    props.workspace.mainViewSelect(tabId);
                                    return;
                                }
                                props.onChatSelect(openGroup.id, tabId);
                            }}
                            onTransfer={(tabId) => {
                                const file = groupFileTabs.find((tab) => tab.id === tabId);
                                const selected = workspace.activeMainViewId === tabId;
                                props.workspace.viewPlacementUpdate(tabId, "panel");
                                // Moving the addressed file beside the session
                                // uncovers that session in the main region, so
                                // its address must stop claiming the file is
                                // still selected there.
                                if (file && selected)
                                    props.onChatSelect(openGroup.id, props.chatId, true);
                            }}
                            // A session is what the address names, so it stays
                            // where the address points; a diff is two revisions
                            // read together and the panel's viewer reads one
                            // file, so it has nowhere over there to land; and a
                            // file with text that has not been written back
                            // keeps its edit rather than its place.
                            transferable={(tab) =>
                                mainTools.some((entry) => entry.id === tab.id) ||
                                groupFileTabs.some(
                                    (entry) =>
                                        entry.id === tab.id &&
                                        entry.kind !== "diff" &&
                                        entry.draft === undefined &&
                                        !entry.saving,
                                )
                            }
                            transferTargets={MAIN_TRANSFER_TARGETS}
                            tabMenuItems={(tab) => {
                                const index = sweepableTabs.findIndex(
                                    (entry) => entry.id === tab.id,
                                );
                                // The detached subagent's tab is not in the sweepable
                                // order, so it offers no menu — its runner owns it.
                                if (index < 0) return [];
                                // A session is archived; a file, a terminal, a
                                // page is closed. The verb has to be the true
                                // one for the tab it is offered on.
                                const verb =
                                    groupFileTabs.some((entry) => entry.id === tab.id) ||
                                    mainTools.some((entry) => entry.id === tab.id)
                                        ? "Close"
                                        : "Archive";
                                return tabStripMenu(verb, index, sweepableTabs.length - index - 1);
                            }}
                            onTabMenuSelect={(tab, actionId) => {
                                const ids = sweepableTabs.map((entry) => entry.id);
                                const index = ids.indexOf(tab.id);
                                if (index < 0) return;
                                if (actionId === TAB_MENU_CLOSE) {
                                    groupTabsClose([tab.id]);
                                } else if (actionId === TAB_MENU_CLOSE_OTHERS) {
                                    groupTabsClose(
                                        ids.filter((id) => id !== tab.id),
                                        tab.id,
                                    );
                                } else if (actionId === TAB_MENU_CLOSE_LEFT) {
                                    groupTabsClose(ids.slice(0, index), tab.id);
                                } else if (actionId === TAB_MENU_CLOSE_RIGHT) {
                                    groupTabsClose(ids.slice(index + 1), tab.id);
                                } else if (actionId === TAB_MENU_CLOSE_ALL) {
                                    groupTabsClose(ids);
                                }
                            }}
                            tabs={groupTabs}
                        >
                            {/* The whole content area accepts a tab dragged out
                                of the panel, so the reader aims at where the
                                thing will be rather than at a stripe. */}
                            <TransferZone
                                icon="panel-collapse"
                                id={TRANSFER_ZONE_MAIN}
                                label="Open in the main content"
                            >
                                <DeferredPane
                                    current={
                                        displayedMainTool
                                            ? undefined
                                            : displayedFile
                                              ? {
                                                    id:
                                                        displayedFile.displayedPresentationId ??
                                                        displayedFile.presentationId,
                                                    content: mainFileBody(displayedFile),
                                                }
                                              : {
                                                    id: `conversation:${openGroup.id}:${props.chatId ?? "empty"}`,
                                                    content: mainConversationBody,
                                                }
                                    }
                                    fallback={
                                        <EmptyState
                                            animation="snail"
                                            description="The selected file is taking a moment."
                                            icon="doc"
                                            size="panel"
                                            title="Opening file…"
                                        />
                                    }
                                    onReveal={props.workspace.mainViewDisplay}
                                    pending={
                                        pendingFile
                                            ? (() => {
                                                  const readyOnCommit =
                                                      connectionRefusal !== undefined ||
                                                      pendingFile.document.type !== "loading";
                                                  return {
                                                      id: pendingFile.presentationId,
                                                      ready: readyOnCommit,
                                                      render: () => mainFileBody(pendingFile),
                                                  };
                                              })()
                                            : undefined
                                    }
                                    // Every page moved to this side stays
                                    // mounted whichever tab is on screen.
                                    persistent={
                                        <HappyAgentToolBodies
                                            activeId={workspace.displayedMainViewId}
                                            {...(props.browserContent
                                                ? { browserContent: props.browserContent }
                                                : {})}
                                            {...(props.chatId ? { sessionId: props.chatId } : {})}
                                            store={props.workspace.panel}
                                            tabs={mainTools}
                                            {...(terminalHappyAgentAvailability === undefined
                                                ? {}
                                                : {
                                                      happyAgentAvailability:
                                                          terminalHappyAgentAvailability,
                                                      happyAgentAvailabilityReason:
                                                          availability.message,
                                                  })}
                                        />
                                    }
                                />
                            </TransferZone>
                        </TabbedPane>
                    )}
                </>
            ) : (
                <>
                    {/* With no project open there is no tab strip, so this side of
                        the window would have no lane to drag it by. */}
                    {desktop ? <WindowDragRegion /> : null}
                    {/* No banner for an unreachable Happy Agent here either. The band
                        across the top of the window is the window's one account
                        of the machine being out of touch, and this screen has
                        nothing to add to it: what it offers already goes quiet
                        on `availability`, below. */}
                    {refusedCreate ? (
                        // This address was a workspace being made until Happy Agent
                        // refused it. Saying "no project open" here would leave
                        // the reader to work out for themselves that the row they
                        // just watched appear and vanish was never created.
                        <WorkspaceLifecycleNotice
                            detail={refusedCreate.message}
                            // The name every worktree Happy asks for is created
                            // under. Happy Agent never gave this one a record, so the
                            // name the request carried is the only one there is.
                            name="Workspace"
                            phase="refused"
                        />
                    ) : (
                        /* Keep project setup in the main empty pane: the sidebar
                           explains why it is empty without repeating this action. */
                        <EmptyState
                            {...(availability.online
                                ? {
                                      action: {
                                          label: "Add project",
                                          icon: "plus" as const,
                                          onClick: () => props.workspace.projectAdd(),
                                      },
                                  }
                                : {})}
                            description="Pick one in the sidebar, or add a project."
                            icon="files"
                            size="panel"
                            title="No project open"
                        />
                    )}
                </>
            )}
        </AppShell>
    );
}

function happyAgentFileRevalidationBanner(
    error: { readonly message: string } | undefined,
): ReactNode {
    return error ? (
        <Banner tone="warning" title="File may be out of date">
            Showing the last loaded content. {error.message}
        </Banner>
    ) : null;
}

function HappyAgentFileBody(props: {
    appearance: "dark" | "light";
    file: HappyAgentFileTabSnapshot;
    htmlPreview?: HtmlPreviewRenderer;
    mediaWindow?: MediaWindowOpener;
    mode: HappyAgentFileViewMode;
    /** Whether long diff lines wrap to the pane or scroll out of it. */
    wrap: boolean;
    /** Re-reads Happy Agent availability when a retained file handler fires. */
    happyAgentOnline: () => boolean;
    /** Addresses a linked file opened from a main-content file tab. */
    onMainFileOpen(path: string, kind: HappyAgentFileTabKind): void;
    /** Why this file cannot be edited or saved, or absent when it can. */
    writeRefusal?: string;
    /** Why the current local draft cannot be persisted to the Happy Agent. */
    saveRefusal?: string;
    workspace: HappyAgentWorkspaceStore;
}) {
    const { file, workspace } = props;
    /**
     * Opens a file a document links to, on the side the document is being read
     * on. A file followed in the main content lands beside it in the tab strip;
     * one followed in the panel stays in the panel, because the reader is
     * reading the conversation and the panel is where they are reading.
     */
    const linkedFileOpen = (target: string): void => {
        if (!props.happyAgentOnline()) return;
        const kind = fileTabKind(target);
        if (file.placement === "panel") workspace.filePanelOpen(file.groupId, target, kind);
        else props.onMainFileOpen(target, kind);
    };
    // Typing into a document that could never be written back is worse than not
    // offering the editor at all: the reader loses what they typed and learns
    // why only when they try to save it.
    const writable = props.writeRefusal === undefined;
    const saveDisabled = !writable || props.saveRefusal !== undefined;
    if (file.kind === "media")
        return (
            <>
                {happyAgentFileRevalidationBanner(file.revalidationError)}
                <HappyAgentFilePreview
                    document={file.document}
                    {...(props.mediaWindow ? { mediaWindow: props.mediaWindow } : {})}
                    key={file.id}
                    path={file.path}
                    revalidating={file.revalidating}
                />
            </>
        );
    if (
        (file.kind === "file" || file.kind === "document") &&
        file.document.type === "ready" &&
        "content" in file.document.value
    ) {
        const content = file.document.value.content;
        const dirty = file.draft !== undefined && file.draft !== content;
        const text = file.draft ?? content;
        const status =
            props.writeRefusal ?? props.saveRefusal ?? (file.saving ? "Saving…" : undefined);
        const markdownCacheKey =
            file.draft === undefined
                ? markdownHighlightCacheKey(file.path, file.document.value.hash)
                : undefined;
        return (
            <FileEditor
                banner={happyAgentFileRevalidationBanner(file.revalidationError)}
                documentKey={fileDocumentKey(file.id, file.document.value)}
                dirty={dirty}
                {...(file.kind === "document" && props.htmlPreview
                    ? {
                          rendered: (
                              // The page is served from the file on disk, so the
                              // rendered face shows what was saved; the source
                              // face is where an unsaved edit lives until it is.
                              <HtmlPreviewFrame
                                  {...(file.previewError
                                      ? {
                                            failure: {
                                                kind: "address-unavailable" as const,
                                                path: file.path,
                                                detail: file.previewError,
                                            },
                                        }
                                      : {})}
                                  renderContent={props.htmlPreview}
                                  revision={file.revision}
                                  source={file.previewUrl}
                              />
                          ),
                      }
                    : {})}
                {...(filePreviewKind(file.path) === "markdown"
                    ? {
                          rendered: (
                              <MarkdownDocument
                                  /* Whatever the link names — another document,
                                     a picture — follows the same file-open path
                                     as the sidebar. */
                                  onFileOpen={(href) =>
                                      linkedFileOpen(documentLinkResolve(file.path, href))
                                  }
                                  {...(markdownCacheKey === undefined
                                      ? {}
                                      : { cacheKey: markdownCacheKey })}
                                  text={text}
                              />
                          ),
                      }
                    : {})}
                onRevert={() => workspace.fileDraftRevert(file.id)}
                onSave={() => {
                    if (!saveDisabled && props.happyAgentOnline())
                        void workspace.fileDraftSave(file.id).catch(() => undefined);
                }}
                onValueChange={(value) => workspace.fileDraftUpdate(file.id, value)}
                onWrapChange={(wrap) => workspace.fileViewWrapUpdate(wrap)}
                path={file.path}
                readOnly={file.saving || !writable}
                saveDisabled={saveDisabled}
                saving={file.saving}
                {...(status === undefined ? {} : { status })}
                value={text}
                wrap={props.wrap}
            />
        );
    }
    if (
        file.kind === "diff" &&
        file.document.type === "ready" &&
        "oldContent" in file.document.value
    ) {
        const change = file.document.value;
        // An untouched tab shows what was read; once edited it shows what was
        // typed, which is the only copy of it there is.
        const current = file.draft ?? change.newContent;
        const oldCacheKey =
            file.draft !== undefined || change.oldHash === undefined
                ? undefined
                : `d:old:${file.groupId}:${change.oldHash}:${fileHighlightLanguageKey(change.oldPath)}`;
        const newCacheKey =
            file.draft === undefined && change.hash !== undefined
                ? `d:new:${file.groupId}:${change.hash}:${fileHighlightLanguageKey(file.path)}`
                : undefined;
        return (
            <>
                {happyAgentFileRevalidationBanner(file.revalidationError)}
                <ChangedFileDiff
                    appearance={props.appearance}
                    documentKey={fileDocumentKey(file.id, file.document.value)}
                    key={`${file.id}:${file.kind}`}
                    loading={file.revalidating}
                    mode={props.mode}
                    {...(newCacheKey === undefined ? {} : { newCacheKey })}
                    newContent={current}
                    {...(oldCacheKey === undefined ? {} : { oldCacheKey })}
                    oldContent={change.oldContent}
                    oldPath={change.oldPath}
                    {...(writable
                        ? {
                              onContentChange: (content: string) =>
                                  workspace.fileDraftUpdate(file.id, content),
                              onSave: () => {
                                  if (!saveDisabled && props.happyAgentOnline())
                                      void workspace.fileDraftSave(file.id).catch(() => undefined);
                              },
                          }
                        : {})}
                    saveDisabled={saveDisabled}
                    onModeChange={(mode) => workspace.fileViewModeUpdate(mode)}
                    onWrapChange={(wrap) => workspace.fileViewWrapUpdate(wrap)}
                    wrap={props.wrap}
                    // A change that deleted the file left no copy to look at, which
                    // the read reports by having no working-tree identity for it.
                    // Preview is then not offered rather than offered over nothing.
                    {...(change.hash === undefined
                        ? {}
                        : {
                              preview: (
                                  <HappyAgentChangedFilePreview
                                      file={file}
                                      onFileOpen={linkedFileOpen}
                                      openDisabled={props.saveRefusal !== undefined}
                                      text={current}
                                  />
                              ),
                          })}
                    path={file.path}
                    saving={file.saving}
                />
            </>
        );
    }
    if (file.document.type === "error")
        return (
            <EmptyState
                {...(props.saveRefusal === undefined
                    ? {
                          action: {
                              label: "Retry",
                              icon: "arrow-right" as const,
                              onClick: () => {
                                  if (props.happyAgentOnline()) workspace.fileRetry(file.id);
                              },
                          },
                      }
                    : {})}
                description={file.document.error.message}
                icon="doc"
                size="panel"
                title="File unavailable"
            />
        );
    if (props.saveRefusal)
        return (
            <EmptyState
                description={props.saveRefusal}
                icon="link"
                size="panel"
                title="File unavailable while Happy Agent is offline"
            />
        );
    return (
        <EmptyState
            animation="snail"
            description={
                file.kind === "file"
                    ? "Reading the file from its workspace."
                    : "Reading the changed file from its workspace."
            }
            icon="doc"
            size="panel"
            title="Loading file…"
        />
    );
}

/**
 * A changed file as it now stands, in the same preview the product opens any
 * file into.
 *
 * The text is the copy already in hand: the changed-file read takes its
 * working-tree side from the same file read that opening an ordinary file uses,
 * so Preview and Edit are looking at one file rather than at two reads of it —
 * including an edit that has been typed and not yet saved. Nothing is fetched
 * here, so switching to Preview cannot land another file's bytes.
 */
function HappyAgentChangedFilePreview(props: {
    file: HappyAgentFileTabSnapshot;
    openDisabled: boolean;
    /** Opens a linked file on the side this one is being read on. */
    onFileOpen: (path: string) => void;
    text: string;
}) {
    const { file } = props;
    // A picture, a recording, or an archive opens as itself rather than as a
    // diff, so a tab of one is not a diff tab and this is reached only by a tab
    // restored from a session that sorted the file differently. Saying the file
    // has no preview beats rendering its bytes as characters.
    const kind = filePreviewKind(file.path);
    const readable = kind === "markdown" || kind === "text";
    const cacheKey =
        file.draft === undefined &&
        file.document.type === "ready" &&
        "hash" in file.document.value &&
        file.document.value.hash !== undefined
            ? fileHighlightCacheKey(file.path, file.document.value.hash)
            : undefined;
    return (
        <FilePreview
            content={readable ? { type: "text", text: props.text } : { type: "unavailable" }}
            {...(cacheKey === undefined ? {} : { cacheKey })}
            // A document followed out of the changed list lands beside it as the
            // file itself, the same way one followed out of a file tab does.
            onFileOpen={(href) => {
                if (props.openDisabled) return;
                props.onFileOpen(documentLinkResolve(file.path, href));
            }}
            path={file.path}
        />
    );
}

/**
 * One workspace file shown rather than edited.
 *
 * The document says where the bytes are rather than carrying them, so the
 * picture element fetches its own source over an ordinary URL. Nothing here
 * holds a browser resource with a lifetime to revoke, and a video's seeks become
 * range requests against the proxy instead of a whole file already in the DOM.
 */
function HappyAgentFilePreview(props: {
    document: HappyAgentFileTabSnapshot["document"];
    mediaWindow?: MediaWindowOpener;
    path: string;
    revalidating: boolean;
}) {
    const document = props.document;
    if (document.type === "error")
        return (
            <FilePreview
                content={{ type: "error", message: document.error.message }}
                path={props.path}
            />
        );
    // A background revalidation must not replace usable media with a loading
    // face. The request may still fail into the warning banner owned by the
    // surrounding file surface; only a true first load has no content to show.
    if (document.type !== "ready")
        return <FilePreview content={{ type: "loading" }} path={props.path} />;
    const value = document.value;
    if (!("contentType" in value))
        return <FilePreview content={{ type: "unavailable" }} path={props.path} />;
    // A format with no viewer is stated as such rather than rendered as an
    // <img> that will only ever show a broken-image glyph.
    const kind = filePreviewKind(props.path);
    const showable = value.contentType !== "application/octet-stream" && kind !== "binary";
    const mediaWindow = props.mediaWindow;
    return (
        <FilePreview
            content={showable ? { type: "url", url: value.url } : { type: "unavailable" }}
            {...(mediaWindow && showable && mediaWindowShowable(kind)
                ? {
                      onMediaWindowOpen: () => mediaWindow({ path: props.path, url: value.url }),
                  }
                : {})}
            path={props.path}
            size={fileSizeFormat(value.size)}
            updating={props.revalidating}
        />
    );
}

/** A byte count as a person reads it. */
function fileSizeFormat(size: number): string {
    if (size < 1024) return `${String(size)} B`;
    if (size < 1024 * 1024) return `${String(Math.round(size / 102.4) / 10)} KB`;
    return `${String(Math.round(size / (102.4 * 1024)) / 10)} MB`;
}

/**
 * The composer of a group that holds no conversation yet: a live input rather
 * than a button, so opening a project or worktree and typing is what starts its
 * first session. It is one surface wherever it stands — alone on a group with
 * nothing open in it at all, or as the body under the tab strip when the only
 * tabs are files and tools — because two of them on one screen would be two
 * places to type the same first message.
 */
function HappyAgentGroupComposer(props: {
    composer: ComposerSnapshot;
    /**
     * How that first conversation will be configured, and the options behind
     * those choices. Absent until the model catalog has been read, which is
     * what keeps the composer from waiting on it.
     */
    draftMenus?: HappyAgentMenusSnapshot;
    focusOnType: boolean;
    /** The group being written into. Arriving at another one takes the caret. */
    groupId: string;
    groupName: string;
    /** Reads current transport health when a Happy Agent-backed action is invoked. */
    happyAgentOnline: () => boolean;
    /** Why this Happy Agent cannot accept network actions while the local draft remains editable. */
    unavailable?: string;
    workspace: HappyAgentWorkspaceStore;
}) {
    const workspace = props.workspace;
    const draftMenus = props.draftMenus;
    return (
        <ConversationView
            agentAuthor={agentAuthor}
            composer={props.composer}
            composerFocusOnType={props.focusOnType}
            // Only the composer that claims stray typing takes the caret, so the
            // dock over an expanded panel cannot pull it out from under the one
            // the reader can see.
            {...(props.focusOnType ? { composerFocusKey: props.groupId } : {})}
            composerPlaceholder={composerPlaceholder(props.groupName)}
            composerSubmitDisabled={props.unavailable !== undefined}
            entries={NO_ENTRIES}
            // The first message is what creates the session, so its model,
            // effort, and access mode have to be choosable before it is sent
            // rather than corrected afterwards. These are the same pickers an
            // open conversation carries, over the draft instead of a live
            // session.
            composerControls={
                draftMenus ? (
                    <ComposerModelControl
                        {...happyAgentComposerModelControlProps(draftMenus, {
                            onEffortChange: (effort?: HappyAgentThinkingLevel) =>
                                workspace.sessionEffortUpdate(effort),
                            onModelChange: (selection: HappyAgentModelSelection) =>
                                workspace.sessionModelUpdate(selection),
                        })}
                    />
                ) : undefined
            }
            composerFooterControl={
                draftMenus ? (
                    <ComposerFooterBar
                        leading={
                            <HappyAgentSessionControls
                                fields={["permission", "tier"]}
                                menuPlacement="above"
                                variant="ghost"
                                menus={draftMenus}
                                onEffortChange={(effort?: HappyAgentThinkingLevel) =>
                                    workspace.sessionEffortUpdate(effort)
                                }
                                onModelChange={(selection: HappyAgentModelSelection) =>
                                    workspace.sessionModelUpdate(selection)
                                }
                                onPermissionModeChange={(mode: HappyAgentPermissionMode) =>
                                    workspace.sessionPermissionModeUpdate(mode)
                                }
                                onServiceTierChange={(tier?: HappyAgentServiceTier) =>
                                    workspace.sessionServiceTierUpdate(tier)
                                }
                            />
                        }
                    />
                ) : undefined
            }
            onComposerAttachmentRemove={(attachmentId) =>
                workspace.composerAttachmentRemove(attachmentId)
            }
            onComposerAttachmentsSelect={(files) => workspace.composerAttachmentsAdd(files)}
            onComposerFocusChange={(focused) => workspace.composerFocusUpdate(focused)}
            onComposerSend={() => {
                if (props.happyAgentOnline()) workspace.composerTextSubmit();
            }}
            onComposerValueChange={(value) =>
                reactFrameInputUpdate(workspace, () => workspace.composerTextUpdate(value))
            }
        />
    );
}

/** The open conversation's materialization states, inside the directory's tabs. */
function HappyAgentConversationBody(props: {
    activitySelected: boolean;
    conversation: HappyAgentWorkspaceSnapshot["conversation"];
    focusOnType: boolean;
    groupId: string;
    groupName: string;
    now: number;
    /**
     * Something to say about the place this conversation is happening in, held
     * above every message in it. A workspace's own first conversation exists
     * before its checkout does, so this is where the reader watches that
     * checkout being prepared — while the transcript, the empty state, and the
     * composer underneath all behave exactly as they otherwise would.
     */
    notice?: ReactNode;
    /** Starts a session here, when this workspace can host one. */
    onCreate?: () => void;
    onChatSelect: HappyAgentWorkspaceSurfaceProps["onChatSelect"];
    onFileOpen: (path: string) => void;
    /** Completes a main-to-panel selection by handing keyboard ownership to the panel. */
    onPanelFocus: () => void;
    readOnly: boolean;
    /** Reads current transport health when a Happy Agent-backed action is invoked. */
    happyAgentOnline: () => boolean;
    /** Why the input is closed, said in the words of whatever closed it. */
    readOnlyReason?: string;
    /** Why this Happy Agent cannot currently accept network actions. */
    unavailable?: string;
    /**
     * Whether a run already going here may be stopped. Separate from `readOnly`
     * on purpose: a checkout that has gone away closes the input, but the run
     * inside it is a process the host owns and the reader must still be able to
     * end it. Only a subagent's own runner takes Stop away, because that run
     * belongs to the parent that started it.
     */
    canAbort: boolean;
    /** Why this conversation may not be written into, or absent when it may. */
    writeRefusal?: string;
    viewerId: string;
    workspace: HappyAgentWorkspaceStore;
}) {
    const conversation = props.conversation;
    if (conversation.type === "ready")
        return (
            <HappyAgentConversationSurface
                activitySelected={props.activitySelected}
                conversation={conversation.value}
                focusOnType={props.focusOnType}
                groupId={props.groupId}
                groupName={props.groupName}
                {...(props.notice === undefined ? {} : { notice: props.notice })}
                now={props.now}
                onChatSelect={props.onChatSelect}
                onFileOpen={props.onFileOpen}
                onPanelFocus={props.onPanelFocus}
                canAbort={props.canAbort}
                readOnly={props.readOnly}
                happyAgentOnline={props.happyAgentOnline}
                {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
                {...(props.readOnlyReason === undefined
                    ? {}
                    : { readOnlyReason: props.readOnlyReason })}
                {...(props.writeRefusal === undefined ? {} : { writeRefusal: props.writeRefusal })}
                viewerId={props.viewerId}
                workspace={props.workspace}
            />
        );
    if (conversation.type === "loading" && props.unavailable !== undefined)
        return (
            <EmptyState
                description={`${props.unavailable} The session will finish loading automatically after reconnect.`}
                icon="link"
                size="panel"
                title="Session waiting for the Happy Agent"
            />
        );
    if (conversation.type === "loading")
        return (
            <EmptyState
                animation="snail"
                description="Loading the selected local session."
                icon="chat"
                size="panel"
                title="Loading session…"
            />
        );
    if (conversation.type === "error")
        return (
            <EmptyState
                {...(props.unavailable === undefined
                    ? {
                          action: {
                              label: "Retry",
                              icon: "arrow-right" as const,
                              onClick: () => {
                                  if (props.happyAgentOnline()) props.workspace.conversationRetry();
                              },
                          },
                      }
                    : {})}
                description={conversation.error.message}
                icon="shield"
                size="panel"
                title="Session unavailable"
            />
        );
    return (
        <EmptyState
            {...(props.onCreate === undefined
                ? {}
                : {
                      action: {
                          label: "New session",
                          icon: "plus" as const,
                          onClick: props.onCreate,
                      },
                  })}
            // The main screen of the whole application when no work is open: an
            // agent standing by, waiting to be given something to do.
            animation="robot"
            description="Select a session tab or start a new one to begin."
            icon="chat"
            size="panel"
            title="No session selected"
        />
    );
}

/** A delegated agent that is still working, or about to be. */
function happyAgentSubagentActive(subagent: SubagentSummary): boolean {
    return subagent.status === "queued" || subagent.status === "running";
}

/**
 * Whether this conversation is working at all: its own turn, or the agents it
 * delegated to and has not outlived. A turn can hand work to a child and end
 * before the child does, and the session is still working while that lasts.
 */
function happyAgentConversationWorking(
    conversation: Pick<HappyAgentConversationSnapshot, "running" | "subagents">,
): boolean {
    return conversation.running || conversation.subagents.some(happyAgentSubagentActive);
}

/** Counts live agents and terminals for the compact transcript affordance. */
function happyAgentActiveActivityCounts(
    conversation: Pick<
        HappyAgentConversationSnapshot,
        "subagents" | "backgroundProcesses" | "detachedBackgroundProcessIds"
    >,
): {
    readonly agents: number;
    readonly terminals: number;
} {
    const agents = conversation.subagents.filter(happyAgentSubagentActive);
    return {
        agents: agents.length,
        terminals: conversation.backgroundProcesses.filter((process) =>
            conversation.detachedBackgroundProcessIds.has(process.id),
        ).length,
    };
}

/**
 * How long this conversation's delegated agents have been working, counted from
 * the first one still going. It is the clock the status line shows once the
 * parent turn has ended and the children have not, so it measures the work that
 * is actually still running rather than the turn that started it.
 *
 * A child whose runner never told us when it started leaves the state without a
 * clock, and the status line then shows the state alone.
 */
function happyAgentDelegatedElapsedMs(
    conversation: Pick<HappyAgentConversationSnapshot, "subagents">,
    now: number,
): number | undefined {
    let startedAt: number | undefined;
    for (const subagent of conversation.subagents) {
        if (!happyAgentSubagentActive(subagent)) continue;
        const since = subagent.activeSince ?? subagent.createdAt;
        if (startedAt === undefined || since < startedAt) startedAt = since;
    }
    return startedAt === undefined ? undefined : Math.max(0, now - startedAt);
}

function HappyAgentConversationSurface(props: {
    activitySelected: boolean;
    conversation: HappyAgentConversationSnapshot;
    focusOnType: boolean;
    groupId: string;
    groupName: string;
    /** What to say above every message here; see `HappyAgentConversationBody`. */
    notice?: ReactNode;
    now: number;
    onChatSelect: HappyAgentWorkspaceSurfaceProps["onChatSelect"];
    /** Opens a file the transcript names, in the panel beside it. */
    onFileOpen: (path: string) => void;
    /** Completes a main-to-panel selection by handing keyboard ownership to the panel. */
    onPanelFocus: () => void;
    readOnly: boolean;
    /** Reads current transport health when a Happy Agent-backed action is invoked. */
    happyAgentOnline: () => boolean;
    /** Why the input is closed, said in the words of whatever closed it. */
    readOnlyReason?: string;
    /** Why this Happy Agent cannot currently accept network actions. */
    unavailable?: string;
    /**
     * Whether a run already going here may be stopped. Separate from `readOnly`
     * on purpose: a checkout that has gone away closes the input, but the run
     * inside it is a process the host owns and the reader must still be able to
     * end it. Only a subagent's own runner takes Stop away, because that run
     * belongs to the parent that started it.
     */
    canAbort: boolean;
    /** Why this conversation may not be written into, or absent when it may. */
    writeRefusal?: string;
    viewerId: string;
    workspace: HappyAgentWorkspaceStore;
}) {
    const { conversation, workspace } = props;
    // A session that is still being read is not a reason to unmount this
    // surface: the composer is already live, the header already carries the
    // title the list knew, and the transcript fills in underneath. Only a
    // session that failed replaces it.
    if (conversation.session.type === "error")
        return (
            <EmptyState
                {...(props.unavailable === undefined
                    ? {
                          action: {
                              label: "Retry",
                              icon: "arrow-right" as const,
                              onClick: () => {
                                  if (props.happyAgentOnline()) workspace.conversationRetry();
                              },
                          },
                      }
                    : {})}
                description={conversation.session.error.message}
                icon="shield"
                size="panel"
                title="Session unavailable"
            />
        );
    const swallow = (operation: Promise<unknown>) => void operation.catch(() => undefined);
    // Whether a chat this reader may not write into is closed rather than merely
    // held. A chat whose runner owns it is not somewhere to leave a draft: the
    // agent is having this conversation and the reader is reading it, so the
    // composer locks instead of collecting a message with nowhere to go.
    //
    // The Happy Agent being unreachable is deliberately not this: that is a wait, the
    // draft survives it, and the window-level band names it. Only an unusable
    // destination locks the box.
    const sendRefusal = props.unavailable;
    /*
     * Whether the reader may choose how this conversation runs. The model,
     * reasoning, access mode, and speed all describe the message about to be
     * sent, so a chat that takes no message offers no choice about one: a
     * subagent's settings belong to the runner that started it, and a checkout
     * that has gone away has nothing to apply them to. The controls stay
     * visible and keep showing what the session actually runs, which is what a
     * reader looking at someone else's chat came to find out.
     */
    const configurable = !props.readOnly && sendRefusal === undefined;
    const activeActivity = happyAgentActiveActivityCounts(conversation);
    const activityTotal = activeActivity.agents + activeActivity.terminals;
    return (
        <ConversationView
            agentAuthor={agentAuthor}
            activityControl={
                activityTotal > 0 ? (
                    <HappyAgentActivityControl
                        agents={activeActivity.agents}
                        backgroundTerminals={activeActivity.terminals}
                        onClick={() => {
                            workspace.activityPanelOpen();
                            props.onPanelFocus();
                        }}
                    />
                ) : undefined
            }
            composer={conversation.composer}
            composerDisabled={props.readOnly}
            composerSubmitDisabled={sendRefusal !== undefined}
            composerFocusOnType={!props.readOnly && props.focusOnType}
            // The open conversation is what this composer writes into, so moving
            // to another one — or landing in the one a new workspace was made
            // with — puts the caret in the draft. A locked chat has no draft to
            // put it in, and only the composer claiming stray typing takes it,
            // so the dock over an expanded panel cannot steal it.
            {...(!props.readOnly && props.focusOnType
                ? { composerFocusKey: conversation.conversationId }
                : {})}
            // A locked chat says why in the words of whatever locked it: the
            // agent that owns it, named, or the checkout that will not take a
            // message. Both are more use than the category of chat this is.
            composerPlaceholder={
                props.readOnly
                    ? (props.readOnlyReason ?? composerPlaceholder(props.groupName))
                    : composerPlaceholder(props.groupName)
            }
            conversationId={conversation.conversationId}
            entries={conversation.entries}
            loading={!conversation.ready}
            {...(props.notice === undefined ? {} : { notice: props.notice })}
            scrollPosition={conversation.scrollPosition}
            onScrollPositionChange={(position) => {
                workspace.conversationScrollUpdate(
                    conversation.conversationId as HappyAgentSessionId,
                    position,
                );
            }}
            // Reaching the oldest loaded entry is the whole request for the page
            // before it. The transcript reports it whether the reader scrolled
            // there or a short history put them there on arrival — a long run
            // fills a whole page on its own, and the transcript it opens with
            // can be shorter than the pane it sits in.
            onStartReached={() => {
                if (props.happyAgentOnline() && !conversation.transcriptComplete)
                    workspace.historyLoadMore();
            }}
            composerControls={
                <>
                    {conversation.menus ? (
                        <ComposerModelControl
                            {...happyAgentComposerModelControlProps(conversation.menus, {
                                // The daemon refuses a model change while a run
                                // is active or queued behind it, so the control
                                // says so rather than accepting a choice the
                                // next message could not apply.
                                disabled: !configurable || conversation.modelLocked,
                                onEffortChange: (effort?: HappyAgentThinkingLevel) => {
                                    if (props.happyAgentOnline())
                                        workspace.sessionEffortUpdate(effort);
                                },
                                onModelChange: (selection: HappyAgentModelSelection) => {
                                    if (props.happyAgentOnline())
                                        workspace.sessionModelUpdate(selection);
                                },
                            })}
                        />
                    ) : null}
                </>
            }
            composerFooterControl={
                <ComposerFooterBar
                    leading={
                        <>
                            <HappyAgentSessionControls
                                disabled={!configurable}
                                fields={["permission", "tier"]}
                                menuPlacement="above"
                                variant="ghost"
                                menus={conversation.menus}
                                onEffortChange={(effort?: HappyAgentThinkingLevel) => {
                                    if (props.happyAgentOnline())
                                        workspace.sessionEffortUpdate(effort);
                                }}
                                onModelChange={(selection: HappyAgentModelSelection) => {
                                    if (props.happyAgentOnline())
                                        workspace.sessionModelUpdate(selection);
                                }}
                                onPermissionModeChange={(mode: HappyAgentPermissionMode) => {
                                    if (props.happyAgentOnline())
                                        workspace.sessionPermissionModeUpdate(mode);
                                }}
                                onServiceTierChange={(tier?: HappyAgentServiceTier) => {
                                    if (props.happyAgentOnline())
                                        workspace.sessionServiceTierUpdate(tier);
                                }}
                            />
                        </>
                    }
                    /* How much of the window this session has spent, at the far
                       end of the same row as the access mode and the speed: the
                       reader is about to type one more message, and this is
                       where they find out whether it still fits and when to
                       compact. Before the provider's first measurement, the
                       declared window still appears with an empty-state count
                       so the context surface is discoverable. */
                    trailing={
                        conversation.contextGauge ? (
                            <ContextMeter
                                approximate={conversation.contextGauge.approximate}
                                measured={conversation.contextGauge.measured}
                                totalTokens={conversation.contextGauge.totalTokens}
                                usedTokens={conversation.contextGauge.usedTokens}
                            />
                        ) : undefined
                    }
                />
            }
            onAbort={
                props.canAbort
                    ? () => {
                          if (props.happyAgentOnline()) swallow(workspace.runAbort());
                      }
                    : undefined
            }
            onCommandInvoke={
                props.unavailable === undefined
                    ? (commandId) => {
                          if (props.happyAgentOnline()) workspace.composerCommandInvoke(commandId);
                      }
                    : undefined
            }
            onComposerAttachmentRemove={(attachmentId) =>
                workspace.composerAttachmentRemove(attachmentId)
            }
            onComposerAttachmentsSelect={(files) => workspace.composerAttachmentsAdd(files)}
            onComposerFocusChange={(focused) => workspace.composerFocusUpdate(focused)}
            onComposerSend={() => {
                if (props.happyAgentOnline()) workspace.composerTextSubmit();
            }}
            onComposerValueChange={(value) =>
                reactFrameInputUpdate(workspace, () => workspace.composerTextUpdate(value))
            }
            onFileOpen={(path) => {
                if (props.happyAgentOnline()) props.onFileOpen(path);
            }}
            onImageOpen={(messageId, attachmentId) => {
                if (props.happyAgentOnline()) workspace.imageOpen(messageId, attachmentId);
            }}
            onAttachmentOpen={(attachment) => {
                // An attached document is a page, not a file to save. When it
                // lives in a checkout this workspace reads, it opens the way a
                // document in the file list does — rendered, served from its own
                // folder so its stylesheet and scripts resolve, with the source
                // a toggle away. Only a document the workspace cannot reach
                // falls back to the download the host offered.
                if (
                    attachment.attachmentKind === "file" &&
                    filePreviewKind(attachment.source) === "html" &&
                    props.happyAgentOnline() &&
                    workspace.attachmentFileOpen(attachment.source, "document")
                ) {
                    return;
                }
                if (attachment.openUrl) openExternalLink(attachment.openUrl);
            }}
            onToolSelect={(entryId) => {
                workspace.panel.previewOpen(entryId);
                props.onPanelFocus();
            }}
            onDelegationSelect={(sessionId) =>
                props.onChatSelect(props.groupId, sessionId as HappyAgentSessionId)
            }
            {...(props.writeRefusal === undefined && props.unavailable === undefined
                ? {
                      onRequestAnswer: (requestId: string, answers: HappyAgentUserInputAnswerMap) =>
                          props.happyAgentOnline()
                              ? swallow(workspace.answerInput({ requestId, answers }))
                              : undefined,
                  }
                : {})}
            expandedTurnIds={conversation.expandedTurnIds}
            onTraceToggle={(turnId) => workspace.turnTraceToggle(turnId)}
            overlay={
                conversation.openImage ? (
                    <ModalOverlay onDismiss={() => workspace.imageClose()} placement="fill">
                        <Lightbox
                            alt={conversation.openImage.alt}
                            imageUrl={conversation.openImage.url}
                            onClose={() => workspace.imageClose()}
                            {...(conversation.openImage.total > 1
                                ? {
                                      position: {
                                          index: conversation.openImage.index,
                                          total: conversation.openImage.total,
                                      },
                                      onNext: () => workspace.imageNext(),
                                      onPrevious: () => workspace.imagePrevious(),
                                  }
                                : {})}
                        />
                    </ModalOverlay>
                ) : undefined
            }
            requestSubmissions={conversation.requestSubmissions}
            requestSelections={conversation.requestSelections}
            onRequestSelectionChange={(requestId, answers) =>
                workspace.requestSelectionUpdate(requestId, answers)
            }
            activityTreatment="focused"
            motion="calm-typed"
            running={conversation.running}
            delegatedAgents={activeActivity.agents}
            delegatedElapsedMs={happyAgentDelegatedElapsedMs(conversation, props.now)}
            elapsedMs={happyAgentTurnElapsedMs(conversation, props.now)}
            now={props.now}
            workingPhase={conversation.workingPhase}
            workingLabel={conversation.workingLabel}
            workingWait={happyAgentWaitStatus(conversation, props.now)}
            viewerId={props.viewerId}
        />
    );
}

/**
 * The scheduled wait the footer counts down, paired with the surface clock it
 * is measured against. The daemon's own label states an absolute deadline that
 * stops being useful the moment it is written; handing the status line both
 * ends and a ticking `now` is what turns it into something that keeps changing
 * while the reader watches it.
 */
function happyAgentWaitStatus(
    conversation: { readonly running: boolean; readonly workingWait?: HappyAgentWorkingWait },
    now: number,
): AgentWaitStatus | undefined {
    if (!conversation.running || conversation.workingWait === undefined) return undefined;
    return { ...conversation.workingWait, now };
}

/**
 * Live elapsed for the open turn, counted from when the user sent the request
 * (before the first token). Prefers the store's request-send clock; falls back
 * to the last user message's createdAt when a reconnect leaves that unset.
 */
function happyAgentTurnElapsedMs(
    conversation: {
        readonly running: boolean;
        readonly runStartedAt?: number;
        readonly turnElapsedMs?: number;
        readonly entries: readonly ConversationEntry[];
    },
    now: number,
): number | undefined {
    if (!conversation.running) return conversation.turnElapsedMs;
    if (conversation.runStartedAt !== undefined)
        return Math.max(0, now - conversation.runStartedAt);
    let earliestSentAt: number | undefined;
    for (let index = conversation.entries.length - 1; index >= 0; index -= 1) {
        const entry = conversation.entries[index];
        if (entry?.kind === "turnStatus" && entry.status !== "steered") break;
        if (entry?.kind !== "message") continue;
        if (!happyAgentHumanMessageAuthor(entry.message.sender)) continue;
        const sentAt = Date.parse(entry.message.createdAt);
        if (Number.isFinite(sentAt)) earliestSentAt = sentAt;
    }
    return earliestSentAt === undefined ? undefined : Math.max(0, now - earliestSentAt);
}

/**
 * The right panel's header band and its two stacked regions. The upper one is
 * the addressed project/worktree's live changed-file list; the lower one is the
 * terminal section. The divider between them is the user's, so a shell can take
 * most of the column or none of it.
 *
 * Only the tab strip re-renders from this component's subscription; a terminal's
 * own output lands in `HappyAgentTerminalTab`, which subscribes to that terminal alone,
 * so a busy shell never re-renders its neighbours or the tab bar above it.
 *
 * The band is empty and still earns its place: it puts this column's tabs on the
 * same line as the session tabs beside them instead of a header's height higher,
 * and in the desktop window it gives that edge a lane to drag the window by.
 */
/**
 * The dialogs that belong to the window rather than to a screen: naming a row,
 * and Create. Both are reached from chrome that is on every route — the cog on a
 * sidebar row, the Create row above it — so they are mounted once beside the
 * screen instead of inside one of them, and they answer the same way wherever
 * the reader happens to be. Being outside the screen is also what keeps a task
 * being written alive while the surface behind it changes.
 *
 * One subscription serves both: this is a single window-level adapter onto one
 * materialized store, so the routes that render no workspace surface still see
 * a draft change as it is typed.
 */
function HappyAgentWindowDialogs(props: {
    projects: readonly HappyAgentProjectGroup[];
    happyAgentOnline: () => boolean;
    unavailable?: string;
    workspace: HappyAgentWorkspaceStore;
}) {
    const workspace = useSyncExternalStore(
        reactFrameSubscribe(props.workspace),
        props.workspace.get,
        props.workspace.get,
    );
    return (
        <>
            {happyAgentNamingDialog(
                workspace.rename,
                workspace.projectArchive,
                workspace.projectCompute,
                props.projects,
                props.workspace,
                props.happyAgentOnline,
                props.unavailable,
            )}
            {happyAgentGroupArchiveDialog(
                workspace.groupArchive,
                props.workspace,
                props.happyAgentOnline,
                props.unavailable,
            )}
            {happyAgentCreateDialog(
                workspace.create,
                props.workspace,
                props.happyAgentOnline,
                props.unavailable,
            )}
            {workspace.projectClone ? (
                <HappyAgentProjectCloneDialog
                    repository={workspace.projectClone.repository}
                    submitting={workspace.projectClone.submitting}
                    onClose={() => props.workspace.projectCloneCancel()}
                    onRepositoryChange={(value) => props.workspace.projectRepositoryUpdate(value)}
                    onSubmit={() => props.workspace.projectCloneSubmit()}
                    {...(workspace.projectClone.error === undefined
                        ? {}
                        : { error: workspace.projectClone.error })}
                    {...(props.unavailable === undefined
                        ? {}
                        : { submitDisabledReason: props.unavailable })}
                />
            ) : null}
        </>
    );
}

/**
 * Cmd-W over an empty main pane stops at a confirmation. The dialog names the
 * exact group the store resolved, and the keystroke itself never archives it.
 */
function happyAgentGroupArchiveDialog(
    archive: HappyAgentWorkspaceSnapshot["groupArchive"],
    store: HappyAgentWorkspaceStore,
    happyAgentOnline: () => boolean,
    unavailable?: string,
): ReactNode {
    if (!archive) return null;
    const subject = archive.kind === "worktree" ? "workspace" : "project";
    return (
        <ModalOverlay
            {...(archive.submitting ? {} : { onDismiss: () => store.groupArchiveCancel() })}
        >
            <Modal
                footer={
                    <>
                        <Button
                            disabled={archive.submitting}
                            onClick={() => store.groupArchiveCancel()}
                            variant="ghost"
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={unavailable !== undefined}
                            loading={archive.submitting}
                            onClick={() => {
                                if (happyAgentOnline())
                                    void store.groupArchiveSubmit().catch(() => undefined);
                            }}
                            variant="danger"
                        >
                            Archive {subject}
                        </Button>
                    </>
                }
                icon="archive"
                {...(archive.submitting ? {} : { onClose: () => store.groupArchiveCancel() })}
                size="small"
                title={`Archive ${archive.name}?`}
                tone="danger"
            >
                {archive.error ? (
                    <Banner tone="danger" title={`Could not archive ${subject}`}>
                        {archive.error}
                    </Banner>
                ) : null}
                <p>
                    {archive.kind === "worktree"
                        ? "This removes the workspace from the sidebar and removes its worktree folder."
                        : "This removes the project and its sessions from the sidebar, archives every workspace under it, and removes those worktree folders. The project's own checkout stays where it is."}
                </p>
            </Modal>
        </ModalOverlay>
    );
}

/**
 * Where a row is named. A project opens its settings dialog rather than a bare
 * field: it has an identity and a checkout worth stating, and its name is the
 * one thing about it the daemon takes a new value for, so the name belongs
 * inside that surface. A worktree has nothing but its name, and gets the field.
 *
 * The project's settings are also where it ends: the archive lives in that same
 * dialog, so the confirmation, what it is waiting on, and why it failed are all
 * one projection of this store rather than a second surface over the first.
 */
function happyAgentNamingDialog(
    rename: HappyAgentWorkspaceSnapshot["rename"],
    archive: HappyAgentWorkspaceSnapshot["projectArchive"],
    compute: HappyAgentWorkspaceSnapshot["projectCompute"],
    projects: readonly HappyAgentProjectGroup[],
    store: HappyAgentWorkspaceStore,
    happyAgentOnline: () => boolean,
    unavailable?: string,
): ReactNode {
    if (!rename) return null;
    if (rename.worktreeId)
        return (
            <ModalOverlay onDismiss={() => store.renameCancel()}>
                <Modal
                    footer={
                        <>
                            <Button onClick={() => store.renameCancel()} variant="ghost">
                                Cancel
                            </Button>
                            <Button
                                disabled={rename.submitting || unavailable !== undefined}
                                onClick={() => {
                                    if (happyAgentOnline())
                                        void store.renameSubmit().catch(() => undefined);
                                }}
                                variant="primary"
                            >
                                Rename
                            </Button>
                        </>
                    }
                    onClose={() => store.renameCancel()}
                    size="small"
                    title={`Rename ${rename.currentName}`}
                >
                    <TextField
                        disabled={rename.submitting}
                        fullWidth
                        label="Name"
                        onSubmit={() => {
                            if (happyAgentOnline())
                                void store.renameSubmit().catch(() => undefined);
                        }}
                        onValueChange={(value) => store.renameDraftUpdate(value)}
                        value={rename.draft}
                    />
                </Modal>
            </ModalOverlay>
        );
    // The project may have been archived from another window while this was
    // open. The dialog stays up on what the rename itself carries — the reader
    // still has an edit in front of them, and dismissing it is what clears the
    // draft — and simply drops the section it can no longer state.
    const project = projects.find((candidate) => candidate.id === rename.projectId);
    // Only what this dialog's own project is doing: an archive confirmed on
    // another project — or one this dialog was opened over afterwards — is not
    // this reader's question.
    const archiving = archive?.projectId === rename.projectId ? archive : undefined;
    // The archive is shown whenever an intent for it exists, whether or not the
    // row is in the list this render happens to hold: an operation the reader
    // started is not a fact about the catalog, and dropping the block the moment
    // the row went would take the pending state, the button, and the reason a
    // failure gave with it. Only a project with nothing pending has to be listed
    // to be offered one.
    const archiveBlock =
        archiving || project
            ? {
                  archive: {
                      confirming: archiving !== undefined,
                      submitting: archiving?.submitting === true,
                      ...(archiving?.error !== undefined ? { error: archiving.error } : {}),
                  },
              }
            : {};
    // Only this dialog's own project again. The compute block is materialized
    // with the dialog and released with it, so a snapshot naming another project
    // can only be one this render has raced; dropping it is what stops one
    // project's setting — and the handler that would save it — from being shown
    // over another.
    const computeBlock =
        compute?.projectId === rename.projectId
            ? {
                  compute: {
                      status: compute.status,
                      mode: compute.mode,
                      image: compute.image,
                      ...(compute.current === undefined ? {} : { current: compute.current }),
                      submitting: compute.submitting,
                      ...(compute.error === undefined ? {} : { error: compute.error }),
                      ...(compute.readError === undefined ? {} : { readError: compute.readError }),
                  },
              }
            : {};
    return (
        <HappyAgentProjectSettingsDialog
            draft={rename.draft}
            {...(project?.avatar ? { imageUrl: project.avatar.url } : {})}
            {...archiveBlock}
            {...computeBlock}
            {...(project
                ? {
                      contents: {
                          sessions:
                              project.conversations.length +
                              project.worktrees.reduce(
                                  (total, worktree) => total + worktree.conversations.length,
                                  0,
                              ),
                          worktrees: project.worktrees.length,
                      },
                      location: { displayPath: project.displayPath, path: project.path },
                  }
                : {})}
            // While an archive is pending, the name is the one the intent
            // captured and the store keeps current against the host: what the
            // reader is being asked to destroy has to be the entity that is
            // about to be destroyed, not whatever this dialog was opened on.
            name={archiving?.name ?? rename.currentName}
            onArchiveCancel={() => store.projectArchiveCancel()}
            onArchiveConfirm={() => {
                if (happyAgentOnline()) void store.projectArchiveSubmit().catch(() => undefined);
            }}
            onArchiveRequest={() => store.projectArchiveOpen(rename.projectId)}
            onClose={() => store.renameCancel()}
            onComputeImageChange={(value) => store.projectComputeImageUpdate(value)}
            onComputeModeChange={(mode) => store.projectComputeModeUpdate(mode)}
            onComputeSubmit={() => {
                if (happyAgentOnline()) void store.projectComputeSubmit().catch(() => undefined);
            }}
            onDraftChange={(value) => store.renameDraftUpdate(value)}
            onSubmit={() => {
                if (happyAgentOnline()) void store.renameSubmit().catch(() => undefined);
            }}
            submitting={rename.submitting}
            {...(unavailable === undefined ? {} : { submitDisabledReason: unavailable })}
        />
    );
}

/**
 * Create, as the window's own surface. The store owns what is being written, so
 * this is only a projection of `workspace.create` into the shared dialog and its
 * callbacks back into the same store — including the task, which lives there so
 * that closing the dialog puts it down rather than destroying it.
 */
function happyAgentCreateDialog(
    create: HappyAgentWorkspaceSnapshot["create"],
    store: HappyAgentWorkspaceStore,
    happyAgentOnline: () => boolean,
    unavailable?: string,
): ReactNode {
    if (!create) return null;
    return (
        <HappyAgentCreateSessionDialog
            destinations={create.groups.map((group) => ({
                displayPath: group.displayPath,
                id: group.id,
                label: group.label,
                ...(group.parentLabel === undefined ? {} : { parentLabel: group.parentLabel }),
            }))}
            destinationsLoading={create.groupsLoading}
            {...(create.groupId === undefined ? {} : { destinationId: create.groupId })}
            {...(create.draft ? { menus: create.draft.menus } : {})}
            {...(create.error === undefined ? {} : { error: create.error })}
            keepOpen={create.keepOpen}
            onClose={() => store.createCancel()}
            onDestinationSelect={(id) => store.createGroupUpdate(id as HappyAgentGroupId)}
            onEffortChange={(effort) => store.createEffortUpdate(effort)}
            onKeepOpenChange={(keepOpen) => store.createKeepOpenUpdate(keepOpen)}
            onModelChange={(selection) => store.createModelUpdate(selection)}
            onPermissionModeChange={(mode) => store.createPermissionModeUpdate(mode)}
            onServiceTierChange={(tier) => store.createServiceTierUpdate(tier)}
            onSubmit={() => {
                if (happyAgentOnline()) void store.createSubmit().catch(() => undefined);
            }}
            onTextChange={(text) => store.createTextUpdate(text)}
            submitting={create.submitting}
            {...(unavailable === undefined ? {} : { submitDisabledReason: unavailable })}
            text={create.text}
        />
    );
}

/**
 * One changed file as a listing entry. Under "All files" the changed ones keep
 * their status marks, so the work in progress stays findable inside the whole
 * tree rather than becoming indistinguishable from everything around it.
 */
function changeEntry(change: OpenGroup["changes"][number]): FileTreeBuildEntry {
    return {
        path: change.path,
        gitStatus: change.status,
        ...(change.addedLines === undefined ? {} : { addedLines: change.addedLines }),
        ...(change.deletedLines === undefined ? {} : { deletedLines: change.deletedLines }),
    };
}

/** Projects only the directory pages the workspace store has materialized. */
function workspaceFileTreeNodes(
    files: HappyAgentWorkspaceFiles | undefined,
    directoryPath: string,
    expansion: FileTreeExpansion,
    changesByPath: ReadonlyMap<string, OpenGroup["changes"][number]>,
    depth = 0,
): FileTreeNode[] {
    const directory = files?.directories.get(directoryPath);
    if (directory === undefined) return [];
    const entries = [...directory.entries].sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
        return fileNameCompare(left.name, right.name);
    });
    return entries.map((entry) => {
        const change = changesByPath.get(entry.path);
        const facts = {
            ...(change?.status === undefined ? {} : { gitStatus: change.status }),
            ...(change?.addedLines === undefined ? {} : { addedLines: change.addedLines }),
            ...(change?.deletedLines === undefined ? {} : { deletedLines: change.deletedLines }),
        };
        if (entry.kind === "file")
            return {
                id: entry.path,
                kind: "file" as const,
                name: entry.name,
                ...facts,
            };
        const expanded = fileTreeExpanded(expansion, entry.path, depth);
        const child = files?.directories.get(entry.path);
        return {
            id: entry.path,
            kind: "directory" as const,
            name: entry.name,
            expanded,
            ...(expanded
                ? {
                      children: workspaceFileTreeNodes(
                          files,
                          entry.path,
                          expansion,
                          changesByPath,
                          depth + 1,
                      ),
                      hasMore: child?.loading !== true && child?.nextCursor !== undefined,
                      loading: child === undefined || (child.loading && child.entries.length === 0),
                  }
                : {}),
        };
    });
}

function HappyAgentPanelBody(props: {
    activity?: HappyAgentConversationSnapshot;
    browserContent?: BrowserContentRenderer;
    htmlPreview?: HtmlPreviewRenderer;
    mediaWindow?: MediaWindowOpener;
    canStartTerminal: boolean;
    changes: OpenGroup["changes"];
    closeShortcut?: KeyboardShortcut;
    expanded: ReadonlySet<string>;
    collapsed: ReadonlySet<string>;
    layout: HappyAgentFileLayout;
    /** Reference clock for elapsed subagent activity. */
    now: number;
    /** Selects Activity through the owning workspace. */
    onActivityOpen: () => void;
    /** Selects the session Usage tab through the owning workspace. */
    onUsageOpen: () => void;
    /** Stops one background process from the Activity tab. */
    onActivityProcessStop?: (processId: number) => void;
    /** Opens one delegated child session from the Activity tab. */
    onSubagentSelect?: (sessionId: string) => void;
    onFileOpen: (path: string) => void;
    onFilePreprocess: (path: string) => void;
    onFileSelect: (path: string) => void;
    onLayoutChange: (layout: HappyAgentFileLayout) => void;
    onPanelClose: () => void;
    /** The file the viewer tab is on, read out of the transcript beside it. */
    panelFile?: HappyAgentFileTabSnapshot;
    /**
     * Draws one open file. It is the workspace's own file body, so the file
     * beside a conversation is the identical surface to the file in a
     * main-content tab — same header, same Rendered / Source, same editor,
     * same Command-S.
     */
    fileBody: (file: HappyAgentFileTabSnapshot) => ReactNode;
    onPanelFileClose: () => void;
    onScopeChange: (scope: HappyAgentFileScope) => void;
    onToggle: (path: string, expanded: boolean) => void;
    onDirectoryPrefetch: (path: string) => void;
    onLoadMore: (path: string) => void;
    /** Moves one view out of this panel and into the main content. */
    onViewTransfer: (viewId: string) => void;
    /** Closes one panel view through the same route used by Cmd-W. */
    onViewClose: (viewId: string) => void;
    panel: HappyAgentPanelSnapshot;
    previewTool?: ConversationToolCall;
    /** Owning Happy Agent availability applied to every retained terminal tab. */
    happyAgentAvailability?: "reconnecting" | "unavailable";
    happyAgentAvailabilityReason?: string;
    scope: HappyAgentFileScope;
    sessionId?: string;
    selectedPath?: string;
    store: HappyAgentPanelStore;
    workspaceFiles?: HappyAgentWorkspaceFiles;
    workspaceFilesLoading: boolean;
}) {
    const all = props.scope === "all";
    const entries: FileTreeBuildEntry[] = useMemo(
        () => props.changes.map(changeEntry),
        [props.changes],
    );
    const expansion: FileTreeExpansion = useMemo(
        () => ({
            opened: props.expanded,
            closed: props.collapsed,
            // All Files starts closed because every disclosure is a real daemon
            // read. Changes is already complete in memory and can open one level.
            defaultDepth: all ? 0 : 1,
        }),
        [all, props.expanded, props.collapsed],
    );
    const changesByPath = useMemo(
        () => new Map(props.changes.map((change) => [change.path, change])),
        [props.changes],
    );
    const nodes: FileTreeNode[] = useMemo(
        () =>
            all
                ? workspaceFileTreeNodes(props.workspaceFiles, "", expansion, changesByPath)
                : props.layout === "tree"
                  ? fileTreeBuild(entries, expansion)
                  : fileTreeFlatten(entries),
        [all, changesByPath, entries, expansion, props.layout, props.workspaceFiles],
    );
    const loading = all && props.workspaceFilesLoading;
    const addedLines = props.changes.reduce((sum, change) => sum + (change.addedLines ?? 0), 0);
    const deletedLines = props.changes.reduce((sum, change) => sum + (change.deletedLines ?? 0), 0);
    const count = entries.length;
    // Only the tabs this side is holding: one the reader moved into the main
    // content is drawn there, and the panel neither lists it nor renders it.
    const panelTools = toolTabsPlaced(props.panel, "panel");
    const activeToolTab = panelTools.find((tab) => tab.id === props.panel.activeViewId);
    const panelFile = props.panelFile;
    const activityTabShown =
        props.panel.activityViewOpen ||
        (props.activity?.activityAvailable === true && !props.panel.activityViewDismissed);
    const activityBackgroundProcesses = props.activity
        ? props.activity.backgroundProcesses.filter((process) =>
              props.activity?.detachedBackgroundProcessIds.has(process.id),
          )
        : [];
    const allFilesUnavailable =
        props.happyAgentAvailability !== undefined && props.workspaceFiles === undefined
            ? (props.happyAgentAvailabilityReason ??
              "Happy Agent must reconnect before loading all files.")
            : undefined;
    const fileScopeActive = props.panel.activeViewId === "files";
    const baseTabs: TabItem[] = [
        {
            closable: fileScopeActive && !all,
            icon: "diff",
            iconOnly: true,
            id: "changes",
            label: "Changes",
        },
        {
            closable: fileScopeActive && all,
            ...(allFilesUnavailable === undefined ? {} : { disabledReason: allFilesUnavailable }),
            icon: "files",
            id: "files",
            label: "Files",
        },
        ...(activityTabShown
            ? [{ closable: true, icon: "agents" as const, id: "activity", label: "Activity" }]
            : []),
        ...(props.panel.usageViewOpen
            ? [{ closable: true, icon: "clock" as const, id: "usage", label: "Usage" }]
            : []),
        ...(props.panel.fileViewOpen && panelFile
            ? [
                  {
                      ...fileTabItem(panelFile),
                      closable: true,
                      id: HAPPY_AGENT_PANEL_FILE_VIEW_ID,
                      // The viewer holds whatever the transcript last pointed
                      // at, so it is marked as the replaceable tab it is.
                      preview: true,
                  } satisfies TabItem,
              ]
            : []),
        ...(props.panel.previewEntryId
            ? [
                  {
                      closable: true,
                      icon:
                          props.previewTool?.presentation?.type === "fileDiff"
                              ? ("doc" as const)
                              : props.previewTool?.presentation?.type === "execCommand" ||
                                  props.previewTool?.presentation?.type ===
                                      "backgroundTerminalInteraction"
                                ? ("terminal" as const)
                                : ("zap" as const),
                      id: "preview",
                      label: "Preview",
                      preview: true,
                  },
              ]
            : []),
        ...toolTabItems(panelTools),
    ];
    const tabs = baseTabs;
    const activeTabId =
        props.panel.activeViewId === "files"
            ? all
                ? "files"
                : "changes"
            : props.panel.activeViewId;
    return (
        <>
            {/* The panel's own chrome control, at its leading edge. */}
            <PanelHeader edgeControl>
                <Button
                    aria-label={PANEL_HIDE_LABEL}
                    aria-pressed
                    icon="panel-collapse"
                    iconOnly
                    onClick={props.onPanelClose}
                    shortcut={PANEL_TOGGLE_HINT}
                    size="small"
                    variant="ghost"
                />
            </PanelHeader>
            {/* The whole panel accepts a tab dragged out of the main strip,
                rather than a target inside it: the reader is aiming at this
                side of the window, not at a stripe within it. */}
            <TransferZone
                icon="panel-expand"
                id={TRANSFER_ZONE_PANEL}
                label="Open in the side panel"
            >
                <TabbedPane
                    actions={
                        props.canStartTerminal ? (
                            <>
                                {props.browserContent ? (
                                    <Button
                                        aria-label="New browser"
                                        icon="globe"
                                        iconOnly
                                        onClick={() => props.store.browserAdd()}
                                        size="small"
                                        variant="ghost"
                                    />
                                ) : null}
                                {/* A shell runs in the checkout, so a checkout
                                    that cannot take work cannot host one. The
                                    panel carries the reason with its scope. */}
                                <Button
                                    aria-label="New terminal"
                                    disabled={props.panel.terminalRefusal !== undefined}
                                    icon="terminal"
                                    iconOnly
                                    onClick={() => props.store.terminalAdd()}
                                    size="small"
                                    title={props.panel.terminalRefusal ?? "New terminal"}
                                    variant="ghost"
                                />
                            </>
                        ) : undefined
                    }
                    activeId={activeTabId}
                    closeLabel="Close tab"
                    {...(props.closeShortcut ? { closeShortcut: props.closeShortcut } : {})}
                    onClose={props.onViewClose}
                    onSelect={(tabId) => {
                        if (tabId === "changes") {
                            props.onScopeChange("changed");
                            props.store.filesSelect();
                        } else if (tabId === "files") {
                            props.onScopeChange("all");
                            props.store.filesSelect();
                        } else if (tabId === "activity") props.onActivityOpen();
                        else if (tabId === "usage") props.onUsageOpen();
                        else if (tabId === "preview" && props.panel.previewEntryId)
                            props.store.previewOpen(props.panel.previewEntryId);
                        else if (tabId === HAPPY_AGENT_PANEL_FILE_VIEW_ID)
                            props.store.fileViewOpen();
                        else props.store.tabSelect(tabId as HappyAgentPanelTabId);
                    }}
                    onTransfer={(tabId) => props.onViewTransfer(tabId)}
                    tabs={tabs}
                    // The listing opens content rather than being content, and a
                    // tool-call preview is bound to an entry of the conversation
                    // the main content is showing; neither has a form over there.
                    transferable={(tab) =>
                        tab.id !== "files" &&
                        tab.id !== "changes" &&
                        tab.id !== "activity" &&
                        tab.id !== "usage" &&
                        tab.id !== "preview"
                    }
                    transferTargets={PANEL_TRANSFER_TARGETS}
                >
                    <HappyAgentToolBodies
                        activeId={props.panel.activeViewId}
                        {...(props.browserContent ? { browserContent: props.browserContent } : {})}
                        {...(props.sessionId ? { sessionId: props.sessionId } : {})}
                        store={props.store}
                        tabs={panelTools}
                        {...(props.happyAgentAvailability === undefined
                            ? {}
                            : {
                                  happyAgentAvailability: props.happyAgentAvailability,
                                  ...(props.happyAgentAvailabilityReason === undefined
                                      ? {}
                                      : {
                                            happyAgentAvailabilityReason:
                                                props.happyAgentAvailabilityReason,
                                        }),
                              })}
                    />
                    {props.panel.activeViewId === "files" ? (
                        <FileBrowser
                            // Only Changes has a complete total and line delta;
                            // All Files stays visually focused on its lazy tree.
                            {...(all ? {} : { addedLines, deletedLines })}
                            count={count}
                            emptyLabel={all ? "No files." : "No changed files."}
                            layout={props.layout}
                            loading={loading}
                            nodes={nodes}
                            {...(props.happyAgentAvailability !== undefined && all
                                ? {
                                      fileActionsUnavailable:
                                          props.happyAgentAvailabilityReason ??
                                          "Happy Agent must reconnect before opening files.",
                                  }
                                : {})}
                            onLayoutChange={(layout: HappyAgentFileLayout) =>
                                props.onLayoutChange(layout)
                            }
                            onDirectoryPrefetch={props.onDirectoryPrefetch}
                            onFilePrefetch={props.onFilePreprocess}
                            onLoadMore={props.onLoadMore}
                            {...(props.happyAgentAvailability === undefined
                                ? { onOpen: props.onFileOpen }
                                : {})}
                            onSelect={(path: string) => props.onFileSelect(path)}
                            onToggle={props.onToggle}
                            scope={props.scope}
                            selectedId={props.selectedPath}
                        />
                    ) : props.panel.activeViewId === "activity" ? (
                        props.activity ? (
                            <HappyAgentActivityPanel
                                backgroundProcesses={activityBackgroundProcesses}
                                goal={props.activity.goal}
                                now={props.now}
                                onBackgroundProcessStop={props.onActivityProcessStop}
                                onSubagentSelect={props.onSubagentSelect}
                                placement="panel"
                                subagents={props.activity.subagents}
                                tasks={props.activity.tasks}
                            />
                        ) : (
                            <EmptyState
                                description="Open a session to see its goal, tasks, subagents, and background terminals."
                                icon="agents"
                                size="panel"
                                title="No session activity"
                            />
                        )
                    ) : props.panel.activeViewId === "usage" ? (
                        props.activity ? (
                            <HappyAgentUsagePanel
                                error={props.activity.usageError}
                                loading={props.activity.usageLoading}
                                placement="panel"
                                usage={props.activity.usage}
                            />
                        ) : (
                            <EmptyState
                                description="Open a session to see its token, cost, context, and quota usage."
                                icon="clock"
                                size="panel"
                                title="No session usage"
                            />
                        )
                    ) : props.panel.activeViewId === "preview" ? (
                        props.previewTool ? (
                            <ToolCallPreview tool={props.previewTool} />
                        ) : (
                            <EmptyState
                                description="The selected call is no longer in this conversation view."
                                icon="zap"
                                size="panel"
                                title="Preview unavailable"
                            />
                        )
                    ) : props.panel.activeViewId === HAPPY_AGENT_PANEL_FILE_VIEW_ID ? (
                        panelFile ? (
                            props.fileBody(panelFile)
                        ) : (
                            <EmptyState
                                description="The file this conversation pointed at is no longer open."
                                icon="doc"
                                size="panel"
                                title="No file open"
                            />
                        )
                    ) : activeToolTab ? null : ( // Already drawn above, for every kind of tool.
                        <EmptyState
                            description="Select Files, Activity, Usage, a preview, or a live tool tab."
                            icon="files"
                            size="panel"
                            title="Nothing selected"
                        />
                    )}
                </TabbedPane>
            </TransferZone>
        </>
    );
}

/**
 * Whether a file is one the shell's separate window has a viewer for. Pictures
 * and recordings are; a document, a listing, or an archive is not, and offering
 * to open one in a window that could only say so again would be a control that
 * does nothing.
 */
function mediaWindowShowable(kind: FilePreviewKind): boolean {
    return kind === "image" || kind === "video";
}

/**
 * One terminal tab. It reads the terminal's own store, which is the only thing in
 * this surface that changes on every frame of output, and hands it to the shared
 * `TerminalPanel` with no height of its own so it fills the panel column. The tab
 * names it and closes it, so the panel draws no chrome of its own above the grid.
 */
/**
 * The bodies of the live tool tabs on one side of the workspace, written once
 * and rendered by whichever side is currently holding them: moving a tab across
 * the window changes which strip draws it and nothing about what it is.
 *
 * Browser pages are all mounted together and only one is shown, because a page that
 * stopped being looked at is still loaded and unmounting it would throw the
 * session away; a terminal is drawn only while it is on screen, and its process
 * outlives its view because the store, not this component, is what holds it.
 *
 * Moving a terminal across the window therefore costs it nothing: the view is
 * rebuilt on the other side and attaches to the same running shell. A page
 * cannot be given that promise. An iframe reloads whenever it is moved to a
 * different parent — that is the browser's rule, not this component's, and no
 * arrangement of React can move a node without moving it. So a page that
 * changes sides loads again, from the address the store kept for it, which is
 * why the address lives in the store and not in the frame.
 */
function HappyAgentToolBodies(props: {
    tabs: readonly HappyAgentPanelTabSnapshot[];
    activeId: string | undefined;
    store: HappyAgentPanelStore;
    browserContent?: BrowserContentRenderer;
    /** Owning Happy Agent availability applied to retained terminal tabs. */
    happyAgentAvailability?: "reconnecting" | "unavailable";
    happyAgentAvailabilityReason?: string;
    sessionId?: string;
}) {
    const active = props.tabs.find((tab) => tab.id === props.activeId);
    return (
        <>
            {props.tabs
                .filter((tab) => tab.kind === "browser")
                .map((tab) => (
                    <BrowserPanel
                        active={props.activeId === tab.id}
                        initialUrl={tab.url}
                        key={tab.id}
                        onLocationChange={(url) => props.store.browserUpdate(tab.id, { url })}
                        onTitleChange={(title) => props.store.browserUpdate(tab.id, { title })}
                        {...(props.happyAgentAvailability === undefined
                            ? {}
                            : {
                                  unavailable:
                                      props.happyAgentAvailabilityReason ??
                                      "This Happy Agent is reconnecting. Browser navigation is paused.",
                              })}
                        renderContent={
                            props.browserContent && props.sessionId
                                ? (browserProps) =>
                                      props.browserContent!({
                                          ...browserProps,
                                          sessionId: props.sessionId,
                                      })
                                : undefined
                        }
                    />
                ))}
            {active?.kind === "terminal" ? (
                <HappyAgentTerminalTab
                    key={active.id}
                    store={props.store}
                    tabId={active.id}
                    {...(props.happyAgentAvailability === undefined
                        ? {}
                        : {
                              happyAgentAvailability: props.happyAgentAvailability,
                              ...(props.happyAgentAvailabilityReason === undefined
                                  ? {}
                                  : {
                                        happyAgentAvailabilityReason:
                                            props.happyAgentAvailabilityReason,
                                    }),
                          })}
                />
            ) : null}
        </>
    );
}

function HappyAgentTerminalTab(props: {
    store: HappyAgentPanelStore;
    tabId: HappyAgentPanelTabId;
    happyAgentAvailability?: "reconnecting" | "unavailable";
    happyAgentAvailabilityReason?: string;
}) {
    const terminal: HappyAgentTerminalStore | undefined = props.store.terminal(props.tabId);
    if (!terminal)
        return (
            <EmptyState
                description="This terminal is no longer available."
                icon="terminal"
                size="panel"
                title="Terminal closed"
            />
        );
    return (
        <HappyAgentTerminalScreen
            terminal={terminal}
            {...(props.happyAgentAvailability === undefined
                ? {}
                : {
                      happyAgentAvailability: props.happyAgentAvailability,
                      ...(props.happyAgentAvailabilityReason === undefined
                          ? {}
                          : { happyAgentAvailabilityReason: props.happyAgentAvailabilityReason }),
                  })}
        />
    );
}

/** The subscribed half of a terminal tab, split out so the store is non-optional. */
function HappyAgentTerminalScreen(props: {
    terminal: HappyAgentTerminalStore;
    happyAgentAvailability?: "reconnecting" | "unavailable";
    happyAgentAvailabilityReason?: string;
}) {
    const { terminal } = props;
    const snapshot = useSyncExternalStore(terminal.subscribe, terminal.get, terminal.get);
    return (
        <TerminalPanel
            colorScheme={snapshot.colorScheme}
            exitCode={snapshot.exitCode}
            {...(snapshot.grid ? { grid: snapshot.grid } : {})}
            {...(snapshot.error ? { error: snapshot.error.message } : {})}
            onInput={(data) => terminal.terminalWrite(data)}
            onOpenLink={openExternalLink}
            onReconnect={() => terminal.terminalReconnect()}
            onResize={(cols, rows) => terminal.terminalResize(cols, rows)}
            {...(props.happyAgentAvailability === undefined
                ? {}
                : {
                      happyAgentAvailability: props.happyAgentAvailability,
                      ...(props.happyAgentAvailabilityReason === undefined
                          ? {}
                          : { happyAgentAvailabilityReason: props.happyAgentAvailabilityReason }),
                  })}
            status={snapshot.status}
        />
    );
}
