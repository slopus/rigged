import { useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import {
    DesktopStartupScreen,
    happyAgentHistoryCreate,
    happyAgentRouterConversationOpen,
    happyAgentRouterGroupOpen,
    happyAgentRouterGroupForget,
    happyAgentRouterCreate,
    type AppHappyAgentDaemonInstall,
    type AppHappyAgentDaemonStore,
    type AppHappyAgentUpdate,
    type AppHappyAgentDebugStore,
    type AppHappyAgentProfilerStore,
    type HappyAgentRouter,
} from "happy-desktop-app";
import {
    HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
    appearanceStoreCreate,
    experimentsStoreCreate,
    titleShimmerStoreCreate,
    welcomeStoreCreate,
    happyAgentNavigationOrderStoreCreate,
    happyAgentSidebarCollapseStoreCreate,
    happyAgentSettingsStoreCreate,
    type AppearanceStore,
    type ExperimentsStore,
    type WelcomeStore,
    type HappyAgentNavigationOrderStore,
    type HappyAgentSidebarCollapseStore,
    type HappyAgentSettingsStore,
    type TitleShimmerStore,
    type HappyAgentWindowStore,
} from "happy-desktop-state";
import {
    CodeHighlightWorkers,
    LocalOnboardingScreen,
    SetupPage,
    ThemeScope,
    AgentInstallScreen,
    ConnectionHeader,
    WelcomeScreen,
    ZoomIndicator,
    type AgentInstallView,
    type WelcomeSlide,
    type BrowserContentRenderer,
    type HtmlPreviewRenderer,
    type MediaWindowOpener,
} from "happy-desktop-ui";
import {
    mediaPreviewView,
    type DesktopConfig,
    type DesktopEditUndoRequest,
    type DesktopGuestKeyEvent,
    type DesktopRuntimeSnapshot,
    type DesktopUpdateSnapshot,
    type HappyDesktopBridge,
} from "../shared/desktopContract";
import { desktopStartRequestFromValues, desktopStartupValues } from "./desktopStartupModel";
import { dockUnreadPublish } from "./dockUnread";
import { desktopRuntimeStoreCreate, type DesktopRuntimeStore } from "./runtimeStore";
import {
    localOnboardingStoreCreate,
    localOnboardingView,
    type LocalOnboardingStore,
} from "./localOnboardingStore";
import {
    LOCAL_HAPPY_AGENT_ID,
    happyAgentDirectoryStoreCreate,
    type HappyAgentDirectoryStore,
} from "./happyAgentDirectoryStore";
import { startupValuesStoreCreate, type StartupValuesStore } from "./startupValuesStore";
import { browserDevBridgeCreate } from "./browserDevBridge";
import { localWebBuild } from "./localWebBuild";
import {
    localWebUpdateStoreCreate,
    type LocalWebUpdateSnapshot,
    type LocalWebUpdateStore,
} from "./localWebUpdateStore";
import { windowStateStoreCreate } from "./windowStateStore";
import { DesktopBrowserView } from "./desktopBrowserView";
import { DesktopHtmlPreviewView } from "./desktopHtmlPreviewView";
import { desktopPreferencesCreate } from "./desktopPreferences";
import { desktopHistoryPersistence } from "./desktopHistory";
import { desktopDebugStoreCreate } from "./desktopDebugStore";
import { desktopProfilerStoreCreate } from "./desktopProfilerStore";
import { desktopDaemonStoreCreate } from "./desktopDaemonStore";
import { desktopExperimentsPersistence } from "./desktopExperiments";
import { desktopWelcomePersistence } from "./desktopWelcome";
import {
    desktopHappyMobileOnboardingSkip,
    desktopHappyMobileOnboardingSkipped,
} from "./desktopHappyMobileOnboarding";
import { desktopNavigationOrderPersistence } from "./desktopNavigationOrder";
import { desktopSidebarCollapsePersistence } from "./desktopSidebarCollapse";
import { DesktopBootGate, desktopBootForget } from "./DesktopBootGate";
import {
    DesktopMediaPreviewWindow,
    desktopMediaPreviewEscapeBind,
    desktopMediaPreviewStoreCreate,
} from "./desktopMediaPreview";

/**
 * Hands one workspace file to the shell to show in a window of its own. The
 * shell decides whether the address is one of its Happy Agents' and refuses otherwise,
 * so a failure here is reported rather than retried against another route.
 */
function desktopMediaWindowOpen(bridge: HappyDesktopBridge): MediaWindowOpener {
    return (request) => {
        void bridge.mediaPreviewOpen(request.url).catch((error: unknown) => {
            console.error("Could not open the file in its own window.", error);
        });
    };
}

const desktopBrowserContentRender: BrowserContentRenderer = (props) => (
    <DesktopBrowserView {...props} />
);

const desktopHtmlPreviewRender: HtmlPreviewRenderer = (props) => (
    <DesktopHtmlPreviewView {...props} />
);

function desktopAction(operation: Promise<void>): void {
    void operation.catch(() => undefined);
}

/**
 * Publishes Happy's selected appearance source to Chromium. Electron applies it
 * process-wide, which is the boundary shared by browser guests, HTML previews,
 * and the separate media-preview window.
 */
function desktopAppearanceSynchronize(
    appearance: AppearanceStore,
    bridge: HappyDesktopBridge,
): void {
    let published: "dark" | "light" | "system" | undefined;
    const publish = () => {
        const mode = appearance.get().mode;
        if (mode === published) return;
        published = mode;
        bridge.appearanceSet(mode);
    };
    publish();
    appearance.subscribe(publish);
}

interface WorkspaceUpdate {
    readonly action: "install" | "refresh";
    readonly snapshot: AppHappyAgentUpdate;
}

function workspaceUpdate(
    native: DesktopUpdateSnapshot,
    hosted: LocalWebUpdateSnapshot,
): WorkspaceUpdate | undefined {
    if (
        native.status === "available" ||
        native.status === "downloading" ||
        native.status === "downloaded"
    )
        return {
            action: "install",
            snapshot: {
                action: "restart",
                ...(native.availableVersion ? { version: native.availableVersion } : {}),
                ...(native.message ? { detail: native.message } : {}),
                status: native.status,
            },
        };
    if (hosted.status !== "available") return undefined;
    const version =
        hosted.version !== localWebBuild?.version
            ? hosted.version
            : `build ${hosted.buildId.slice(0, 7)}`;
    return {
        action: "refresh",
        snapshot: { action: "refresh", status: "downloaded", version },
    };
}

function ChoosingScreen(props: {
    bridge: HappyDesktopBridge;
    update: DesktopUpdateSnapshot;
    values: StartupValuesStore;
}) {
    const values = useSyncExternalStore(props.values.subscribe, props.values.get, props.values.get);
    return (
        <DesktopStartupScreen
            onChange={props.values.change}
            onInstallUpdate={() => desktopAction(props.bridge.updateInstall())}
            onSubmit={() =>
                desktopAction(props.bridge.runtimeStart(desktopStartRequestFromValues(values)))
            }
            phase="choosing"
            update={props.update}
            values={values}
        />
    );
}

/**
 * Mounts the local workspace under its router once a connection exists. The
 * router owns which conversation is open, so the stores of a new connection are
 * handed to it as route context rather than as props to a screen.
 */
/**
 * Renders the whole desktop tree in the selected appearance. The store outlives
 * every daemon connection and every startup phase, so the startup screens and the
 * workspace are one themed subtree rather than two.
 */
function DesktopAppearance(props: { appearance: AppearanceStore; children: ReactNode }) {
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    return (
        <ThemeScope mode={appearance.mode} scrollbarVisibility={appearance.scrollbarVisibility}>
            {props.children}
        </ThemeScope>
    );
}

/**
 * Mounts the workspace router as soon as this window has a Happy Agent directory to
 * render. Which Happy Agent is on screen — and whether it has connected yet — is the
 * directory's business and the URL's, not this boundary's, so a machine that is
 * still connecting no longer holds the whole window on a startup screen.
 */
function HappyAgentBoundary(props: {
    appearance: AppearanceStore;
    daemon?: AppHappyAgentDaemonStore;
    debug: AppHappyAgentDebugStore;
    profiler: AppHappyAgentProfilerStore;
    bridge: HappyDesktopBridge;
    browserContent?: BrowserContentRenderer;
    htmlPreview?: HtmlPreviewRenderer;
    mediaWindow?: MediaWindowOpener;
    experiments: ExperimentsStore;
    platform: "desktop" | "web";
    router: HappyAgentRouter;
    navigationOrder: HappyAgentNavigationOrderStore;
    sidebarCollapse: HappyAgentSidebarCollapseStore;
    happyAgents: HappyAgentDirectoryStore;
    settings: HappyAgentSettingsStore;
    titleShimmer: TitleShimmerStore;
    update?: WorkspaceUpdate;
    windowState: HappyAgentWindowStore;
}) {
    const update = props.update;
    return (
        <RouterProvider
            context={{
                appearance: props.appearance,
                browserContent: props.browserContent,
                // A development window says which checkout it came from; the
                // packaged product supplies nothing and shows nothing.
                buildIdentity: props.bridge.buildIdentity,
                ...(props.daemon ? { daemon: props.daemon } : {}),
                debug: props.debug,
                profiler: props.profiler,
                htmlPreview: props.htmlPreview,
                mediaWindow: props.mediaWindow,
                ...(update
                    ? {
                          onUpdateApply: () => {
                              if (update.action === "install")
                                  desktopAction(props.bridge.updateInstall());
                              else window.location.reload();
                          },
                          update: update.snapshot,
                      }
                    : {}),
                experiments: props.experiments,
                navigationOrder: props.navigationOrder,
                sidebarCollapse: props.sidebarCollapse,
                platform: props.platform,
                happyAgents: props.happyAgents,
                settings: props.settings,
                titleShimmer: props.titleShimmer,
                windowState: props.windowState,
            }}
            router={props.router}
        />
    );
}

/**
 * First-run setup, while there is any of it left to do.
 *
 * Within local mode it does own the whole window until the machine can actually
 * run Happy Agent and the person has answered the questions that follow, so the
 * workspace below is never mounted against a machine that is not ready. Which
 * stage is on is the main process's answer, so a restart, an interrupted
 * install, or a Happy Agent that disappeared resumes here rather than in a remembered
 * position.
 */
function DesktopOnboardingGate(props: {
    appearance: AppearanceStore;
    children: ReactNode;
    store: LocalOnboardingStore;
    welcome: WelcomeStore;
}) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const welcome = useSyncExternalStore(
        props.welcome.subscribe,
        props.welcome.get,
        props.welcome.get,
    );
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    // Nothing has answered yet, so nothing is known to be owed. Deciding here
    // would put the welcome — a full-colour mark and a slogan — in front of a
    // machine that turns out to need no setup at all, for exactly as long as the
    // main process takes to say so. The boot cover holds the window meanwhile.
    if (!snapshot.onboarding) return null;
    const view = localOnboardingView(snapshot);
    if (!view) return <>{props.children}</>;
    // The welcome is only the deck. Entering setup acknowledges it and enables
    // the renderer-owned automatic download and launch; every machine operation
    // appears on the one setup surface that follows.
    if (!welcome.welcomeAcknowledged)
        return (
            <WelcomeScreen
                appearance={appearance.mode}
                backdrop={{ kind: "sky" }}
                onAction={() => {
                    props.store.agentSetupBegin();
                    props.welcome.welcomeAcknowledge();
                }}
                onAppearanceChange={(mode) => props.appearance.appearanceSelect(mode)}
                slides={WELCOME_SLIDES}
            />
        );
    return (
        <LocalOnboardingScreen
            appearance={appearance.mode}
            onAssistantsContinue={() => props.store.assistantsContinue()}
            onConnectRetry={() => props.store.connectRetry()}
            onHappyMobileConnect={() => props.store.happyMobileConnect()}
            onHappyMobileSkip={() => props.store.happyMobileSkip()}
            onProfileCreate={() => props.store.profileCreate()}
            onProfileEmailChange={(value) => props.store.profileEmailUpdate(value)}
            onProfileNameChange={(value) => props.store.profileNameUpdate(value)}
            onProjectChoose={() => props.store.projectChoose()}
            view={view}
        />
    );
}

