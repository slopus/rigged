import { type CSSProperties, type ReactNode, useState, useSyncExternalStore } from "react";
import {
    entryKey,
    type ComposerSnapshot,
    type ConversationAuthor,
    type ConversationEntry,
    type ConversationRequestSubmission,
    type ConversationToolCall,
} from "happy-desktop-state";
import { type ActivityMotion, type ActivityTreatment } from "./AgentActivityRow";
import { HAPPY_AGENT_ACTIVITY_CONTROL_TRANSCRIPT_HEIGHT } from "./HappyAgentActivityControl";
import {
    AGENT_WORKING_STATUS_ROW_HEIGHT,
    AgentWorkingStatus,
    type AgentWaitStatus,
    type AgentWorkingPhase,
} from "./AgentWorkingStatus";
import { ChannelHeader } from "./ChannelHeader";
import { ConversationDock } from "./ConversationDock";
import { ConversationEntryView, type ConversationEntryViewProps } from "./ConversationEntryView";
import {
    conversationAgentRowStartsGroup,
    conversationEntryPrecedesActivity,
    conversationEntryResumesAfterActivity,
    conversationMessageClosedByStatus,
    conversationMessageGrouped,
    conversationTurnStatusAfterActivity,
    conversationTurnStatusStartsGroup,
    conversationWorkingStatusStartsGroup,
} from "./conversationMessageGrouped";
import {
    contentWidth,
    conversationRowHeight,
    conversationRowHeightCacheCreate,
    type ConversationRowHeightCache,
} from "./conversationRowHeight";
import { EmptyState } from "./EmptyState";
import { Message, MessageList, type MessageListScrollPosition } from "./Message";
import {
    messageTextLayoutFontGenerationGet,
    messageTextLayoutFontGenerationSubscribe,
} from "./messageTextLayout";
import type { HappyAgentUserInputAnswerMap } from "./HappyAgentUserInputPrompt";
import { ScrollArea } from "./Scrollbar";
import { Spinner } from "./Spinner";
import { WindowOverlay } from "./WindowOverlay";

