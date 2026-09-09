export interface KeyboardShortcut {
    readonly aria: string;
    readonly caps: string;
}

export interface CommandShortcut extends KeyboardShortcut {
    readonly alt: boolean;
    readonly code: string;
    readonly key: string;
    readonly shift: boolean;
}

/** Creates one exact macOS Command chord and every representation its UI needs. */
export function commandShortcut(
    key: string,
    modifiers: { readonly alt?: boolean; readonly shift?: boolean } = {},
): CommandShortcut {
    const normalized = key.toLowerCase();
    const label = normalized.toUpperCase();
    const alt = modifiers.alt === true;
    const shift = modifiers.shift === true;
    return {
        alt,
        aria: `Meta+${alt ? "Alt+" : ""}${shift ? "Shift+" : ""}${label}`,
        caps: `${alt ? "⌥" : ""}${shift ? "⇧" : ""}⌘${label}`,
        code: /^[0-9]$/.test(normalized) ? `Digit${label}` : `Key${label}`,
        key: normalized,
        shift,
    };
}

/** Matches one exact chord while leaving unrelated and composing input untouched. */
export function commandShortcutMatches(event: KeyboardEvent, shortcut: CommandShortcut): boolean {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat)
        return false;
    if (
        !event.metaKey ||
        event.ctrlKey ||
        event.altKey !== shortcut.alt ||
        event.shiftKey !== shortcut.shift
    )
        return false;
    if (event.key.toLowerCase() === shortcut.key) return true;
    const digit = /^[0-9]$/.test(shortcut.key);
    if (digit) return event.code === shortcut.code || event.code === `Numpad${shortcut.key}`;
    // Option transforms a letter's `key` on macOS (Option-B is "∫"), so that
    // chord needs its physical code. Plain Command chords remain character
    // based, matching the active keyboard layout and native menu accelerators.
    return shortcut.alt && event.code === shortcut.code;
}

/** Global workspace commands never act through a modal or an open custom menu. */
export function windowShortcutBlocked(): boolean {
    return [
        ...document.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="modal-overlay"], [role="dialog"], [role="menu"]',
        ),
    ].some((element) => element.getClientRects().length > 0);
}