/**
 * What Happy says for itself before it has been set up, in the order it says it.
 *
 * The words live here rather than in the component because they are the product
 * talking, not a layout: `WelcomeScreen` owns the centred column, the slideshow,
 * and the button, and this is the only place that decides what any of it means.
 * The order is the value hierarchy, not a feature tour. The mark names the
 * category and carries the whole summary: one harness for the whole team,
 * available in the terminal, on desktop, and on mobile. The next two slides
 * make the differentiators concrete — the team inside the live session first,
 * then every agent mixed in one harness. Open source and being yours to change
 * explain who controls the product; the final security slide closes with how
 * that control protects a corporate deployment and its mobile clients.
 */
const WELCOME_SLIDES: readonly WelcomeSlide[] = [
    {
        art: { kind: "logo" },
        copy: "Happy integrates models, teams, and compute into one secure, open-source harness—accessible from terminal, desktop, and mobile, deployable anywhere, and adaptable to your team.",
        id: "happy",
        title: "Any team. Any model. One harness.",
    },
    {
        art: { kind: "scene", name: "alien-monster" },
        copy: "Bring your team into one session with every agent. Anyone can share context, steer the conversation, approve decisions, and take over in real time.",
        id: "team",
        title: "Natively multiplayer",
    },
    {
        art: { kind: "scene", name: "llama" },
        copy: "Let Claude plan, Codex build, and Grok review—or run them side by side and compare. The context stays together across every handoff.",
        id: "mix",
        title: "One harness. Every agent.",
    },
    {
        art: { kind: "scene", name: "wand" },
        copy: "Happy is open source and built to be changed. Run it on your hardware, in your cloud, or in ours—then change Happy to fit your team’s needs.",
        id: "open",
        title: "Yours to run. Yours to change.",
    },
    {
        art: { kind: "scene", name: "closed-lock" },
        copy: "No telemetry. No third-party servers by default. Run Happy safely inside corporate networks without leaking data. Every connection between agents, teammates, and mobile clients is end-to-end encrypted.",
        id: "security",
        title: "Secure and compliant",
    },
];

