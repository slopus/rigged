import type { HappyAgentClient, HappyIntegration } from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import type { UserError } from "../types.js";
import { happyAgentUserError } from "./happyAgentSupport.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";

export type HappyAgentIntegrationStatus =
    | "loading"
    | "disabled"
    | "disconnected"
    | "pairing"
    | "connecting"
    | "connected"
    | "failed"
    | "unavailable";

/** The Happy Mobile connection as the Happy settings category reads it. */
export interface HappyAgentIntegrationSnapshot {
    /** Undefined until the daemon has reported whether it holds a pairing. */
    readonly configured?: boolean;
    /** True while this window is waiting for the daemon to confirm an unlink. */
    readonly disconnecting: boolean;
    /** True while this window is waiting for the daemon to start pairing. */
    readonly pairingStarting: boolean;
    /** True while this window is waiting for the daemon to cancel pairing. */
    readonly pairingCanceling: boolean;
    /** Why the live integration state could not be read. */
    readonly error?: UserError;
    /** Why the last unlink was refused. Cleared by the next attempt. */
    readonly disconnectError?: UserError;
    /** Why the last pairing action was refused. Cleared by the next attempt. */
    readonly pairingError?: UserError;
    /** The opaque QR authorization supplied only while pairing is active. */
    readonly pairing?: {
        readonly data: string;
        readonly expiresAt: number;
    };
    /** The daemon's own detail for a disconnected or failed integration. */
    readonly message?: string;
    readonly status: HappyAgentIntegrationStatus;
}

