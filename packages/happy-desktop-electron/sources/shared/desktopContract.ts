import type {
    DesktopProfilerRequest,
    DesktopProfilerSnapshot,
    DesktopReactDevtoolsCommand,
    DesktopReactDevtoolsMessage,
} from "./desktopProfiler";

export type DesktopMode = "local";

/** Appearance source the Electron shell applies to every local renderer and guest. */
export type DesktopAppearanceMode = "dark" | "light" | "system";
export type DesktopScrollbarVisibility = "always" | "automatic";

export interface DesktopCloudAuthConfiguration {
    readonly environment: "production" | "staging";
    readonly redirectUri: string;
}

/** Access granted to a newly created local Happy Agent session. */
export type DesktopPermissionMode = "auto" | "workspace_write" | "read_only" | "full_access";

/** One provider-qualified model identity in desktop preferences. */
export interface DesktopModelIdentity {
    readonly providerId: string;
    readonly modelId: string;
}

/** The explicit model and effort a new desktop session starts with. */
export interface DesktopDefaultModel extends DesktopModelIdentity {
    readonly effort?: string;
}

/** The choices most recently made while using one provider-qualified model. */
export interface DesktopModelPreference extends DesktopModelIdentity {
    readonly lastEffort?: string;
    /** `standard` names the provider's ordinary tier; every other value is a catalog tier. */
    readonly lastSpeed: string;
}

/**
 * Machine-local desktop preferences. Theme, scrollbar behavior, and explicit
 * title motion belong here because they must survive every window and Happy
 * Agent lifetime. Model ids are provider-qualified because the same model can
 * be offered through more than one account/provider.
 */
export interface DesktopConfig {
    readonly appearance: DesktopAppearanceMode;
    readonly defaultModel?: DesktopDefaultModel;
    readonly defaultEffort: string;
    readonly defaultPermissionMode: DesktopPermissionMode;
    readonly lastPickedModel?: DesktopModelIdentity;
    readonly modelPreferences: readonly DesktopModelPreference[];
    readonly scrollbarVisibility: DesktopScrollbarVisibility;
    readonly titleShimmerEnabled?: boolean;
    readonly version: 1;
}

export type DesktopStartRequest = { mode: "local" };

export type DesktopTopology = {
    id: string;
    mode: "local";
};

export interface DesktopTopologyTarget {
    detail: string;
    id: string;
    kind: "local" | "remote";
    label: string;
    mode: DesktopMode;
}

export type DesktopActiveTarget = DesktopTopologyTarget & {
    authentication: "happyAgent";
    mode: "local";
    happyAgentVersion: string;
    /**
     * Loopback base URL of the main process's Happy Agent HTTP proxy. The renderer's
     * connection loader probes `${happyAgentHttpUrl}/health` directly; this is the
     * only channel the renderer uses to reach the local daemon.
     */
    happyAgentHttpUrl: string;
};

export interface DesktopUpdateSnapshot {
    availableVersion?: string;
    message?: string;
    status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "error";
}

/**
 * One Happy Agent version this machine can run: either published for this
 * platform, already downloaded here, or both. `downloaded` is what decides
 * whether choosing it needs the network.
 */
export interface DesktopDaemonVersion {
    readonly downloaded: boolean;
    readonly prerelease: boolean;
    readonly version: string;
}

/**
 * One agent the daemon is still waiting on, and the stage it is finishing.
 * Reported by the daemon itself; Happy never infers what an agent is doing.
 */
export interface DesktopDrainAgent {
    readonly id: string;
    readonly stage: "inference" | "tools" | "compaction" | "settlement";
}

/**
 * Why the daemon is being taken down and brought back.
 *
 * Both are the same sequence and the same screen; only the words differ,
 * because arriving on a newer version and arriving back on the one you were
 * already running are different things to be told.
 */
export type DesktopDaemonRestartReason = "install" | "restart";

/** One runtime component whose admitted work has not drained yet. */
export interface DesktopDrainComponent {
    readonly name: string;
    /** Exact number of operations still holding this component open. */
    readonly count: number;
    /** Bounded, ID-sorted agent detail, present only for an agent component. */
    readonly agents?: readonly DesktopDrainAgent[];
    /** More agents are waiting than the daemon listed. */
    readonly truncated?: boolean;
}

/** The steps a restart runs through, in the order it runs them. */
export type DesktopDaemonRestartStep = "draining" | "stopping" | "starting" | "reconnecting";