/** True while the runtime is working on, or running, this machine's own Happy Agent. */
function desktopLocalPhase(snapshot: DesktopRuntimeSnapshot): boolean {
    if (snapshot.phase === "choosing") return false;
    if (snapshot.phase === "ready") return snapshot.mode === "local";
    return snapshot.request.mode === "local";
}

interface DesktopRendererProps {
    appearance: AppearanceStore;
    daemon?: AppHappyAgentDaemonStore;
    debug: AppHappyAgentDebugStore;
    profiler: AppHappyAgentProfilerStore;
    onboarding: LocalOnboardingStore;
    browserContent?: BrowserContentRenderer;
    htmlPreview?: HtmlPreviewRenderer;
    mediaWindow?: MediaWindowOpener;
    bridge: HappyDesktopBridge;
    experiments: ExperimentsStore;
    navigationOrder: HappyAgentNavigationOrderStore;
    sidebarCollapse: HappyAgentSidebarCollapseStore;
    platform: "desktop" | "web";
    happyAgentRouter: HappyAgentRouter;
    happyAgents: HappyAgentDirectoryStore;
    settings: HappyAgentSettingsStore;
    titleShimmer: TitleShimmerStore;
    startupValues: StartupValuesStore;
    store: DesktopRuntimeStore;
    welcome: WelcomeStore;
    localWebUpdate: LocalWebUpdateStore;
    windowState: HappyAgentWindowStore;
}

/**
 * The desktop's own screens: choosing where Happy should run, the startup and
 * failure states of that choice, and the workspace once a machine is connected.
 * First-run setup is layered over this rather than built into it, so the choice
 * itself is always reachable.
 */
function DesktopRenderer(props: DesktopRendererProps) {
    return (
        // Outside every screen below, so one mark spans the whole run-up to a
        // workspace instead of being unmounted and remounted as the window moves
        // between the screens that boot crosses.
        <DesktopBootGate
            onboarding={props.onboarding}
            happyAgents={props.happyAgents}
            runtime={props.store}
        >
            <DesktopScreens {...props} />
        </DesktopBootGate>
    );
}

