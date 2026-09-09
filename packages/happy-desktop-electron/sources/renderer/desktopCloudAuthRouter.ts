import type { HappyAgentCloudHost } from "happy-desktop-state";
import type { HappyDesktopBridge } from "../shared/desktopContract";

/** Correlates the external OAuth state with the connection that opened its login. */
export function desktopCloudAuthRouterCreate(
    bridge: HappyDesktopBridge,
    onReturn: (id: string) => void,
) {
    const key = "happy.connection-oauth.v1";
    const owners = new Map<string, string>();
    try {
        const stored = localStorage.getItem(key);
        if (stored)
            for (const [state, id] of JSON.parse(stored) as [string, string][])
                owners.set(state, id);
    } catch {
        /* A missing correlation is never guessed from the focused connection. */
    }
    const pending = new Map<string, string>();
    const listeners = new Map<string, Set<() => void>>();
    let reading = false;
    const persist = (): void => {
        try {
            localStorage.setItem(key, JSON.stringify([...owners]));
        } catch {
            /* Current-window login still works. */
        }
    };
    const receive = async (): Promise<void> => {
        if (reading) return;
        reading = true;
        try {
            const callback = await bridge.cloudAuthCallbackTake();
            if (!callback) return;
            const state = new URL(callback).searchParams.get("state");
            const id = state ? owners.get(state) : undefined;
            if (!id) return;
            pending.set(id, callback);
            onReturn(id);
            for (const listener of listeners.get(id) ?? []) listener();
        } finally {
            reading = false;
        }
    };
    const unsubscribe = bridge.cloudAuthCallbackSubscribe(() => {
        void receive().catch(() => undefined);
    });
    void receive().catch(() => undefined);
    return {
        hostFor(id: string): HappyAgentCloudHost {
            return {
                cloudAuthConfigurationGet: () => bridge.cloudAuthConfigurationGet(),
                cloudAuthCallbackSubscribe(listener) {
                    let group = listeners.get(id);
                    if (!group) {
                        group = new Set();
                        listeners.set(id, group);
                    }
                    group.add(listener);
                    return () => {
                        group.delete(listener);
                        if (!group.size) listeners.delete(id);
                    };
                },
                async cloudAuthCallbackTake() {
                    const callback = pending.get(id);
                    pending.delete(id);
                    if (callback) {
                        const state = new URL(callback).searchParams.get("state");
                        if (state) owners.delete(state);
                        persist();
                    }
                    return callback;
                },
                async cloudAuthOpen(url) {
                    const state = new URL(url).searchParams.get("state");
                    if (!state)
                        throw new Error("The account login did not provide its OAuth state.");
                    owners.set(state, id);
                    persist();
                    await bridge.cloudAuthOpen(url);
                },
            };
        },
        dispose() {
            unsubscribe();
            listeners.clear();
            pending.clear();
        },
    };
}
