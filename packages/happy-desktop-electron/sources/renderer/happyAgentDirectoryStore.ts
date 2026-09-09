import {
    HappyAgentClient,
    happyAgentConnectionsStoreCreate,
    type HappyAgentConnectionsStore,
} from "happy-desktop-state";
import type {
    HappyAgentBot,
    HappyAgentConnectionSnapshot,
    HappyAgentHost,
    HappyAgentModelPreferencePersistence,
    HappyAgentCloudHost,
    HappyAgentProjectAddSnapshot,
    HappyAgentProjectGroup,
    HappyAgentSessionLocation,
    TerminalColorScheme,
} from "happy-desktop-state";
import type { HappyDesktopBridge } from "../shared/desktopContract";
import {
    happyAgentConnectionOpen,
    type HappyAgentConnectionHandle,
    type HappyAgentProtocolMismatch,
    type HappyAgentSession,
} from "./happyAgentConnection";
import type { DesktopRuntimeStore } from "./runtimeStore";

export const LOCAL_HAPPY_AGENT_ID = "local";
const PROJECT_ADD_IDLE: HappyAgentProjectAddSnapshot = { pending: false };

export interface HappyAgentDirectoryEntry {
    readonly id: string;
    readonly remoteId?: string;
    readonly label: string;
    readonly status: "connecting" | "connected" | "disconnected" | "error";
    readonly protocolMismatch?: HappyAgentProtocolMismatch;
    readonly message?: string;
    readonly version?: string;
    readonly projects: readonly HappyAgentProjectGroup[];
    /** This Happy Agent's bots, shown under their own heading above its projects. */
    readonly bots: readonly HappyAgentBot[];
    readonly projectsStatus: "loading" | "ready" | "error";
    readonly projectAdd: HappyAgentProjectAddSnapshot;
    readonly session?: HappyAgentSession;
}

export interface HappyAgentDirectorySnapshot {
    readonly activeHappyAgentId?: string;
    readonly happyAgents: readonly HappyAgentDirectoryEntry[];
    readonly error?: string;
}

export interface HappyAgentDirectoryStore {
    get(): HappyAgentDirectorySnapshot;
    subscribe(listener: () => void): () => void;
    happyAgentActivate(id: string): void;
}

export interface HappyAgentDirectoryDeps {
    readonly cloudHostFor: (id: string) => HappyAgentCloudHost;
    readonly conversationOpen: (happyAgentId: string, location: HappyAgentSessionLocation) => void;
    readonly groupOpen: (happyAgentId: string, groupId: string) => void;
    /**
     * Takes a group that stopped existing out of the window's navigation. Both
     * identities travel: the window addresses one Happy Agent at a time, and a
     * background one reporting a removal must not move the reader.
     */
    readonly groupForget: (happyAgentId: string, groupId: string) => void;
    /** Desktop-wide model memory for this window's Happy Agent connection. */
    readonly modelPreferencePersistence: (id: string) => HappyAgentModelPreferencePersistence;
    /**
     * Whether the local daemon is mid-restart. Remote connections are proxied
     * through it, and a restarting daemon comes back reporting an empty
     * connection registry for a beat before it repopulates. That empty read is
     * not a real removal, so while it is true the last-known remotes are kept
     * mounted — they show their own disconnected state — rather than being pruned
     * and taking the connection rail and every remote workspace down with them.
     * Absent on a host with no managed daemon, which never restarts one.
     */
    readonly localRestarting?: () => boolean;
    /**
     * The window's current appearance, read whenever a terminal is opened. A
     * terminal runs in the appearance it was started in for the rest of its life,
     * so this is read once per shell rather than followed.
     */
    readonly terminalColorScheme: () => TerminalColorScheme;
}

interface LocalHappyAgent {
    connection?: HappyAgentConnectionHandle;
    connectionUnsubscribe?: () => void;
    workspaceUnsubscribe?: () => void;
    protocolMismatch?: HappyAgentProtocolMismatch;
    url?: string;
    entry: HappyAgentDirectoryEntry;
}

