import type { LocalOnboardingAssistant, LocalOnboardingView } from "happy-desktop-ui";
import {
    HappyAgentClient,
    type HappyMobileOnboardingSnapshot,
    type HappyMobileOnboardingStore,
} from "happy-desktop-state";
import type {
    DesktopDaemonSnapshot,
    DesktopRuntimeSnapshot,
    HappyDesktopBridge,
    LocalAssistantState,
    LocalOnboardingSnapshot,
} from "../shared/desktopContract";

type ProviderAuthenticationResult = "checking" | "valid" | "invalid" | "error";

interface ProviderAuthenticationSnapshot {
    readonly claude?: ProviderAuthenticationResult;
    readonly codex?: ProviderAuthenticationResult;
    readonly complete: boolean;
    readonly grok?: ProviderAuthenticationResult;
    readonly key?: string;
}

export interface LocalOnboardingViewSnapshot {
    readonly onboarding?: LocalOnboardingSnapshot;
    readonly daemon?: DesktopDaemonSnapshot;
    readonly runtime?: DesktopRuntimeSnapshot;
    /** Authentication-level daemon checks for the binaries the shell found. */
    readonly providerAuthentication: ProviderAuthenticationSnapshot;
    /** The renderer has asked the verified first release to start. */
    readonly agentStarting: boolean;
    /** True while a request this window made is still in flight. */
    readonly pending: boolean;
    /** Why the last request could not be delivered, until another is made. */
    readonly failure?: string;
    readonly profileName: string;
    readonly profileEmail: string;
    /** The optional mobile step, materialized only before the first project. */
    readonly happyMobile?: HappyMobileOnboardingSnapshot;
}

export interface LocalOnboardingStore {
    get(): LocalOnboardingViewSnapshot;
    subscribe(listener: () => void): () => void;
    connectRetry(): void;
    /** Enters machine setup and allows its automatic download and launch to begin. */
    agentSetupBegin(): void;
    projectChoose(): void;
    assistantsContinue(): void;
    profileNameUpdate(value: string): void;
    profileEmailUpdate(value: string): void;
    profileCreate(): void;
    happyMobileConnect(): void;
    happyMobileSkip(): void;
}

export interface LocalOnboardingStoreOptions {
    /** The local connection owns mobile setup and its shared realtime transport. */
    readonly happyMobile: {
        get(): HappyMobileOnboardingStore | undefined;
        subscribe(listener: () => void): () => void;
    };
    /** True when the welcome was acknowledged before this window opened. */
    readonly agentSetupActive?: boolean;
}

const downloadRetryMinimumMs = 3_000;
const downloadRetryMaximumMs = 30_000;
const startRetryMinimumMs = 3_000;
const startRetryMaximumMs = 30_000;

/**
 * The window's view of first-run setup: one coarse bridge subscription for the
 * durable stage.
 *
 * The shell exposes daemon state and two narrow capabilities; this surface owns
 * the first-run policy that uses them. Once the welcome hands the window to
 * machine setup, it begins and retries the harmless download, then starts the
 * verified release as soon as it is ready. Native work, durable stages, and
 * validation remain in the shell.
 */
