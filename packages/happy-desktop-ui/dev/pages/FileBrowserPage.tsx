import { useState, type ReactNode } from "react";
import { FileBrowser, type FileBrowserLayout, type FileBrowserScope } from "../../src/FileBrowser";
import { TabbedPane } from "../../src/TabbedPane";
import {
    fileTreeBuild,
    fileTreeFlatten,
    type FileTreeBuildEntry,
    type FileTreeExpansion,
} from "../../src/fileTreeBuild";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-168";
const changed: FileTreeBuildEntry[] = [
    {
        path: "packages/happy-desktop-ui/src/FileTree.tsx",
        gitStatus: "modified",
        addedLines: 148,
        deletedLines: 62,
    },
    {
        path: "packages/happy-desktop-ui/src/styles/file-tree.css",
        gitStatus: "modified",
        addedLines: 96,
        deletedLines: 41,
    },
    {
        path: "packages/happy-desktop-ui/src/FileBrowser.tsx",
        gitStatus: "added",
        addedLines: 157,
        deletedLines: 0,
    },
    {
        path: "packages/happy-desktop-app/sources/AppHappyAgentView.tsx",
        gitStatus: "modified",
        addedLines: 24,
        deletedLines: 38,
    },
    { path: "packages/happy-desktop-ui/src/assets/plugin.png", gitStatus: "added" },
    {
        path: "packages/happy-desktop-ui/src/SegmentedControl.tsx",
        gitStatus: "deleted",
        addedLines: 0,
        deletedLines: 84,
    },
    {
        path: "docs/notes/file-viewer.md",
        gitStatus: "renamed",
        addedLines: 3,
        deletedLines: 1,
    },
    { path: ".env.local", gitStatus: "untracked", addedLines: 6, deletedLines: 0 },
];
const everything: FileTreeBuildEntry[] = [
    ...changed,
    { path: "packages/happy-desktop-ui/src/Button.tsx" },
    { path: "packages/happy-desktop-ui/src/theme.css" },
    { path: "packages/happy-desktop-state/src/index.ts" },
    { path: "scripts/release.sh" },
    { path: "assets/keys/deploy.pem" },
    { path: "media/intro.mp4" },
    { path: "media/theme.mp3" },
    { path: "vendor/toolchain.tar.gz" },
    { path: "package.json" },
    { path: "README.md" },
];
/**
 * Names chosen to prove the order rather than to look like a repository: a
 * capital and a lowercase spelling of one word, a run of numbers that reads
 * wrong when compared character by character, and a name long enough to need
 * the whole row.
 */
const awkward: FileTreeBuildEntry[] = [
    { path: "release/v9/notes.md" },
    { path: "release/v10/notes.md" },
    { path: "release/v2/notes.md" },
    { path: "release/V1/notes.md" },
    { path: "Makefile" },
    { path: "makefile.local" },
    { path: "zebra.ts" },
    { path: "Apple.ts" },
    { path: "apple.ts" },
    { path: "img/photo-2.png" },
    { path: "img/photo-10.png" },
    { path: "img/photo-1.png" },
    {
        path: "packages/happy-desktop-ui/src/components/experimental/very-long-component-name-that-will-not-fit.tsx",
    },
];
/**
 * A checkout the size of a real one, built from a fixed recipe so the specimen
 * is the same on every run. Five thousand rows is the point of the listing: it
 * must cost the same to draw as fifty.
 */
