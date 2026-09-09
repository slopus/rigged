import type {
    Agent,
    Bot,
    HappyAgentClient,
    HappyAgentEvent,
    MessageBlock,
    MessageMode,
    MutationId,
    Project,
    SlashCommand,
} from "@slopus/happy-agent-client";
import type { HappyAgentDebugLogInput } from "../happyAgent/happyAgentDebugLogStore.js";
import type { HappyAgentServiceTier } from "../happyAgentServiceTier.js";
import type { HappyAgentSync } from "./happyAgentSync.js";

export type { MutationId };

export type ConnectionState = "connecting" | "live" | "reconnecting" | "closed";

interface HappyAgentProfile {
    id: string;
    name: string;
    photo?: { data: string; mediaType: string };
    version?: number;
}

export type ToolPresentation =
    | {
          kind: "compaction";
          trigger: "manual" | "automatic";
          tokensBefore?: number;
          tokensAfter?: number;
          failureReason?: string;
      }
    | {
          kind: "command";
          command: string;
          output?: string;
          terminalId?: number;
      }
    | {
          kind: "exploration";
          steps: readonly (
              | { kind: "list"; target: string }
              | { kind: "read"; name: string }
              | { kind: "search"; command: string; query?: string; path?: string }
          )[];
      }
    | {
          kind: "file_edit";
          files: readonly {
              path: string;
              kind: "add" | "delete" | "update";
              language?: string;
              added: number;
              deleted: number;
              omittedLines?: number;
              hunks: readonly {
                  oldStart: number;
                  newStart: number;
                  lines: readonly { kind: "context" | "add" | "delete"; text: string }[];
              }[];
          }[];
          omittedFiles?: number;
      }
    | {
          kind: "terminal_input";
          terminalId: number;
          command: string;
          input: string;
      }
    | {
          kind: "search";
          target: "web" | "x";
          query: string;
          sources?: readonly { url: string; title: string }[];
      };

interface BaseChatElement {
    id: string;
    groupId: string;
    runId: string;
    createdAt: number;
}

export interface UserMessageElement extends BaseChatElement {
    kind: "user_message";
    messageId: string;
    identity: string | null;
    profile?: HappyAgentProfile;
    delivery: "pending_steering" | "sent";
    text: string;
    attachments?: readonly { data: string; mediaType: string }[];
    source?: "notification";
    /**
     * The agent that put this message in the user slot, when one did, and where
     * it stands relative to the agent whose transcript this is. Happy Agent
     * stamps the sender on every message it generates on an agent's behalf, so
     * the relation is settled here — once, against this session's own parent —
     * rather than left to every surface to work out from two identities.
     */
    senderAgent?: {
        readonly agentId: string;
        /** This agent driving itself, the agent that manages it, or any other. */
        readonly relation: "self" | "parent" | "other";
    };
}

/**
 * A message another agent addressed to this one.
 *
 * Happy Agent delivers it in the agent role, because the words come from an
 * agent rather than from a person — but it is inbound work for this agent, not
 * this agent's own output, and rendering it as such attributed a collaborator's
 * report to the agent that received it. It is separated here, once, on the
 * sender Happy Agent stamps on the message.
 */
export interface InboundAgentMessageElement extends BaseChatElement {
    kind: "inbound_agent_message";
    messageId: string;
    /** The agent that sent it, as Happy Agent identified it. */
    agentId: string;
    /** The agent that manages this one, or any other agent talking to it. */
    relation: "parent" | "other";
    /** The message as it arrived, addressing envelope included. */
    text: string;
}

export interface SystemNoticeElement extends BaseChatElement {
    kind: "system_notice";
    text: string;
    structured?: {
        kind: "compute_preparation";
        state: "unprovisioned" | "provisioning" | "ready" | "unavailable" | "failed" | "stopped";
        phase: string;
        provider: string;
        computeInstanceId: string;
        message: string;
        percent?: number;
        elapsedMs?: number;
    };
}

export interface InferenceElement extends BaseChatElement {
    kind: "inference";
    state: "waiting";
}

export interface AgentTextElement extends BaseChatElement {
    kind: "agent_text";
    text: string;
    complete: boolean;
}

