import {
    type BotGroup,
    type GitChangeSnapshot,
    type GroupSession,
    type ProjectGroup,
    type HappyAgentConnection,
    type HappyAgentGitChangedFile,
    type HappyAgentPermissionMode,
    type HappyAgentBot,
    type HappyAgentBotId,
    type HappyAgentConversationSummaryInput,
    happyAgentConversationSummaryProject,
    type HappyAgentProject,
    type HappyAgentProjectAvatar,
    type HappyAgentProjectCatalog,
    type HappyAgentProjectId,
    type HappyAgentServiceTier,
    type HappyAgentSessionCatalogSnapshot,
    type HappyAgentSessionCatalogSource,
    type HappyAgentSessionId,
    type HappyAgentSessionStatus,
    type HappyAgentSessionSummary,
    type HappyAgentThinkingLevel,
    type HappyAgentWorktree,
    type HappyAgentWorktreeId,
} from "happy-desktop-state";

/**
 * Projects the Happy Agent connection's live group tree into Happy's closed
 * catalog source. The connection owns bootstrap, gap recovery, and reconnects;
 * this adapter only holds the newest complete projection for synchronous reads.
 */
export function happyAgentCatalogSourceCreate(
    happyAgent: HappyAgentConnection,
    baseUrl: string,
): HappyAgentSessionCatalogSource {
    const base = baseUrl.replace(/\/$/, "");
    let snapshot: HappyAgentSessionCatalogSnapshot | undefined;
    let connection: ReturnType<HappyAgentConnection["connectGroups"]> | undefined;
    let disposed = false;
    const listeners = new Set<() => void>();
    const errorListeners = new Set<(error: unknown) => void>();
    const waiting = new Set<{
        resolve: (value: HappyAgentSessionCatalogSnapshot) => void;
        reject: (error: unknown) => void;
    }>();

    const publish = (projects: readonly ProjectGroup[], bots: readonly BotGroup[]): void => {
        if (disposed) return;
        snapshot = catalogProject(projects, bots, base);
        for (const waiter of waiting) waiter.resolve(snapshot);
        waiting.clear();
        for (const listener of listeners) listener();
    };

    const fail = (error: unknown): void => {
        if (disposed) return;
        for (const waiter of waiting) waiter.reject(error);
        waiting.clear();
        for (const listener of errorListeners) listener(error);
    };

    const start = (): void => {
        if (disposed || connection) return;
        connection = happyAgent.connectGroups({
            onChange: (projects, state, bots) => {
                if (!state.sessionsComplete) return;
                publish(projects, bots);
            },
            onError: fail,
        });
    };

    return {
        read() {
            if (disposed)
                return Promise.reject(new Error("The Happy Agent catalog source is disposed."));
            if (snapshot) return Promise.resolve(snapshot);
            start();
            return new Promise<HappyAgentSessionCatalogSnapshot>((resolve, reject) => {
                waiting.add({ resolve, reject });
            });
        },
        subscribe(listener, onError) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            errorListeners.add(onError);
            start();
            return () => {
                listeners.delete(listener);
                errorListeners.delete(onError);
            };
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            connection?.close();
            connection = undefined;
            const error = new Error("The Happy Agent catalog source was disposed.");
            for (const waiter of waiting) waiter.reject(error);
            waiting.clear();
            listeners.clear();
            errorListeners.clear();
        },
    };
}