const bulk: FileTreeBuildEntry[] = (() => {
    const areas = ["packages", "services", "vendor", "docs", "tools"];
    const kinds = ["ts", "tsx", "css", "json", "md", "png", "sh", "yaml", "mp4", "pem"];
    const entries: FileTreeBuildEntry[] = [];
    for (let index = 0; index < 5000; index += 1) {
        const area = areas[index % areas.length]!;
        const module = `module-${String((index * 7) % 40)}`;
        // The case alternates on purpose so the listing has to tie-break, and
        // the index keeps every path distinct: two rows with one path would be
        // two rows with one identity.
        const leaf = `${index % 3 === 0 ? "Item" : "item"}-${String(index)}`;
        entries.push({
            path: `${area}/${module}/src/${leaf}.${kinds[index % kinds.length]!}`,
            ...(index % 97 === 0 ? { gitStatus: "modified" as const, addedLines: index % 40 } : {}),
        });
    }
    return entries;
})();
const totals = changed.reduce(
    (sum, entry) => ({
        added: sum.added + (entry.addedLines ?? 0),
        deleted: sum.deleted + (entry.deletedLines ?? 0),
    }),
    { added: 0, deleted: 0 },
);
/** The tree as it stands before the reader has opened or closed anything. */
const untouched: FileTreeExpansion = {
    opened: new Set(),
    closed: new Set(),
    defaultDepth: 1,
};
function panelFrame(children: ReactNode, height = 480, width = 320) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                height: `${height}px`,
                overflow: "hidden",
                width: `${width}px`,
            }}
        >
            {children}
        </div>
    );
}
/**
 * A listing wired to its own state, so the specimen answers the keyboard the
 * way the product does: the arrow keys walk it, Left and Right disclose,
 * Enter opens, and the scope tabs plus List / Tree choice change what is listed
 * without moving the row the reader is standing on.
 */
