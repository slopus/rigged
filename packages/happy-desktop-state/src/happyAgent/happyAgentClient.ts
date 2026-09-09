import type {
    TerminalColorScheme,
    TerminalDriverCreate,
} from "../modules/terminal/terminalState.js";
import type { HappyAgentClient } from "@slopus/happy-agent-client";
import { happyAgentProjectAddError } from "./happyAgentProjectRegistration.js";
import type { MutationRejectedDelta } from "../happyAgentConnection/index.js";
import type { HappyAgentConnection } from "../happyAgentConnection/index.js";
import {
    happyAgentTerminalOpen,
    type HappyAgentTerminalHandle,
} from "./happyAgentTerminalStore.js";
import {
    happyAgentChatStoreCreate,
    type HappyAgentChatDeps,
    type HappyAgentChatOutput,
    type HappyAgentChatStore,
    type HappyAgentChatTranscriptConnect,
} from "./happyAgentChatStore.js";
import {
    happyAgentSessionListStoreCreate,
    type HappyAgentSessionCatalogSource,
    type HappyAgentSessionListOutput,
    type HappyAgentSessionListStore,
} from "./happyAgentSessionListStore.js";
import type { HappyAgentHostServices } from "./happyAgentHostServices.js";
import {
    happyAgentChangedFileProject,
    happyAgentModelCatalogProject,
    happyAgentTextDecodeBase64,
    happyAgentTextEncodeBase64,
} from "./happyAgentProject.js";
import type {
    HappyAgentChangedFileDocument,
    HappyAgentFileSearchResult,
    HappyAgentGitChangedFile,
    HappyAgentGroupId,
    HappyAgentOpenInTarget,
    HappyAgentOpenInTargets,
    HappyAgentWorkspaceFileBytes,
    HappyAgentWorkspaceFileDocument,
    HappyAgentWorkspaceFileTreePage,
    HappyAgentModelCatalog,
    HappyAgentProjectId,
    HappyAgentSessionId,
} from "./happyAgentTypes.js";
import { happyAgentModelStoreCreate, type HappyAgentModelStore } from "./happyAgentModelStore.js";
import type { HappyAgentModelPreferencePersistence } from "./happyAgentModelStore.js";
import {
    happyAgentWorkspaceMemoryStoreCreate,
    type HappyAgentWorkspaceMemoryPersistence,
    type HappyAgentWorkspaceMemoryStore,
} from "./happyAgentWorkspaceMemory.js";
import {
    happyAgentInboxStoreCreate,
    type HappyAgentInboxSource,
    type HappyAgentInboxStore,
} from "./happyAgentInboxStore.js";
import {
    happyAgentInstructionsStoreCreate,
    type HappyAgentInstructionsStore,
} from "./happyAgentInstructionsStore.js";
import {
    happyAgentSecurityPolicyStoreCreate,
    type HappyAgentSecurityPolicyStore,
} from "./happyAgentSecurityPolicyStore.js";
import {
    happyAgentSecretsStoreCreate,
    type HappyAgentSecretsStore,
} from "./happyAgentSecretsStore.js";
import {
    happyAgentProviderUsageStoreCreate,
    type HappyAgentProviderUsageSource,
    type HappyAgentProviderUsageStore,
} from "./happyAgentProviderUsageStore.js";
import {
    happyAgentProfileStoreCreate,
    type HappyAgentProfileActions,
    type HappyAgentProfileSource,
    type HappyAgentProfileStore,
} from "./happyAgentProfileStore.js";
import {
    happyAgentProvidersStoreCreate,
    type HappyAgentProvidersStore,
} from "./happyAgentProvidersStore.js";
import {
    happyAgentIntegrationStoreCreate,
    type HappyAgentIntegrationStore,
} from "./happyAgentIntegrationStore.js";
import {
    happyAgentCloudStoreCreate,
    type HappyAgentCloudHost,
    type HappyAgentCloudStore,
} from "./happyAgentCloudStore.js";
import {
    happyAgentCloudDevicesStoreCreate,
    type HappyAgentCloudDevicesStore,
} from "./happyAgentCloudDevicesStore.js";
import {
    happyAgentSocialStoreCreate,
    type HappyAgentSocialStore,
} from "./happyAgentSocialStore.js";
import {
    happyAgentSocialJoinStoreCreate,
    type HappyAgentSocialJoinStore,
} from "./happyAgentSocialJoinStore.js";
import { happyAgentTeamsStoreCreate, type HappyAgentTeamsStore } from "./happyAgentTeamsStore.js";

