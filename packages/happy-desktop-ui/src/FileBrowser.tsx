import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { FileTree, type FileTreeNode, type FileTreeProps } from "./FileTree";
import { compactCount, changeCountLabel } from "./countText";
import { Icon } from "./Icon";
/** Which files the listing is about: only what changed, or the whole checkout. */
export type FileBrowserScope = "changed" | "all";
/** Whether the listing nests into directories or reads as one flat run of files. */
export type FileBrowserLayout = "flat" | "tree";
export type FileBrowserProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    scope: FileBrowserScope;
    layout: FileBrowserLayout;
    onLayoutChange?: (layout: FileBrowserLayout) => void;
    /** Rows to list. Passed straight through to FileTree. */
    nodes: readonly FileTreeNode[];
    selectedId?: FileTreeProps["selectedId"];
    onSelect?: FileTreeProps["onSelect"];
    onOpen?: FileTreeProps["onOpen"];
    onToggle?: FileTreeProps["onToggle"];
    onDirectoryPrefetch?: FileTreeProps["onDirectoryPrefetch"];
    onFilePrefetch?: FileTreeProps["onFilePrefetch"];
    onLoadMore?: FileTreeProps["onLoadMore"];
    loading?: boolean;
    loadingLabel?: string;
    emptyLabel?: string;
    /** Rows the listing holds, stated beside the controls rather than over them. */
    count: number;
    /** Total lines the listed files gained and lost, when the scope has a diff. */
    addedLines?: number;
    deletedLines?: number;
    /** Optional truthfulness note under the controls (e.g. a truncated listing). */
    note?: string;
    /** Why file rows cannot open or select remote content; directory disclosure stays local. */
    fileActionsUnavailable?: string;
};
/**
 * C-168 FileBrowser — the file listing of a workspace panel.
 *
 * A scrolling `FileTree` beneath the facts and List / Tree choice for Changes.
 * Scope belongs to the panel's tabs, so this component draws exactly the
 * listing named by its active tab. All Files is always a lazy tree and needs no
 * second control row under the Files tab.
 *
 * Every exclusive control in the row is one layer: no enclosing track, and
 * only the selected option carries the shared selection fill and outline. No
 * rule separates the row from the files. A panel this narrow is read as one
 * column, and each hairline drawn across it cuts that column into pieces that
 * have to be reassembled by eye.
 *
 * Props only — the caller supplies the nodes and every handler; the browser
 * never fetches.
 */
export function FileBrowser(props: FileBrowserProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "scope",
        "layout",
        "onLayoutChange",
        "nodes",
        "selectedId",
        "onSelect",
        "onOpen",
        "onToggle",
        "onDirectoryPrefetch",
        "onFilePrefetch",
        "onLoadMore",
        "loading",
        "loadingLabel",
        "emptyLabel",
        "count",
        "addedLines",
        "deletedLines",
        "note",
        "fileActionsUnavailable",
    ]);
    const added = local.addedLines !== undefined && local.addedLines > 0;
    const deleted = local.deletedLines !== undefined && local.deletedLines > 0;
    return (
        <section
            aria-label={local.scope === "all" ? "All files" : "Changed files"}
            className={["happy-file-browser", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="file-browser"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            {local.scope === "changed" ? (
                <div
                    className="happy-file-browser__controls"
                    data-happy-desktop-ui="file-browser-controls"
                >
                    <span
                        className="happy-file-browser__summary"
                        data-happy-desktop-ui="file-browser-summary"
                    >
                        <span className="happy-file-browser__count">
                            {`${compactCount(local.count)} ${local.count === 1 ? "file" : "files"}`}
                        </span>
                        {added || deleted ? (
                            <span className="happy-file-browser__lines">
                                {added ? (
                                    <span
                                        aria-hidden="true"
                                        className="happy-file-browser__added"
                                    >{`+${compactCount(local.addedLines ?? 0)}`}</span>
                                ) : null}
                                {deleted ? (
                                    <span
                                        aria-hidden="true"
                                        className="happy-file-browser__deleted"
                                    >{`−${compactCount(local.deletedLines ?? 0)}`}</span>
                                ) : null}
                                {/* Out of flow, so the pair keeps the row's spacing. */}
                                <span className="happy-visually-hidden">
                                    {changeCountLabel(
                                        local.addedLines ?? 0,
                                        local.deletedLines ?? 0,
                                    )}
                                </span>
                            </span>
                        ) : null}
                    </span>
                    <div className="happy-file-browser__layouts" role="group">
                        <button
                            aria-label="List files"
                            aria-pressed={local.layout === "flat"}
                            className="happy-file-browser__layout"
                            data-active={local.layout === "flat" ? "" : undefined}
                            data-happy-desktop-ui="file-browser-layout"
                            onClick={() => local.onLayoutChange?.("flat")}
                            type="button"
                        >
                            <Icon name="files" size={14} />
                        </button>
                        <button
                            aria-label="Nest files into directories"
                            aria-pressed={local.layout === "tree"}
                            className="happy-file-browser__layout"
                            data-active={local.layout === "tree" ? "" : undefined}
                            data-happy-desktop-ui="file-browser-layout"
                            onClick={() => local.onLayoutChange?.("tree")}
                            type="button"
                        >
                            <Icon name="branch" size={14} />
                        </button>
                    </div>
                </div>
            ) : null}
            {local.note ? (
                <div className="happy-file-browser__note" data-happy-desktop-ui="file-browser-note">
                    {local.note}
                </div>
            ) : null}
            {/* The tree does its own scrolling here, because a checkout listing
                draws only the rows on screen and nothing outside it can know
                how tall the rest would have been. */}
            <div className="happy-file-browser__body" data-happy-desktop-ui="file-browser-body">
                <FileTree
                    emptyLabel={local.emptyLabel}
                    label={local.scope === "all" ? "All files" : "Changed files"}
                    loading={local.loading}
                    loadingLabel={local.loadingLabel}
                    nodes={local.nodes}
                    filesUnavailable={local.fileActionsUnavailable}
                    onDirectoryPrefetch={local.onDirectoryPrefetch}
                    onFilePrefetch={local.onFilePrefetch}
                    onLoadMore={local.onLoadMore}
                    onOpen={local.onOpen}
                    onSelect={local.onSelect}
                    onToggle={local.onToggle}
                    selectedId={local.selectedId}
                    virtualize
                />
            </div>
        </section>
    );
}