/**
 * Where a deliberate agent restart has got to.
 *
 * The daemon owns every one of these facts: it publishes its own drain mode and
 * what is still finishing, so the screen reports rather than estimates. The one
 * quantity here is the drain's, and it is a count of open work rather than a
 * prediction — the daemon knows what it is still holding and how much it was
 * holding at the worst, and nothing beyond that is claimed.
 */
export type DesktopDaemonInstall =
    /**
     * No restart is running, which is also how a finished one ends. There is no
     * "done": the window comes back the moment the agent is serving again, and
     * a phase whose only content is that it worked would only be something to
     * click through.
     */
    | { readonly phase: "idle" }
    /** Asking the daemon to stop admitting new work. */
    | {
          readonly phase: "draining";
          readonly reason: DesktopDaemonRestartReason;
          readonly version: string;
          readonly waitingFor: readonly DesktopDrainComponent[];
          /**
           * The most open work this drain has been holding at once.
           *
           * The screen shows how far the drain has got as the share of this that
           * has since finished, so it is counted here — by the one place that
           * has watched the drain from its first report — rather than guessed
           * from whatever the window happened to see first.
           */
          readonly waitingPeak: number;
          /**
           * The wait has run long enough to be worth offering a way out of.
           *
           * It is published rather than timed in the window, so the offer appears
           * because the drain really has been going that long — not because a
           * component happened to mount ten seconds ago.
           */
          readonly killable: boolean;
      }
    /** Everything drained; the daemon is being asked to exit. */
    | {
          readonly phase: "stopping";
          readonly reason: DesktopDaemonRestartReason;
          readonly version: string;
          /** The drain was cut short, so work was interrupted rather than finished. */
          readonly killed: boolean;
      }
    /** The binary is starting. */
    | {
          readonly phase: "starting";
          readonly reason: DesktopDaemonRestartReason;
          readonly version: string;
      }
    /** The daemon answered and Happy is reconnecting to it. */
    | {
          readonly phase: "reconnecting";
          readonly reason: DesktopDaemonRestartReason;
          readonly version: string;
      }
    | {
          readonly phase: "error";
          readonly reason: DesktopDaemonRestartReason;
          readonly version: string;
          readonly message: string;
          /**
           * The step that was running when it failed. The sequence knows this;
           * the message alone would leave the screen guessing where it stopped.
           */
          readonly failedAt: DesktopDaemonRestartStep;
      };

/**
 * A Happy Agent release archive, while its bytes are arriving.
 *
 * Both numbers are counted rather than estimated. The release manifest declares
 * the archive's exact size — the download already refuses anything that does not
 * match it — and the same pass that hashes each chunk on its way to disk tallies
 * it, so this is a report of what has happened rather than a prediction.
 *
 * It exists only while an archive is genuinely being fetched. Before the first
 * byte the size is not yet known, and after the last one the work that remains
 * is verifying and unpacking, which take no measurable time and have no honest
 * fraction; a bar that idled at either end would be inventing one.
 */
export interface DesktopDaemonDownload {
    readonly receivedBytes: number;
    readonly totalBytes: number;
}

/** The machine-local Happy Agent installation and the daemon currently serving it. */
export interface DesktopDaemonSnapshot {
    readonly availableVersion?: string;
    /** The archive on its way here, while `operation` is `downloading`. */
    readonly download?: DesktopDaemonDownload;
    readonly error?: string;
    readonly installation: "missing" | "installed";
    readonly installedVersion?: string;
    readonly managed: boolean;
    readonly message?: string;
    /**
     * What the controller is doing. `installing` is the first start alone —
     * selecting a verified release on a machine that has none and launching it.
     * It is kept apart from `downloading` because fetching bytes is harmless and
     * automatic, while selecting and running them follows the person's action.
     */
    readonly operation: "idle" | "checking" | "downloading" | "installing" | "upgrading";
    readonly runtime: "stopped" | "starting" | "ready";
    readonly updateAvailable: boolean;
    /**
     * Every version that can be chosen, newest first. Empty until the first
     * catalog read answers; a version downloaded here always appears, even when
     * GitHub no longer lists it.
     */
    readonly versions: readonly DesktopDaemonVersion[];
    /**
     * The downloaded version waiting to be selected: the first version on a
     * machine with no agent, or one newer than the running daemon. Its presence
     * is the whole condition for offering start/install: the verified bytes are
     * already on this machine.
     */
    readonly readyVersion?: string;
    /** A restart the person asked for, while it is happening. */
    readonly install: DesktopDaemonInstall;
}

