import { useLayoutEffect, useState, type CSSProperties } from "react";
import { Icon } from "./Icon";
import { LivePerformanceIndicator, type LivePerformanceStore } from "./LivePerformanceIndicator";
import { Octicon } from "./vectorIcons/VectorIcon";

export type DevBuildMenuProps = {
    /** Branch the development window was built from. */
    branch: string;
    className?: string;
    /** Worktree label used when Git reports a detached HEAD. */
    label?: string;
    /** Opens the development Blueprint workbench. */
    onBlueprintOpen?: () => void;
    /** Copies the checkout path associated with this development window. */
    onCopyPath?: () => void;
    /** Live renderer diagnostics shown only while the development menu is open. */
    performance?: LivePerformanceStore;
    /** Full checkout path, shown as a tooltip on the trigger and menu row. */
    path?: string;
    style?: CSSProperties;
};

function branchLabel(branch: string, label: string | undefined): string {
    return branch === "HEAD" ? (label ?? branch) : branch;
}

/**
 * C-177 DevBuildMenu — the development-only identity and workbench trigger.
 * The branch name sits quietly in the sidebar footer; its transient menu opens
 * upward like the composer model picker so development tools stay out of the
 * main navigation. Once opened, the popover stays put until the trigger is
 * clicked again; Escape and action completion remain explicit dismissals.
 */
export function DevBuildMenu(props: DevBuildMenuProps) {
    const [open, setOpen] = useState(false);
    const name = branchLabel(props.branch, props.label);

    // eslint-disable-next-line happy-react/no-layout-effect -- Escape is the keyboard equivalent of clicking the trigger again; the listener exists only while the sticky popover is open
    useLayoutEffect(() => {
        if (!open) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", closeOnEscape, true);
        return () => {
            document.removeEventListener("keydown", closeOnEscape, true);
        };
    }, [open]);

    return (
        <div
            className={["happy-dev-build-menu", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="dev-build-menu"
            data-open={open ? "" : undefined}
            style={props.style}
        >
            <button
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={`Development build: ${name}`}
                className="happy-dev-build-menu__trigger"
                data-happy-desktop-ui="dev-build-menu-trigger"
                onClick={() => setOpen((current) => !current)}
                title={props.path ?? name}
                type="button"
            >
                <Icon name="braces" size={16} />
                <span
                    className="happy-dev-build-menu__trigger-label"
                    data-happy-desktop-ui="dev-build-menu-trigger-label"
                >
                    {name}
                </span>
            </button>
            {open ? (
                <div
                    aria-label="Development panel"
                    aria-modal="false"
                    className="happy-dev-build-menu__menu"
                    data-happy-desktop-ui="dev-build-menu-popover"
                    role="dialog"
                >
                    <div
                        className="happy-dev-build-menu__eyebrow"
                        data-happy-desktop-ui="dev-build-menu-eyebrow"
                    >
                        Development
                    </div>
                    {props.onBlueprintOpen ? (
                        <>
                            <button
                                className="happy-dev-build-menu__item"
                                data-happy-desktop-ui="dev-build-menu-blueprint"
                                onClick={() => {
                                    props.onBlueprintOpen?.();
                                    setOpen(false);
                                }}
                                type="button"
                            >
                                <span
                                    className="happy-dev-build-menu__item-icon"
                                    data-happy-desktop-ui="dev-build-menu-blueprint-icon"
                                >
                                    <Icon name="braces" size={16} />
                                </span>
                                <span className="happy-dev-build-menu__item-copy">
                                    <span>Open Blueprint</span>
                                    <span className="happy-dev-build-menu__item-detail">
                                        Component workbench
                                    </span>
                                </span>
                            </button>
                            <div
                                aria-hidden="true"
                                className="happy-dev-build-menu__separator"
                                data-happy-desktop-ui="dev-build-menu-separator"
                            />
                        </>
                    ) : null}
                    <div
                        className="happy-dev-build-menu__branch"
                        data-happy-desktop-ui="dev-build-menu-branch"
                        title={name}
                    >
                        <Octicon name="git-branch" size={16} />
                        <span>{name}</span>
                    </div>
                    {props.performance ? (
                        <>
                            <div
                                aria-hidden="true"
                                className="happy-dev-build-menu__separator"
                                data-happy-desktop-ui="dev-build-menu-performance-separator"
                            />
                            <div
                                className="happy-dev-build-menu__performance"
                                data-happy-desktop-ui="dev-build-menu-performance"
                            >
                                <LivePerformanceIndicator store={props.performance} />
                            </div>
                        </>
                    ) : null}
                    {props.onCopyPath ? (
                        <button
                            className="happy-dev-build-menu__item"
                            data-happy-desktop-ui="dev-build-menu-copy-path"
                            onClick={() => {
                                props.onCopyPath?.();
                                setOpen(false);
                            }}
                            type="button"
                        >
                            <span
                                className="happy-dev-build-menu__item-icon"
                                data-happy-desktop-ui="dev-build-menu-copy-path-icon"
                            >
                                <Icon name="copy" size={16} />
                            </span>
                            <span className="happy-dev-build-menu__item-copy">
                                <span>Copy worktree path</span>
                                {props.path ? (
                                    <span className="happy-dev-build-menu__item-detail">
                                        {props.path}
                                    </span>
                                ) : null}
                            </span>
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
