import type { WelcomeDocument, WelcomePersistence } from "happy-desktop-state";

const WELCOME_KEY = "happy.welcome.v1";

/**
 * Where this machine remembers that its owner has already been welcomed. It is
 * the window's own storage rather than anything a Happy Agent holds, because the welcome
 * is about the person in front of this app: a machine they connect to later has
 * no idea whether they have read it, and reconnecting must never introduce them
 * to Happy a second time.
 */
export function desktopWelcomePersistence(id = "local"): WelcomePersistence {
    const key = id === "local" ? WELCOME_KEY : `${WELCOME_KEY}:${id}`;
    return {
        read() {
            try {
                const value = localStorage.getItem(key);
                return value ? (JSON.parse(value) as WelcomeDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(key, JSON.stringify(document));
            } catch {
                // A storage-denied renderer still lets this window past the
                // welcome; it will simply offer it again next launch.
            }
        },
    };
}