export type DesktopRuntimeSnapshot =
    | {
          phase: "choosing";
          targets: readonly DesktopTopologyTarget[];
          update: DesktopUpdateSnapshot;
      }
    | {
          phase: "starting";
          message: string;
          request: DesktopStartRequest;
          targets: readonly DesktopTopologyTarget[];
          update: DesktopUpdateSnapshot;
      }
    | {
          phase: "ready";
          activeTarget: DesktopActiveTarget;
          activeTargetId: string;
          connectionId: number;
          mode: DesktopMode;
          targets: readonly DesktopTopologyTarget[];
          update: DesktopUpdateSnapshot;
      }
    | {
          phase: "error";
          message: string;
          request: DesktopStartRequest;
          retryable: boolean;
          /**
           * Another attempt is running right now, started from this failure. The
           * failure stays published so the window can keep the screen the person
           * is reading and put the waiting on its retry control instead.
           */
          retrying?: boolean;
          targets: readonly DesktopTopologyTarget[];
          update: DesktopUpdateSnapshot;
      };

/**
 * The window chrome the renderer cannot observe for itself. macOS full screen
 * hides the traffic lights without changing any CSS display mode, so the shell
 * would otherwise keep reserving the lane they left behind.
 */
export interface DesktopWindowState {
    readonly fullScreen: boolean;
}

/** One native keyboard event relayed from an embedded browser/preview guest. */
export interface DesktopGuestKeyEvent {
    readonly altKey: boolean;
    readonly code: string;
    readonly ctrlKey: boolean;
    readonly isComposing: boolean;
    readonly key: string;
    readonly location: number;
    readonly metaKey: boolean;
    readonly repeat: boolean;
    readonly shiftKey: boolean;
    readonly type: "keydown" | "keyup";
}

export type DesktopDebugTargetStatus =
    | "stopped"
    | "starting"
    | "running"
    | "stopping"
    | "unavailable"
    | "error";

/** One live debugger attachment point owned by the native shell. */
export interface DesktopDebugTargetSnapshot {
    readonly error?: string;
    readonly status: DesktopDebugTargetStatus;
    readonly url?: string;
}

/** The three runtimes an external CDP client can attach to from Dev Tools. */
export interface DesktopDebugSnapshot {
    readonly daemonConnected: boolean;
    readonly daemon: DesktopDebugTargetSnapshot;
    readonly main: DesktopDebugTargetSnapshot;
    readonly renderer: DesktopDebugTargetSnapshot;
    readonly supported: boolean;
}

/** Native renderer profiling is separate from debugger endpoint lifetimes. */
export type DesktopProfilerStartRequest = DesktopProfilerRequest;

/**
 * What a development build calls itself. A packaged Happy reports none: only a
 * build run from a checkout has to be told apart from the other one beside it.
 */
export interface DesktopBuildIdentity {
    readonly branch: string;
    /** Short name for this checkout: its worktree directory, its branch, or "dev". */
    readonly label: string;
    /** Absolute path of the checkout, which is the detail worth copying. */
    readonly path: string;
}

/** Launch argument prefix carrying `DesktopBuildIdentity` JSON into the preload. */
export const buildIdentityArgument = "--happy-build-identity=";

/**
 * Where local first-run setup currently stands. The stage is always derived from
 * what this machine actually has — a Node runtime, an installed agent, a
 * connected daemon — plus the choices already recorded durably, so a restart, a
 * reinstall that keeps user data, or an interrupted install resumes at the same
 * stage or at the nearest truthful earlier one rather than at a remembered step
 * that may no longer be true.
 */