function catalogProject(
    groups: readonly ProjectGroup[],
    botGroups: readonly BotGroup[],
    baseUrl: string,
): HappyAgentSessionCatalogSnapshot {
    const projects: HappyAgentProject[] = [];
    const worktrees: HappyAgentWorktree[] = [];
    const sessions: HappyAgentSessionSummary[] = [];
    const archivedSessions: HappyAgentSessionSummary[] = [];

    for (const group of groups) {
        const projectId = group.id as HappyAgentProjectId;
        projects.push(projectProject(group, baseUrl));
        sessions.push(
            ...group.sessions
                .filter((session) => !session.archived)
                .map((session) => sessionProject(session, projectId)),
        );
        archivedSessions.push(
            ...group.sessions
                .filter((session) => session.archived)
                .map((session) => sessionProject(session, projectId)),
        );
        for (const workspace of group.workspaces) {
            worktrees.push({
                id: workspace.id as HappyAgentWorktreeId,
                projectId: group.id as HappyAgentProjectId,
                name: workspace.name,
                orderKey: workspace.orderKey,
                path: workspace.path,
                displayPath: workspace.path,
                status: workspace.status,
                presence: workspace.presence,
                // The host's own sentence about a failed checkout, carried
                // whole. It is present only while the workspace it belongs to
                // reports one, so a workspace that stops failing stops carrying
                // a reason rather than keeping the last one it had.
                ...(workspace.error === undefined ? {} : { error: workspace.error }),
                ...gitProject(workspace.git),
            });
            sessions.push(
                ...workspace.sessions
                    .filter((session) => !session.archived)
                    .map((session) => sessionProject(session, projectId)),
            );
            archivedSessions.push(
                ...workspace.sessions
                    .filter((session) => session.archived)
                    .map((session) => sessionProject(session, projectId)),
            );
        }
    }

    archivedSessions.sort((left, right) => (right.archivedAt ?? 0) - (left.archivedAt ?? 0));
    // A bot's conversation is stated on the bot and deliberately kept out of the
    // flat session list: that list is grouped under projects, and a bot is not
    // one. The chat itself is opened by id, which needs no catalog entry.
    const bots: HappyAgentBot[] = botGroups.map((bot) => ({
        id: bot.id as HappyAgentBotId,
        workspaceId: bot.workspaceId as HappyAgentWorktreeId,
        conversation: happyAgentConversationSummaryProject(conversationProject(bot.session)),
        name: bot.name,
        username: bot.username,
        ...(bot.systemKey === undefined ? {} : { systemKey: bot.systemKey }),
        orderKey: bot.orderKey,
        path: bot.path,
        displayPath: bot.path,
        ...(bot.avatar === undefined ? {} : { avatar: bot.avatar }),
    }));
    const catalog: HappyAgentProjectCatalog = { bots, projects, worktrees };
    return { archivedSessions, catalog, sessions };
}

function projectProject(group: ProjectGroup, baseUrl: string): HappyAgentProject {
    const avatar = avatarProject(group.avatar, baseUrl);
    return {
        id: group.id as HappyAgentProjectId,
        name: group.name,
        orderKey: group.orderKey,
        path: group.path,
        displayPath: group.path,
        kind: group.kind,
        status: group.initializationStatus,
        presence: group.presence,
        ...(group.initializationError === undefined ? {} : { error: group.initializationError }),
        ...(group.remoteSource === undefined ? {} : { remoteSource: group.remoteSource }),
        ...(group.requiredSecretKind === undefined
            ? {}
            : { requiredSecretKind: group.requiredSecretKind }),
        ...(avatar ? { avatar } : {}),
        ...gitProject(group.git),
    };
}

function avatarProject(
    value: object | undefined,
    baseUrl: string,
): HappyAgentProjectAvatar | undefined {
    if (value === undefined) return undefined;
    const avatar = value as {
        readonly url?: unknown;
        readonly width?: unknown;
        readonly height?: unknown;
    };
    if (
        typeof avatar.url !== "string" ||
        typeof avatar.width !== "number" ||
        typeof avatar.height !== "number"
    ) {
        return undefined;
    }
    return {
        url: avatar.url.startsWith("/") ? `${baseUrl}${avatar.url}` : avatar.url,
        width: avatar.width,
        height: avatar.height,
    };
}

function gitProject(
    git: GitChangeSnapshot | undefined,
): Pick<HappyAgentProject, "changedFiles" | "addedLines" | "deletedLines" | "changes"> {
    if (git === undefined) return {};
    return {
        changedFiles: git.changedFiles,
        addedLines: git.insertions,
        deletedLines: git.deletions,
        changes: git.files.map((file) => ({
            path: file.path,
            ...(file.previousPath ? { previousPath: file.previousPath } : {}),
            ...(git.baseRevision === undefined ? {} : { baseRevision: git.baseRevision }),
            // A binary file has no lines to count, and saying "+0 −0" about one
            // reads as an empty change rather than as an unmeasurable one.
            ...(file.binary || file.insertions === undefined
                ? {}
                : { addedLines: file.insertions }),
            ...(file.binary || file.deletions === undefined
                ? {}
                : { deletedLines: file.deletions }),
            status: gitStatusProject(file.status),
            revision: [
                git.revision ?? `${git.generation}:${String(git.version)}`,
                git.baseRevision ?? "",
                file.path,
                file.status,
                file.staged ? "staged" : "",
                file.unstaged ? "unstaged" : "",
            ].join(":"),
        })),
    };
}