export interface AgentAttachmentsElement extends BaseChatElement {
    kind: "agent_attachments";
    messageId: string;
    attachments: readonly AgentAttachment[];
}

export type AgentAttachment =
    | {
          bytes: number;
          downloadUrl?: string;
          height: number;
          id: string;
          kind: "image";
          mediaType: string;
          name: string;
          source: string;
          thumbhash: string;
          width: number;
      }
    | {
          bytes: number;
          downloadUrl?: string;
          duration: number;
          height: number;
          id: string;
          kind: "video";
          mediaType?: string;
          name: string;
          preview: {
              downloadUrl?: string;
              height: number;
              mediaType: "image/png";
              path: string;
              thumbhash: string;
              width: number;
          };
          source: string;
          width: number;
      }
    | {
          bytes: number;
          downloadUrl?: string;
          duration: number;
          id: string;
          kind: "audio";
          mediaType?: string;
          name: string;
          source: string;
      }
    | {
          bytes: number;
          downloadUrl?: string;
          id: string;
          kind: "file";
          mediaType?: string;
          name: string;
          source: string;
      }
    | {
          description?: string;
          id: string;
          image?: string;
          kind: "url";
          siteName?: string;
          source: string;
          title: string;
      }
    | {
          applet: string;
          description: string;
          id: string;
          image: string;
          kind: "applet";
          name: string;
          path?: string;
          query?: Record<string, string>;
          thumbhash: string;
      };

export interface ThinkingElement extends BaseChatElement {
    kind: "thinking";
    text: string;
    complete: boolean;
}

export type ToolCallStatus = "pending" | "running" | "succeeded" | "failed" | "interrupted";

export interface ToolCallElement extends BaseChatElement {
    kind: "tool_call";
    toolCallId: string;
    name: string;
    arguments: unknown;
    argumentsComplete: boolean;
    status: ToolCallStatus;
    progress?: string;
    result?: string;
    presentation?: ToolPresentation;
    /**
     * The call crossed the automatic permission-review boundary and its
     * execution was granted temporary Full access. Absent on a call that was
     * never reviewed and on a reviewed call that stayed inside the sandbox.
     */
    elevated?: boolean;
    permissionReview?:
        | {
              action: string;
              status: "reviewing";
          }
        | {
              action: string;
              status: "completed";
              reason: string;
              decision: "allow" | "ask" | "deny";
              risk: "low" | "medium" | "high" | "critical";
              userAuthorization: "unknown" | "low" | "medium" | "high";
          };
}

export interface CompactionElement extends BaseChatElement {
    kind: "compaction";
    compactionId: string;
    status: "running" | "completed" | "cancelled" | "failed";
    estimatedTokensBefore: number;
    estimatedTokensAfter?: number;
}

export interface FailureElement extends BaseChatElement {
    kind: "failure";
    outcome: "retried" | "continued" | "failed";
    attempt?: number;
    reason: string;
}

export type GroupEndReason = "completed" | "steering" | "compaction" | "abort" | "error";

export interface GroupEndElement extends BaseChatElement {
    kind: "group_end";
    turnKind?: "compaction";
    outcome: "success" | "error" | "stopped";
    reason: GroupEndReason;
    errorMessage?: string;
    startedAt: number;
    endedAt: number;
    elapsedMs: number;
    turnStartedAt: number;
    turnElapsedMs: number;
    /** Tokens consumed by this run across every provider/model segment, when reported. */
    usedTokens?: number;
    /** Conversation context measured when this run settled, when reported. */
    finalContextTokens?: number;
}

export type ChatElement =
    | UserMessageElement
    | InboundAgentMessageElement
    | SystemNoticeElement
    | InferenceElement
    | AgentTextElement
    | AgentAttachmentsElement
    | ThinkingElement
    | ToolCallElement
    | CompactionElement
    | FailureElement
    | GroupEndElement;

export interface UserInputRequest {
    requestId: string;
    questions: readonly {
        id: string;
        header: string;
        question: string;
        multiSelect: boolean;
        required?: boolean;
        options: readonly { label: string; description: string }[];
    }[];
}