export type LocalOnboardingStage =
    /** The local runtime is not active yet, so setup has nothing to inspect. */
    | "inactive"
    /** The login-shell probe has not answered yet. */
    | "checking"
    /** No Node runtime; Happy cannot install one, so the person is asked to. */
    | "nodeMissing"
    /** Happy Agent is not installed yet; the renderer downloads and starts it automatically. */
    | "daemonDownload"
    /**
     * The agent that was just fetched is being started, and Happy is reaching it
     * for the first time.
     *
     * It is the tail of `daemonDownload` rather than a step of its own: nobody
     * asked for it, there is nothing to decide, and it is shown on the same
     * screen. It exists because the alternative was reporting the connection
     * Happy had not made yet as a connection that had failed — with the reason
     * the machine gave before the agent was installed, which by then was untrue.
     */
    | "daemonStarting"
    /** The agent exists; the normal user daemon is being started or connected to. */
    | "connecting"
    /** The daemon could not be reached; the desktop runtime carries the reason. */
    | "connectFailed"
    /**
     * Happy Agent is installed and working, but no coding assistant on this machine is
     * signed in, so it has nothing to run a session with. Kept apart from
     * `connectFailed` because nothing is broken: this is the last ordinary step
     * of setting the machine up, and it clears itself the moment an assistant is
     * signed in.
     */
    | "providersMissing"
    /**
     * Happy has just installed and started the agent, and reports which coding
     * assistants this machine turned out to have.
     *
     * Shown once per install, whether or not anything is missing, and passed by
     * the one button on it. It is a report rather than a question: the machine
     * was read while the agent was being fetched, and this is the only moment
     * that answer is worth anybody's attention.
     */
    | "assistantsFound"
    /** Happy Agent requires a human identity before it can finish setup. */
    | "profileRequired"
    /** Happy Agent Connect is resolving the daemon-owned onboarding status. */
    | "examining"
    /** Everything else is settled and this Happy Agent is demonstrably unused. */
    | "project"
    | "complete";

/**
 * How much is known about whether the connected Happy Agent has been used before.
 *
 * It is deliberately not a boolean with an absent third case: "not read yet"
 * and "could not be read" are different from "this Happy Agent is new", and only the
 * last of them may ever lead to Happy registering anything in someone's Happy Agent.
 */
export type LocalOnboardingFreshness =
    /** No authoritative answer yet for the Happy Agent currently connected. */
    | "checking"
    /** This Happy Agent holds no project of its own: it has never been used.  */
    | "fresh"
    /** This Happy Agent already holds projects, archived or not. */
    | "used"
    /** Its catalog could not be read, so nothing may be concluded from it. */
    | "error";

/** The Node runtime the user's login shell resolves, when it resolves one. */
export interface LocalOnboardingNode {
    readonly path: string;
    /** As `node --version` reported it, for example `v22.11.0`. */
    readonly version: string;
}

/**
 * The command-line assistants Happy sets a machine up with.
 *
 * Three, named here once. Happy Agent can be taught to run others and says so in its own
 * settings; setup deliberately asks about these and stops, because a first run
 * is not the place to survey a field — it is the place to get one assistant
 * working.
 */
export type LocalAssistantId = "claude" | "codex" | "grok";

/** What the login-shell probe found out about one assistant. */
export interface LocalAssistantState {
    readonly id: LocalAssistantId;
    /** Where the machine keeps the command, when the machine has it at all. */
    readonly command?: string;
    /**
     * Only what the machine can actually answer: the command is here, or it is
     * not. Whether a present command is signed in is Happy Agent's question rather than
     * the shell's, so it is not claimed here — the stage supplies that, because
     * `providersMissing` is itself Happy Agent's answer that none of them works.
     */
    readonly status: "found" | "missing";
}

export interface LocalOnboardingSnapshot {
    readonly stage: LocalOnboardingStage;
    readonly node?: LocalOnboardingNode;
    /**
     * Whether the Happy Agent connected right now has ever been used. Happy Agent publishes no
     * first-run flag, so this is read from its catalog and is re-read for every
     * connection: a replaced Happy Agent data directory is a different answer, and a
     * remembered one would let setup skip or repeat itself untruthfully.
     */
    readonly freshness: LocalOnboardingFreshness;
    /** The Git folder most recently opened as a project, for display only. */
    readonly projectPath?: string;
    /** True while this process is doing the current stage's work. */
    readonly busy: boolean;
    /**
     * The Happy Agent archive arriving right now, at `daemonDownload` and only
     * there. Setup is the one place a first download is worth watching — it is
     * the whole reason the window is being held — so the counted bytes are
     * carried here rather than left for the screen to guess at from a sentence.
     */
    readonly download?: DesktopDaemonDownload;
    /** Displayable detail for the current stage: why it failed, or what to do. */
    readonly message?: string;
    /**
     * The three assistants setup looks for, each with what this machine holds
     * and what Happy Agent can do with it. Present only at `providersMissing`.
     */
    readonly assistants?: readonly LocalAssistantState[];
    /** An attempt to reach Happy Agent is running, started from a failed stage. */
    readonly retrying?: boolean;
}