function LiveBrowser(props: { entries: FileTreeBuildEntry[]; height?: number; width?: number }) {
    const [scope, scopeSet] = useState<FileBrowserScope>("changed");
    const [layout, layoutSet] = useState<FileBrowserLayout>("flat");
    const [opened, openedSet] = useState<ReadonlySet<string>>(new Set());
    const [closed, closedSet] = useState<ReadonlySet<string>>(new Set());
    const [selectedId, selectedIdSet] = useState<string | undefined>(undefined);
    const expansion: FileTreeExpansion = { opened, closed, defaultDepth: 1 };
    const nodes =
        scope === "all" || layout === "tree"
            ? fileTreeBuild(props.entries, expansion)
            : fileTreeFlatten(props.entries);
    return panelFrame(
        <TabbedPane
            activeId={scope === "changed" ? "changes" : "files"}
            onSelect={(id) => scopeSet(id === "files" ? "all" : "changed")}
            tabs={[
                { icon: "diff", iconOnly: true, id: "changes", label: "Changes" },
                { icon: "files", id: "files", label: "Files" },
            ]}
        >
            <FileBrowser
                count={props.entries.length}
                layout={scope === "all" ? "tree" : layout}
                nodes={nodes}
                onLayoutChange={layoutSet}
                onSelect={(id) => selectedIdSet(id)}
                onToggle={(path, expanded) => {
                    openedSet((current) => {
                        const next = new Set(current);
                        if (expanded) next.add(path);
                        else next.delete(path);
                        return next;
                    });
                    closedSet((current) => {
                        const next = new Set(current);
                        if (expanded) next.delete(path);
                        else next.add(path);
                        return next;
                    });
                }}
                scope={scope}
                {...(selectedId ? { selectedId } : {})}
            />
        </TabbedPane>,
        props.height ?? 480,
        props.width ?? 320,
    );
}
export function FileBrowserPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Changes and Files are peer panel tabs, opening on Changes. The changed-files row carries totals and a flat List / Tree choice over the same virtualized FileTree; Files opens directly into its lazy tree."
            title="FileBrowser"
        >
            <Specimen
                detail="32px bar · 24px controls · shared 6px selection inset"
                label="Changed files, flat"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {panelFrame(
                        <FileBrowser
                            addedLines={totals.added}
                            count={changed.length}
                            deletedLines={totals.deleted}
                            layout="flat"
                            nodes={fileTreeFlatten(changed)}
                            scope="changed"
                            selectedId="packages/happy-desktop-ui/src/FileTree.tsx"
                        />,
                    )}
                    <DimensionRule label="32 px bar · 24 px selector · 28 px row · 6 px shared inset" />
                </div>
            </Specimen>

            <Specimen
                detail="Nothing has been opened by hand: the top level stands open, one level down"
                label="Changed files, tree"
                number="02"
                stage="surface"
            >
                {panelFrame(
                    <FileBrowser
                        addedLines={totals.added}
                        count={changed.length}
                        deletedLines={totals.deleted}
                        layout="tree"
                        nodes={fileTreeBuild(changed, untouched)}
                        scope="changed"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="Whole checkout — a count, and no line totals to claim"
                label="All files"
                number="03"
                stage="surface"
            >
                {panelFrame(
                    <FileBrowser
                        count={everything.length}
                        layout="flat"
                        nodes={fileTreeFlatten(everything)}
                        note="Showing the first 20,000 files."
                        scope="all"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="A narrow panel: the path elides in its middle, the name never does"
                label="Narrow"
                number="04"
                stage="surface"
            >
                {panelFrame(
                    <FileBrowser
                        addedLines={totals.added}
                        count={changed.length}
                        deletedLines={totals.deleted}
                        layout="flat"
                        nodes={fileTreeFlatten(changed)}
                        scope="changed"
                    />,
                    320,
                    250,
                )}
            </Specimen>

            <Specimen detail="Loading and empty" label="States" number="06" stage="surface">
                <div style={{ display: "flex", gap: "12px" }}>
                    {panelFrame(
                        <FileBrowser count={0} layout="flat" loading nodes={[]} scope="all" />,
                        260,
                    )}
                    {panelFrame(
                        <FileBrowser
                            count={0}
                            emptyLabel="No changed files."
                            layout="flat"
                            nodes={[]}
                            scope="changed"
                        />,
                        260,
                    )}
                </div>
            </Specimen>

            <Specimen
                detail="v2 before v10, Apple beside apple, folders ahead of files, and the same order flat as nested"
                label="Ordering"
                number="07"
                stage="surface"
            >
                <div style={{ display: "flex", gap: "12px" }}>
                    {panelFrame(
                        <FileBrowser
                            count={awkward.length}
                            layout="tree"
                            nodes={fileTreeBuild(awkward, untouched)}
                            scope="all"
                        />,
                    )}
                    {panelFrame(
                        <FileBrowser
                            count={awkward.length}
                            layout="flat"
                            nodes={fileTreeFlatten(awkward)}
                            scope="all"
                        />,
                    )}
                </div>
            </Specimen>

            <Specimen
                detail="Arrow keys walk it, Left and Right disclose, Enter opens; tabs and List / Tree keep the row you are on"
                label="Live"
                number="08"
                stage="surface"
            >
                <LiveBrowser entries={everything} />
            </Specimen>

            <Specimen
                detail="5,000 files — only the rows on screen exist, and the scrollbar still tells the truth about the rest"
                label="Whole checkout"
                number="09"
                stage="surface"
            >
                <LiveBrowser entries={bulk} height={480} width={360} />
            </Specimen>

            <Specimen
                detail="known Happy Agent offline · retained rows and local selection remain · remote reads and writes are unavailable"
                label="Happy Agent offline"
                number="10"
                stage="surface"
            >
                <div style={{ display: "flex", gap: "12px" }}>
                    {panelFrame(
                        <FileBrowser
                            addedLines={totals.added}
                            count={changed.length}
                            deletedLines={totals.deleted}
                            layout="flat"
                            nodes={fileTreeFlatten(changed)}
                            scope="changed"
                            selectedId="packages/happy-desktop-ui/src/FileTree.tsx"
                        />,
                    )}
                    {panelFrame(
                        <FileBrowser
                            count={everything.length}
                            fileActionsUnavailable="Happy Agent must reconnect before opening files."
                            layout="tree"
                            nodes={fileTreeBuild(everything, untouched)}
                            scope="all"
                        />,
                    )}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
