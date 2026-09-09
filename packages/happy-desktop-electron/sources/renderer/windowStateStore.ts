import type {
    HappyAgentSidebarVisibilityStore,
    HappyAgentWindowSnapshot,
    HappyAgentWindowStore,
} from "happy-desktop-state";
import type { DesktopWindowState, HappyDesktopBridge } from "../shared/desktopContract";
import type { HappyAgentDirectoryStore } from "./happyAgentDirectoryStore";

const windowed: HappyAgentWindowSnapshot = { fullScreen: false, connectionRail: false };

/**
 * The window state each connection surface lays out against. While the
 * connection rail shows, the surface is not at the window's left edge — the
 * rail is, and it reserves the traffic lights' lane itself — so the surface
 * hears `connectionRail` and closes its chrome inset, and the product mark
 * stands down because the rail's tiles already identify the window. Whether
 * the window is in full screen is still reported as it really is: the surface
 * lays out differently beside a rail in a window than beside one filling the
 * display. The rail shows when there is more than one Happy Agent and the
 * sidebar is not folded away.
 *
 * This is one store for the window's lifetime rather than a swap between two:
 * a surface reads its window state through route context, which is captured
 * when the route loads, so a different store object would not reach it until
 * the next navigation. Only a snapshot change does.
 */
export function surfaceWindowStateStoreCreate(input: {
    readonly windowState: HappyAgentWindowStore;
    readonly sidebarVisibility: HappyAgentSidebarVisibilityStore;
    readonly happyAgents: HappyAgentDirectoryStore;
}): HappyAgentWindowStore {
    const railedWindowed: HappyAgentWindowSnapshot = { fullScreen: false, connectionRail: true };
    const railedFullScreen: HappyAgentWindowSnapshot = { fullScreen: true, connectionRail: true };
    const compute = (): HappyAgentWindowSnapshot => {
        const window = input.windowState.get();
        const rail =
            input.happyAgents.get().happyAgents.length > 1 && !input.sidebarVisibility.get().hidden;
        if (!rail) return window;
        return window.fullScreen ? railedFullScreen : railedWindowed;
    };
    let snapshot = compute();
    const listeners = new Set<() => void>();
    const sourceUnsubscribes: (() => void)[] = [];
    const reconcile = () => {
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
                sourceUnsubscribes.push(
                    input.windowState.subscribe(reconcile),
                    input.sidebarVisibility.subscribe(reconcile),
                    input.happyAgents.subscribe(reconcile),
                );
                reconcile();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    for (const unsubscribe of sourceUnsubscribes.splice(0)) unsubscribe();
                }
            };
        },
    };
}

/**
 * One coarse bridge subscription owns the window's chrome state for the whole
 * renderer. The main process pushes every full-screen transition, and the
 * initial read fills in the state the window already had when this surface
 * mounted; a push that arrives first wins over that read.
 */
export function windowStateStoreCreate(bridge: HappyDesktopBridge): HappyAgentWindowStore {
    let snapshot: HappyAgentWindowSnapshot = windowed;
    let bridgeUnsubscribe: (() => void) | undefined;
    let eventReceived = false;
    const listeners = new Set<() => void>();
    const publish = (next: DesktopWindowState) => {
        if (snapshot.fullScreen === next.fullScreen) return;
        snapshot = { fullScreen: next.fullScreen, connectionRail: false };
        for (const listener of listeners) listener();
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                eventReceived = false;
                bridgeUnsubscribe = bridge.windowStateSubscribe((next) => {
                    eventReceived = true;
                    publish(next);
                });
                void bridge
                    .windowStateGet()
                    .then((initial) => {
                        if (!eventReceived) publish(initial);
                    })
                    .catch(() => undefined);
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    bridgeUnsubscribe?.();
                    bridgeUnsubscribe = undefined;
                }
            };
        },
    };
}