/**
 * One file a window of its own is showing, as that window is allowed to see it:
 * an address on one of this process's own Happy Agent proxies, and the workspace path
 * read back out of it. Never a daemon endpoint, a token, or a path on disk the
 * window could read for itself.
 *
 * Whether it is a picture or a recording is not carried here either. The window
 * decides that from the path it was given, which came out of the address this
 * process already validated — a separately supplied kind would be a second claim
 * about one file, and the only thing a second claim can do is disagree.
 */
export interface DesktopMediaPreview {
    readonly url: string;
    readonly path: string;
}

/**
 * HTTP result of one committed browser-guest navigation. Only the main process
 * sees a guest's response code, so it forwards it to the renderer keyed by the
 * guest's `webContents` id; a renderer tab claims the events for its own guest.
 */
export interface DesktopBrowserStatus {
    readonly guestId: number;
    readonly url: string;
    readonly status: number;
    readonly statusText: string;
}

/** Which local session's network a browser guest browses through. */
export interface DesktopBrowserProxyTarget {
    readonly sessionId: string;
}

/**
 * One step in the life of one main-frame document inside an HTML preview guest.
 *
 * A preview reloads in place whenever the file behind it changes, so one guest
 * shows many documents and its `webContents` id identifies the guest, never the
 * page. `navigationId` is what identifies the page: it is monotonic per guest,
 * counts up once for every new document the main frame starts loading, and is
 * stamped on every step of that document's life.
 *
 * The steps are published by the main process on one channel, in the order that
 * process observed them, so a view never has to guess whether a response code
 * belongs to the document it is showing or to the one before it.
 */
export type DesktopPreviewNavigationStep =
    | {
          /** A new document has begun loading in the main frame. */
          readonly phase: "started";
          readonly url: string;
      }
    | {
          /** The document committed, with the response the server gave for it. */
          readonly phase: "responded";
          readonly url: string;
          /** `-1` for a navigation that is not HTTP. */
          readonly status: number;
          readonly statusText: string;
      }
    | {
          /** The document and everything it pulled in finished loading. */
          readonly phase: "loaded";
          readonly url: string;
      }
    | {
          /** The main frame's load failed outright; nothing committed. */
          readonly phase: "failed";
          readonly url: string;
          readonly code: number;
          readonly description: string;
      }
    | {
          /** The process drawing the page ended. */
          readonly phase: "gone";
          readonly url: string;
          readonly reason: string;
      };

/**
 * A request to move through this window's navigation stack, from the inputs an
 * OS offers: the mouse's side buttons, the trackpad swipe, the menu items. Only
 * the main process sees them, and none says *where* to go — only which
 * direction. The window holds the stack and decides what that lands on.
 */
export type DesktopNavigationStep = {
    readonly direction: "back" | "forward";
};

/** Primary-modifier state for Edit → Undo on the platform hosting this window. */
export type DesktopEditUndoRequest = {
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
};

export type DesktopPreviewNavigation = DesktopPreviewNavigationStep & {
    readonly guestId: number;
    readonly navigationId: number;
};