export interface SessionUsage {
    currentProviderId: string;
    groups: readonly {
        modelId: string;
        providerId: string;
        usage: {
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
            totalTokens: number;
            reasoning?: number;
            cost: { total: number };
        };
    }[];
    totalTokens: number;
    totalCost: number;
    context?: {
        modelId?: string;
        providerId: string;
        totalTokens: number;
        contextWindow: number | null;
        approximate: boolean;
    };
    quotas: readonly {
        providerId: string;
        quota: {
            windows: {
                fiveHour?: { status: "available"; usedPercent: number; resetsAt: number };
                weekly?: { status: "available"; usedPercent: number; resetsAt: number };
            };
        };
    }[];
}

export interface SessionState {
    /** The connection's placeholder before the first durable history snapshot arrives. */
    historyLoading?: boolean;
    activity: {
        kind:
            | "idle"
            | "queued"
            | "thinking"
            | "generating_message"
            | "generating_tool_call"
            | "executing_tool_call";
        label: string;
        since: number;
        wait?: { startedAt: number; dueAt: number };
    };
    activeGroup?: { groupId: string; runId: string; startedAt: number };
    activeTurn?: { runId: string; startedAt: number; kind?: "compaction" };
    status: "idle" | "running" | "completed" | "failed" | "suspended";
    archived: boolean;
    sessionId: string;
    ownerInstanceId: string;
    scope:
        | { kind: "project"; projectId: string }
        | { kind: "workspace"; projectId: string; workspaceId: string }
        | { kind: "bot"; botId: string; workspaceId: string }
        | { kind: "unsorted" };
    projectId?: string;
    workspaceId?: string;
    orderKey?: string;
    cwd: string;
    draft?: string;
    draftUpdatedAt?: number;
    modelId: string;
    providerId: string;
    title?: string;
    recap?: string;
    titleStatus: "error" | "generating" | "idle" | "ready";
    effort?: string;
    serviceTier?: HappyAgentServiceTier;
    permissionMode: string;
    modelLocked: boolean;
    modelCatalog: {
        defaultModelId: string;
        defaultProviderId: string;
        models: readonly unknown[];
        providers: readonly unknown[];
    };
    models: readonly unknown[];
    pendingUserInputs: readonly UserInputRequest[];
    pendingSteeringMessages: readonly {
        message: { id: string; blocks: readonly MessageBlock[] };
    }[];
    /** Complete ordered command catalog for this focused agent. */
    slashCommands: readonly SlashCommand[];
    tasks: readonly {
        id: string;
        subject: string;
        description: string;
        status: "pending" | "in_progress" | "completed";
        activeForm?: string;
        owner?: string;
        blockedBy: readonly string[];
        blocks: readonly string[];
    }[];
    goal?: {
        objective: string;
        status: "active" | "blocked" | "complete" | "paused";
        createdAt: number;
        updatedAt: number;
    };
    subagents: readonly {
        id: string;
        parentSessionId: string;
        parentToolCallId?: string;
        description: string;
        taskName?: string;
        modelId: string;
        status:
            | "idle"
            | "queued"
            | "running"
            | "completed"
            | "aborted"
            | "suspended"
            | "error"
            | "archived";
        depth: number;
        createdAt: number;
        updatedAt: number;
        activeSince?: number;
        elapsedMs?: number;
        latestText?: string;
        totalTokens?: number;
    }[];
    backgroundProcesses: readonly {
        sessionId: number;
        command: string;
        cwd: string;
        status: "running";
    }[];
    usage?: SessionUsage;
    connection: ConnectionState;
    transcriptComplete: boolean;
    loadMoreToken?: string;
    loadingMore: boolean;
    loadMoreError?: string;
    lastEventId?: string;
}

export type ChatDelta =
    | { type: "elements_changed"; elements: readonly ChatElement[] }
    | { type: "session_changed"; session: SessionState }
    | { type: "connection_changed"; connection: ConnectionState }
    | MutationRejectedDelta;

export interface GitChangeSnapshot {
    changedFiles: number;
    insertions: number;
    deletions: number;
    files: readonly {
        path: string;
        previousPath?: string;
        status: string;
        staged: boolean;
        unstaged: boolean;
        binary: boolean;
        insertions?: number;
        deletions?: number;
    }[];
    generation: string;
    version: number;
    /** Source-owned working-tree identity, when it is stronger than generation/version. */
    revision?: string;
    /** Comparison revision already held by the live Git watcher. */
    baseRevision?: string;
}

