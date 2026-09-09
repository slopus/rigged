import { Box } from "./Box";
import { Button } from "./Button";
import { SegmentedProgress, type SegmentedProgressSegment } from "./SegmentedProgress";
import { SetupPage } from "./SetupPage";

/** One agent the daemon is still waiting on, and the stage it is finishing. */
export interface AgentInstallDrainAgent {
    readonly id: string;
    readonly stage: "inference" | "tools" | "compaction" | "settlement";
}

/** One runtime component whose admitted work has not drained yet. */
export interface AgentInstallDrainComponent {
    readonly name: string;
    readonly count: number;
    readonly agents?: readonly AgentInstallDrainAgent[];
    readonly truncated?: boolean;
}

/**
 * Why the agent is being taken down and brought back. The sequence is the same
 * either way; only the words change, because coming back on a newer version and
 * coming back on the one you were already running are different outcomes.
 */
export type AgentInstallReason = "install" | "restart";

/** The steps a restart runs through, in the order it runs them. */
export type AgentInstallStep = "draining" | "stopping" | "starting" | "reconnecting";

export type AgentInstallView =
    | {
          readonly kind: "draining";
          readonly reason: AgentInstallReason;
          readonly version: string;
          readonly waitingFor: readonly AgentInstallDrainComponent[];
          /**
           * The most work this drain has ever been holding at once, which is
           * what the share already finished is measured against. It comes from
           * whatever has been watching the drain since it began rather than
           * from the first report this screen happened to be mounted for.
           */
          readonly waitingPeak: number;
          /** Offers the way out of a wait that has gone on long enough. */
          readonly killable: boolean;
      }
    | {
          readonly kind: "stopping";
          readonly reason: AgentInstallReason;
          readonly version: string;
          readonly killed: boolean;
      }
    | { readonly kind: "starting"; readonly reason: AgentInstallReason; readonly version: string }
    | {
          readonly kind: "reconnecting";
          readonly reason: AgentInstallReason;
          readonly version: string;
      }
    | {
          readonly kind: "error";
          readonly reason: AgentInstallReason;
          readonly version: string;
          readonly message: string;
          /** The step the restart stopped on, so the bar stops where it stopped. */
          readonly failedAt: AgentInstallStep;
      };

export interface AgentInstallScreenProps {
    readonly view: AgentInstallView;
    /**
     * Hands the window back after a failure. Success needs no such thing: the
     * restart finishing is the screen ending, so there is nothing left to
     * acknowledge and nothing to click through.
     */
    onDismiss(): void;
    /**
     * Stops waiting for the drain and takes the agent down now. Offered only
     * once the drain says it has been waiting long enough to be worth it.
     */
    onKill(): void;
}

/**
 * What an agent is doing, named the way a label is named.
 *
 * These sit in chips, so each is a standalone label rather than the tail of a
 * sentence: "Thinking", not "thinking", which only reads correctly if something
 * before it supplied the subject. Still the ordinary word for the thing — the
 * daemon's own terms, `inference` and `settlement`, name an implementation and
 * would tell a reader nothing about whether their work is safe.
 */
const STAGE_WORDS: Record<AgentInstallDrainAgent["stage"], string> = {
    compaction: "Compacting history",
    inference: "Thinking",
    settlement: "Finishing up",
    tools: "Running a tool",
};

/**
 * How many agents are named before the rest become one "More" chip. The chip
 * area is a fixed two rows, and this is what keeps it to two: past this many,
 * the list has stopped being something anyone reads and is only saying "a lot".
 */
const AGENTS_SHOWN = 5;

/** Every step of a restart, in the order they happen. */
const INSTALL_STEPS: readonly AgentInstallStep[] = [
    "draining",
    "stopping",
    "starting",
    "reconnecting",
];

/**
 * The four parts of a restart worth telling apart, and the step each covers.
 *
 * These are the answers to "what is happening to my work": it is still
 * finishing, the agent is going away, the new one is coming up, and the window
 * is catching up to it. Reconnecting is its own part because it is the one the
 * window genuinely waits on after the agent is back — long enough to be worth a
 * segment of its own rather than a change of heading.
 *
 * Named the way the titles are named. `drain` is the daemon's word for the first
 * of these and says nothing to whoever is watching it; what they are being told
 * is that their work is being allowed to finish.
 */