export interface HappyDesktopBridge {
    /**
     * This window's development identity, absent in a packaged build. It is a
     * plain value rather than a call because the window is one build for its
     * whole life: the shell has it before the first frame and it never changes.
     */
    readonly buildIdentity?: DesktopBuildIdentity;
    /**
     * Makes Chromium's preferred color scheme follow Happy's selection, so
     * previews, browser guests, and auxiliary windows agree with
     * the application tree instead of independently following macOS.
     */
    appearanceSet(mode: DesktopAppearanceMode): void;
    /**
     * Where a file the reader dropped, picked, or pasted actually lives on this
     * machine, when it lives anywhere. A file the browser only holds in memory —
     * a pasted screenshot — has no path and answers undefined.
     *
     * It is what lets an attachment be copied where it is going instead of read
     * into the renderer, expanded to base64, and pushed back out through a JSON
     * body every hop holds whole. A video is the case that makes that plain.
     */
    attachmentSourcePath(file: File): string | undefined;
    /** Points this window's browser guests at one local Happy Agent session's network boundary. */
    browserProxyApply(target: DesktopBrowserProxyTarget): Promise<void>;
    browserOpenSubscribe(listener: (url: string) => void): () => void;
    browserStatusSubscribe(listener: (status: DesktopBrowserStatus) => void): () => void;
    /** Announces that the shell received a Happy Social OAuth callback. */
    cloudAuthCallbackSubscribe(listener: () => void): () => void;
    /** Whether a callback is waiting, without consuming its one-shot URL. */
    cloudAuthCallbackPending(): Promise<boolean>;
    /** Takes the most recent unforwarded callback URL, if one has arrived. */
    cloudAuthCallbackTake(): Promise<string | undefined>;
    /** Selects the daemon's matching Cloud deployment and callback address. */
    cloudAuthConfigurationGet(): Promise<DesktopCloudAuthConfiguration>;
    /** Opens only the HTTPS authorization URL returned by Happy Agent. */
    cloudAuthOpen(url: string): Promise<void>;
    /**
     * Relays Command keyboard input while an isolated browser or HTML preview
     * guest owns focus. The renderer dispatches it through the same window
     * shortcut path as native host input.
     */
    guestKeySubscribe(listener: (event: DesktopGuestKeyEvent) => void): () => void;
    /**
     * The ordered life of every HTML preview guest in this window. A view claims
     * the steps carrying its own guest id and follows one navigation at a time.
     */
    previewNavigationSubscribe(listener: (step: DesktopPreviewNavigation) => void): () => void;
    /** Back and Forward, as asked for by the mouse, the trackpad, or the menu. */
    navigationStepSubscribe(listener: (step: DesktopNavigationStep) => void): () => void;
    /**
     * Lets the application claim the native Edit → Undo command for its own
     * close history. Returning false preserves Chromium's native editor undo.
     * Optional while cloud-delivered renderers can still meet an older desktop
     * host that leaves Undo entirely native.
     */
    editUndoSubscribe?(listener: (request: DesktopEditUndoRequest) => boolean): () => void;
    /**
     * Reports how many conversations are waiting for the person, for the mark on
     * the Dock icon. One-way and fire-and-forget: the window states what it is
     * showing and the shell paints it, so nothing above this line has to wait on
     * or reconcile with the operating system.
     */
    dockUnreadSet(count: number): void;
    /**
     * Fires every time zoom is asked for, with the whole-number percentage the
     * window is now at — including when the answer is the one it was already
     * showing, because ⌘0 at 100% and ⌘− against the floor are exactly the
     * moments the reader needs telling that the command landed.
     *
     * The View menu owns zooming, not the page, so the value is pushed from the
     * main process rather than inferred here. There is nothing to ask for before
     * the first one arrives: a window nobody has zoomed has nothing to report.
     */
    zoomSubscribe(listener: (percent: number) => void): () => void;
    /**
     * Shows the file at one address in a window outside this one, reusing the
     * preview window if it is already open. Rejected unless the address is the
     * media route of a Happy Agent proxy this process is currently running.
     */
    mediaPreviewOpen(url: string): Promise<void>;
    directoryPick(): Promise<string | undefined>;
    desktopConfigGet(): Promise<DesktopConfig>;
    desktopConfigWrite(config: DesktopConfig): Promise<void>;
    /** Asks now for what the background check would otherwise find later. */
    daemonCheck(): Promise<void>;
    /**
     * Drains and restarts the local daemon onto the version already downloaded
     * here. Only the local host is ever restarted this way; a remote Happy Agent updates
     * itself and never takes this window.
     */
    daemonInstall(): Promise<void>;
    /** Hands the window back once a finished or failed install has been read. */
    daemonInstallDismiss(): Promise<void>;
    /**
     * Stops waiting for the drain and takes the daemon down now, interrupting
     * whatever it was still finishing.
     */
    daemonInstallKill(): Promise<void>;
    /** Drains and restarts the local daemon on the version it is already running. */
    daemonRestart(): Promise<void>;
    /** Downloads and verifies the first Happy Agent release without running it. */
    daemonDownload(): Promise<void>;
    daemonGet(): Promise<DesktopDaemonSnapshot>;
    /** Starts the verified first Happy Agent release already downloaded here. */
    daemonStart(): Promise<void>;
    daemonSubscribe(listener: (snapshot: DesktopDaemonSnapshot) => void): () => void;
    daemonUpgrade(): Promise<void>;
    /** Installs one exact version if needed, then runs the daemon on it. */
    daemonVersionSelect(version: string): Promise<void>;
    debugGet(): Promise<DesktopDebugSnapshot>;
    debugAllStart(): Promise<DesktopDebugSnapshot>;
    debugAllStop(): Promise<DesktopDebugSnapshot>;
    debugMainInspectorStart(): Promise<DesktopDebugSnapshot>;
    debugMainInspectorStop(): Promise<DesktopDebugSnapshot>;
    debugRendererInspectorStart(): Promise<DesktopDebugSnapshot>;
    debugRendererInspectorStop(): Promise<DesktopDebugSnapshot>;
    debugDaemonInspectorStart(): Promise<DesktopDebugSnapshot>;
    debugDaemonInspectorStop(): Promise<DesktopDebugSnapshot>;
    debugSubscribe(listener: (snapshot: DesktopDebugSnapshot) => void): () => void;
    profilerGet(): Promise<DesktopProfilerSnapshot>;
    profilerStart(request?: DesktopProfilerStartRequest): Promise<DesktopProfilerSnapshot>;
    profilerStop(): Promise<DesktopProfilerSnapshot>;
    profilerSubscribe(listener: (snapshot: DesktopProfilerSnapshot) => void): () => void;
    /** Private typed Wall transport used by the profile renderer bootstrap. */
    profilerReactMessage(message: DesktopReactDevtoolsMessage): void;
    profilerReactSubscribe(listener: (command: DesktopReactDevtoolsCommand) => void): () => void;
    applicationMenuOpen(): Promise<void>;
    /** Where local first-run setup stands, without waiting for its next change. */
    onboardingGet(): Promise<LocalOnboardingSnapshot>;
    onboardingSubscribe(listener: (snapshot: LocalOnboardingSnapshot) => void): () => void;
    onboardingProfileCreate(input: {
        readonly email: string;
        readonly name: string;
    }): Promise<void>;
    /**
     * Opens the native folder picker, requires a Git repository root, and opens
     * it as this Happy Agent's first project. Picking, validating, and registering all
     * happen in the main process; the window never learns a path it did not
     * already receive in a snapshot.
     */
    onboardingProjectChoose(): Promise<void>;
    /** Leaves provider authentication setup after its report, or skips it while it runs. */
    onboardingAssistantsContinue(): Promise<void>;
    runtimeGet(): Promise<DesktopRuntimeSnapshot>;
    runtimeReset(): Promise<void>;
    runtimeRetry(): Promise<void>;
    runtimeStart(request: DesktopStartRequest): Promise<void>;
    topologySelect(topologyId: string): Promise<void>;
    updateInstall(): Promise<void>;
    windowStateGet(): Promise<DesktopWindowState>;
    windowStateSubscribe(listener: (state: DesktopWindowState) => void): () => void;
    subscribe(listener: (snapshot: DesktopRuntimeSnapshot) => void): () => void;
}