export interface GroupSession {
    /**
     * How many agents this session started are running right now, as the host
     * counts them on the session itself. A session whose own turn has ended
     * while its delegated agents keep working is still doing work, and this is
     * what says so without reading another resource.
     */
    activeSubagents: number;
    archived: boolean;
    /** When the host archived it, for recovery-history order. */
    archivedAt?: number;
    createdAt: number;
    cwd: string;
    draft?: string;
    draftUpdatedAt?: number;
    effort?: string;
    id: string;
    lastMessageAt?: number;
    modelId: string;
    ownerInstanceId: string;
    orderKey?: string;
    /** The session that spawned this one, for a subagent. Absent for a top-level session. */
    parentSessionId?: string;
    permissionMode: string;
    scope:
        | { kind: "project"; projectId: string }
        | { kind: "workspace"; projectId: string; workspaceId: string }
        | { kind: "bot"; botId: string; workspaceId: string };
    providerId: string;
    recap?: string;
    serviceTier?: HappyAgentServiceTier;
    status: SessionState["status"];
    title?: string;
    trackUnread: boolean;
    unread?: { reason: "attention_needed" | "turn_finished"; since: number };
    wait?: { startedAt: number; dueAt: number };
    updatedAt: number;
}

export interface WorkspaceGroup {
    id: string;
    name: string;
    orderKey: string;
    path: string;
    presence: "present" | "missing";
    projectId: string;
    status: "initializing" | "ready" | "failed";
    error?: string;
    git?: GitChangeSnapshot;
    sessions: readonly GroupSession[];
    usage: { totalTokens: number };
    unread: { count: number; attentionCount: number; reason?: string; since?: number };
}

export interface ProjectGroup {
    id: string;
    kind: "regular" | "home";
    name: string;
    branch?: string;
    orderKey: string;
    path: string;
    presence: "present" | "missing";
    initializationError?: string;
    initializationStatus: "initializing" | "ready" | "failed";
    remoteSource?: { kind: "github"; repository: string } | { kind: "git"; url: string };
    requiredSecretKind?: "github";
    avatar?: { height: number; url: string; width: number };
    git?: GitChangeSnapshot;
    usage: { totalTokens: number };
    unread: { count: number; attentionCount: number; reason?: string; since?: number };
    workspaces: readonly WorkspaceGroup[];
    sessions: readonly GroupSession[];
}

/**
 * A bot: a persistent assistant with one dedicated workspace and exactly one
 * agent that never ends.
 *
 * It is a sibling of `ProjectGroup` rather than a kind of one. A project is a
 * place work is started in — it holds many workspaces, gains and loses
 * conversations, and is configured. A bot holds none of that: the daemon
 * creates its workspace and its one agent together, and neither can be added
 * to or taken away. So the group states the one session outright instead of
 * carrying a list that could only ever have one entry.
 */
export interface BotGroup {
    id: string;
    /** The bot's dedicated workspace, which is what its conversation addresses. */
    workspaceId: string;
    name: string;
    /** Immutable local snake_case name, also the bot's folder name. */
    username: string;
    /** Daemon-provided built-in bot identity; null or absent for ordinary bots. */
    systemKey?: string | null;
    orderKey: string;
    path: string;
    /** Present when the bot has a picture; the bytes are fetched separately. */
    avatar?: { url: string; thumbhash: string };
    /** The bot's one permanent conversation. */
    session: GroupSession;
    unread: { count: number; attentionCount: number; reason?: string; since?: number };
}

export interface GroupsState {
    connection: ConnectionState;
    sessionsComplete: boolean;
}

export type GroupDelta =
    | { type: "projects_changed"; projects: readonly ProjectGroup[] }
    | { type: "groups_state_changed"; state: GroupsState }
    | { type: "files_changed"; workspaceId: string; paths: readonly string[] | null }
    | { type: "project_added"; projectId: string }
    | { type: "workspace_added"; projectId: string; workspaceId: string }
    | { type: "bot_added"; botId: string; workspaceId: string }
    | { type: "session_added"; sessionId: string }
    | { type: "session_removed"; sessionId: string }
    | MutationRejectedDelta;