export type ConversationViewProps = {
    /**
     * Titles this conversation's own 56px header. Omit it when the surface that
     * hosts this view already names what is open — the local workspace heads a
     * whole directory and switches sessions with tabs beneath that heading — and
     * no header renders at all.
     */
    title?: string;
    /** Secondary header line: the working directory, topic, or participants. */
    subtitle?: string;
    /** True while the agent is working; drives the live activity line. */
    running?: boolean;
    /** True while the addressed conversation is hydrating its transcript. */
    loading?: boolean;
    /** Elapsed run time in ms, supplied by the owner (no timers live in the UI). */
    elapsedMs?: number;
    /** Current reader-facing phase of the active turn. */
    workingPhase?: AgentWorkingPhase;
    /** Humanized activity text from the agent, preferred over the phase word. */
    workingLabel?: string;
    /** The scheduled wait the turn is inside, counted down by the owner's clock. */
    workingWait?: AgentWaitStatus;
    /**
     * How many agents this conversation delegated to are still working. A turn
     * can hand work to a child and end before the child does, and the reader is
     * then watching a conversation that looks finished while it is not: this is
     * what keeps the status line saying so.
     */
    delegatedAgents?: number;
    /**
     * How long those agents have been going, when the owner knows. Absent leaves
     * the dedicated status without a clock rather than inventing one.
     */
    delegatedElapsedMs?: number;
    /**
     * Motion profile for live activity rows and the working-status footer.
     * Defaults to the historical typewriter behavior.
     */
    motion?: ActivityMotion;
    /** Activity-row content/chrome policy, independent of animation. */
    activityTreatment?: ActivityTreatment;
    /**
     * A live summary of external work, rendered as the final transcript entry
     * instead of taking space above the composer.
     */
    activityControl?: ReactNode;
    /**
     * The global switch for a caret at the end of a still-streaming reply.
     * Off by default, preserving the historical no-caret text stream.
     */
    streamingCaret?: boolean;
    entries: readonly ConversationEntry[];
    /** Custom introduction for a loaded conversation with no transcript entries. */
    emptyContent?: ReactNode;
    /** Agent identity shown when a tool/activity row opens a turn before prose exists. */
    agentAuthor?: ConversationAuthor;
    /** Identity id of the reader, so their own messages take the own treatment. */
    viewerId?: string;
    /**
     * Which conversation these entries belong to. It is the transcript's
     * lifetime boundary: switching conversations mounts a new list, so one
     * conversation's reading position is never applied to another's.
     */
    conversationId?: string;
    /**
     * Where this conversation was last being read, restored on mount. Absent
     * means the newest content, which is where a conversation opens.
     */
    scrollPosition?: MessageListScrollPosition;
    /** Reports the reading position, including the final one before unmount. */
    onScrollPositionChange?: (position: MessageListScrollPosition) => void;
    /**
     * The oldest loaded entry is on screen and older ones are wanted: the
     * reader scrolled to the top of the transcript, or the whole loaded
     * transcript fits on screen and they have nothing left to scroll.
     */
    onStartReached?: () => void;
    /** Header controls composed by the surface owner. */
    headerActions?: ReactNode;
    /**
     * Controls rendered inside the composer toolbar, beneath the text input:
     * the model/effort picker and the settings affordance. They belong to the
     * message being written, so they sit with the input rather than the header.
     */
    composerControls?: ReactNode;
    /** Agent-authored contribution bar immediately above the composer. */
    composerAboveControl?: ReactNode;
    /** Controlled accessory below the composer card. */
    composerFooterControl?: ReactNode;
    /**
     * A modal-class surface (settings dialog, picker) hosted above this one.
     * The owner decides whether it is open; this surface only says where it
     * belongs in the product. It is rendered in the window's own overlay lane,
     * so it stacks over the whole window rather than over the conversation's
     * corner of it.
     */
    overlay?: ReactNode;
    /**
     * Something to say about this conversation that is not part of it, held
     * above every message rather than mixed in among them.
     *
     * It is a fixed row between the header and the body, so it stays put while
     * the transcript scrolls and reads as a fact about the place the
     * conversation is happening in — a checkout still being prepared, above all
     * — rather than as something that was said in it. The transcript underneath
     * behaves exactly as it otherwise would, empty or full.
     */
    notice?: ReactNode;
    /** Replaces the conversation body while an owner-selected panel is open. */
    panel?: ReactNode;
    /** Shows or hides the intermediate entries of a finished turn. */
    onTraceToggle?: (turnId: string) => void;
    /** Finished turns currently listing their intermediate entries. */
    expandedTurnIds?: ReadonlySet<string>;
    /** @deprecated Pending steering now renders as an ordered transcript message. */
    queued?: readonly { readonly id: string; readonly text: string }[];
    /** The composer surface snapshot; the draft never lives in this component. */
    composer: ComposerSnapshot;
    /** Keeps the conversation readable while disabling every composer action. */
    composerDisabled?: boolean;
    /** Keeps the local draft editable while disabling submission to the Happy Agent. */
    composerSubmitDisabled?: boolean;
    composerPlaceholder?: string;
    /** Makes this composer the last resort for typing; see `Composer.focusOnType`. */
    composerFocusOnType?: boolean;
    /** What this composer writes into; a change takes the caret. See `Composer.focusKey`. */
    composerFocusKey?: string;
    onComposerValueChange: (value: string) => void;
    onComposerFocusChange?: (focused: boolean) => void;
    onComposerSend: () => void;
    /** Receives images picked through the composer's picker or pasted into it. */
    onComposerAttachmentsSelect?: (files: File[]) => void;
    /** Removes one attachment chip from the draft. */
    onComposerAttachmentRemove?: (attachmentId: string) => void;
    /** Opens one transcript image full size; the owner hosts the viewer in `overlay`. */
    onImageOpen?: (messageId: string, attachmentId: string) => void;
    /** Opens or downloads one linked transcript attachment. */
    onAttachmentOpen?: ConversationEntryViewProps["onAttachmentOpen"];
    /** Opens one tool entry in the workspace's replaceable Preview tab. */
    onToolSelect?: (entryId: string, tool: ConversationToolCall) => void;
    /** Opens a child session from an inline delegated-agent row. */
    onDelegationSelect?: ConversationEntryViewProps["onDelegationSelect"];
    /** Reference epoch millis used by delegated-agent timers. */
    now?: number;
    /**
     * Opens a workspace file the transcript names — the file a tool call worked
     * on, or one a message links to — in the product's own file viewer. Absent
     * leaves those affordances out entirely, because a transcript with no
     * workspace behind it has nothing to open.
     */
    onFileOpen?: (path: string) => void;
    /** Runs a command chosen from the `/` palette. */
    onCommandInvoke?: (commandId: string) => void;
    /** Stops the current run; the composer's send control becomes this while running. */
    onAbort?: () => void;
    onRequestAnswer?: (requestId: string, answers: HappyAgentUserInputAnswerMap) => void;
    /** Request-id-scoped local answer submission lifecycles. */
    requestSubmissions?: readonly ConversationRequestSubmission[];
    /**
     * Options ticked into each pending question but not yet submitted, by
     * request id. The owner keeps them because sending a message answers the
     * question, and that answer must carry a choice already made.
     */
    requestSelections?: ReadonlyMap<string, Readonly<Record<string, readonly string[]>>>;
    /** Reports each tick to the owner that keeps the selections. */
    onRequestSelectionChange?: (requestId: string, answers: HappyAgentUserInputAnswerMap) => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/** Whether the turn this row carries the trace control for is currently open. */
function conversationEntryTraceOpen(
    entry: ConversationEntry,
    expandedTurnIds: ReadonlySet<string> | undefined,
): boolean {
    const trace =
        entry.kind === "message"
            ? entry.message.agentTrace
            : entry.kind === "agentActivity" || entry.kind === "delegation"
              ? entry.agentTrace
              : undefined;
    return trace !== undefined && expandedTurnIds?.has(trace.turnId) === true;
}

/**
 * Splits off the queued steering waiting at the end of the transcript.
 *
 * Steering is the one thing in a conversation that has not happened yet: the
 * reader typed it while the agent was working and it will be handed over at the
 * next boundary. Ordered among the rows above the live status, it reads as
 * something already said and answers the wrong question — the reader looks at
 * their own words sitting above "Thinking" and cannot tell whether the turn has
 * seen them. Below that line it reads as what it is, next in the queue.
 *
 * Only a run of them at the very tail moves. Steering that was already applied
 * is ordinary history and stays where it happened.
 */
function conversationPendingSteering(entries: readonly ConversationEntry[]): {
    readonly transcript: readonly ConversationEntry[];
    readonly queued: readonly ConversationEntry[];
} {
    let start = entries.length;
    while (start > 0) {
        const entry = entries[start - 1];
        if (entry?.kind !== "message" || entry.delivery !== "pending_steering") break;
        start -= 1;
    }
    return start === entries.length
        ? { transcript: entries, queued: [] }
        : { transcript: entries.slice(0, start), queued: entries.slice(start) };
}

function elapsedFormat(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${(seconds % 60).toString().padStart(2, "0")}s`;
}

/**
 * The agent's live run state for the header that names what is open. It sits
 * here rather than inside `ConversationView` because a surface whose heading
 * spans a whole directory still shows the open session's activity.
 */
export function ConversationStatus(props: { elapsedMs?: number; running?: boolean }) {
    return (
        <span
            className="happy-conversation__status"
            data-happy-desktop-ui="conversation-status"
            data-running={props.running ? "" : undefined}
        >
            <span aria-hidden="true" className="happy-conversation__status-dot" />
            {props.running ? "Running" : "Idle"}
            {props.running && props.elapsedMs !== undefined ? (
                <span
                    className="happy-conversation__status-elapsed"
                    data-happy-desktop-ui="conversation-elapsed"
                >
                    {elapsedFormat(props.elapsedMs)}
                </span>
            ) : null}
        </span>
    );
}

/**
 * ConversationView — the assembled conversation surface: a `ChannelHeader` with
 * the title, subtitle, and owner-supplied controls; the virtualized shared
 * `MessageList` of `ConversationEntry` rows; an optional owner panel that takes
 * the body; and the shared `Composer` with its `/` command palette and `@`
 * mention candidates. A running turn keeps one minimal `AgentWorkingStatus` in the
 * message list footer — elapsed clock and current phase — alongside any active
 * external-work summary, all of which scrolls with the transcript rather than
 * floating over it.
 *
 * Every value comes from props and every draft keystroke goes back out through
 * `onComposerValueChange`, so the composer store — not this component — owns the
 * draft, the active command query, and the mention query.
 */
export function ConversationView(props: ConversationViewProps) {
    const composer = props.composer;
    const textLayoutGeneration = useSyncExternalStore(
        messageTextLayoutFontGenerationSubscribe,
        messageTextLayoutFontGenerationGet,
        messageTextLayoutFontGenerationGet,
    );
    /*
     * One row-layout cache per recent conversation: leaving a conversation and
     * coming back reuses prepared text layout without retaining every session
     * ever visited by this mounted view. This Map and its values are
     * component-lifetime memo caches, not product state: retaining a calculation
     * never drives another render.
     * The row estimator needs the active cache while rendering, so lazy state
     * initialization gives the registry one stable owner without reading or
     * writing a ref during render.
     */
    const [rowHeightCaches] = useState(() => new Map<string, ConversationRowHeightCache>());
    const conversationCacheKey =
        props.conversationId === undefined ? "anonymous" : `conversation:${props.conversationId}`;
    const [rowExpansion, setRowExpansion] = useState(() => new Map<string, boolean>());
    const rowExpansionKey = (entry: ConversationEntry) =>
        `${conversationCacheKey}:${entryKey(entry)}`;
    const rowExpanded = (entry: ConversationEntry) =>
        rowExpansion.get(rowExpansionKey(entry)) ??
        (entry.kind === "agentActivity" && entry.activity.kind === "shell");
    const rowExpandedChange = (entry: ConversationEntry, expanded: boolean) => {
        const key = rowExpansionKey(entry);
        setRowExpansion((current) => {
            if (current.get(key) === expanded) return current;
            const next = new Map(current);
            next.set(key, expanded);
            return next;
        });
    };
    const cachedRowHeights = rowHeightCaches.get(conversationCacheKey);
    const rowHeightCache = cachedRowHeights ?? conversationRowHeightCacheCreate();
    if (cachedRowHeights === undefined) rowHeightCaches.set(conversationCacheKey, rowHeightCache);
    else {
        // Map insertion order is the tiny LRU; the current conversation is
        // always touched last and therefore survives a later navigation.
        rowHeightCaches.delete(conversationCacheKey);
        rowHeightCaches.set(conversationCacheKey, cachedRowHeights);
    }
    while (rowHeightCaches.size > 4) {
        const oldest = rowHeightCaches.keys().next().value as string | undefined;
        if (oldest === undefined || oldest === conversationCacheKey) break;
        rowHeightCaches.delete(oldest);
    }
    const { transcript, queued } = conversationPendingSteering(props.entries);
    const awaitingInput = transcript.some(
        (entry) =>
            entry.kind === "request" &&
            entry.request.kind === "userInput" &&
            entry.request.status !== "answered",
    );
    /*
     * The turn ended and the agents it delegated to did not. That is a state of
     * its own rather than a continuation of the turn: the conversation is still
     * working, but nothing of the parent's is running, so the line takes the
     * loader and the children's clock instead of the finished turn's phase,
     * label, and wait — and it never claims the identity header, because the
     * work it reports was set going by the turn above it.
     */
    const delegating = props.running !== true && !awaitingInput && (props.delegatedAgents ?? 0) > 0;
    /*
     * An unanswered question keeps the footer after the run that asked it
     * stops. The turn is not over — it is waiting on the reader — and the one
     * line that reports what this conversation is doing is the place that says
     * so, rather than leaving the transcript looking finished.
     */
    const statusVisible = props.running === true || awaitingInput || delegating;
    const workingStatusStartsGroup =
        statusVisible &&
        !delegating &&
        props.agentAuthor !== undefined &&
        conversationWorkingStatusStartsGroup(transcript);
    const workingStatus = (
        <AgentWorkingStatus
            active={statusVisible}
            awaitingInput={awaitingInput}
            className="happy-conversation-turn-status"
            elapsedMs={delegating ? props.delegatedElapsedMs : props.elapsedMs}
            label={delegating ? undefined : props.workingLabel}
            /* The phase word is the one label whose changes are the whole
               point of the row, so it retypes wherever the rows above it
               retype verbs. */
            motion={
                props.motion === undefined ||
                props.motion === "typewriter" ||
                props.motion === "verb-typed"
                    ? "typewriter"
                    : "calm"
            }
            phase={delegating ? "delegating" : props.workingPhase}
            wait={delegating ? undefined : props.workingWait}
        />
    );
    /**
     * The live turn and its external work share one line: the status keeps the
     * left and the activity summary sits at the far right. When no parent turn
     * is active, the same line remains with only the external-work summary, so
     * a terminal or subagent never jumps into the settled "Completed in" row.
     */
    const workingStatusLine = (
        <div
            className="happy-conversation__status-line"
            data-active-turn={statusVisible ? "" : undefined}
            data-happy-desktop-ui="conversation-status-line"
        >
            {workingStatus}
            {props.activityControl ? (
                <div
                    className="happy-conversation__activity-entry"
                    data-happy-desktop-ui="conversation-activity-entry"
                >
                    {props.activityControl}
                </div>
            ) : null}
        </div>
    );
    const workingStatusRow =
        workingStatusStartsGroup && props.agentAuthor ? (
            <Message
                agent
                author={props.agentAuthor.displayName}
                body=""
                className="happy-message--activity-lead happy-message--working-lead"
                initials={initialsOf(props.agentAuthor.displayName)}
            >
                {workingStatusLine}
            </Message>
        ) : (
            workingStatusLine
        );
    const activityFallback = props.activityControl ? (
        <div
            className="happy-conversation__activity-fallback"
            data-happy-desktop-ui="conversation-activity-fallback"
        >
            {props.activityControl}
        </div>
    ) : null;
    const workingStatusHeight = statusVisible
        ? workingStatusStartsGroup
            ? 68
            : AGENT_WORKING_STATUS_ROW_HEIGHT
        : 0;
    return (
        <section
            className={["happy-conversation", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="conversation-view"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {props.title === undefined ? null : (
                <ChannelHeader
                    actions={
                        <>
                            <ConversationStatus
                                elapsedMs={props.elapsedMs}
                                running={props.running}
                            />
                            {props.headerActions}
                        </>
                    }
                    icon="spark"
                    title={props.title}
                    topic={props.subtitle}
                />
            )}

            {props.notice ? (
                <div
                    className="happy-conversation__notice"
                    data-happy-desktop-ui="conversation-notice"
                >
                    {props.notice}
                </div>
            ) : null}

            {props.panel ? (
                <ScrollArea
                    axes="both"
                    className="happy-conversation__panel"
                    data-happy-desktop-ui="conversation-panel"
                    viewportClassName="happy-conversation__panel-viewport"
                >
                    {props.panel}
                </ScrollArea>
            ) : props.loading ? (
                <ScrollArea
                    axes="both"
                    className="happy-conversation__empty happy-conversation__loading"
                    data-happy-desktop-ui="conversation-loading"
                    viewportClassName="happy-conversation__empty-viewport"
                >
                    <Spinner label="Loading conversation" size={20} tone="muted" variant="line" />
                    {activityFallback}
                </ScrollArea>
            ) : props.entries.length === 0 ? (
                <ScrollArea
                    axes="both"
                    className="happy-conversation__empty"
                    data-happy-desktop-ui="conversation-empty"
                    viewportClassName="happy-conversation__empty-viewport"
                >
                    {props.emptyContent ?? (
                        <EmptyState
                            // A conversation with nothing in it is an agent waiting
                            // to be told what to do, so that is what it looks like.
                            animation="robot"
                            description="Send a message to start working in this conversation."
                            icon="chat"
                            size="panel"
                            title="Nothing here yet"
                        />
                    )}
                    {activityFallback}
                </ScrollArea>
            ) : (
                <MessageList
                    estimateDependencies={[
                        props.entries,
                        props.viewerId,
                        props.activityTreatment,
                        statusVisible,
                        workingStatusStartsGroup,
                        props.activityControl !== undefined,
                        rowExpansion,
                    ]}
                    estimateRowSize={(index, width) =>
                        conversationRowHeight(
                            transcript,
                            index,
                            {
                                activityTreatment: props.activityTreatment,
                                expanded:
                                    transcript[index] === undefined
                                        ? false
                                        : rowExpanded(transcript[index]),
                                surface: "conversation",
                                viewerId: props.viewerId,
                                width,
                            },
                            rowHeightCache,
                        )
                    }
                    estimateRowWidth={contentWidth}
                    estimateVersion={textLayoutGeneration}
                    footer={
                        <>
                            {workingStatusRow}
                            {queued.length > 0 ? (
                                <div
                                    className="happy-conversation__queued"
                                    data-happy-desktop-ui="conversation-queued"
                                >
                                    {queued.map((entry) => (
                                        <ConversationEntryView
                                            entry={entry}
                                            key={
                                                entry.kind === "message"
                                                    ? entry.message.id
                                                    : entry.id
                                            }
                                            viewerId={props.viewerId}
                                        />
                                    ))}
                                </div>
                            ) : null}
                        </>
                    }
                    footerHeight={(width) =>
                        Math.max(
                            workingStatusHeight,
                            props.activityControl
                                ? HAPPY_AGENT_ACTIVITY_CONTROL_TRANSCRIPT_HEIGHT
                                : 0,
                        ) +
                        queued.reduce(
                            (total, entry, index) =>
                                total +
                                (conversationRowHeight(
                                    queued,
                                    index,
                                    {
                                        activityTreatment: props.activityTreatment,
                                        expanded:
                                            queued[index] === undefined
                                                ? false
                                                : rowExpanded(queued[index]),
                                        surface: "conversation",
                                        viewerId: props.viewerId,
                                        width,
                                    },
                                    rowHeightCache,
                                ) ?? 0),
                            0,
                        )
                    }
                    initialScrollPosition={props.scrollPosition}
                    // The conversation is this list's lifetime: switching to
                    // another one mounts its own list, which is what lets each
                    // restore its own position instead of inheriting one.
                    key={props.conversationId}
                    onScrollPositionChange={props.onScrollPositionChange}
                    onStartReached={props.onStartReached}
                    paddingEnd={24}
                    virtualize
                >
                    {transcript.map((entry, index) => {
                        const submission =
                            entry.kind === "request"
                                ? props.requestSubmissions?.find(
                                      (candidate) =>
                                          candidate.requestId === entry.request.requestId,
                                  )
                                : undefined;
                        return (
                            <ConversationEntryView
                                activityMotion={props.motion}
                                activityTreatment={props.activityTreatment}
                                {...(props.streamingCaret === undefined
                                    ? {}
                                    : { streamingCaret: props.streamingCaret })}
                                {...(entry.kind === "message" && entry.contextNote !== undefined
                                    ? { contextNote: entry.contextNote }
                                    : {})}
                                activityAuthor={
                                    props.agentAuthor &&
                                    (conversationAgentRowStartsGroup(transcript, index) ||
                                        conversationTurnStatusStartsGroup(transcript, index))
                                        ? props.agentAuthor
                                        : undefined
                                }
                                className={
                                    [
                                        entry.kind === "turnStatus" &&
                                        conversationTurnStatusAfterActivity(transcript, index)
                                            ? "happy-turn-status--after-trace"
                                            : undefined,
                                        conversationEntryResumesAfterActivity(transcript, index)
                                            ? "happy-conversation__resumed"
                                            : undefined,
                                        conversationEntryPrecedesActivity(transcript, index)
                                            ? "happy-conversation__continues"
                                            : undefined,
                                        conversationMessageClosedByStatus(transcript, index)
                                            ? "happy-conversation__closing"
                                            : undefined,
                                    ]
                                        .filter(Boolean)
                                        .join(" ") || undefined
                                }
                                entry={entry}
                                grouped={
                                    entry.kind === "message"
                                        ? conversationMessageGrouped(transcript, index)
                                        : undefined
                                }
                                key={
                                    entry.kind === "message"
                                        ? entry.message.id
                                        : entry.kind === "turnStatus"
                                          ? entry.id
                                          : entry.id
                                }
                                onImageOpen={props.onImageOpen}
                                onAttachmentOpen={props.onAttachmentOpen}
                                onRequestAnswer={props.onRequestAnswer}
                                onRequestSelectionChange={props.onRequestSelectionChange}
                                onRowExpandedChange={(expanded) =>
                                    rowExpandedChange(entry, expanded)
                                }
                                requestSelection={
                                    entry.kind === "request"
                                        ? props.requestSelections?.get(entry.request.requestId)
                                        : undefined
                                }
                                onToolSelect={props.onToolSelect}
                                onDelegationSelect={props.onDelegationSelect}
                                now={props.now}
                                {...(props.onFileOpen ? { onFileOpen: props.onFileOpen } : {})}
                                onTraceToggle={props.onTraceToggle}
                                /* Either kind of row can be the one a turn hung
                                   its control on: the answer when the turn is
                                   folded up, the row its work starts on when it
                                   is open. */
                                traceOpen={conversationEntryTraceOpen(entry, props.expandedTurnIds)}
                                requestError={
                                    submission?.status === "failed" ? submission.error : undefined
                                }
                                requestPending={submission?.status === "pending"}
                                rowExpanded={rowExpanded(entry)}
                                viewerId={props.viewerId}
                            />
                        );
                    })}
                </MessageList>
            )}

            <ConversationDock
                composer={composer}
                composerAboveControl={props.composerAboveControl}
                composerControls={props.composerControls}
                disabled={props.composerDisabled}
                submitDisabled={props.composerSubmitDisabled === true}
                composerFooterControl={props.composerFooterControl}
                composerFocusOnType={props.composerFocusOnType}
                {...(props.composerFocusKey === undefined
                    ? {}
                    : { composerFocusKey: props.composerFocusKey })}
                composerPlaceholder={props.composerPlaceholder}
                onAbort={props.onAbort}
                onCommandInvoke={props.onCommandInvoke}
                onComposerAttachmentRemove={props.onComposerAttachmentRemove}
                onComposerAttachmentsSelect={props.onComposerAttachmentsSelect}
                onComposerFocusChange={props.onComposerFocusChange}
                onComposerSend={props.onComposerSend}
                onComposerValueChange={props.onComposerValueChange}
                running={props.running}
            />

            {props.overlay ? <WindowOverlay>{props.overlay}</WindowOverlay> : null}
        </section>
    );
}

function initialsOf(displayName: string): string {
    return displayName
        .split(/\s+/u)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}