export function localOnboardingStoreCreate(
    bridge: HappyDesktopBridge,
    options: LocalOnboardingStoreOptions,
): LocalOnboardingStore {
    const listeners = new Set<() => void>();
    let snapshot: LocalOnboardingViewSnapshot = {
        agentStarting: false,
        pending: false,
        profileEmail: "",
        profileName: "",
        providerAuthentication: { complete: false },
    };
    let bridgeUnsubscribe: (() => void) | undefined;
    let daemonUnsubscribe: (() => void) | undefined;
    let runtimeUnsubscribe: (() => void) | undefined;
    let downloadInFlight = false;
    let downloadRetry: ReturnType<typeof setTimeout> | undefined;
    let downloadRetryMs = downloadRetryMinimumMs;
    let startInFlight = false;
    let startRetry: ReturnType<typeof setTimeout> | undefined;
    let startRetryMs = startRetryMinimumMs;
    let eventReceived = false;
    let daemonEventReceived = false;
    let runtimeEventReceived = false;
    let verificationAbort: AbortController | undefined;
    let happyMobileStore: HappyMobileOnboardingStore | undefined;
    let happyMobileUnsubscribe: (() => void) | undefined;
    let happyMobileSourceUnsubscribe: (() => void) | undefined;
    let inFlight = 0;
    let agentSetupActive = options.agentSetupActive === true;

    const publish = (next: LocalOnboardingViewSnapshot) => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const onboardingSet = (next: LocalOnboardingSnapshot) => {
        if (Object.is(snapshot.onboarding, next)) return;
        publish({
            ...snapshot,
            onboarding: next,
        });
        setupSynchronize();
    };
    const daemonSet = (next: DesktopDaemonSnapshot) => {
        if (Object.is(snapshot.daemon, next)) return;
        publish({
            ...snapshot,
            daemon: next,
        });
        setupSynchronize();
    };
    const runtimeSet = (next: DesktopRuntimeSnapshot) => {
        if (Object.is(snapshot.runtime, next)) return;
        publish({
            ...snapshot,
            runtime: next,
        });
        setupSynchronize();
    };
    /**
     * Sends one request and reports what happened to it. A bridge call that
     * rejects is the shell refusing — a stale window, a step that is no longer
     * current — and saying so is the only way the person is not left pressing an
     * inert button.
     */
    const attempt = (operation: Promise<unknown>, failure: string) => {
        inFlight += 1;
        publish({ ...snapshot, failure: undefined, pending: true });
        void operation.then(
            () => {
                inFlight -= 1;
                publish({ ...snapshot, pending: inFlight > 0 });
            },
            (error: unknown) => {
                inFlight -= 1;
                publish({
                    ...snapshot,
                    failure: `${failure} ${errorMessage(error)}`,
                    pending: inFlight > 0,
                });
            },
        );
    };

    const downloadRetryStop = () => {
        if (!downloadRetry) return;
        clearTimeout(downloadRetry);
        downloadRetry = undefined;
    };
    const downloadBegin = () => {
        if (downloadInFlight) return;
        downloadRetryStop();
        downloadInFlight = true;
        if (snapshot.failure) publish({ ...snapshot, failure: undefined });
        void bridge
            .daemonDownload()
            .catch((error: unknown) => {
                publish({
                    ...snapshot,
                    failure: `Happy could not download Happy Agent. ${errorMessage(error)}`,
                });
            })
            .finally(() => {
                downloadInFlight = false;
                setupSynchronize();
            });
    };
    function downloadSynchronize() {
        const onboarding = snapshot.onboarding;
        const daemon = snapshot.daemon;
        if (
            listeners.size === 0 ||
            !agentSetupActive ||
            onboarding?.stage !== "daemonDownload" ||
            !daemon ||
            daemon.installation !== "missing" ||
            daemon.readyVersion !== undefined
        ) {
            downloadRetryStop();
            downloadRetryMs = downloadRetryMinimumMs;
            return;
        }
        if (
            downloadInFlight ||
            daemon.operation === "downloading" ||
            daemon.operation === "installing" ||
            downloadRetry
        )
            return;
        if (daemon.error || snapshot.failure) {
            const delay = downloadRetryMs;
            downloadRetryMs = Math.min(downloadRetryMaximumMs, downloadRetryMs * 2);
            downloadRetry = setTimeout(() => {
                downloadRetry = undefined;
                downloadBegin();
            }, delay);
            return;
        }
        downloadBegin();
    }

    const startRetryStop = () => {
        if (!startRetry) return;
        clearTimeout(startRetry);
        startRetry = undefined;
    };
    const startBegin = () => {
        if (startInFlight) return;
        startRetryStop();
        startInFlight = true;
        publish({ ...snapshot, agentStarting: true, failure: undefined });
        void bridge
            .daemonStart()
            .catch((error: unknown) => {
                publish({
                    ...snapshot,
                    failure: `Happy could not start Happy Agent. ${errorMessage(error)}`,
                });
            })
            .finally(() => {
                startInFlight = false;
                publish({ ...snapshot, agentStarting: false });
                setupSynchronize();
            });
    };
    function startSynchronize() {
        const onboarding = snapshot.onboarding;
        const daemon = snapshot.daemon;
        if (
            listeners.size === 0 ||
            !agentSetupActive ||
            onboarding?.stage !== "daemonDownload" ||
            !daemon ||
            daemon.installation !== "missing" ||
            daemon.readyVersion === undefined
        ) {
            startRetryStop();
            startRetryMs = startRetryMinimumMs;
            return;
        }
        if (startInFlight || daemon.operation === "installing" || startRetry) return;
        if (daemon.error || snapshot.failure) {
            const delay = startRetryMs;
            startRetryMs = Math.min(startRetryMaximumMs, startRetryMs * 2);
            startRetry = setTimeout(() => {
                startRetry = undefined;
                startBegin();
            }, delay);
            return;
        }
        startBegin();
    }
    function setupSynchronize() {
        downloadSynchronize();
        startSynchronize();
        providerAuthenticationSynchronize();
        happyMobileSynchronize();
    }

    const happyMobileStop = () => {
        happyMobileUnsubscribe?.();
        happyMobileUnsubscribe = undefined;
        happyMobileStore = undefined;
        if (snapshot.happyMobile) publish({ ...snapshot, happyMobile: undefined });
    };

    function happyMobileSynchronize() {
        const onboarding = snapshot.onboarding;
        const runtime = snapshot.runtime;
        if (
            listeners.size === 0 ||
            !onboarding ||
            onboarding.stage === "inactive" ||
            onboarding.stage === "complete" ||
            runtime?.phase !== "ready" ||
            runtime.mode !== "local"
        ) {
            happyMobileStop();
            return;
        }
        const store = options.happyMobile.get();
        if (happyMobileStore === store) return;
        happyMobileStop();
        if (!store) return;
        happyMobileStore = store;
        publish({ ...snapshot, happyMobile: store.get() });
        happyMobileUnsubscribe = store.subscribe(() => {
            if (happyMobileStore !== store) return;
            publish({ ...snapshot, happyMobile: store.get() });
        });
    }

    function providerAuthenticationSynchronize() {
        const onboarding = snapshot.onboarding;
        const runtime = snapshot.runtime;
        if (
            listeners.size === 0 ||
            (onboarding?.stage !== "providersMissing" && onboarding?.stage !== "assistantsFound") ||
            runtime?.phase !== "ready" ||
            runtime.mode !== "local"
        ) {
            verificationAbort?.abort();
            verificationAbort = undefined;
            return;
        }
        const assistants = onboarding.assistants ?? [];
        const binaries = assistants.filter((assistant) => assistant.status === "found");
        const key = `${String(runtime.connectionId)}|${assistants
            .map((assistant) => `${assistant.id}:${assistant.status}`)
            .join(",")}`;
        if (snapshot.providerAuthentication.key === key) return;

        verificationAbort?.abort();
        const abort = new AbortController();
        verificationAbort = abort;
        publish({
            ...snapshot,
            providerAuthentication: {
                claude: binaryAuthenticationInitial(assistants, "claude"),
                codex: binaryAuthenticationInitial(assistants, "codex"),
                complete: binaries.length === 0,
                grok: binaryAuthenticationInitial(assistants, "grok"),
                key,
            },
        });
        if (binaries.length === 0) return;

        const client = new HappyAgentClient({
            endpoint: runtime.activeTarget.happyAgentHttpUrl,
            token: "happy-local-capability",
        });
        void client
            .scanProviders({ signal: abort.signal })
            // Scanning refreshes daemon discovery, but a failed scan does not
            // answer whether an already configured provider authenticates.
            .catch(() => undefined)
            .then(() =>
                Promise.all(
                    binaries.map(async (assistant) => {
                        try {
                            const result = await client.verifyProvider(
                                assistant.id,
                                { level: "authentication" },
                                { signal: abort.signal },
                            );
                            return {
                                id: assistant.id,
                                result:
                                    result.status === "passed" &&
                                    result.performedLevel === "authentication"
                                        ? ("valid" as const)
                                        : ("invalid" as const),
                            };
                        } catch {
                            return { id: assistant.id, result: "error" as const };
                        }
                    }),
                ),
            )
            .then((results) => {
                if (
                    abort.signal.aborted ||
                    snapshot.providerAuthentication.key !== key ||
                    listeners.size === 0
                )
                    return;
                publish({
                    ...snapshot,
                    providerAuthentication: authenticationResultsProject(key, results),
                });
            });
    }

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                happyMobileSourceUnsubscribe =
                    options.happyMobile.subscribe(happyMobileSynchronize);
                eventReceived = false;
                bridgeUnsubscribe = bridge.onboardingSubscribe((next) => {
                    eventReceived = true;
                    onboardingSet(next);
                });
                daemonEventReceived = false;
                daemonUnsubscribe = bridge.daemonSubscribe((next) => {
                    daemonEventReceived = true;
                    daemonSet(next);
                });
                runtimeEventReceived = false;
                runtimeUnsubscribe = bridge.subscribe((next) => {
                    runtimeEventReceived = true;
                    runtimeSet(next);
                });
                void bridge.onboardingGet().then(
                    (initial) => {
                        if (!eventReceived) onboardingSet(initial);
                    },
                    (error: unknown) => {
                        publish({
                            ...snapshot,
                            failure: `Happy could not read the state of first-run setup. ${errorMessage(error)}`,
                        });
                    },
                );
                void bridge.daemonGet().then(
                    (initial) => {
                        if (!daemonEventReceived) daemonSet(initial);
                    },
                    (error: unknown) => {
                        publish({
                            ...snapshot,
                            failure: `Happy could not read Happy Agent download state. ${errorMessage(error)}`,
                        });
                    },
                );
                void bridge.runtimeGet().then(
                    (initial) => {
                        if (!runtimeEventReceived) runtimeSet(initial);
                    },
                    (error: unknown) => {
                        publish({
                            ...snapshot,
                            failure: `Happy could not read Happy Agent connection state. ${errorMessage(error)}`,
                        });
                    },
                );
                setupSynchronize();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                bridgeUnsubscribe?.();
                bridgeUnsubscribe = undefined;
                daemonUnsubscribe?.();
                daemonUnsubscribe = undefined;
                runtimeUnsubscribe?.();
                runtimeUnsubscribe = undefined;
                happyMobileSourceUnsubscribe?.();
                happyMobileSourceUnsubscribe = undefined;
                verificationAbort?.abort();
                verificationAbort = undefined;
                happyMobileStop();
                downloadRetryStop();
                startRetryStop();
            };
        },
        connectRetry() {
            attempt(bridge.runtimeRetry(), "Happy could not ask Happy Agent to start again.");
        },
        agentSetupBegin() {
            if (agentSetupActive) return;
            agentSetupActive = true;
            setupSynchronize();
        },
        projectChoose() {
            attempt(bridge.onboardingProjectChoose(), "Happy could not open a project.");
        },
        assistantsContinue() {
            attempt(bridge.onboardingAssistantsContinue(), "Happy could not continue setup.");
        },
        profileNameUpdate(value) {
            publish({ ...snapshot, profileName: value });
        },
        profileEmailUpdate(value) {
            publish({ ...snapshot, profileEmail: value });
        },
        profileCreate() {
            if (snapshot.pending) return;
            attempt(
                bridge.onboardingProfileCreate({
                    email: snapshot.profileEmail.trim(),
                    name: snapshot.profileName.trim(),
                }),
                "Happy could not create that profile.",
            );
        },
        happyMobileConnect() {
            happyMobileStore?.happyMobileConnect();
        },
        happyMobileSkip() {
            happyMobileStore?.happyMobileSkip();
        },
    };
}