export type MutationAction =
    | "create_project"
    | "archive_project"
    | "archive_bot"
    | "create_workspace"
    | "archive_workspace"
    | "create_session"
    | "send_message"
    | "invoke_slash_command"
    | "stop_background_process"
    | "stop_run"
    | "switch_model"
    | "set_effort"
    | "set_service_tier"
    | "set_permission_mode"
    | "set_draft"
    | "answer_user_input"
    | "compact_session"
    | "set_session_archived"
    | "mark_session_read"
    | "rename_group"
    | "reorder_group"
    | "reorder_bot"
    | "reorder_session";

export interface MutationRejectedDelta {
    action: string;
    message: string;
    mutationId: string;
    type: "mutation_rejected";
}

export interface HappyAgentSessionSubscriptionOptions {
    sessionId: string;
    onChange: (elements: readonly ChatElement[], session: SessionState) => void;
    onDelta?: (delta: ChatDelta) => void;
    onError?: (error: unknown) => void;
    transcriptTurnLimit?: number;
}

export interface HappyAgentSessionConnection {
    elements: () => readonly ChatElement[];
    session: () => SessionState;
    loadMore: (token: string) => void;
    close: () => void;
}

export interface HappyAgentGroupsSubscriptionOptions {
    /**
     * The catalog as it now stands. Bots arrive beside the projects rather than
     * among them: they are a separate top-level list the daemon orders itself,
     * and a subscriber that renders both gets one coherent picture per call.
     */
    onChange: (
        projects: readonly ProjectGroup[],
        state: GroupsState,
        bots: readonly BotGroup[],
    ) => void;
    onDelta?: (delta: GroupDelta) => void;
    onError?: (error: unknown) => void;
}

export interface HappyAgentGroupsConnection {
    projects: () => readonly ProjectGroup[];
    bots: () => readonly BotGroup[];
    state: () => GroupsState;
    close: () => void;
}

export interface SendMessageInput {
    content?: readonly (
        | { type: "text"; text: string }
        | { type: "image"; mediaType: string; data: string }
    )[];
    text: string;
}

export interface DraftUpdate {
    draft: string | null;
    updatedAt?: number;
    origin?: string;
}

export interface ModelSelection {
    modelId: string;
    providerId?: string;
}

export interface CreateSessionInput {
    cwd: string;
    effort?: string;
    modelId?: string;
    permissionMode?: string;
    projectId?: string;
    providerId?: string;
    serviceTier?: HappyAgentServiceTier;
    workspaceId?: string;
}

export interface CreateWorkspaceInput {
    baseRef?: string;
    name: string;
    projectId: string;
}

export interface ProjectAddOptions {
    projectId?: string;
    signal?: AbortSignal;
}

export interface CreateRemoteProjectInput {
    name: string;
    projectId?: string;
    secret?: { kind: "github" };
    source: { kind: "github"; repository: string } | { kind: "git"; url: string };
}

export type GroupTarget =
    | { kind: "project"; projectId: string }
    | { kind: "workspace"; projectId: string; workspaceId: string };

export interface UserInputAnswers {
    answers: Readonly<Record<string, readonly string[]>>;
}

export interface ConnectHappyAgentOptions {
    endpoint: string | URL;
    token: string;
    /** Reuses the composition root's stateless client instead of opening a second authority. */
    client?: HappyAgentClient;
    fetch?: typeof globalThis.fetch;
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
    now?: () => number;
    onMutationRejected?: (delta: MutationRejectedDelta) => void;
    onCompatibilityChange?: (compatibility: ServerCompatibility) => void;
    /** Receives bounded, display-ready diagnostics without exposing credentials. */
    onDebugEntry?: (entry: HappyAgentDebugLogInput) => void;
    /** Runs when a top-level session finishes; delegated subagent runs stay silent. */
    onTopLevelSessionFinished?: (sessionId: string) => void;
}

