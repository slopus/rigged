/**
 * Whether the window's left side is folded away. The sidebar is what the
 * reader hides, with its toggle or Command-B, but the fold belongs to the
 * window rather than to any one connection: the connection rail stands beside
 * the sidebar and goes with it, and switching machines does not bring the
 * sidebar back. One store per window, shared by every connection it shows.
 *
 * Memory only. A hidden sidebar is a posture for this sitting, not an
 * arrangement worth keeping across launches.
 */
export interface HappyAgentSidebarVisibilitySnapshot {
    /** The sidebar, and the rail beside it, are folded away. */
    readonly hidden: boolean;
}

export interface HappyAgentSidebarVisibilityStore {
    get(): HappyAgentSidebarVisibilitySnapshot;
    subscribe(listener: () => void): () => void;
    /** Folds the left side away, or brings it back. */
    sidebarHiddenUpdate(hidden: boolean): void;
}

const SHOWN: HappyAgentSidebarVisibilitySnapshot = { hidden: false };
const HIDDEN: HappyAgentSidebarVisibilitySnapshot = { hidden: true };

export function happyAgentSidebarVisibilityStoreCreate(): HappyAgentSidebarVisibilityStore {
    let snapshot = SHOWN;
    const listeners = new Set<() => void>();
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        sidebarHiddenUpdate(hidden) {
            const next = hidden ? HIDDEN : SHOWN;
            if (next === snapshot) return;
            snapshot = next;
            for (const listener of listeners) listener();
        },
    };
}

/** A window whose sidebar is never folded: Blueprint fixtures and the browser shell. */
export const happyAgentSidebarVisibilityStoreNoop: HappyAgentSidebarVisibilityStore = {
    get: () => SHOWN,
    subscribe: () => () => undefined,
    sidebarHiddenUpdate: () => undefined,
};