/** The screen this snapshot is on, or nothing once setup is finished. */
export function localOnboardingView(
    snapshot: LocalOnboardingViewSnapshot,
): LocalOnboardingView | undefined {
    const onboarding = snapshot.onboarding;
    if (!onboarding)
        return { kind: "checking", ...(snapshot.failure ? { message: snapshot.failure } : {}) };
    // What the shell reported about the step comes first; a request this window
    // could not even deliver is the fallback, so one failure is never shown as
    // if it were the other.
    const message = onboarding.message ?? snapshot.failure;
    const busy = onboarding.busy || snapshot.pending;
    switch (onboarding.stage) {
        case "inactive":
            return undefined;
        case "checking":
            return { kind: "checking", ...(message ? { message } : {}) };
        case "nodeMissing":
            return { kind: "node-missing" };
        case "daemonDownload":
            return agentSetupProject(snapshot.daemon, snapshot.agentStarting, message);
        case "daemonStarting":
            return {
                kind: "agent-setup",
                phase: { kind: "starting" },
                ...(message ? { message } : {}),
            };
        case "connecting":
            return { kind: "connecting" };
        case "connectFailed":
            return {
                kind: "connect-failed",
                message: message ?? "Happy could not reach your Happy Agent daemon.",
                retrying: onboarding.retrying === true,
            };
        case "providersMissing":
        case "assistantsFound":
            return {
                assistants: assistantsProject(
                    onboarding.assistants,
                    snapshot.providerAuthentication,
                ),
                complete: snapshot.providerAuthentication.complete,
                kind: "provider-authentication",
            };
        case "profileRequired":
            return {
                busy,
                email: snapshot.profileEmail,
                kind: "profile-required",
                name: snapshot.profileName,
                ...(message ? { message } : {}),
            };
        case "examining":
            return { kind: "examining" };
        case "project": {
            const mobile = snapshot.happyMobile;
            if (!mobile || mobile.status === "checking") return { kind: "happy-mobile-checking" };
            switch (mobile.status) {
                case "offer":
                    return {
                        busy: mobile.pending,
                        kind: "happy-mobile-offer",
                        ...(mobile.message ? { message: mobile.message } : {}),
                    };
                case "pairing":
                    return {
                        data: mobile.data,
                        expiresAt: mobile.expiresAt,
                        kind: "happy-mobile-pairing",
                    };
                case "failed":
                    return {
                        busy: mobile.pending,
                        kind: "happy-mobile-failed",
                        message: mobile.message,
                    };
                case "configured":
                case "disabled":
                case "skipped":
                    return { busy, kind: "project", ...(message ? { message } : {}) };
            }
        }
        case "complete":
            return undefined;
    }
    return undefined;
}