/**
 * The whole capability of the window that shows one file.
 *
 * It is deliberately not `HappyDesktopBridge`: a window whose only job is to
 * show one picture or play one recording has no business writing preferences or
 * choosing a topology, so it is handed a bridge that cannot do either rather
 * than the application's and a promise not to use it.
 */
export interface HappyMediaPreviewBridge {
    /** What this window was opened for; it has not been sent anything yet. */
    mediaPreviewGet(): Promise<DesktopMediaPreview | undefined>;
    /** Fires when the window is pointed at a different file. */
    mediaPreviewSubscribe(listener: (preview: DesktopMediaPreview | undefined) => void): () => void;
    /** Closes this window from inside it. */
    mediaPreviewClose(): Promise<void>;
}

export const desktopIpc = {
    /** Renderer → main only: the appearance source inherited by local web contents. */
    appearanceSet: "happy:appearance:set",
    browserProxyApply: "happy:browser:proxy-apply",
    browserOpenRequested: "happy:browser:open-requested",
    browserStatusChanged: "happy:browser:status-changed",
    cloudAuthCallbackReceived: "happy:cloud-auth:callback-received",
    cloudAuthCallbackPending: "happy:cloud-auth:callback-pending",
    cloudAuthCallbackTake: "happy:cloud-auth:callback-take",
    cloudAuthConfigurationGet: "happy:cloud-auth:configuration-get",
    cloudAuthOpen: "happy:cloud-auth:open",
    guestKey: "happy:guest:key",
    previewNavigationChanged: "happy:html-preview:navigation-changed",
    /** Main → renderer: the reader asked to go back or forward. */
    navigationStep: "happy:navigation:step",
    /** Main → renderer: the native Edit menu asked the focused app to undo. */
    editUndoRequested: "happy:edit:undo-requested",
    /** Preload → main: no app command claimed Undo, so Chromium should handle it. */
    editUndoNative: "happy:edit:undo-native",
    directoryPick: "happy:directory:pick",
    mediaPreviewChanged: "happy:media-preview:changed",
    mediaPreviewClose: "happy:media-preview:close",
    mediaPreviewGet: "happy:media-preview:get",
    mediaPreviewOpen: "happy:media-preview:open",
    /** Renderer → main only: the number of conversations waiting for the person. */
    dockUnreadSet: "happy:dock:unread-set",
    /** Main → renderer only: the window's zoom, every time the View menu is used. */
    zoomChanged: "happy:zoom:changed",
    desktopConfigGet: "happy:desktop-config:get",
    desktopConfigWrite: "happy:desktop-config:write",
    daemonChanged: "happy:daemon:changed",
    daemonCheck: "happy:daemon:check",
    daemonDownload: "happy:daemon:download",
    daemonInstall: "happy:daemon:install",
    daemonInstallDismiss: "happy:daemon:install-dismiss",
    daemonInstallKill: "happy:daemon:install-kill",
    daemonRestart: "happy:daemon:restart",
    daemonGet: "happy:daemon:get",
    daemonStart: "happy:daemon:start",
    daemonUpgrade: "happy:daemon:upgrade",
    daemonVersionSelect: "happy:daemon:version-select",
    debugAllStart: "happy:debug:all-start",
    debugAllStop: "happy:debug:all-stop",
    debugChanged: "happy:debug:changed",
    debugDaemonInspectorStart: "happy:debug:daemon-inspector-start",
    debugDaemonInspectorStop: "happy:debug:daemon-inspector-stop",
    debugGet: "happy:debug:get",
    debugMainInspectorStart: "happy:debug:main-inspector-start",
    debugMainInspectorStop: "happy:debug:main-inspector-stop",
    debugRendererInspectorStart: "happy:debug:renderer-inspector-start",
    debugRendererInspectorStop: "happy:debug:renderer-inspector-stop",
    profilerGet: "happy:profiler:get",
    profilerStart: "happy:profiler:start",
    profilerStop: "happy:profiler:stop",
    profilerChanged: "happy:profiler:changed",
    profilerReactCommand: "happy:profiler:react-command",
    profilerReactMessage: "happy:profiler:react-message",
    applicationMenuOpen: "happy:application-menu:open",
    onboardingAssistantsContinue: "happy:onboarding:assistants-continue",
    onboardingChanged: "happy:onboarding:changed",
    onboardingGet: "happy:onboarding:get",
    onboardingProfileCreate: "happy:onboarding:profile-create",
    onboardingProjectChoose: "happy:onboarding:project-choose",
    runtimeChanged: "happy:runtime:changed",
    runtimeGet: "happy:runtime:get",
    runtimeReset: "happy:runtime:reset",
    runtimeRetry: "happy:runtime:retry",
    runtimeStart: "happy:runtime:start",
    topologySelect: "happy:topology:select",
    updateInstall: "happy:update:install",
    windowStateChanged: "happy:window-state:changed",
    windowStateGet: "happy:window-state:get",
} as const;

/** Persistent, capability-isolated Chromium profile used only by embedded browser tabs. */
export const happyBrowserPartition = "persist:happy-browser";

/**
 * In-memory Chromium profile used only by rendered HTML file previews. It is
 * deliberately not persistent and not the browser's: a previewed page keeps no
 * cookies or storage between sessions, and can reach nothing the browser tabs
 * are logged into.
 */
export const happyHtmlPreviewPartition = "happy-html-preview";

/**
 * Query the preview window is loaded with, so the renderer entry mounts only the
 * file instead of the whole application. It is a property of the window's own
 * address rather than something asked for over the bridge, so the first frame is
 * already the right one.
 */
export const mediaPreviewView = { key: "view", value: "media-preview" } as const;

/**
 * Launch argument that tells the preload it is loading the preview window, so
 * the reduced bridge is chosen before the page exists rather than inferred from
 * an address the page could later change.
 */
export const mediaPreviewArgument = "--happy-media-preview";