const INSTALL_SECTIONS: readonly {
    readonly id: string;
    readonly label: string;
    readonly steps: readonly AgentInstallStep[];
}[] = [
    { id: "drain", label: "Finishing work", steps: ["draining"] },
    { id: "shutdown", label: "Shutting down", steps: ["stopping"] },
    { id: "start", label: "Starting", steps: ["starting"] },
    { id: "reconnect", label: "Reconnecting", steps: ["reconnecting"] },
];

/**
 * Installing a new Happy Agent, as the one thing this window is doing.
 *
 * It takes the whole window because it is not a background task: the agent that
 * runs every session on this machine is being stopped and replaced, so for the
 * moment there is nothing else the window could truthfully show. It is only ever
 * the local machine's agent — a Happy Agent on another machine is restarted by whoever
 * owns it and never takes this window.
 *
 * Nothing here is an estimate. The daemon says which of its components still
 * hold work open and how many operations each one is holding, and this states
 * that. When it says nothing is waiting, the wait is over.
 *
 * The bar says which part of a restart is running: work finishing, the agent
 * going away, the new one starting, the window reconnecting. Those are separate
 * answers to the only question anyone watching this has, and one undivided bar
 * gives none of them. Only the drain fills in proportion, against the most work
 * it was holding, because it is the only step with a quantity behind it; the
 * others sweep rather than invent a position.
 *
 * Every phase is one frame that never moves. The whole sequence runs on its own
 * in front of someone who cannot do anything about it, so the parts that change
 * are the words alone: one scene mounted once for the entire restart, a copy
 * line holding two lines' height whether it fills them or not, a chip area
 * holding its two rows while empty, and a button row holding its height while
 * there is no button in it. A step that finishes as another begins should read
 * as a sentence being rewritten, not as the page rebuilding itself.
 *
 * There is no state for having succeeded. The restart ending is this screen
 * ending — the window it was covering is the reward, and a page that stops to
 * be congratulated on the way back to it is a page in the way.
 */
export function AgentInstallScreen(props: AgentInstallScreenProps) {
    const { view } = props;
    const agents = view.kind === "draining" ? drainAgents(view.waitingFor) : [];
    const more =
        view.kind === "draining" &&
        (agents.length > AGENTS_SHOWN ||
            view.waitingFor.some((component) => component.truncated === true));
    // Offered rather than shown from the start: a drain that takes a moment
    // should simply finish, and a button to cut it short reads as an invitation
    // to cut it short.
    //
    // "Stop waiting" rather than "Kill now": what the person is ending is their
    // own wait, and that is the decision in front of them. "Kill" is the
    // engineering word for the mechanism and puts violence on a button someone
    // is likely to press just because they are impatient — the copy beside it
    // already says work will be interrupted, which is the fact that matters.
    const action =
        view.kind === "error"
            ? { label: "Continue", onSelect: props.onDismiss }
            : view.kind === "draining" && view.killable
              ? { label: "Stop waiting and restart now", onSelect: props.onKill }
              : undefined;
    return (
        <SetupPage
            className="happy-agent-install"
            copy={installCopy(view)}
            data-testid="agent-install-screen"
            // One scene for the whole restart, mounted once. `snail` because
            // that is what every phase of this actually is — something is
            // happening and it is taking a moment — where `robot` would say the
            // agent is up and waiting to be told what to do, which is the one
            // thing it is not.
            scene="snail"
            title={installTitle(view)}
        >
            <SegmentedProgress
                className="happy-agent-install__progress"
                data-testid="agent-install-progress"
                label="Restart progress"
                segments={installSegments(view)}
            />
            <Box className="happy-agent-install__waiting">
                {agents.slice(0, AGENTS_SHOWN).map((agent) => (
                    <span className="happy-agent-install__agent" key={agent.id}>
                        {STAGE_WORDS[agent.stage]}
                    </span>
                ))}
                {more ? <span className="happy-agent-install__agent">More</span> : null}
            </Box>
            <Box className="happy-agent-install__action">
                {action ? (
                    <Button fullWidth onClick={action.onSelect} size="large">
                        {action.label}
                    </Button>
                ) : null}
            </Box>
        </SetupPage>
    );
}

/**
 * The restart as its segments: where it has got to, and how far into the one
 * part of it that can be counted.
 *
 * The bar is the sequence rather than a duration. Only the drain knows a
 * quantity — the daemon says how much work it is still holding — so only that
 * segment ever reports a position; the other two say "this is the step running"
 * and nothing more, because nothing more is known about them.
 */