function agentSetupProject(
    daemon: DesktopDaemonSnapshot | undefined,
    starting: boolean,
    message: string | undefined,
): LocalOnboardingView {
    const phase = (() => {
        if (starting || daemon?.operation === "installing") return { kind: "starting" } as const;
        if (daemon?.readyVersion) return { kind: "ready", version: daemon.readyVersion } as const;
        if (daemon?.operation === "downloading")
            return {
                ...(daemon.download ? { download: daemon.download } : {}),
                kind: "downloading",
            } as const;
        if (daemon?.error) return { kind: "retrying", message: daemon.error } as const;
        return { kind: "preparing" } as const;
    })();
    return {
        kind: "agent-setup",
        phase,
        ...(message ? { message } : {}),
    };
}

/** The shell's answer about the three assistants, as the screen takes it. */
function assistantsProject(
    assistants: readonly LocalAssistantState[] | undefined,
    authentication: ProviderAuthenticationSnapshot,
): readonly LocalOnboardingAssistant[] {
    return (assistants ?? []).map((assistant) => ({
        authentication:
            assistant.status === "missing"
                ? "unavailable"
                : (authenticationFor(authentication, assistant.id) ?? "checking"),
        ...(assistant.command ? { command: assistant.command } : {}),
        id: assistant.id,
        status: assistant.status,
    }));
}