function DesktopScreens(props: DesktopRendererProps) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const hostedUpdate = useSyncExternalStore(
        props.localWebUpdate.subscribe,
        props.localWebUpdate.get,
        props.localWebUpdate.get,
    );
    const content = (
        <DesktopProtocolGate
            onUpdateInstall={() => desktopAction(props.bridge.updateInstall())}
            // A runtime that is still choosing, starting, or failing answers for
            // itself, and those screens are the more actionable ones: a version
            // gap learned from an earlier connection must not talk over the
            // reason this one is not up. The gate stays mounted across that so
            // the workspace below it is never rebuilt by the change.
            ready={snapshot?.phase === "ready"}
            happyAgents={props.happyAgents}
            {...(props.daemon ? { daemon: props.daemon } : {})}
            {...(snapshot?.update ? { update: snapshot.update } : {})}
        >
            <DesktopRuntimeContent {...props} hostedUpdate={hostedUpdate} snapshot={snapshot} />
        </DesktopProtocolGate>
    );
    // Local setup gates the workspace until this machine can run Happy Agent.
    const gated =
        !snapshot || !desktopLocalPhase(snapshot) ? (
            content
        ) : (
            <DesktopOnboardingGate
                appearance={props.appearance}
                store={props.onboarding}
                welcome={props.welcome}
            >
                {content}
            </DesktopOnboardingGate>
        );
    // A restart is not gated here. It is not a state this tree can be in: the
    // tree is discarded for its duration and a new one is built afterwards, so
    // the screen for it lives above the root render rather than inside it.
    return gated;
}

/**
 * The workspace's own line about being out of touch with the machine.
 *
 * It reads the Happy Agent directory rather than any one surface, because losing the
 * machine is not a fact about a surface: every project, session, and terminal in
 * the workspace is equally out of reach, and saying so once at the top beats
 * saying it on each of them.
 *
 * It belongs to the workspace and settings alone. Every screen before them —
 * the welcome, first-run setup, choosing where Happy runs, starting, failing to
 * start, a protocol gap — is already the window's whole account of a machine
 * that is not connected, and a band repeating it above them would be a second
 * voice talking over the one the reader is meant to act on.
 *
 * Only a Happy Agent that has actually dropped gets a line. `connecting` is deliberately
 * silent — that is startup, and the boot cover is already speaking for it; a
 * band that appeared during every launch would mean nothing by the time it
 * mattered.
 */
function DesktopConnectionHeader(props: {
    platform: "desktop" | "web";
    happyAgents: HappyAgentDirectoryStore;
    windowState: HappyAgentWindowStore;
}) {
    const directory = useSyncExternalStore(
        props.happyAgents.subscribe,
        props.happyAgents.get,
        props.happyAgents.get,
    );
    const windowState = useSyncExternalStore(
        props.windowState.subscribe,
        props.windowState.get,
        props.windowState.get,
    );
    const lost = directory.happyAgents.find(
        (happyAgent) => happyAgent.status === "disconnected" || happyAgent.status === "error",
    );
    if (!lost) return null;
    return (
        <ConnectionHeader
            message={lost.message ?? `${lost.label} is unreachable.`}
            // An error has settled; a disconnect is still being retried by the
            // connection's own backoff, and the spinner is the difference.
            retrying={lost.status === "disconnected"}
            // Only the Electron window hides its title bar and so hands this
            // band the traffic lights; the browser development server draws web
            // chrome above it and needs neither the inset nor the drag lane.
            windowControls={props.platform === "desktop"}
            // Full screen takes the lights away, and the band shaped around
            // them has to hear about it: no store the band could read reports
            // this, and no CSS query asks it.
            windowFullScreen={windowState.fullScreen}
        />
    );
}

/**
 * The whole window while the local machine's Happy Agent is being replaced.
 *
 * This is the entire tree for as long as a restart runs — not a screen over the
 * app, but the app's replacement. It renders one thing from one store, and that
 * store reaches the main process directly, so nothing here depends on a Happy Agent, a
 * session, a project, or a connection. That is what lets the rest be thrown
 * away: there is nothing left holding a reference to the machine going down.
 *
 * Only ever the local host. A Happy Agent on another machine is restarted by whoever
 * owns it and never touches this window.
 */
function DesktopAgentRestartWindow(props: { daemon: AppHappyAgentDaemonStore }) {
    const daemon = useSyncExternalStore(props.daemon.subscribe, props.daemon.get, props.daemon.get);
    const view = agentInstallView(daemon.install);
    // The supervisor mounts this only while a restart is running and replaces it
    // the moment one is not, so this is unreachable in practice; rendering
    // nothing is the honest answer for the frame that could sit between the two.
    if (!view) return null;
    return (
        <AgentInstallScreen
            onDismiss={props.daemon.daemonInstallDismiss}
            onKill={props.daemon.daemonInstallKill}
            view={view}
        />
    );
}

/** The restart as the screen takes it, or nothing while none is running. */
function agentInstallView(install: AppHappyAgentDaemonInstall): AgentInstallView | undefined {
    switch (install.phase) {
        case "idle":
            return undefined;
        case "draining":
            return {
                killable: install.killable,
                kind: "draining",
                reason: install.reason,
                version: install.version,
                waitingFor: install.waitingFor,
                waitingPeak: install.waitingPeak,
            };
        case "stopping":
            return {
                killed: install.killed,
                kind: "stopping",
                reason: install.reason,
                version: install.version,
            };
        case "starting":
        case "reconnecting":
            return { kind: install.phase, reason: install.reason, version: install.version };
        case "error":
            return {
                failedAt: install.failedAt,
                kind: "error",
                message: install.message,
                reason: install.reason,
                version: install.version,
            };
    }
}