export interface HappyAgentConnection {
    /** Shared authoritative transport input for this connection's feature stores. */
    readonly sync: HappyAgentSync;
    compatibility: () => ServerCompatibility;
    /** Interrupts the managed update feed or startup wait so reconnection starts immediately. */
    retry: () => void;
    connectSession: (options: HappyAgentSessionSubscriptionOptions) => HappyAgentSessionConnection;
    connectGroups: (options: HappyAgentGroupsSubscriptionOptions) => HappyAgentGroupsConnection;
    projects: {
        add(path: string, options?: ProjectAddOptions): Promise<Project>;
        archive(projectId: string): MutationId;
        clone(input: CreateRemoteProjectInput): MutationId;
    };
    createWorkspace(input: CreateWorkspaceInput): MutationId;
    archiveWorkspace(projectId: string, workspaceId: string): MutationId;
    /**
     * Names the agent and returns that name at once, so the session can be
     * addressed and drawn before the daemon has been asked for it.
     *
     * `checkoutReady` holds the request itself back without holding the name
     * back. The daemon will not take an agent into a workspace it is still
     * preparing, so a session created with one is announced locally now and
     * requested when that promise settles; rejecting it withdraws the session
     * the way any refused creation is withdrawn. Everything else addressed to
     * this agent — its draft, its first message — queues behind the creation
     * either way, so a caller supplying it need do nothing else.
     */
    createSession(input: CreateSessionInput, checkoutReady?: Promise<unknown>): MutationId;
    markSessionRead(sessionId: string): MutationId;
    sendMessage(sessionId: string, message: string | SendMessageInput): MutationId;
    /** Invokes one slash command under the session's current composer selection. */
    invokeSlashCommand(sessionId: string, name: string, argumentsValue?: string): MutationId;
    stopBackgroundProcess(sessionId: string, projectedProcessId: number): MutationId;
    stopRun(sessionId: string): MutationId;
    compactSession(sessionId: string): MutationId;
    setDraft(sessionId: string, update: string | DraftUpdate): MutationId;
    switchModel(sessionId: string, selection: string | ModelSelection): MutationId;
    setEffort(sessionId: string, effort?: string): MutationId;
    setServiceTier(sessionId: string, serviceTier?: HappyAgentServiceTier): MutationId;
    setPermissionMode(sessionId: string, permissionMode: string): MutationId;
    answerUserInput(sessionId: string, requestId: string, response: UserInputAnswers): MutationId;
    setSessionArchived(sessionId: string, archived: boolean): MutationId;
    renameGroup(target: GroupTarget, name: string): MutationId;
    /**
     * Creates a bot, its dedicated workspace, and its one agent, and answers
     * with the bot itself.
     *
     * A promise rather than a named mutation, because nothing here can be named
     * in advance: the daemon derives the folder name and makes the one agent
     * that *is* the bot's conversation, and a caller opening the bot it just
     * asked for needs both. The id is supplied so a repeated attempt creates
     * the same bot rather than a second one.
     */
    createBot(name: string): Promise<Bot>;
    archiveBot(botId: string): MutationId;
    reorderBot(botId: string, afterId: string | null): MutationId;
    reorderProject(projectId: string, afterId: string | null): MutationId;
    reorderWorkspace(workspaceId: string, afterId: string | null): MutationId;
    reorderSession(sessionId: string, afterId: string | null): MutationId;
    close(): void;
}

export type ServerCompatibility =
    | {
          status: "checking";
          minimumSupportedProtocolVersion: number;
          /** The oldest Happy Agent product version this build works with. */
          minimumSupportedVersion: string;
      }
    | {
          status: "compatible" | "server_outdated";
          minimumSupportedProtocolVersion: number;
          /** The oldest Happy Agent product version this build works with. */
          minimumSupportedVersion: string;
          serverProtocolVersion: number;
          /** The daemon's own product version, as its health report states it. */
          serverVersion: string;
      };

export type SessionEvent = HappyAgentEvent;
export interface SessionStreamHello {
    connection: ConnectionState;
    session?: SessionState;
}

export type ProtocolSession = Partial<SessionState> & {
    id: string;
    archived: boolean;
    cwd: string;
    modelId: string;
    ownerInstanceId: string;
    permissionMode: string;
    providerId: string;
};

export interface ChatStoreSnapshot {
    agent: Agent;
    mode: MessageMode;
}