function binaryAuthenticationInitial(
    assistants: readonly LocalAssistantState[],
    id: LocalAssistantState["id"],
): ProviderAuthenticationResult | undefined {
    return assistants.some((assistant) => assistant.id === id && assistant.status === "found")
        ? "checking"
        : undefined;
}

function authenticationFor(
    authentication: ProviderAuthenticationSnapshot,
    id: LocalAssistantState["id"],
): ProviderAuthenticationResult | undefined {
    switch (id) {
        case "claude":
            return authentication.claude;
        case "codex":
            return authentication.codex;
        case "grok":
            return authentication.grok;
    }
}

function authenticationResultsProject(
    key: string,
    results: readonly {
        readonly id: LocalAssistantState["id"];
        readonly result: Exclude<ProviderAuthenticationResult, "checking">;
    }[],
): ProviderAuthenticationSnapshot {
    let claude: ProviderAuthenticationResult | undefined;
    let codex: ProviderAuthenticationResult | undefined;
    let grok: ProviderAuthenticationResult | undefined;
    for (const result of results) {
        switch (result.id) {
            case "claude":
                claude = result.result;
                break;
            case "codex":
                codex = result.result;
                break;
            case "grok":
                grok = result.result;
                break;
        }
    }
    return {
        ...(claude ? { claude } : {}),
        ...(codex ? { codex } : {}),
        complete: true,
        ...(grok ? { grok } : {}),
        key,
    };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