/**
 * The window when this build and the host's Happy Agent cannot read each other.
 *
 * Every other unavailability in Happy belongs beside the Happy Agent it affects, and
 * this one deliberately does not. A version gap is not a connection that might
 * come back: the daemon is up, answering, and speaking a protocol this build has
 * no code for, so nothing behind this screen would work and nothing anyone does
 * in it would change that. Waiting is not one of the options, which is why it is
 * not shown as a state to wait in.
 *
 * It is the host alone. A node with the same gap is one machine of several
 * whose work is missing while the rest of the app still does its job, so that
 * stays a notice beside that node.
 */
function DesktopProtocolGate(props: {
    children: ReactNode;
    daemon?: AppHappyAgentDaemonStore;
    onUpdateInstall(): void;
    /** False while the runtime still owns the window with a screen of its own. */
    ready: boolean;
    happyAgents: HappyAgentDirectoryStore;
    update?: DesktopUpdateSnapshot;
}) {
    const directory = useSyncExternalStore(
        props.happyAgents.subscribe,
        props.happyAgents.get,
        props.happyAgents.get,
    );
    const daemonStore = props.daemon ?? unavailableDaemonStore;
    const daemon = useSyncExternalStore(daemonStore.subscribe, daemonStore.get, daemonStore.get);
    const mismatch = props.ready
        ? directory.happyAgents.find((happyAgent) => happyAgent.id === LOCAL_HAPPY_AGENT_ID)
              ?.protocolMismatch
        : undefined;
    if (!mismatch) return <>{props.children}</>;
    // Happy is behind. It updates itself, so the only useful thing on screen is
    // the update it already has — and, until it has one, the plain fact. The
    // button arrives here on its own when the download lands, because this
    // screen is drawn from the same runtime snapshot the updater publishes to.
    if (mismatch.side === "app") {
        const downloaded = props.update?.status === "downloaded";
        return (
            <SetupPage
                {...(downloaded
                    ? {
                          action: {
                              label: "Install update and restart",
                              onSelect: props.onUpdateInstall,
                          },
                      }
                    : {})}
                copy={`Happy Agent on this machine speaks protocol ${mismatch.serverProtocolVersion}, and this build of Happy reads up to ${mismatch.supportedMaximum}. ${
                    downloaded
                        ? "The update is downloaded and ready to install."
                        : "Happy is looking for its own update and will offer it here as soon as it has one."
                }`}
                data-testid="desktop-protocol-screen"
                scene="owl"
                title="Happy is out of date"
            />
        );
    }
    const upgrading = daemon.operation === "upgrading";
    return (
        <SetupPage
            {...(daemon.updateAvailable || upgrading
                ? {
                      action: {
                          busy: upgrading,
                          label: upgrading
                              ? "Updating Happy Agent…"
                              : `Update to ${daemon.availableVersion ?? "latest"}`,
                          onSelect: daemonStore.daemonUpgrade,
                      },
                  }
                : {})}
            copy={`Happy Agent on this machine speaks protocol ${mismatch.serverProtocolVersion}, and this build of Happy needs at least ${mismatch.supportedMinimum}. ${
                !daemon.managed
                    ? "This daemon is supplied by an external development environment; update it there and reconnect."
                    : daemon.error
                      ? `Happy could not check for its update: ${daemon.error}`
                      : daemon.updateAvailable || upgrading
                        ? "Install the verified update to reconnect with the current protocol."
                        : "Happy is checking for a compatible update automatically."
            }`}
            data-testid="desktop-protocol-screen"
            scene="owl"
            title="Happy Agent is out of date"
        />
    );
}

const unavailableDaemonSnapshot = {
    install: { phase: "idle" },
    managed: false,
    operation: "idle",
    runtime: "stopped",
    updateAvailable: false,
    versions: [],
} as const;
const unavailableDaemonStore: AppHappyAgentDaemonStore = {
    daemonCheck: () => undefined,
    daemonInstall: () => undefined,
    daemonInstallDismiss: () => undefined,
    daemonInstallKill: () => undefined,
    daemonRestart: () => undefined,
    daemonUpgrade: () => undefined,
    daemonVersionSelect: () => undefined,
    get: () => unavailableDaemonSnapshot,
    subscribe: () => () => undefined,
};