function projectsRead(
    session: HappyAgentSession,
): Pick<HappyAgentDirectoryEntry, "bots" | "projects" | "projectsStatus" | "projectAdd"> {
    const workspace = session.workspace.get();
    const projects = workspace.list.projects;
    return {
        bots: workspace.list.bots,
        projects: projects.type === "ready" ? projects.value : [],
        projectsStatus:
            projects.type === "ready" ? "ready" : projects.type === "error" ? "error" : "loading",
        projectAdd: workspace.projectAdd,
    };
}

function projectsMatch(
    entry: HappyAgentDirectoryEntry,
    next: Pick<HappyAgentDirectoryEntry, "bots" | "projects" | "projectsStatus" | "projectAdd">,
): boolean {
    return (
        entry.bots === next.bots &&
        entry.projects === next.projects &&
        entry.projectsStatus === next.projectsStatus &&
        entry.projectAdd === next.projectAdd
    );
}

function connectionRead(
    happyAgent: LocalHappyAgent,
    connection: HappyAgentConnectionSnapshot,
): Pick<HappyAgentDirectoryEntry, "message" | "status" | "version"> {
    if (connection.connection === "connecting")
        return {
            status: "connecting",
            message: "Connecting to this Happy Agent.",
            version: connection.version ?? happyAgent.entry.version,
        };
    if (connection.connection === "disconnected")
        return {
            status: "disconnected",
            message: connection.message ?? "This Happy Agent is disconnected.",
            version: connection.version ?? happyAgent.entry.version,
        };
    if (connection.daemon === "starting")
        return {
            status: "connecting",
            message: "This Happy Agent is starting.",
            version: connection.version ?? happyAgent.entry.version,
        };
    if (connection.daemon === "error")
        return {
            status: "error",
            message: connection.message ?? "This Happy Agent reported an error.",
            version: connection.version ?? happyAgent.entry.version,
        };
    return {
        status: connection.daemon === "ready" ? "connected" : "connecting",
        message:
            connection.daemon === "ready"
                ? happyAgent.protocolMismatch?.message
                : "Waiting for this Happy Agent to become ready.",
        version: connection.version ?? happyAgent.entry.version,
    };
}

/**
 * Composes one ordinary connection per host-published entry. The state package
 * owns membership and selection; this adapter supplies desktop capabilities.
 */
