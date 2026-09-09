import type { HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";

export interface HappyAgentConnectionItem {
    readonly id: string;
    readonly name: string;
    readonly remoteId?: string;
}

export interface HappyAgentConnectionsSnapshot {
    readonly items: readonly HappyAgentConnectionItem[];
    readonly selectedId: string;
    readonly error?: string;
}

export interface HappyAgentConnectionsStore {
    get(): HappyAgentConnectionsSnapshot;
    subscribe(listener: () => void): () => void;
    connectionSelect(id: string): void;
    [Symbol.dispose](): void;
}

/** The main daemon owns membership; connectivity never removes a known UI. */
export function happyAgentConnectionsStoreCreate(
    client: HappyAgentClient,
    sync: HappyAgentSync,
): HappyAgentConnectionsStore {
    let snapshot: HappyAgentConnectionsSnapshot = {
        items: [{ id: "local", name: "This Mac" }],
        selectedId: "local",
    };
    const listeners = new Set<() => void>();
    let controller: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const publish = (next: HappyAgentConnectionsSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const reconcile = async (signal: AbortSignal): Promise<void> => {
        const result = await happyAgentSyncRead(
            signal,
            () => client.listConnections({ signal }),
            (error) =>
                publish({
                    ...snapshot,
                    error: error instanceof Error ? error.message : String(error),
                }),
        );
        if (signal.aborted) return;
        const items: HappyAgentConnectionItem[] = [snapshot.items[0]!];
        for (const connection of result.connections) {
            const id = `connection:${connection.id}`;
            const previous = snapshot.items.find((item) => item.id === id);
            items.push(
                previous?.name === connection.name
                    ? previous
                    : { id, remoteId: connection.id, name: connection.name },
            );
        }
        if (
            !snapshot.error &&
            items.length === snapshot.items.length &&
            items.every((item, index) => item === snapshot.items[index])
        )
            return;
        publish({
            items,
            selectedId: items.some((item) => item.id === snapshot.selectedId)
                ? snapshot.selectedId
                : "local",
        });
    };
    const start = (): void => {
        if (disposed || controller || listeners.size === 0) return;
        const active = new AbortController();
        controller = active;
        void (async () => {
            // The shared subscription is installed before reading membership;
            // changes during that read remain queued for reconciliation.
            for await (const input of sync.follow({
                signal: active.signal,
                events: ["connections.updated"],
            })) {
                try {
                    if (input.kind === "error") throw input.error;
                    if (input.kind === "bootstrap" || input.kind === "reconcile")
                        await reconcile(active.signal);
                    else if (
                        (input.update.kind === "connected" && snapshot.error) ||
                        (input.update.kind === "event" &&
                            input.update.event.type === "connections.updated")
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
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };
    const stop = (): void => {
        controller?.abort();
        controller = undefined;
        if (retry) clearTimeout(retry);
        retry = undefined;
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            start();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        connectionSelect(id) {
            if (id !== snapshot.selectedId && snapshot.items.some((item) => item.id === id))
                publish({ ...snapshot, selectedId: id });
        },
        [Symbol.dispose]() {
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
