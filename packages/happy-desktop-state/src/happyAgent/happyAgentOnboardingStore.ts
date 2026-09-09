import type { HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import {
    happyMobileOnboardingStoreCreate,
    type HappyMobileOnboardingStore,
} from "../onboarding/happyMobileOnboardingStore.js";

export interface HappyAgentOnboardingSnapshot {
    readonly state?: {
        readonly completed: boolean;
        readonly steps: {
            readonly profile: { readonly done: boolean };
            readonly project: { readonly done: boolean };
            readonly providers: { readonly done: boolean; readonly signedIn: readonly string[] };
        };
    };
    readonly pending: boolean;
    readonly error?: string;
}

export interface HappyAgentOnboardingStore {
    readonly mobile: HappyMobileOnboardingStore;
    get(): HappyAgentOnboardingSnapshot;
    subscribe(listener: () => void): () => void;
    onboardingBegin(): void;
    [Symbol.dispose](): void;
}

/** Remote onboarding follows the daemon's state without scanning providers or requiring a project. */
export function happyAgentOnboardingStoreCreate(
    client: HappyAgentClient,
    sync: HappyAgentSync,
    options: {
        readonly setupActive?: boolean;
        readonly mobileSkipped?: boolean;
        readonly onMobileSkip?: () => void;
    } = {},
): HappyAgentOnboardingStore {
    let snapshot: HappyAgentOnboardingSnapshot = {
        pending: false,
    };
    const listeners = new Set<() => void>();
    let controller: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let readRequest = 0;
    let setupActive = options.setupActive === true;
    let completion: AbortController | undefined;
    let completionRetry: ReturnType<typeof setTimeout> | undefined;
    let mobileUnsubscribe: (() => void) | undefined;
    const mobile = happyMobileOnboardingStoreCreate({
        client,
        sync,
        initialSkipped: options.mobileSkipped,
        onOutput: options.onMobileSkip,
    });
    const publish = (next: HappyAgentOnboardingSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const reconcile = async (signal: AbortSignal): Promise<void> => {
        const request = ++readRequest;
        const state = await happyAgentSyncRead(
            signal,
            () => client.getOnboarding({ signal }),
            (error) => {
                if (request === readRequest)
                    publish({
                        ...snapshot,
                        error: error instanceof Error ? error.message : String(error),
                    });
            },
        );
        if (!disposed && !signal.aborted && request === readRequest) {
            publish({ ...snapshot, state, error: undefined });
            setupSynchronize();
        }
    };
    function setupSynchronize(): void {
        if (
            !setupActive ||
            disposed ||
            !listeners.size ||
            !snapshot.state ||
            snapshot.state.completed
        )
            return;
        if (!snapshot.state.steps.profile.done) return;
        if (!mobileUnsubscribe) mobileUnsubscribe = mobile.subscribe(setupSynchronize);
        const status = mobile.get().status;
        // Remote setup ends here. Its first project is created later in the workspace.
        if (status === "configured" || status === "disabled" || status === "skipped")
            onboardingComplete();
    }
    function onboardingComplete(): void {
        if (
            completion ||
            completionRetry ||
            disposed ||
            !listeners.size ||
            snapshot.state?.completed
        )
            return;
        const active = new AbortController();
        completion = active;
        publish({ ...snapshot, pending: true, error: undefined });
        // The SDK declares completion idempotent. An outage must not strand the
        // person on the finishing screen or require a manual refresh.
        void client
            .completeOnboarding({ signal: active.signal })
            .then(() => reconcile(active.signal))
            .catch((error: unknown) => {
                if (!active.signal.aborted)
                    publish({
                        ...snapshot,
                        error: error instanceof Error ? error.message : String(error),
                    });
            })
            .finally(() => {
                if (completion !== active) return;
                completion = undefined;
                if (!active.signal.aborted && !disposed) {
                    if (!snapshot.state?.completed && listeners.size)
                        completionRetry = setTimeout(() => {
                            completionRetry = undefined;
                            setupSynchronize();
                        }, 2_000);
                    publish({ ...snapshot, pending: false });
                }
            });
    }
    const start = (): void => {
        if (controller || disposed || !listeners.size) return;
        const active = new AbortController();
        controller = active;
        void (async () => {
            for await (const input of sync.follow({
                signal: active.signal,
                events: ["config.updated", "profile.updated", "project.created", "project.updated"],
            })) {
                try {
                    if (input.kind === "error") throw input.error;
                    if (input.kind === "bootstrap") {
                        ++readRequest;
                        publish({
                            ...snapshot,
                            state: input.bootstrap.onboarding,
                            error: undefined,
                        });
                        setupSynchronize();
                    } else if (
                        input.kind === "reconcile" ||
                        (input.update.kind === "connected" && snapshot.error) ||
                        input.update.kind === "event"
                    )
                        await reconcile(active.signal);
                } catch (error) {
                    if (!active.signal.aborted)
                        publish({
                            ...snapshot,
                            error: error instanceof Error ? error.message : String(error),
                        });
                }
            }
        })()
            .catch((error: unknown) => {
                if (!active.signal.aborted)
                    publish({
                        ...snapshot,
                        error: error instanceof Error ? error.message : String(error),
                    });
            })
            .finally(() => {
                if (controller === active) controller = undefined;
                if (!active.signal.aborted && !disposed && listeners.size)
                    retry = setTimeout(start, 1_000);
            });
    };
    const stop = (): void => {
        controller?.abort();
        controller = undefined;
        completion?.abort();
        completion = undefined;
        if (completionRetry) clearTimeout(completionRetry);
        completionRetry = undefined;
        snapshot = { ...snapshot, pending: false };
        mobileUnsubscribe?.();
        mobileUnsubscribe = undefined;
        if (retry) clearTimeout(retry);
        retry = undefined;
    };
    return {
        mobile,
        get: () => snapshot,
        onboardingBegin() {
            setupActive = true;
            setupSynchronize();
        },
        subscribe(listener) {
            listeners.add(listener);
            start();
            return () => {
                listeners.delete(listener);
                if (!listeners.size) stop();
            };
        },
        [Symbol.dispose]() {
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