function DesktopRuntimeContent(
    props: DesktopRendererProps & {
        hostedUpdate: LocalWebUpdateSnapshot;
        snapshot: DesktopRuntimeSnapshot | undefined;
    },
) {
    const { hostedUpdate, snapshot } = props;
    if (!snapshot)
        return (
            <DesktopStartupScreen
                message="Reading desktop settings…"
                onChange={() => undefined}
                onSubmit={() => undefined}
                phase="starting"
                values={desktopStartupValues()}
            />
        );
    if (snapshot.phase === "choosing")
        return (
            <ChoosingScreen
                bridge={props.bridge}
                update={snapshot.update}
                values={props.startupValues}
            />
        );
    if (snapshot.phase === "starting")
        return (
            <DesktopStartupScreen
                message={snapshot.message}
                onChange={() => undefined}
                onInstallUpdate={() => desktopAction(props.bridge.updateInstall())}
                onSubmit={() => undefined}
                phase="starting"
                update={snapshot.update}
                values={desktopStartupValues(snapshot.request)}
            />
        );
    if (snapshot.phase === "error")
        return (
            <DesktopStartupScreen
                error={snapshot.message}
                onChange={() => undefined}
                onInstallUpdate={() => desktopAction(props.bridge.updateInstall())}
                onRetry={
                    snapshot.retryable
                        ? () => desktopAction(props.bridge.runtimeRetry())
                        : undefined
                }
                onSubmit={() => undefined}
                phase="error"
                update={snapshot.update}
                values={desktopStartupValues(snapshot.request)}
            />
        );

    // The workspace is mounted, so this is the first screen a dropped machine
    // can be reported against: the band is its outermost row and moves every
    // surface in it down rather than covering any of them.
    return (
        <div className="happy-connection-frame">
            <DesktopConnectionHeader
                platform={props.platform}
                happyAgents={props.happyAgents}
                windowState={props.windowState}
            />
            <div className="happy-connection-frame__body">
                <HappyAgentBoundary
                    appearance={props.appearance}
                    bridge={props.bridge}
                    {...(props.daemon ? { daemon: props.daemon } : {})}
                    debug={props.debug}
                    profiler={props.profiler}
                    browserContent={props.browserContent}
                    htmlPreview={props.htmlPreview}
                    mediaWindow={props.mediaWindow}
                    experiments={props.experiments}
                    navigationOrder={props.navigationOrder}
                    sidebarCollapse={props.sidebarCollapse}
                    platform={props.platform}
                    router={props.happyAgentRouter}
                    happyAgents={props.happyAgents}
                    settings={props.settings}
                    titleShimmer={props.titleShimmer}
                    update={workspaceUpdate(snapshot.update, hostedUpdate)}
                    windowState={props.windowState}
                />
            </div>
        </div>
    );
}

// Browser-local dev mode is signalled by a CSP-safe meta tag the dev server
// injects (an inline script would be blocked by the page's script-src policy).
const browserLocal =
    document.querySelector('meta[name="happy-browser-local"]')?.getAttribute("content") === "1";
const bridge = window.happyDesktop ?? (browserLocal ? browserDevBridgeCreate() : undefined);
const root = createRoot(document.getElementById("root")!);

/* The View menu owns zooming, so `bridge` is the only thing that hears of it.
   What is counted is how many times zoom was asked for, not what it came to:
   the count is the React key, so pressing ⌘0 twice at 100% shows the read-out
   twice, where keying on the percentage would remount nothing the second time
   and leave the fade to finish silently. Zero asks is a cold start, which shows
   nothing. The percentage is written in the same tick as the count. */
let zoomAsks = 0;
let zoomPercent = 100;
const zoomSubscribe = (listener: () => void) => {
    if (!bridge) return () => {};
    return bridge.zoomSubscribe((percent) => {
        zoomAsks += 1;
        zoomPercent = percent;
        listener();
    });
};

function DesktopZoomIndicator(): ReactNode {
    const asks = useSyncExternalStore(zoomSubscribe, () => zoomAsks);
    return asks === 0 ? undefined : <ZoomIndicator key={asks} percent={zoomPercent} />;
}
// The preview window is this same document, launched with the reduced bridge and
// loaded with the view it should mount. Deciding it here rather than after a
// round trip means the first frame is already the file instead of the whole
// application appearing for a beat.
const mediaPreviewBridge =
    new URLSearchParams(location.search).get(mediaPreviewView.key) === mediaPreviewView.value
        ? window.happyMediaPreview
        : undefined;
