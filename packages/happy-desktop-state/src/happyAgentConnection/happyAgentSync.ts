import type {
    HappyAgentClient,
    HappyAgentEvent,
    HappyAgentUpdate,
} from "@slopus/happy-agent-client";

type DesktopBootstrap = Awaited<ReturnType<HappyAgentClient["getDesktopBootstrap"]>>;

/** Private authoritative input to feature stores, never a product/UI snapshot. */
export type HappyAgentSyncInput =
    | { readonly kind: "bootstrap"; readonly bootstrap: DesktopBootstrap }
    | { readonly kind: "reconcile" }
    | { readonly kind: "update"; readonly update: HappyAgentUpdate }
    | { readonly kind: "error"; readonly error: Error };

/** One connection's transport input. Following it never opens another request or SSE stream. */
export interface HappyAgentSync {
    follow(options: {
        readonly signal: AbortSignal;
        readonly events: readonly HappyAgentEvent["type"][];
    }): AsyncIterable<HappyAgentSyncInput>;
}

/**
 * The connection privately writes its bootstrap and ordered transport updates.
 * No aggregate product state or historical bootstrap is retained here. A late
 * surface reconciles its own endpoint with its subscription already installed.
 */
export function happyAgentSyncCreate() {
    const listeners = new Set<(input: HappyAgentSyncInput) => void>();
    let initialized = false;
    let closed = false;
    let connectionUpdate: HappyAgentUpdate | undefined;
    const publish = (input: HappyAgentSyncInput): void => {
        if (closed) return;
        for (const listener of listeners) listener(input);
    };
    const source: HappyAgentSync = {
        async *follow({ signal, events }) {
            if (closed || signal.aborted) return;
            const queue: HappyAgentSyncInput[] = [];
            let wake: (() => void) | undefined;
            const notify = (): void => {
                wake?.();
                wake = undefined;
            };
            const receive = (input: HappyAgentSyncInput): void => {
                if (
                    input.kind === "update" &&
                    input.update.kind === "event" &&
                    !events.includes(input.update.event.type)
                )
                    return;
                if (input.kind === "bootstrap") queue.length = 0;
                // A slow endpoint cannot accumulate an unbounded journal. The
                // authoritative narrow read repairs discarded delivery hints.
                if (queue.length >= 64) {
                    queue.length = 0;
                    queue.push({ kind: "reconcile" });
                }
                queue.push(input);
                notify();
            };
            listeners.add(receive);
            signal.addEventListener("abort", notify, { once: true });
            if (initialized) {
                receive({ kind: "reconcile" });
                if (connectionUpdate) receive({ kind: "update", update: connectionUpdate });
            }
            try {
                while (!closed && !signal.aborted) {
                    const next = queue.shift();
                    if (next) yield next;
                    else
                        await new Promise<void>((resolve) => {
                            wake = resolve;
                        });
                }
            } finally {
                listeners.delete(receive);
                signal.removeEventListener("abort", notify);
                queue.length = 0;
            }
        },
    };
    return {
        source,
        writer: {
            bootstrapReceived(bootstrap: DesktopBootstrap): void {
                initialized = true;
                publish({ kind: "bootstrap", bootstrap });
            },
            updateReceived(update: HappyAgentUpdate): void {
                if (
                    update.kind === "connected" ||
                    update.kind === "disconnected" ||
                    update.kind === "draining"
                )
                    connectionUpdate = update;
                publish({ kind: "update", update });
            },
            errorReceived(error: unknown): void {
                publish({
                    kind: "error",
                    error: error instanceof Error ? error : new Error(String(error)),
                });
            },
            close(): void {
                closed = true;
                // Wake parked iterators so their finally blocks release listeners.
                for (const listener of listeners) listener({ kind: "reconcile" });
                listeners.clear();
            },
        },
    };
}