function gitStatusProject(status: string): HappyAgentGitChangedFile["status"] {
    if (status === "added") return "added";
    if (status === "deleted") return "deleted";
    if (status === "renamed" || status === "copied") return "renamed";
    if (status === "untracked") return "untracked";
    return "modified";
}

function sessionProject(
    session: GroupSession,
    /**
     * The project whose list this session is being put into. It is supplied by
     * the caller rather than read off the session's own scope because only a
     * project's sessions are gathered here — a bot's one conversation is stated
     * on the bot itself and never joins this flat list.
     */
    projectId: HappyAgentProjectId,
): HappyAgentSessionSummary {
    return {
        ...conversationProject(session),
        projectId,
        ...(session.scope.kind === "workspace"
            ? { worktreeId: session.scope.workspaceId as HappyAgentWorktreeId }
            : {}),
    };
}

/**
 * One session as everything about it except where it is listed.
 *
 * A bot's conversation is exactly this and nothing more: it belongs to the bot
 * rather than to a project, so the placement a session summary carries is the
 * one part of the shape it cannot supply. Splitting it out is what lets a bot's
 * chat be projected by the same code that projects every other one, instead of
 * a second reading of the same fields that could drift from it.
 */
function conversationProject(session: GroupSession): HappyAgentConversationSummaryInput {
    const effort = thinkingLevel(session.effort);
    const serviceTier =
        session.serviceTier === "fast" ? ("fast" as HappyAgentServiceTier) : undefined;
    return {
        id: session.id as HappyAgentSessionId,
        ...(session.archivedAt === undefined ? {} : { archivedAt: session.archivedAt }),
        ...(session.orderKey === undefined ? {} : { orderKey: session.orderKey }),
        ...(session.parentSessionId === undefined
            ? {}
            : { parentSessionId: session.parentSessionId as HappyAgentSessionId }),
        cwd: session.cwd,
        displayCwd: session.cwd,
        providerId: session.providerId,
        modelId: session.modelId,
        permissionMode: permissionMode(session.permissionMode),
        ...(effort ? { effort } : {}),
        ...(serviceTier ? { serviceTier } : {}),
        status: session.status as HappyAgentSessionStatus,
        activeSubagentCount: session.activeSubagents,
        ...(session.wait === undefined
            ? {}
            : { wait: { startedAt: session.wait.startedAt, dueAt: session.wait.dueAt } }),
        ...(session.unread === undefined ? {} : { unreadReason: session.unread.reason }),
        ...(session.title === undefined ? {} : { title: session.title }),
        ...(session.recap === undefined ? {} : { recap: session.recap }),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        ...(session.lastMessageAt === undefined ? {} : { lastMessageAt: session.lastMessageAt }),
        ...(session.draft === undefined ? {} : { draft: session.draft }),
        ...(session.draftUpdatedAt === undefined ? {} : { draftUpdatedAt: session.draftUpdatedAt }),
    };
}

export function permissionMode(value: string): HappyAgentPermissionMode {
    if (
        value === "auto" ||
        value === "workspace_write" ||
        value === "read_only" ||
        value === "full_access"
    ) {
        return value;
    }
    return "auto";
}

export function thinkingLevel(value: string | undefined): HappyAgentThinkingLevel | undefined {
    if (
        value === "off" ||
        value === "on" ||
        value === "minimal" ||
        value === "low" ||
        value === "medium" ||
        value === "high" ||
        value === "xhigh" ||
        value === "max" ||
        value === "ultra"
    ) {
        return value;
    }
    return undefined;
}