/** A disposable view lease on one retained session chat store. */
export interface HappyAgentChatHandle {
    readonly store: HappyAgentChatStore;
    [Symbol.dispose](): void;
}

/** One daemon hint that says which workspace files must be read again. */
export interface HappyAgentWorkspaceFilesChanged {
    readonly groupId: HappyAgentGroupId;
    /** Relative paths, or `null` when every materialized path may have changed. */
    readonly paths: readonly string[] | null;
}

export interface HappyAgentWorkspaceClient {
    /** One model/capability/default/last-used authority for this daemon connection. */
    readonly models: HappyAgentModelStore;
    /**
     * What this Happy Agent remembers between runs: each group's tabs and which sessions
     * have unseen finished work. Shared by the list and the workspace so both
     * read and write the one document the host persists.
     */
    readonly memory: HappyAgentWorkspaceMemoryStore;
    /** Loads (once) and returns the model catalog; cached for the client's lifetime. */
    catalogRead(): Promise<HappyAgentModelCatalog>;
    /** The single session-list store; materialized on first access. */
    sessionList(): HappyAgentSessionListStore;
    /**
     * The single inbox store for this Happy Agent: every question its agents are waiting
     * on. Materialized on first access and shared, because the sidebar's pending
     * count and the open inbox are the same queue seen twice. Unavailable when the
     * host supplied no question feed, so a surface can say so instead of showing
     * an inbox that is empty for the wrong reason.
     */
    inbox(): HappyAgentInboxStore | undefined;
    /**
     * The single provider-usage store for this Happy Agent: how much of each account's
     * plan its agents have spent. Materialized on first access and shared, so a
     * second surface reading the same accounts costs no extra daemon reads.
     * Unavailable when the host supplied no usage feed, so a surface can say the
     * machine does not report usage rather than showing an account list that is
     * empty for the wrong reason.
     */
    providerUsage(): HappyAgentProviderUsageStore | undefined;
    /** The installation-wide Happy Mobile connection, materialized on first access. */
    happyIntegration(): HappyAgentIntegrationStore;
    /** The installation-wide Happy Social account, materialized on first access. */
    cloud(): HappyAgentCloudStore;
    /** Every installation signed into that account, read while a surface watches. */
    cloudDevices(): HappyAgentCloudDevicesStore;
    /** Friends and requests for the enrolled Happy Social account. */
    social(): HappyAgentSocialStore;
    /** WorkOS organizations shown as teams, on agents that support the organization API. */
    teams(): HappyAgentTeamsStore;
    /** The ordered errand that carries this account from signed out to live. */
    socialJoin(): HappyAgentSocialJoinStore;
    /** The one host-owned identity work is authored as. */
    profile(): HappyAgentProfileStore | undefined;
    /**
     * Which model providers this Happy Agent will use, as the Providers settings
     * category reads and changes them. Materialized on first access and shared;
     * every configuration the daemon confirms through it also replaces the
     * catalog `models` holds, so a provider switched off stops being offered.
     */
    providers(): HappyAgentProvidersStore;
    /**
     * This Happy Agent's own machine-wide instructions, as one editable document.
     * Materialized on first access and shared, so the settings window and
     * anything else showing them are looking at the same draft.
     */
    instructions(): HappyAgentInstructionsStore;
    /** This Happy Agent's machine-wide permission-review policy, as one editable document. */
    securityPolicy(): HappyAgentSecurityPolicyStore;
    /** Global write-only environment bundles, materialized while Settings reads them. */
    secrets(): HappyAgentSecretsStore;
    /** Reads one bounded page of one checkout directory. */
    workspaceFileTreeRead(
        groupId: HappyAgentGroupId,
        path: string,
        cursor?: string,
    ): Promise<HappyAgentWorkspaceFileTreePage>;
    /**
     * Searches one checkout for `@`-mention candidates. A pure query: the result
     * is transient composer typeahead and never enters a durable snapshot.
     */
    filesSearch(
        groupId: HappyAgentGroupId,
        query: string,
        limit?: number,
    ): Promise<readonly HappyAgentFileSearchResult[]>;
    /**
     * Reads one existing text file from a project/worktree checkout. A file
     * belongs to the checkout rather than to any conversation open over it, so
     * it is addressed by the group.
     */
    workspaceFileRead(
        groupId: HappyAgentGroupId,
        path: string,
        signal?: AbortSignal,
    ): Promise<HappyAgentWorkspaceFileDocument>;
    /** Follows file-change hints only while a workspace surface is materialized. */
    workspaceFilesSubscribe(
        listener: (change: HappyAgentWorkspaceFilesChanged) => void,
    ): () => void;
    /**
     * Reads one workspace file as bytes, for showing it rather than editing it.
     * Makes no claim that the file is text, so an image or a video arrives whole.
     */
    workspaceFileBytesRead(
        groupId: HappyAgentGroupId,
        path: string,
        signal?: AbortSignal,
    ): Promise<HappyAgentWorkspaceFileBytes>;
    /**
     * Where one HTML document of a checkout is served as a page, for a viewer
     * that renders the document rather than its source.
     */
    htmlPreviewOpen(groupId: HappyAgentGroupId, path: string): Promise<string>;
    /** Writes one existing text file back to its checkout. */
    workspaceFileWrite(
        groupId: HappyAgentGroupId,
        path: string,
        content: string,
        expectedHash: string | null,
    ): Promise<void>;
    /** Where a file the reader chose lives on this machine, when it lives anywhere. */
    attachmentSourcePath(file: File): string | undefined;
    /**
     * Whether an agent working in this group could open that path where it lies,
     * which is true exactly when its work happens on the reader's own machine.
     */
    attachmentSourceReachable(groupId: HappyAgentGroupId, sourcePath: string): Promise<boolean>;
    /**
     * Copies an attached file into a project or worktree checkout by value,
     * answering with the path it landed on relative to that checkout.
     */
    attachmentWrite(
        groupId: HappyAgentGroupId,
        name: string,
        content: string,
    ): Promise<{ readonly path: string }>;
    /**
     * Registers one folder on this Happy Agent's machine as a project and resolves with
     * the identity Happy Agent gave it. Nothing is started in it: a project is a folder
     * Happy Agent knows about, and a conversation in it is a separate decision.
     *
     * Happy Agent is authoritative for what may become a project and answers by
     * canonical path, so registering a folder it already holds returns the
     * project it already has rather than a second copy of it. A refusal arrives
     * as a displayable `UserError`.
     */
    projectAdd(path: string): Promise<HappyAgentProjectId>;
    /** Applications this host can open a project or worktree directory in. */
    openInTargetsRead(): Promise<HappyAgentOpenInTargets>;
    /**
     * Opens one project or worktree root in one of those applications, and makes
     * it the one this machine opened most recently.
     */
    openIn(groupId: HappyAgentGroupId, target: HappyAgentOpenInTarget): Promise<void>;
    /** Reads one changed text file from a project/worktree checkout. */
    changedFileRead(
        groupId: HappyAgentGroupId,
        path: string,
        change: HappyAgentGitChangedFile,
        signal?: AbortSignal,
    ): Promise<HappyAgentChangedFileDocument>;
    /**
     * Acquires a retained chat store for one session. Concurrent and later
     * acquisitions share its messages and model state. Releasing the last lease
     * pauses this store's projection; the Happy Agent-wide SSE cache continues following
     * the session and catches the store up when it is acquired again. A bounded
     * recent-chat cache disposes released stores when the live-store limit is exceeded.
     */
    chat(sessionId: HappyAgentSessionId): Promise<HappyAgentChatHandle>;
    /** Stops background synchronization for an archived chat; its store remains subject to the bounded cache. */
    chatArchive(sessionId: HappyAgentSessionId): void;
    /** Lets a restored chat resume background synchronization when it is acquired again. */
    chatRestore(sessionId: HappyAgentSessionId): void;
    /**
     * Opens one interactive terminal in a session's working directory. Unlike a
     * chat store these are not shared or reference-counted: two terminals in the
     * same session are two separate shells, which is the whole point of being able
     * to open more than one. Disposing the handle stops the remote terminal.
     */
    terminalOpen(sessionId: HappyAgentSessionId): HappyAgentTerminalHandle;
    [Symbol.dispose](): void;
}

