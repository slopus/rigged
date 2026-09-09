import { Activity, type ReactNode } from "react";

/** Activity retains DOM/local state while suspending hidden window listeners. */
export function ConnectionSurface(props: {
    readonly active: boolean;
    readonly children: ReactNode;
}) {
    return (
        <Activity mode={props.active ? "visible" : "hidden"}>
            <div className="happy-connections__surface" data-happy-desktop-ui="connection-surface">
                {props.children}
            </div>
        </Activity>
    );
}
