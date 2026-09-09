import type { HappyAgentClient, HappyIntegration } from "@slopus/happy-agent-client";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";

export type HappyMobileOnboardingSnapshot =
    | { readonly status: "checking" }
    | {
          readonly message?: string;
          readonly pending: boolean;
          readonly status: "offer";
      }
    | {
          /** Opaque data supplied by Happy Agent, rendered only as a QR code. */
          readonly data: string;
          readonly expiresAt: number;
          readonly status: "pairing";
      }
    | { readonly status: "configured" }
    | { readonly status: "disabled" }
    | { readonly status: "skipped" }
    | {
          readonly message: string;
          readonly pending: boolean;
          readonly status: "failed";
      };

export type HappyMobileOnboardingOutput = { readonly type: "happyMobileSkipped" };

export interface HappyMobileOnboardingStore {
    get(): HappyMobileOnboardingSnapshot;
    subscribe(listener: () => void): () => void;
    happyMobileConnect(): void;
    happyMobileSkip(): void;
}

export interface HappyMobileOnboardingStoreOptions {
    readonly sync: HappyAgentSync;
    readonly client: Pick<
        HappyAgentClient,
        "cancelHappyIntegration" | "getHappyIntegration" | "startHappyIntegration"
    >;
    readonly initialSkipped?: boolean;
    readonly onOutput?: (output: HappyMobileOnboardingOutput) => void;
}

const CHECKING: HappyMobileOnboardingSnapshot = { status: "checking" };
const CONFIGURED: HappyMobileOnboardingSnapshot = { status: "configured" };
const DISABLED: HappyMobileOnboardingSnapshot = { status: "disabled" };
const SKIPPED: HappyMobileOnboardingSnapshot = { status: "skipped" };

function resolved(snapshot: HappyMobileOnboardingSnapshot): boolean {
    return (
        snapshot.status === "configured" ||
        snapshot.status === "disabled" ||
        snapshot.status === "skipped"
    );
}

/**
 * The optional Happy Mobile step, backed by one authoritative daemon snapshot
 * and its realtime replacements.
 *
 * The constructor opens nothing. The first subscriber takes a race-free
 * shared bootstrap or a narrow integration read and follows the connection's
 * shared journal; the last subscriber aborts its read immediately. Configured, disabled, and skipped
 * are terminal for onboarding, so they stop transport even while the screen
 * that follows remains mounted.
 */
export function happyMobileOnboardingStoreCreate(
    options: HappyMobileOnboardingStoreOptions,
): HappyMobileOnboardingStore {
    const listeners = new Set<() => void>();
    let snapshot: HappyMobileOnboardingSnapshot = options.initialSkipped ? SKIPPED : CHECKING;
    let version: string | undefined;
    let networkAbort: AbortController | undefined;
    let mutation = 0;

    const publish = (next: HappyMobileOnboardingSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const networkStop = (): void => {
        networkAbort?.abort();
        networkAbort = undefined;
    };
    const integrationAdopt = (integration: HappyIntegration): void => {
        if (version !== undefined) {
            const order = version.localeCompare(integration.version);
            if (order > 0 || (order === 0 && snapshot.status !== "failed")) return;
        }
        version = integration.version;
        if (integration.configured) {
            publish(CONFIGURED);
            networkStop();
            return;
        }
        switch (integration.status) {
            case "disabled":
                publish(DISABLED);
                networkStop();
                return;
            case "disconnected":
                publish({
                    ...(integration.error ? { message: integration.error.message } : {}),
                    pending: false,
                    status: "offer",
                });
                return;
            case "pairing":
                publish({
                    data: integration.authorization.data,
                    expiresAt: integration.authorization.expiresAt,
                    status: "pairing",
                });
                return;
            case "failed":
                publish({ message: integration.error.message, pending: false, status: "failed" });
                return;
        }
    };
    const follow = async (abort: AbortController): Promise<void> => {
        const integrationRead = () =>
            happyAgentSyncRead(
                abort.signal,
                () => options.client.getHappyIntegration({ signal: abort.signal }),
                (error) =>
                    publish({
                        message: `Happy could not read Happy Mobile setup. ${happyAgentUserError(error).message}`,
                        pending: false,
                        status: "failed",
                    }),
            );
        for await (const input of options.sync.follow({
            signal: abort.signal,
            events: ["happy.integration.updated"],
        })) {
            try {
                if (input.kind === "error") throw input.error;
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" &&
                        input.update.kind === "connected" &&
                        snapshot.status === "failed")
                ) {
                    const integration =
                        input.kind === "bootstrap"
                            ? input.bootstrap.happyIntegration
                            : (await integrationRead()).integration;
                    if (abort.signal.aborted) return;
                    if (input.kind === "bootstrap") version = undefined;
                    if (!integration) {
                        publish({
                            message: "This Happy Agent does not support Happy Mobile pairing.",
                            pending: false,
                            status: "failed",
                        });
                        continue;
                    }
                    integrationAdopt(integration);
                    if (abort.signal.aborted || resolved(snapshot)) return;
                    continue;
                }
                const update = input.update;
                if (update.kind === "event" && update.event.type === "happy.integration.updated") {
                    integrationAdopt(update.event.payload.integration);
                    if (abort.signal.aborted || resolved(snapshot)) return;
                }
            } catch (error) {
                if (!abort.signal.aborted)
                    publish({
                        message: `Happy could not read Happy Mobile setup. ${happyAgentUserError(error).message}`,
                        pending: false,
                        status: "failed",
                    });
            }
        }
    };
    const networkEnsure = (): void => {
        if (listeners.size === 0 || networkAbort || resolved(snapshot)) return;
        const abort = new AbortController();
        networkAbort = abort;
        void follow(abort)
            .catch((error: unknown) => {
                if (abort.signal.aborted) return;
                publish({
                    message: `Happy could not read Happy Mobile setup. ${happyAgentUserError(error).message}`,
                    pending: false,
                    status: "failed",
                });
            })
            .finally(() => {
                if (networkAbort === abort) networkAbort = undefined;
            });
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) networkEnsure();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) networkStop();
            };
        },
        happyMobileConnect() {
            if ((snapshot.status !== "offer" && snapshot.status !== "failed") || snapshot.pending)
                return;
            const request = ++mutation;
            publish({ ...snapshot, pending: true });
            void options.client.startHappyIntegration().then(
                (response) => {
                    if (request !== mutation || snapshot.status === "skipped") return;
                    integrationAdopt(response.integration);
                    networkEnsure();
                },
                (error: unknown) => {
                    if (request !== mutation || resolved(snapshot)) return;
                    publish({
                        message: `Happy Mobile could not start pairing. ${happyAgentUserError(error).message}`,
                        pending: false,
                        status: "failed",
                    });
                },
            );
        },
        happyMobileSkip() {
            if (resolved(snapshot)) return;
            const cancelPairing = snapshot.status === "pairing";
            mutation += 1;
            publish(SKIPPED);
            networkStop();
            options.onOutput?.({ type: "happyMobileSkipped" });
            if (cancelPairing) void options.client.cancelHappyIntegration().catch(() => undefined);
        },
    };
}