export function happyAgentDirectoryStoreCreate(
    bridge: HappyDesktopBridge,
    runtime: DesktopRuntimeStore,
    deps: HappyAgentDirectoryDeps,
): HappyAgentDirectoryStore {
    const listeners = new Set<() => void>();
    const happyAgent: LocalHappyAgent = {
        entry: {
            id: LOCAL_HAPPY_AGENT_ID,
            label: "This Mac",
            bots: [],
            projects: [],
            projectsStatus: "loading",
            projectAdd: PROJECT_ADD_IDLE,
            status: "connecting",
        },
    };
    let snapshot: HappyAgentDirectorySnapshot = { happyAgents: [] };
    let runtimeUnsubscribe: (() => void) | undefined;
    let browserOpenUnsubscribe: (() => void) | undefined;
    const remotes = new Map<string, LocalHappyAgent>();
    let roster: HappyAgentConnectionsStore | undefined;
    let rosterUnsubscribe: (() => void) | undefined;

    const host: HappyAgentHost = {
        applicationMenuOpen: () => void bridge.applicationMenuOpen().catch(() => undefined),
        directoryPick: () => bridge.directoryPick(),
    };

    const publish = (): void => {
        snapshot = {
            activeHappyAgentId: roster?.get().selectedId ?? LOCAL_HAPPY_AGENT_ID,
            happyAgents: [happyAgent.entry, ...[...remotes.values()].map((remote) => remote.entry)],
            ...(roster?.get().error ? { error: roster.get().error } : {}),
        };
        for (const listener of listeners) listener();
    };

    const connectionClose = (happyAgent: LocalHappyAgent): void => {
        happyAgent.connectionUnsubscribe?.();
        happyAgent.connectionUnsubscribe = undefined;
        happyAgent.workspaceUnsubscribe?.();
        happyAgent.workspaceUnsubscribe = undefined;
        happyAgent.connection?.dispose();
        happyAgent.connection = undefined;
        happyAgent.url = undefined;
        happyAgent.entry = {
            ...happyAgent.entry,
            bots: [],
            projects: [],
            projectsStatus: "loading",
            projectAdd: PROJECT_ADD_IDLE,
            session: undefined,
        };
    };

    const connectionOpen = (
        happyAgent: LocalHappyAgent,
        client: HappyAgentClient,
        hostServicesUrl: string,
    ): void => {
        const happyAgentHttpUrl = client.endpoint.replace(/\/$/u, "");
        connectionClose(happyAgent);
        happyAgent.url = happyAgentHttpUrl;
        happyAgent.connection = happyAgentConnectionOpen({
            cloudHost: deps.cloudHostFor(happyAgent.entry.id),
            host: happyAgent.entry.remoteId
                ? {
                      projectSource: "repository",
                      applicationMenuOpen: host.applicationMenuOpen,
                      directoryPick: async () => undefined,
                  }
                : host,
            happyAgentId: happyAgent.entry.id,
            client,
            hostServicesUrl,
            happyAgentHttpUrl,
            modelPreferencePersistence: deps.modelPreferencePersistence(happyAgent.entry.id),
            terminalColorScheme: deps.terminalColorScheme,
            deps: {
                conversationOpen: (location) =>
                    deps.conversationOpen(happyAgent.entry.id, location),
                groupOpen: (groupId) => deps.groupOpen(happyAgent.entry.id, groupId),
                groupForget: (groupId) => deps.groupForget(happyAgent.entry.id, groupId),
                compatibility: (mismatch) => {
                    if (happyAgent.protocolMismatch?.message === mismatch?.message) return;
                    happyAgent.protocolMismatch = mismatch;
                    const {
                        protocolMismatch: _protocolMismatch,
                        message: _message,
                        ...entry
                    } = happyAgent.entry;
                    happyAgent.entry = mismatch
                        ? {
                              ...entry,
                              protocolMismatch: mismatch,
                              message: mismatch.message,
                          }
                        : entry;
                    publish();
                },
                unavailable: (error) => {
                    if (happyAgent.connection?.get() || happyAgent.entry.session) return;
                    const message = error instanceof Error ? error.message : String(error);
                    if (happyAgent.entry.status === "error" && happyAgent.entry.message === message)
                        return;
                    happyAgent.entry = { ...happyAgent.entry, status: "error", message };
                    publish();
                },
                changed: () => {
                    const session = happyAgent.connection?.get();
                    // A daemon that has not finished starting is a machine on
                    // its way up, so it holds the connecting state it was
                    // already in rather than becoming a failure the window has
                    // to report and the reader has to dismiss.
                    if (happyAgent.connection?.starting() === true) {
                        happyAgent.entry = {
                            ...happyAgent.entry,
                            status: "connecting",
                            message: "Happy Agent is starting.",
                            projectsStatus: "loading",
                        };
                        publish();
                        return;
                    }
                    const failure = happyAgent.connection?.failure();
                    if (failure) {
                        happyAgent.entry = {
                            ...happyAgent.entry,
                            status: "error",
                            message: failure,
                            projectsStatus: "error",
                        };
                        publish();
                        return;
                    }
                    if (!session) return;
                    const sessionChanged = happyAgent.entry.session !== session;
                    if (sessionChanged) {
                        happyAgent.connectionUnsubscribe?.();
                        happyAgent.workspaceUnsubscribe?.();
                        happyAgent.workspaceUnsubscribe = session.workspace.subscribe(() => {
                            if (happyAgent.entry.session !== session) return;
                            // The workspace also announces every open-transcript
                            // delta. None of that belongs to this directory
                            // projection; republishing it would synchronously
                            // render the entire app shell once per token.
                            const projects = projectsRead(session);
                            if (projectsMatch(happyAgent.entry, projects)) return;
                            happyAgent.entry = { ...happyAgent.entry, ...projects };
                            publish();
                        });
                        happyAgent.connectionUnsubscribe = session.connection.subscribe(() => {
                            if (happyAgent.entry.session !== session) return;
                            happyAgent.entry = {
                                ...happyAgent.entry,
                                ...connectionRead(happyAgent, session.connection.get()),
                            };
                            publish();
                        });
                    }
                    happyAgent.entry = {
                        ...happyAgent.entry,
                        ...projectsRead(session),
                        ...connectionRead(happyAgent, session.connection.get()),
                        session,
                    };
                    publish();
                },
            },
        });
    };

    const localReconcile = (): void => {
        const value = runtime.get();
        const target =
            value && value.phase === "ready" && value.activeTarget.mode === "local"
                ? value.activeTarget
                : undefined;
        if (!target) {
            const unavailable =
                value?.phase === "starting"
                    ? { status: "connecting" as const, message: value.message }
                    : value?.phase === "error"
                      ? { status: "error" as const, message: value.message }
                      : {
                            status: happyAgent.entry.session
                                ? ("disconnected" as const)
                                : ("connecting" as const),
                            message: happyAgent.entry.session
                                ? "The local Happy Agent is disconnected."
                                : "Connecting to the local Happy Agent.",
                        };
            happyAgent.entry = { ...happyAgent.entry, ...unavailable };
            publish();
            return;
        }
        const starting = happyAgent.connection?.starting() === true;
        const failure = starting ? undefined : happyAgent.connection?.failure();
        happyAgent.entry = {
            ...happyAgent.entry,
            ...(failure
                ? { status: "error" as const, message: failure }
                : starting
                  ? { status: "connecting" as const, message: "Happy Agent is starting." }
                  : happyAgent.entry.session
                    ? connectionRead(happyAgent, happyAgent.entry.session.connection.get())
                    : {
                          status: "connecting" as const,
                          message: "Connecting to this Happy Agent.",
                      }),
            version: target.happyAgentVersion,
        };
        const base = target.happyAgentHttpUrl.replace(/\/$/u, "");
        if (happyAgent.url !== base) {
            rosterUnsubscribe?.();
            roster?.[Symbol.dispose]();
            const client = new HappyAgentClient({
                endpoint: base,
                token: "happy-local-capability",
            });
            connectionOpen(happyAgent, client, base);
            roster = happyAgentConnectionsStoreCreate(client, happyAgent.connection!.sync);
            rosterUnsubscribe = roster.subscribe(() => {
                const membership = roster!.get();
                // A local restart takes the daemon down and brings it back with an
                // empty registry for a beat. Pruning against that would collapse
                // the rail and unmount every remote workspace, so known remotes
                // are held through it and reconciled once the daemon reports its
                // real membership again.
                const localRestarting = deps.localRestarting?.() === true;
                for (const [id, remote] of remotes) {
                    if (membership.items.some((item) => item.id === id)) continue;
                    if (localRestarting) continue;
                    connectionClose(remote);
                    remotes.delete(id);
                }
                for (const item of membership.items) {
                    if (!item.remoteId) continue;
                    let remote = remotes.get(item.id);
                    if (!remote) {
                        remote = {
                            entry: {
                                id: item.id,
                                remoteId: item.remoteId,
                                label: item.name,
                                bots: [],
                                projects: [],
                                projectsStatus: "loading",
                                projectAdd: PROJECT_ADD_IDLE,
                                status: "connecting",
                            },
                        };
                        remotes.set(item.id, remote);
                        connectionOpen(
                            remote,
                            client.connection(item.remoteId),
                            `${base}/connections/${item.remoteId}`,
                        );
                    } else if (remote.entry.label !== item.name)
                        remote.entry = { ...remote.entry, label: item.name };
                }
                publish();
            });
        }
        publish();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                runtimeUnsubscribe = runtime.subscribe(localReconcile);
                browserOpenUnsubscribe = bridge.browserOpenSubscribe((url) => {
                    snapshot.happyAgents
                        .find((entry) => entry.id === snapshot.activeHappyAgentId)
                        ?.session?.workspace.panel.browserAdd(url);
                });
                localReconcile();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                runtimeUnsubscribe?.();
                runtimeUnsubscribe = undefined;
                browserOpenUnsubscribe?.();
                browserOpenUnsubscribe = undefined;
                rosterUnsubscribe?.();
                rosterUnsubscribe = undefined;
                roster?.[Symbol.dispose]();
                roster = undefined;
                for (const remote of remotes.values()) connectionClose(remote);
                remotes.clear();
                connectionClose(happyAgent);
                snapshot = { happyAgents: [] };
            };
        },
        happyAgentActivate(id) {
            roster?.connectionSelect(id);
        },
    };
}