export interface HappyAgentWorkspaceClientDeps {
    readonly client: HappyAgentClient;
    readonly cloudHost: HappyAgentCloudHost;
    readonly connection: HappyAgentConnection;
    readonly hostServices: HappyAgentHostServices;
    /** Stream-owned read authority for the project/workspace/session catalog. */
    readonly catalogSource: HappyAgentSessionCatalogSource;
    /**
     * Stream-owned feed of the questions this Happy Agent's agents are waiting on.
     * Omitted leaves the inbox unavailable rather than empty.
     */
    readonly inboxSource?: HappyAgentInboxSource;
    /**
     * Repeating read of each provider account's plan usage. Omitted leaves usage
     * unavailable rather than empty.
     */
    readonly providerUsageSource?: HappyAgentProviderUsageSource;
    /** Host-only profile read and mutation. Omitted on a node connection. */
    readonly profileSource?: HappyAgentProfileSource;
    readonly profileActions?: HappyAgentProfileActions;
    /** Opens the core transcript stream for one materialized chat. */
    readonly transcriptConnect: HappyAgentChatTranscriptConnect;
    /** Maximum number of leased chat stores that may keep a live transcript subscription. */
    readonly maxLiveChatSubscriptions?: number;
    /** Terminal failures emitted by the shared Happy Agent mutation authority. */
    readonly connectMutationSubscribe: (
        listener: (rejection: MutationRejectedDelta) => void,
    ) => () => void;
    readonly sessionListOutput?: (event: HappyAgentSessionListOutput) => void;
    readonly chatOutput?: (sessionId: HappyAgentSessionId, event: HappyAgentChatOutput) => void;
    readonly modelPreferencePersistence?: HappyAgentModelPreferencePersistence;
    /** Where this Happy Agent's tab and read memory is kept; omitted keeps it in memory. */
    readonly workspaceMemoryPersistence?: HappyAgentWorkspaceMemoryPersistence;
    /**
     * Builds the driver behind a terminal: the app-layer machinery that owns the
     * terminal protocol client and the VT emulator. Omitting it leaves terminals
     * unavailable — they report that instead of failing silently — which is what an
     * app with no emulator to offer should do.
     */
    readonly terminalDriverCreate?: TerminalDriverCreate;
    /**
     * The appearance a terminal opened right now should run in, read once per
     * terminal. It is a function rather than a value because the window's theme
     * changes over the life of this client, and each terminal keeps whichever
     * appearance was current when it started.
     */
    readonly terminalColorScheme: () => TerminalColorScheme;
}

