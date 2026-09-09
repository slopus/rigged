import type { ReactNode } from "react";
import { AvatarBrutalist } from "./AvatarBrutalist";
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";

export interface ConnectionShellItem {
    readonly id: string;
    readonly label: string;
    readonly local: boolean;
    readonly status: "connecting" | "connected" | "disconnected" | "error";
}

/** The connection switcher stays outside every connection's workspace and setup. */
export function ConnectionShell(props: {
    readonly items: readonly ConnectionShellItem[];
    readonly selectedId: string;
    readonly onSelect: (id: string) => void;
    readonly children: ReactNode;
    readonly windowControls?: boolean;
    /**
     * The window's left side is folded away. The rail stands beside the
     * sidebar and goes with it, so the active connection takes the whole
     * width and its own reveal control brings both back.
     */
    readonly collapsed?: boolean;
    readonly error?: string;
}) {
    return (
        <div className="happy-connections" data-happy-desktop-ui="connection-shell">
            {props.items.length > 1 && !props.collapsed ? (
                <nav
                    className="happy-connections__rail"
                    aria-label="Connections"
                    data-window-controls={props.windowControls || undefined}
                >
                    <ScrollArea placement="overlay">
                        <div className="happy-connections__items">
                            {props.items.map((item) => (
                                <button
                                    className="happy-connections__item"
                                    key={item.id}
                                    type="button"
                                    aria-label={`${item.label}, ${item.status}`}
                                    aria-current={props.selectedId === item.id ? "page" : undefined}
                                    title={`${item.label} · ${item.status}`}
                                    onClick={() => props.onSelect(item.id)}
                                    data-local={item.local || undefined}
                                    data-status={item.status}
                                >
                                    {item.local ? (
                                        <Icon name="home" size={20} />
                                    ) : (
                                        <AvatarBrutalist
                                            id={item.id}
                                            size={36}
                                            style={{ borderRadius: "10px" }}
                                        />
                                    )}
                                </button>
                            ))}
                        </div>
                    </ScrollArea>
                    <div className="happy-connections__footer" aria-hidden="true" />
                </nav>
            ) : null}
            <div className="happy-connections__body">
                {props.error ? (
                    <div className="happy-connections__error" role="status">
                        Connection list unavailable. Keeping known connections.
                    </div>
                ) : null}
                {props.children}
            </div>
        </div>
    );
}