if (mediaPreviewBridge) {
    const previewBridge = mediaPreviewBridge;
    desktopMediaPreviewEscapeBind(previewBridge);
    root.render(
        <DesktopAppearance appearance={appearanceStoreCreate()}>
            <DesktopMediaPreviewWindow store={desktopMediaPreviewStoreCreate(previewBridge)} />
        </DesktopAppearance>,
    );
} else if (bridge) {
    const desktopBridge = bridge;
    const focusedKeyboardTarget = (): HTMLElement | Window =>
        document.activeElement instanceof HTMLElement ? document.activeElement : window;
    const guestKeyUnsubscribe = desktopBridge.guestKeySubscribe((input: DesktopGuestKeyEvent) => {
        focusedKeyboardTarget().dispatchEvent(
            new KeyboardEvent(input.type, {
                altKey: input.altKey,
                bubbles: true,
                cancelable: true,
                code: input.code,
                ctrlKey: input.ctrlKey,
                isComposing: input.isComposing,
                key: input.key,
                location: input.location,
                metaKey: input.metaKey,
                repeat: input.repeat,
                shiftKey: input.shiftKey,
            }),
        );
    });
    const editUndoUnsubscribe =
        desktopBridge.editUndoSubscribe?.((request: DesktopEditUndoRequest) => {
            const event = new KeyboardEvent("keydown", {
                bubbles: true,
                cancelable: true,
                code: "KeyZ",
                ctrlKey: request.ctrlKey,
                key: "z",
                metaKey: request.metaKey,
            });
            focusedKeyboardTarget().dispatchEvent(event);
            return event.defaultPrevented;
        }) ?? (() => undefined);
    window.addEventListener("unload", guestKeyUnsubscribe, { once: true });
    window.addEventListener("unload", editUndoUnsubscribe, { once: true });
    /**
     * The two stores that outlive the app itself.
     *
     * Everything else in `start` is rebuilt from nothing by an agent restart, so
     * these are the only things held apart from it. The daemon store has to be:
     * it is what reports the restart, and a store discarded by the teardown
     * could not tell anyone the restart had finished. Appearance is held for a
     * plainer reason — the window must not flash to another theme on its way
     * through a restart it was asked to perform.
     */
    interface DesktopShellStores {
        readonly appearance: AppearanceStore;
        readonly daemon?: AppHappyAgentDaemonStore;
    }
    let shell: DesktopShellStores | undefined;
    /**
     * What the current app registered outside its own React tree.
     *
     * Unmounting drops every store the tree subscribed to, but a shell listener
     * and a window event listener are not the tree's to drop — nothing would
     * ever remove them, and the next `start` would add a second set pointing at
     * the history and directory the first set is still holding. Back would then
     * walk twice per press. Everything registered by a run of `start` is
     * recorded here and undone before the next one begins.
     */
    const appDisposers: (() => void)[] = [];
    const appDispose = (): void => {
        for (const dispose of appDisposers.splice(0)) dispose();
    };
    /**
     * Throws the whole app away for the duration of an agent restart, then
     * builds a brand new one.
     *
     * The machine every surface in this window is a view of is being stopped.
     * Nothing rendered against it stays true across that: sessions end,
     * subscriptions point at a daemon that is gone, and what comes back is a
     * different process that may not even be the same version. Reconciling all
     * of that in place is work with no reader — the person asked for this and is
     * watching the restart, not the workspace behind it.
     *
     * So the restart screen replaces the tree outright rather than covering it.
     * React unmounts everything under the root, every store and connection
     * created by `start` is dropped on the floor, and the screen that remains
     * holds no product state at all — it renders the daemon's own report of
     * itself and nothing else.
     *
     * When it is over, `start` runs again from the top against the new daemon.
     * That is a cold boot in every sense that matters, so `desktopBootForget`
     * lets the ordinary boot cover do its ordinary job while the fresh app
     * connects and reads its state back.
     *
     * This is the deliberate exception to the multiple-happy-agents plan's rule against
     * connection-driven app loaders. The rule exists so an arbitrary network
     * failure cannot take someone's work away; this is not one. It happens only
     * because a person asked for it, only for the machine-local agent, and never
     * for a Happy Agent that merely went quiet.
     */
    const restartSupervise = (config: DesktopConfig, daemon: AppHappyAgentDaemonStore): void => {
        let covering = false;
        daemon.subscribe(() => {
            const running = daemon.get().install.phase !== "idle";
            if (running === covering) return;
            covering = running;
            if (running) {
                root.render(
                    <DesktopAppearance appearance={shell!.appearance}>
                        <DesktopAgentRestartWindow daemon={daemon} />
                    </DesktopAppearance>,
                );
                return;
            }
            desktopBootForget();
            appDispose();
            start(config);
        });
    };
    const start = (config: DesktopConfig): void => {
        const runtimeStore = desktopRuntimeStoreCreate(desktopBridge);
        // Whether this machine's owner has been welcomed. Acknowledging this
        // deck enters machine setup; it does not wait for machine work to finish.
        const welcome = welcomeStoreCreate(desktopWelcomePersistence());
        // First-run setup outlives every daemon connection this window makes, so
        // its store is created once here beside the runtime store.
        const onboardingStore = localOnboardingStoreCreate(desktopBridge, {
            agentSetupActive: welcome.get().welcomeAcknowledged,
            happyMobileSkipped: desktopHappyMobileOnboardingSkipped(),
            onHappyMobileSkip: desktopHappyMobileOnboardingSkip,
        });
        // The local router outlives any single daemon connection, so it is created
        // here and the session store navigates through it when a conversation it
        // created should be opened.
        const happyAgentHistory = happyAgentHistoryCreate({
            persistence: desktopHistoryPersistence(),
        });
        const happyAgentRouter = happyAgentRouterCreate(happyAgentHistory);
        // Where the Happy Social account is shown, which is the Profile category.
        const cloudAuthCallbackOpen = (): void => happyAgentHistory.replace("/settings/profile");
        appDisposers.push(desktopBridge.cloudAuthCallbackSubscribe(cloudAuthCallbackOpen));
        desktopAction(
            desktopBridge.cloudAuthCallbackPending().then((pending) => {
                if (pending) cloudAuthCallbackOpen();
            }),
        );
        // The shell's Back and Forward arrive as a direction and are walked here.
        appDisposers.push(
            desktopBridge.navigationStepSubscribe((step) => {
                if (step.direction === "back") happyAgentHistory.back();
                else happyAgentHistory.forward();
            }),
        );
        // Chromium acts on macOS side buttons after mouseup, before auxclick is
        // guaranteed to arrive. Claim them in capture so only our stack moves.
        const sideButtonWalk = (event: MouseEvent): void => {
            if (event.button !== 3 && event.button !== 4) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.button === 3) happyAgentHistory.back();
            else happyAgentHistory.forward();
        };
        window.addEventListener("mouseup", sideButtonWalk, { capture: true });
        appDisposers.push(() =>
            window.removeEventListener("mouseup", sideButtonWalk, { capture: true }),
        );
        // Appearance, title motion, and model choices share one durable desktop
        // document. The adapter keeps its current value synchronous so writes
        // from any product store preserve changes already made by the others.
        const preferences = desktopPreferencesCreate(desktopBridge, config);
        // Appearance is chosen for the window, not for one connection, so the store is
        // created here beside the router and outlives both — and outlives the app
        // itself, along with the daemon store, for the reasons given at `shell`.
        shell ??= ((): DesktopShellStores => {
            const created = appearanceStoreCreate({
                mode: preferences.initialAppearance,
                scrollbarVisibility: preferences.initialScrollbarVisibility,
            });
            desktopAppearanceSynchronize(created, desktopBridge);
            created.subscribe(() => {
                const snapshot = created.get();
                preferences.appearanceChanged(snapshot.mode, snapshot.scrollbarVisibility);
            });
            const store = browserLocal ? undefined : desktopDaemonStoreCreate(desktopBridge);
            if (store) restartSupervise(config, store);
            return { appearance: created, ...(store ? { daemon: store } : {}) };
        })();
        const { appearance, daemon } = shell;
        const debug = desktopDebugStoreCreate(desktopBridge);
        const profiler = desktopProfilerStoreCreate(desktopBridge);
        // Defaults and model picker memory belong to the desktop, not one daemon.
        // The state stores stay synchronous while the bridge persists their typed
        // snapshots through the main process.
        const settings = happyAgentSettingsStoreCreate(preferences.initialSettings);
        appDisposers.push(settings.subscribe(() => preferences.settingsChanged(settings.get())));
        // How the reader arranged the sidebar's pinned rows. It is the window's
        // Those rows are window chrome whether or not any machine is reachable,
        // so the arrangement must outlive every connection this window makes.
        const navigationOrder = happyAgentNavigationOrderStoreCreate(
            desktopNavigationOrderPersistence(),
        );
        // Which projects the reader folded shut, kept beside that arrangement
        // and for the same reason: a fold is about this window's
        // sidebar, so no machine coming or going may undo it.
        const sidebarCollapse = happyAgentSidebarCollapseStoreCreate(
            desktopSidebarCollapsePersistence(),
        );
        // Whether this window offers the features that are not finished yet. It
        // is kept beside the arrangement above and for the same reason: it says
        // what this installation shows, so no machine has a say in it.
        const experiments = experimentsStoreCreate(desktopExperimentsPersistence());
        // Active-title motion is also this window's own choice. The store keeps
        // the product default in memory and writes only after the reader changes
        // the switch, so untouched installations follow future defaults.
        const titleShimmer = titleShimmerStoreCreate(preferences.titleShimmerPersistence);
        // Every Happy Agent in this window, each with its own product stores. The router is
        // told to resolve its address again whenever the set of connected Happy Agents
        // changes, so a machine that connects after the URL already named it opens
        // the addressed conversation without the reader navigating twice.
        const happyAgents = happyAgentDirectoryStoreCreate(desktopBridge, runtimeStore, {
            conversationOpen: (happyAgentId, location) =>
                happyAgentRouterConversationOpen(happyAgentRouter, happyAgentId, location),
            groupOpen: (happyAgentId, groupId) =>
                happyAgentRouterGroupOpen(happyAgentRouter, happyAgentId, groupId),
            groupForget: (happyAgentId, groupId) =>
                happyAgentRouterGroupForget(happyAgentRouter, happyAgentId, groupId),
            modelPreferencePersistence: preferences.preferencePersistence,
            // A shell is told which background it is drawing on when it starts and
            // never hears about it again, so every terminal takes the appearance
            // showing at the moment it is opened and keeps it.
            terminalColorScheme: () => appearance.get().appearance,
        });
        let materialized = "";
        appDisposers.push(
            happyAgents.subscribe(() => {
                const current = happyAgents
                    .get()
                    .happyAgents.map(
                        (happyAgent) => `${happyAgent.id}:${happyAgent.session ? "up" : "down"}`,
                    )
                    .join(",");
                if (current === materialized) return;
                materialized = current;
                void happyAgentRouter.invalidate();
            }),
        );
        // What is waiting for the person is a fact about the whole window, not
        // about the screen that happens to be open, so the Dock is marked from
        // the same directory the sidebar reads rather than from any one Happy Agent.
        appDisposers.push(
            dockUnreadPublish(happyAgents, (count) => desktopBridge.dockUnreadSet(count)),
        );
        // This window renders the Happy Agent tree directly rather than through `App`, so
        // it has to start the highlighting pool itself: without this the file
        // viewer and every diff in the primary desktop surface tokenize on the
        // main thread, which is exactly where a large file must not be parsed.
        root.render(
            <DesktopAppearance appearance={appearance}>
                <DesktopZoomIndicator />
                <CodeHighlightWorkers>
                    <DesktopRenderer
                        appearance={appearance}
                        {...(daemon ? { daemon } : {})}
                        debug={debug}
                        profiler={profiler}
                        onboarding={onboardingStore}
                        browserContent={browserLocal ? undefined : desktopBrowserContentRender}
                        htmlPreview={browserLocal ? undefined : desktopHtmlPreviewRender}
                        bridge={desktopBridge}
                        mediaWindow={
                            browserLocal ? undefined : desktopMediaWindowOpen(desktopBridge)
                        }
                        experiments={experiments}
                        navigationOrder={navigationOrder}
                        sidebarCollapse={sidebarCollapse}
                        // Only the Electron window hides its title bar; the browser
                        // development server renders the same tree with web chrome.
                        platform={browserLocal ? "web" : "desktop"}
                        happyAgentRouter={happyAgentRouter}
                        happyAgents={happyAgents}
                        localWebUpdate={localWebUpdateStoreCreate(localWebBuild)}
                        settings={settings}
                        titleShimmer={titleShimmer}
                        startupValues={startupValuesStoreCreate()}
                        store={runtimeStore}
                        welcome={welcome}
                        windowState={windowStateStoreCreate(desktopBridge)}
                    />
                </CodeHighlightWorkers>
            </DesktopAppearance>,
        );
    };
    void desktopBridge.desktopConfigGet().then(start, (error: unknown) => {
        console.error("Could not read desktop preferences.", error);
        start({
            appearance: "system",
            defaultEffort: HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
            defaultPermissionMode: "auto",
            modelPreferences: [],
            scrollbarVisibility: "automatic",
            version: 1,
        });
    });
}