/** One installation-wide Happy Mobile integration, read while its surface is open. */
export interface HappyAgentIntegrationStore {
    get(): HappyAgentIntegrationSnapshot;
    subscribe(listener: () => void): () => void;
    /** Unlinks this Happy Agent installation from Happy Mobile. */
    happyIntegrationDisconnect(): void;
    /** Starts pairing this Happy Agent installation with Happy Mobile. */
    happyIntegrationPair(): void;
    /** Cancels the pairing authorization currently shown by this window. */
    happyIntegrationPairingCancel(): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentIntegrationStoreDeps {
    readonly sync: HappyAgentSync;
    readonly client: Pick<
        HappyAgentClient,
        | "cancelHappyIntegration"
        | "disconnectHappyIntegration"
        | "getHappyIntegration"
        | "startHappyIntegration"
    >;
}

const EMPTY: HappyAgentIntegrationSnapshot = {
    disconnecting: false,
    pairingCanceling: false,
    pairingStarting: false,
    status: "loading",
};

/**
 * Creates the settings projection of Happy Mobile's daemon-owned integration.
 *
 * The constructor opens nothing. The first subscriber reads one race-free
 * shared bootstrap or a narrow integration read, then follows the connection's
 * shared stream. Every server response is a complete replacement, so the
 * store never reconstructs connection state from event order.
 */
export function happyAgentIntegrationStoreCreate(
    deps: HappyAgentIntegrationStoreDeps,
): HappyAgentIntegrationStore {
    const store = createStore<HappyAgentIntegrationSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    let controller: AbortController | undefined;
    let disposed = false;
    let version: string | undefined;

    const integrationAdopt = (integration: HappyIntegration): void => {
        if (version !== undefined && version.localeCompare(integration.version) >= 0) {
            // A successful bootstrap or stream event also proves transport has
            // recovered when its integration version did not need replacing.
            const { error: _cleared, ...current } = store.getState();
            if (_cleared) store.setState(current, true);
            return;
        }
        version = integration.version;
        const current = store.getState();
        store.setState(
            {
                ...integrationProject(integration),
                disconnecting: current.disconnecting,
                pairingCanceling: current.pairingCanceling,
                pairingStarting: current.pairingStarting,
                ...(integration.configured && current.disconnectError
                    ? { disconnectError: current.disconnectError }
                    : {}),
                ...(!integration.configured && current.pairingError
                    ? { pairingError: current.pairingError }
                    : {}),
            },
            true,
        );
    };

    const follow = async (active: AbortController): Promise<void> => {
        const integrationRead = () =>
            happyAgentSyncRead(
                active.signal,
                () => deps.client.getHappyIntegration({ signal: active.signal }),
                (error) => store.setState({ error: happyAgentUserError(error) }, false),
            );
        for await (const input of deps.sync.follow({
            signal: active.signal,
            events: ["happy.integration.updated"],
        })) {
            try {
                if (input.kind === "error") throw input.error;
                if (input.kind === "bootstrap" || input.kind === "reconcile") {
                    const integration =
                        input.kind === "bootstrap"
                            ? input.bootstrap.happyIntegration
                            : (await integrationRead()).integration;
                    if (active.signal.aborted) return;
                    if (input.kind === "bootstrap") version = undefined;
                    if (!integration) {
                        store.setState({ ...EMPTY, status: "unavailable" }, true);
                        continue;
                    }
                    integrationAdopt(integration);
                    continue;
                }
                const update = input.update;
                if (update.kind === "connected" && store.getState().error) {
                    const response = await integrationRead();
                    if (!active.signal.aborted) integrationAdopt(response.integration);
                }
                if (update.kind === "event" && update.event.type === "happy.integration.updated")
                    integrationAdopt(update.event.payload.integration);
            } catch (error) {
                if (!active.signal.aborted)
                    store.setState({ error: happyAgentUserError(error) }, false);
            }
        }
    };

    const followEnsure = (): void => {
        if (disposed || listeners.size === 0 || controller !== undefined) return;
        const active = new AbortController();
        controller = active;
        void follow(active)
            .catch((error: unknown) => {
                if (disposed || active.signal.aborted) return;
                store.setState({ error: happyAgentUserError(error) }, false);
            })
            .finally(() => {
                if (controller === active) controller = undefined;
            });
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) followEnsure();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size !== 0) return;
                controller?.abort();
                controller = undefined;
            };
        },
        happyIntegrationDisconnect() {
            const current = store.getState();
            if (disposed || current.configured !== true || current.disconnecting) return;
            const { disconnectError: _cleared, ...rest } = current;
            store.setState({ ...rest, disconnecting: true }, true);
            void deps.client.disconnectHappyIntegration().then(
                (response) => {
                    if (disposed) return;
                    integrationAdopt(response.integration);
                    store.setState({ disconnecting: false }, false);
                },
                (error: unknown) => {
                    if (disposed) return;
                    store.setState(
                        { disconnectError: happyAgentUserError(error), disconnecting: false },
                        false,
                    );
                },
            );
        },
        happyIntegrationPair() {
            const current = store.getState();
            if (
                disposed ||
                current.configured !== false ||
                current.pairingStarting ||
                (current.status !== "disconnected" && current.status !== "failed")
            )
                return;
            const { pairingError: _cleared, ...rest } = current;
            store.setState({ ...rest, pairingStarting: true }, true);
            void deps.client.startHappyIntegration().then(
                (response) => {
                    if (disposed) return;
                    integrationAdopt(response.integration);
                    store.setState({ pairingStarting: false }, false);
                },
                (error: unknown) => {
                    if (disposed) return;
                    store.setState(
                        { pairingError: happyAgentUserError(error), pairingStarting: false },
                        false,
                    );
                },
            );
        },
        happyIntegrationPairingCancel() {
            const current = store.getState();
            if (disposed || current.status !== "pairing" || current.pairingCanceling) return;
            const { pairingError: _cleared, ...rest } = current;
            store.setState({ ...rest, pairingCanceling: true }, true);
            void deps.client.cancelHappyIntegration().then(
                (response) => {
                    if (disposed) return;
                    integrationAdopt(response.integration);
                    store.setState({ pairingCanceling: false }, false);
                },
                (error: unknown) => {
                    if (disposed) return;
                    store.setState(
                        { pairingCanceling: false, pairingError: happyAgentUserError(error) },
                        false,
                    );
                },
            );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            controller?.abort();
            controller = undefined;
            listeners.clear();
        },
    };
}

function integrationProject(integration: HappyIntegration): HappyAgentIntegrationSnapshot {
    return {
        configured: integration.configured,
        disconnecting: false,
        pairingCanceling: false,
        pairingStarting: false,
        status: integration.status,
        ...(integration.status === "pairing"
            ? {
                  pairing: {
                      data: integration.authorization.data,
                      expiresAt: integration.authorization.expiresAt,
                  },
              }
            : {}),
        ...((integration.status === "disconnected" || integration.status === "failed") &&
        integration.error
            ? { message: integration.error.message }
            : {}),
    };
}

const UNAVAILABLE: HappyAgentIntegrationSnapshot = {
    disconnecting: false,
    pairingCanceling: false,
    pairingStarting: false,
    status: "unavailable",
};

/** A settled stand-in when this window has no Happy Agent integration source. */
export const happyAgentIntegrationStoreNoop: HappyAgentIntegrationStore = {
    get: () => UNAVAILABLE,
    subscribe: () => () => undefined,
    happyIntegrationDisconnect: () => undefined,
    happyIntegrationPair: () => undefined,
    happyIntegrationPairingCancel: () => undefined,
    [Symbol.dispose]: () => undefined,
};
