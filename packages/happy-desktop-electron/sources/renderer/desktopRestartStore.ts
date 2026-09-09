import type { AppHappyAgentDaemonInstall, AppHappyAgentDaemonStore } from "happy-desktop-app";
import type { AgentInstallView } from "happy-desktop-ui";
import {
    LOCAL_HAPPY_AGENT_ID,
    type HappyAgentDirectoryEntry,
    type HappyAgentDirectoryStore,
} from "./happyAgentDirectoryStore";

/** The restart screen's view, or nothing while no restart is running. */
export interface DesktopRestartStore {
    get(): AgentInstallView | undefined;
    subscribe(listener: () => void): () => void;
}

/**
 * The local agent's restart as the window shows it, held until the window is
 * actually talking to the new daemon again.
 *
 * The main process reports the restart finished the moment it can reach the
 * daemon itself. This window is behind it: its own connection still has to
 * come back and the catalog still has to be read, and until then there is
 * nothing usable behind the screen. So the last step, "reconnecting", is held
 * here past the main process's word for it, until the local entry in the
 * directory has settled — connected with its projects loaded, or failed,
 * which is a screen of its own that this one must not sit on.
 */
export function desktopRestartStoreCreate(input: {
    readonly daemon: AppHappyAgentDaemonStore;
    readonly happyAgents: HappyAgentDirectoryStore;
}): DesktopRestartStore {
    const listeners = new Set<() => void>();
    let snapshot: AgentInstallView | undefined;
    // The step reported last, kept so the held "reconnecting" carries the same
    // reason and version the restart started with.
    let held: Extract<AgentInstallView, { kind: "reconnecting" }> | undefined;
    // Whether the local connection has actually gone down since the restart
    // began. Until it has, a "connected" entry is the old socket that has not
    // yet noticed the daemon leave, and releasing on it would hand the window
    // back to a connection about to break. The screen waits for the drop and
    // then for the fresh connection that follows it.
    let dropped = false;
    let unsubscribe: (() => void) | undefined;

    const compute = (): AgentInstallView | undefined => {
        const view = installView(input.daemon.get().install);
        const local = input.happyAgents
            .get()
            .happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID);
        if (local && local.status !== "connected") dropped = true;
        if (view) {
            held =
                view.kind === "error"
                    ? undefined
                    : { kind: "reconnecting", reason: view.reason, version: view.version };
            return view;
        }
        if (!held) return undefined;
        if (local && localSettled(local, dropped)) {
            held = undefined;
            dropped = false;
            return undefined;
        }
        return held;
    };
    const reconcile = (): void => {
        const next = compute();
        if (next === snapshot) return;
        snapshot = next;
        for (const listener of listeners) listener();
    };

    return {
        get: () => {
            if (listeners.size === 0) snapshot = compute();
            return snapshot;
        },
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                const disposers = [
                    input.daemon.subscribe(reconcile),
                    input.happyAgents.subscribe(reconcile),
                ];
                unsubscribe = () => {
                    for (const dispose of disposers) dispose();
                };
                reconcile();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                unsubscribe?.();
                unsubscribe = undefined;
            };
        },
    };
}

/**
 * Whether the window is back in touch with the restarted agent.
 *
 * "Disconnected" is not an answer here: it is what the entry reads for the
 * whole gap between the old daemon going down and the new connection being
 * made, so releasing on it would hand the window back before the reconnect
 * had even begun. A "connected" only counts once the old socket has been seen
 * to drop, so the reconnect the screen waits for is the new one rather than
 * the stale one still open the instant the daemon reports itself back. Only a
 * fresh connection with its catalog read, or a failure the window has to show
 * on its own screen, ends the wait.
 */
function localSettled(entry: HappyAgentDirectoryEntry, dropped: boolean): boolean {
    if (entry.status === "error") return true;
    return dropped && entry.status === "connected" && entry.projectsStatus !== "loading";
}

/** The restart as the screen takes it, or nothing while none is running. */
function installView(install: AppHappyAgentDaemonInstall): AgentInstallView | undefined {
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