function installSegments(view: AgentInstallView): readonly SegmentedProgressSegment[] {
    const step = view.kind === "error" ? view.failedAt : view.kind;
    const reached = INSTALL_STEPS.indexOf(step);
    return INSTALL_SECTIONS.map((section) => {
        const live = section.steps.includes(step);
        const through = Math.max(...section.steps.map((one) => INSTALL_STEPS.indexOf(one)));
        const state = live
            ? view.kind === "error"
                ? "failed"
                : "running"
            : reached > through
              ? "done"
              : "pending";
        const fraction =
            state === "running" && view.kind === "draining" ? drainFraction(view) : undefined;
        return {
            id: section.id,
            label: section.label,
            state,
            ...(fraction === undefined ? {} : { fraction }),
        };
    });
}

/**
 * How much of the drain is behind us, or nothing while that is unknowable.
 *
 * The daemon reports open work rather than progress, so this is the share of
 * the work the drain has been holding that it has since let go of. Before the
 * first report there is no denominator and none is invented: an unmeasured
 * drain sweeps instead, which is the honest drawing of "waiting, amount
 * unknown".
 */
function drainFraction(view: Extract<AgentInstallView, { kind: "draining" }>): number | undefined {
    if (view.waitingPeak <= 0) return undefined;
    const remaining = view.waitingFor.reduce((total, one) => total + one.count, 0);
    return Math.min(1, Math.max(0, (view.waitingPeak - remaining) / view.waitingPeak));
}

/** Every agent the daemon named, across the components holding them. */
function drainAgents(
    waitingFor: readonly AgentInstallDrainComponent[],
): readonly AgentInstallDrainAgent[] {
    return waitingFor.flatMap((component) => component.agents ?? []);
}

/**
 * What is happening, as a heading rather than a remark.
 *
 * No trailing ellipsis on any of these. Three dots is the chat register — it
 * suggests a thought being left unfinished, and it appears on every one of these
 * states at once, so it stops meaning "still going" and becomes a tic. A present
 * participle already says the thing is under way, and the scene beside it is
 * moving. Each stays inside one line at the title's measure.
 */
function installTitle(view: AgentInstallView): string {
    switch (view.kind) {
        case "draining":
            return "Finishing active work";
        case "stopping":
            return "Stopping Happy Agent";
        // Reconnecting keeps the starting heading rather than replacing it: the
        // reconnect is a segment on the bar, and swapping the title as the bar
        // advances would say two different things about one continuous wait.
        case "starting":
        case "reconnecting":
            return view.reason === "install" ? "Starting the new version" : "Starting Happy Agent";
        case "error":
            return view.reason === "install" ? "Install failed" : "Restart failed";
    }
}

/**
 * The line under it: the part that changes, and the part that reassures.
 *
 * The heading is deliberately plain, so this carries the warmth — what is being
 * protected, what has already happened, what is safe. Stated plainly and without
 * apology, which is what keeps plain from turning cold.
 */
function installCopy(view: AgentInstallView): string {
    switch (view.kind) {
        case "draining":
            return drainCopy(
                view.waitingFor.reduce((total, one) => total + one.count, 0),
                drainAgents(view.waitingFor).length,
            );
        case "stopping":
            return view.killed
                ? "Remaining work was interrupted, as you asked."
                : "All work has finished. Closing the agent down.";
        case "starting":
            return `Happy Agent ${view.version} is coming up.`;
        case "reconnecting":
            return "Happy Agent is running. Restoring your workspace.";
        case "error":
            // The daemon's own words. Whatever was running before is still
            // running, so this is a reason rather than a loss to report.
            return view.message;
    }
}

/**
 * What is actually being waited for. The counts are the daemon's, and the
 * sentence changes with them rather than counting down a clock nobody set.
 *
 * The promise not to interrupt anyone is the point of this whole screen, so it
 * is made in words wherever there is someone it applies to.
 */
function drainCopy(operations: number, agents: number): string {
    if (operations === 0) return "Happy Agent has stopped taking on new work.";
    if (agents > 0) {
        return agents === 1
            ? "One agent is still working. It will not be interrupted."
            : `${String(agents)} agents are still working. They will not be interrupted.`;
    }
    return operations === 1
        ? "One operation is still finishing."
        : `${String(operations)} operations are still finishing.`;
}