interface ChatBinding {
    count: number;
    readonly storePromise: Promise<HappyAgentChatStore>;
    store?: HappyAgentChatStore;
    activeUnsubscribe?: () => void;
    archived: boolean;
    lastUsedOrder: number;
    /** Ignores the archived snapshot retained until an unarchive is confirmed. */
    restoring: boolean;
}

async function workspaceFileTreeRead(
    client: Pick<HappyAgentClient, "getFileTree">,
    groupId: HappyAgentGroupId,
    path: string,
    cursor?: string,
): Promise<HappyAgentWorkspaceFileTreePage> {
    const page = await client.getFileTree(groupId, {
        ...(path === "" ? {} : { path }),
        ...(cursor === undefined ? {} : { cursor }),
        limit: 500,
    });
    const entries = page.entries.flatMap((entry) => {
        // `.git` is never a browsable project entry. Older daemons exposed it
        // and then refused expansion; newer ones omit it at the source.
        if (entry.name === ".git" || entry.type === "other") return [];
        return [
            {
                kind: entry.type === "directory" ? ("directory" as const) : ("file" as const),
                name: entry.name,
                path: entry.path,
            },
        ];
    });
    return {
        entries,
        ...(page.nextCursor === null ? {} : { nextCursor: page.nextCursor }),
    };
}

