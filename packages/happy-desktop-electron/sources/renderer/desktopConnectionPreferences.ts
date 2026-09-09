import type {
    HappyAgentModelPreferenceDocument,
    HappyAgentModelPreferencePersistence,
} from "happy-desktop-state";

/** A remote's model choices never share the main daemon's desktop settings document. */
export function desktopConnectionPreferencesCreate(
    id: string,
): HappyAgentModelPreferencePersistence {
    const key = `happy.connection-preferences.v1:${id}`;
    const listeners = new Set<() => void>();
    let current: HappyAgentModelPreferenceDocument | undefined;
    try {
        const value = localStorage.getItem(key);
        current = value ? (JSON.parse(value) as HappyAgentModelPreferenceDocument) : undefined;
    } catch {
        /* Storage-denied windows retain in-memory choices. */
    }
    return {
        read: () => current,
        write(next) {
            current = next;
            try {
                localStorage.setItem(key, JSON.stringify(next));
            } catch {
                /* Memory remains authoritative for this window. */
            }
            for (const listener of listeners) listener();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
