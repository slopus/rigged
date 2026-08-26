import { useEffectEvent, useLayoutEffect } from "react";
import {
    commandShortcutMatches,
    windowShortcutBlocked,
    type CommandShortcut,
} from "./keyboardShortcut";

export interface WindowShortcutAction {
    /** Read at keydown time, so ref-backed commands can become actionable without a render. */
    readonly enabled?: () => boolean;
    /** Leaves native/editor undo alone while a text-editing surface owns the key event. */
    readonly preserveTextEditing?: boolean;
    readonly run: () => void;
    readonly shortcut: CommandShortcut;
}

const TEXT_EDITING_TARGETS =
    'textarea, input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]), [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"], webview, iframe';

function textEditingTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(TEXT_EDITING_TARGETS) !== null;
}

/**
 * One lifecycle-owned dispatcher for context-sensitive window commands. The
 * caller supplies only commands that are currently actionable.
 */
export function WindowShortcuts(props: { readonly actions: readonly WindowShortcutAction[] }) {
    const shortcutRun = useEffectEvent((event: KeyboardEvent) => {
        const action = props.actions.find(
            (candidate) =>
                commandShortcutMatches(event, candidate.shortcut) &&
                candidate.enabled?.() !== false &&
                !(candidate.preserveTextEditing === true && textEditingTarget(event.target)),
        );
        if (!action || windowShortcutBlocked()) return;
        event.preventDefault();
        action.run();
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- a window command must work regardless of which descendant owns focus
    useLayoutEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => shortcutRun(event);
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
    return null;
}