async function changedFileRead(
    client: Pick<HappyAgentClient, "readFile" | "readFileRevision">,
    groupId: HappyAgentGroupId,
    path: string,
    change: HappyAgentGitChangedFile,
    signal?: AbortSignal,
): Promise<HappyAgentChangedFileDocument> {
    const oldPath = change.previousPath ?? path;
    const oldContent =
        change.status === "added" ||
        change.status === "untracked" ||
        change.baseRevision === undefined
            ? ""
            : happyAgentTextDecodeBase64(
                  (
                      await client.readFileRevision(
                          groupId,
                          { path: oldPath, revision: change.baseRevision },
                          { signal },
                      )
                  ).content,
              );
    const current =
        change.status === "deleted" ? undefined : await client.readFile(groupId, path, { signal });
    return happyAgentChangedFileProject({
        path,
        ...(oldPath === path ? {} : { oldPath }),
        oldContent,
        newContent: current === undefined ? "" : happyAgentTextDecodeBase64(current.content),
        ...(current === undefined ? {} : { hash: current.hash }),
    });
}

/**
 * Composition root for a direct Happy Agent client: it owns the stateless `/v0`
 * client, the live connection, model store, session list, and retained chats.
 * Chat projections run only while leased; their state remains in memory, while
 * the one connection-wide SSE cache follows materialized sessions between views.
 */
