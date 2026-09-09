import type {
    HappyAgentViewPreferencesDocument,
    HappyAgentViewPreferencesPersistence,
} from "happy-desktop-state";

const VIEW_PREFERENCES_KEY = "happy.view-preferences.v1";

/**
 * How long a run of changes is allowed to settle before it is written down.
 *
 * Dragging the panel reports every settled step, which is the right thing for
 * the store — the width on screen must never lag the pointer — and the wrong
 * thing for storage, where it would mean a serialize and a synchronous
 * localStorage write per animation frame. The newest value always wins and is
 * always eventually written, so nothing is lost by waiting; a drag simply costs
 * one write instead of fifty.
 */
const WRITE_SETTLE_MS = 250;

/**
 * Where this machine remembers how each checkout is arranged — the right panel's
 * width, and how its files are listed.
 *
 * The window's own storage rather than anything a Happy Agent holds: how someone likes
 * to look at a project is about the person in front of this app, and a machine
 * they connect to has no opinion about it. It also has to survive a Happy Agent going
 * away, which anything kept inside a connection would not.
 */
function persistenceCreate(key: string): HappyAgentViewPreferencesPersistence {
    let pending: HappyAgentViewPreferencesDocument | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = (): void => {
        timer = undefined;
        const document = pending;
        pending = undefined;
        if (!document) return;
        try {
            localStorage.setItem(key, JSON.stringify(document));
        } catch {
            // A storage-denied renderer still keeps the arrangement on screen for
            // as long as this window stays open.
        }
    };

    // A window closing mid-settle would otherwise drop the last drag. Both events
    // are used because neither fires reliably alone: `pagehide` covers a
    // navigation away, and `visibilitychange` covers a window simply being hidden
    // and then killed.
    const flushNow = (): void => {
        if (timer === undefined) return;
        clearTimeout(timer);
        flush();
    };
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushNow();
    });

    return {
        read() {
            try {
                const value = localStorage.getItem(key);
                return value ? (JSON.parse(value) as HappyAgentViewPreferencesDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(next) {
            pending = next;
            if (timer !== undefined) return;
            timer = setTimeout(flush, WRITE_SETTLE_MS);
        },
    };
}

/**
 * The window's one view-preferences store.
 *
 * A singleton because every Happy Agent this window connects to arranges the same
 * localStorage record and installs the same unload listeners: one instance per
 * connection would race its siblings' writes and add a listener per Happy Agent that
 * ever connected.
 */
const shared = new Map<string, HappyAgentViewPreferencesPersistence>();
export function desktopViewPreferencesPersistence(
    id = "local",
): HappyAgentViewPreferencesPersistence {
    let persistence = shared.get(id);
    if (!persistence) {
        persistence = persistenceCreate(
            id === "local" ? VIEW_PREFERENCES_KEY : `${VIEW_PREFERENCES_KEY}:${id}`,
        );
        shared.set(id, persistence);
    }
    return persistence;
}