export function happyAgentWorkspaceClientCreate(
    deps: HappyAgentWorkspaceClientDeps,
): HappyAgentWorkspaceClient {
    const configuredMaxLiveChatSubscriptions = deps.maxLiveChatSubscriptions;
    const maxLiveChatSubscriptions =
        configuredMaxLiveChatSubscriptions === undefined ||
        !Number.isFinite(configuredMaxLiveChatSubscriptions)
            ? 8
            : Math.max(1, Math.floor(configuredMaxLiveChatSubscriptions));
    const models = happyAgentModelStoreCreate({
        catalogRead: async () =>
            happyAgentModelCatalogProject((await deps.client.getConfig()).config),
        ...(deps.modelPreferencePersistence
            ? { preferencePersistence: deps.modelPreferencePersistence }
            : {}),
    });
    const memory = happyAgentWorkspaceMemoryStoreCreate(deps.workspaceMemoryPersistence);
    let sessionListStore: HappyAgentSessionListStore | undefined;
    let inboxStore: HappyAgentInboxStore | undefined;
    let providerUsageStore: HappyAgentProviderUsageStore | undefined;
    let happyIntegrationStore: HappyAgentIntegrationStore | undefined;
    let cloudStore: HappyAgentCloudStore | undefined;
    let cloudDevicesStore: HappyAgentCloudDevicesStore | undefined;
    let socialStore: HappyAgentSocialStore | undefined;
    let teamsStore: HappyAgentTeamsStore | undefined;
    let socialJoinStore: HappyAgentSocialJoinStore | undefined;
    let profileStore: HappyAgentProfileStore | undefined;
    let providersStore: HappyAgentProvidersStore | undefined;
    let instructionsStore: HappyAgentInstructionsStore | undefined;
    let securityPolicyStore: HappyAgentSecurityPolicyStore | undefined;
    let secretsStore: HappyAgentSecretsStore | undefined;
    const chats = new Map<HappyAgentSessionId, ChatBinding>();
    let disposed = false;
    let chatUseOrder = 0;

    /**
     * A released chat has no transcript listener, but its ChatStore used to
     * remain in this map forever (including its mutation listener and projected
     * entries). Keep a small recent set and dispose the oldest released stores;
     * the connection-wide session cache remains responsible for complete
     * inactive messages.
     */
    const evictReleasedChats = (protectedSessionId?: HappyAgentSessionId): void => {
        while (chats.size > maxLiveChatSubscriptions) {
            const candidate = [...chats.entries()]
                .filter(
                    ([sessionId, binding]) =>
                        sessionId !== protectedSessionId &&
                        binding.count === 0 &&
                        binding.store !== undefined &&
                        !binding.store.hasPendingMutations(),
                )
                .sort((left, right) => left[1].lastUsedOrder - right[1].lastUsedOrder)[0];
            if (candidate === undefined) return;
            const [sessionId, binding] = candidate;
            binding.activeUnsubscribe?.();
            binding.activeUnsubscribe = undefined;
            binding.store?.[Symbol.dispose]();
            chats.delete(sessionId);
        }
    };

    const admitChat = (sessionId: HappyAgentSessionId): void => {
        evictReleasedChats(sessionId);
        const binding = chats.get(sessionId);
        if (binding !== undefined && binding.count > 0) return;
        const live = [...chats.values()].filter((candidate) => candidate.count > 0).length;
        if (live >= maxLiveChatSubscriptions) {
            throw new Error(
                `The maximum of ${String(maxLiveChatSubscriptions)} live chat subscriptions is already in use.`,
            );
        }
    };

    const chatDeactivate = (binding: ChatBinding): void => {
        binding.activeUnsubscribe?.();
        binding.activeUnsubscribe = undefined;
    };

    const chatActivate = (binding: ChatBinding): void => {
        const store = binding.store;
        if (
            store === undefined ||
            binding.archived ||
            binding.count === 0 ||
            binding.activeUnsubscribe !== undefined
        ) {
            return;
        }
        const archivedRead = (): void => {
            const archived = store.get().archived;
            // Restoring starts against the last archived snapshot. Keep this
            // watcher alive until the connection publishes the host's false;
            // only a later true is another archive.
            if (binding.restoring) {
                if (archived) return;
                binding.restoring = false;
            }
            binding.archived = archived;
            if (archived) chatDeactivate(binding);
        };
        const unsubscribe = store.subscribe(archivedRead);
        binding.activeUnsubscribe = unsubscribe;
        archivedRead();
    };

    return {
        models,
        memory,
        catalogRead: () => models.load().then((snapshot) => snapshot.catalog),
        changedFileRead: (groupId, path, change, signal) =>
            changedFileRead(deps.client, groupId, path, change, signal),
        workspaceFileTreeRead: (groupId, path, cursor) =>
            workspaceFileTreeRead(deps.client, groupId, path, cursor),
        filesSearch: async (groupId, query, limit) =>
            (
                await deps.client.searchFiles(groupId, {
                    query,
                    ...(limit === undefined ? {} : { limit }),
                })
            ).files.map((file) => ({ fileName: file.fileName, path: file.path })),
        workspaceFileRead: async (groupId, path, signal) => {
            const file = await deps.client.readFile(groupId, path, { signal });
            return { path, content: happyAgentTextDecodeBase64(file.content), hash: file.hash };
        },
        workspaceFilesSubscribe(listener) {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            const connection = deps.connection.connectGroups({
                onChange: () => undefined,
                onDelta: (delta) => {
                    if (delta.type !== "files_changed") return;
                    listener({
                        groupId: delta.workspaceId as HappyAgentGroupId,
                        paths: delta.paths,
                    });
                },
            });
            return () => connection.close();
        },
        workspaceFileBytesRead: (groupId, path, signal) =>
            deps.hostServices.workspaceFileBytesRead(groupId, path, signal),
        htmlPreviewOpen: (groupId, path) => deps.hostServices.htmlPreviewOpen(groupId, path),
        workspaceFileWrite: async (groupId, path, content, expectedHash) => {
            await deps.client.writeFile(groupId, {
                path,
                content: happyAgentTextEncodeBase64(content),
                expectedHash,
            });
        },
        attachmentSourcePath: (file) => deps.hostServices.attachmentSourcePath(file),
        attachmentSourceReachable: (groupId, sourcePath) =>
            deps.hostServices.attachmentSourceReachable(groupId, sourcePath),
        attachmentWrite: (groupId, name, content) =>
            deps.hostServices.attachmentWrite(groupId, name, content),
        async projectAdd(path) {
            // Registration is the daemon's own decision, so it goes directly
            // through the connection actions: the daemon validates the folder,
            // names the project, and is idempotent by canonical path. A
            // connection without project actions cannot ask, and says so rather
            // than pretending the folder was added.
            try {
                const project = await deps.connection.projects.add(path);
                return project.id as HappyAgentProjectId;
            } catch (error) {
                throw happyAgentProjectAddError(error, path);
            }
        },
        openInTargetsRead: () => deps.hostServices.openInTargetsRead(),
        openIn: (groupId, target) => deps.hostServices.openIn(groupId, target),
        sessionList() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            if (!sessionListStore) {
                sessionListStore = happyAgentSessionListStoreCreate({
                    client: deps.client,
                    catalogSource: deps.catalogSource,
                    connectActions: deps.connection,
                    connectMutationSubscribe: deps.connectMutationSubscribe,
                    output: deps.sessionListOutput,
                });
            }
            return sessionListStore;
        },
        inbox() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            const source = deps.inboxSource;
            if (!source) return undefined;
            inboxStore ??= happyAgentInboxStoreCreate({
                source,
                output: (event) => {
                    const store = inboxStore;
                    if (!store) return;
                    deps.connection.answerUserInput(event.sessionId, event.requestId, {
                        answers: event.answers,
                    });
                    store.inboxInput({ type: "itemAnswerSucceeded", itemId: event.itemId });
                },
            });
            return inboxStore;
        },
        providerUsage() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            const source = deps.providerUsageSource;
            if (!source) return undefined;
            providerUsageStore ??= happyAgentProviderUsageStoreCreate({ source });
            return providerUsageStore;
        },
        happyIntegration() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            happyIntegrationStore ??= happyAgentIntegrationStoreCreate({
                client: deps.client,
                sync: deps.connection.sync,
            });
            return happyIntegrationStore;
        },
        cloud() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            cloudStore ??= happyAgentCloudStoreCreate({
                client: deps.client,
                sync: deps.connection.sync,
                host: deps.cloudHost,
            });
            return cloudStore;
        },
        cloudDevices() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            cloudDevicesStore ??= happyAgentCloudDevicesStoreCreate({ client: deps.client });
            return cloudDevicesStore;
        },
        social() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            socialStore ??= happyAgentSocialStoreCreate({
                client: deps.client,
                sync: deps.connection.sync,
            });
            return socialStore;
        },
        teams() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            teamsStore ??= happyAgentTeamsStoreCreate({ client: deps.client });
            return teamsStore;
        },
        socialJoin() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            cloudStore ??= happyAgentCloudStoreCreate({
                client: deps.client,
                sync: deps.connection.sync,
                host: deps.cloudHost,
            });
            socialJoinStore ??= happyAgentSocialJoinStoreCreate({
                client: deps.client,
                cloud: cloudStore,
            });
            return socialJoinStore;
        },
        profile() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            if (!deps.profileSource || !deps.profileActions) return undefined;
            profileStore ??= happyAgentProfileStoreCreate({
                source: deps.profileSource,
                actions: deps.profileActions,
            });
            return profileStore;
        },
        providers() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            providersStore ??= happyAgentProvidersStoreCreate({
                client: deps.client,
                catalogChanged: (catalog) => models.catalogChanged(catalog),
            });
            return providersStore;
        },
        instructions() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            instructionsStore ??= happyAgentInstructionsStoreCreate({ client: deps.client });
            return instructionsStore;
        },
        securityPolicy() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            securityPolicyStore ??= happyAgentSecurityPolicyStoreCreate({ client: deps.client });
            return securityPolicyStore;
        },
        secrets() {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            secretsStore ??= happyAgentSecretsStoreCreate({ client: deps.client });
            return secretsStore;
        },
        async chat(sessionId) {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            let binding = chats.get(sessionId);
            admitChat(sessionId);
            if (!binding) {
                const storePromise = models.load().then(({ catalog }) => {
                    const chatDeps: HappyAgentChatDeps = {
                        catalog,
                        transcriptConnect: deps.transcriptConnect,
                        connectActions: deps.connection,
                        connectMutationSubscribe: deps.connectMutationSubscribe,
                        selectionUsed: (selection) => models.selectionUsed(selection),
                        modelSelect: (current, input) => models.modelSelect(current, input),
                        output: deps.chatOutput
                            ? (event) => deps.chatOutput?.(sessionId, event)
                            : undefined,
                    };
                    const store = happyAgentChatStoreCreate(sessionId, chatDeps);
                    const current = chats.get(sessionId);
                    if (current) {
                        current.store = store;
                        chatActivate(current);
                    }
                    return store;
                });
                binding = {
                    count: 0,
                    storePromise,
                    archived: false,
                    lastUsedOrder: 0,
                    restoring: false,
                };
                chats.set(sessionId, binding);
            }
            binding.count += 1;
            binding.lastUsedOrder = ++chatUseOrder;
            chatActivate(binding);
            let store: HappyAgentChatStore;
            try {
                store = await binding.storePromise;
            } catch (error) {
                const current = chats.get(sessionId);
                if (current === binding) chats.delete(sessionId);
                throw error;
            }
            evictReleasedChats(sessionId);
            let released = false;
            return {
                store,
                [Symbol.dispose]() {
                    if (released) return;
                    released = true;
                    const current = chats.get(sessionId);
                    if (!current) return;
                    current.count -= 1;
                    if (current.count <= 0) {
                        current.count = 0;
                        chatDeactivate(current);
                        evictReleasedChats(sessionId);
                    }
                },
            };
        },
        chatArchive(sessionId) {
            const binding = chats.get(sessionId);
            if (!binding) return;
            binding.archived = true;
            binding.restoring = false;
            chatDeactivate(binding);
        },
        chatRestore(sessionId) {
            const binding = chats.get(sessionId);
            if (!binding) return;
            binding.archived = false;
            binding.restoring = true;
            chatActivate(binding);
        },
        terminalOpen(sessionId) {
            if (disposed) throw new Error("The Happy Agent client is disposed.");
            return happyAgentTerminalOpen(
                {
                    client: deps.client,
                    hostServices: deps.hostServices,
                    colorScheme: deps.terminalColorScheme(),
                    ...(deps.terminalDriverCreate
                        ? { driverCreate: deps.terminalDriverCreate }
                        : {}),
                },
                sessionId,
            );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            models[Symbol.dispose]();
            sessionListStore?.[Symbol.dispose]();
            sessionListStore = undefined;
            inboxStore?.[Symbol.dispose]();
            inboxStore = undefined;
            providerUsageStore?.[Symbol.dispose]();
            providerUsageStore = undefined;
            happyIntegrationStore?.[Symbol.dispose]();
            cloudStore?.[Symbol.dispose]();
            cloudDevicesStore?.[Symbol.dispose]();
            socialStore?.[Symbol.dispose]();
            teamsStore?.[Symbol.dispose]();
            socialJoinStore?.[Symbol.dispose]();
            happyIntegrationStore = undefined;
            cloudStore = undefined;
            cloudDevicesStore = undefined;
            socialStore = undefined;
            teamsStore = undefined;
            socialJoinStore = undefined;
            profileStore?.[Symbol.dispose]();
            profileStore = undefined;
            providersStore?.[Symbol.dispose]();
            providersStore = undefined;
            instructionsStore?.[Symbol.dispose]();
            instructionsStore = undefined;
            securityPolicyStore?.[Symbol.dispose]();
            securityPolicyStore = undefined;
            secretsStore?.[Symbol.dispose]();
            secretsStore = undefined;
            deps.catalogSource[Symbol.dispose]();
            for (const binding of chats.values()) {
                chatDeactivate(binding);
                binding.store?.[Symbol.dispose]();
            }
            chats.clear();
        },
    };
}
