import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { drawnGlyphs, type DrawnGlyphName } from "./drawnGlyphs";
import { ioniconsGlyphs, type IoniconName } from "./vectorIcons/ioniconsGlyphs";
import { octiconsGlyphs, type OcticonName } from "./vectorIcons/octiconsGlyphs";
export type IconName =
    | "home"
    | "inbox"
    | "chat"
    | "agents"
    | "tasks"
    | "files"
    | "search"
    | "settings"
    | "clock"
    | "history"
    | "plus"
    | "send"
    | "check"
    | "check-circle"
    | "copy"
    | "chevron-down"
    | "chevron-right"
    | "close"
    | "diff"
    | "branch"
    | "merge"
    | "spark"
    | "doc"
    | "code"
    | "braces"
    | "image"
    | "play"
    | "stop"
    | "pause"
    | "at"
    | "hash"
    | "bell"
    | "more"
    | "arrow-right"
    | "arrow-up"
    | "shield"
    | "lock"
    | "eye"
    | "link"
    | "mobile"
    | "smile"
    | "paperclip"
    | "mic"
    | "users"
    | "star"
    | "reply"
    | "zap"
    | "terminal"
    | "globe"
    | "filter"
    | "edit"
    | "sun"
    | "moon"
    | "sidebar-collapse"
    | "sidebar-expand"
    | "panel-collapse"
    | "panel-expand"
    | "trash"
    | "archive"
    | "alert"
    | "unlink"
    | "plugin"
    | "package"
    | "dot";
export type IconProps = {
    name: IconName;
    /*
     * The chrome sizes run 12–20. 24 and 32 exist for the places a glyph is the
     * subject rather than an affordance beside one — an application mark and a
     * hero mark — where a 20px glyph inside a 48 or 64px tile reads as a speck
     * rather than as the thing's face.
     */
    size?: 12 | 14 | 16 | 18 | 20 | 24 | 32;
    color?: string;
    className?: string;
    style?: CSSProperties;
    "aria-label"?: string;
    "data-testid"?: string;
};
/*
 * The curated house icon vocabulary, backed by the font-based vector sets ported
 * verbatim from Happy's `@expo/vector-icons` usage (Ionicons and Octicons). Each
 * curated `IconName` resolves to one upstream glyph in one set, so a name renders
 * the exact glyph Happy renders while call sites keep the small, stable
 * `IconName` union. Outline Ionicons variants are chosen so the set reads with a
 * consistent light stroke weight; the few code/repository affordances that only
 * Octicons carries (branch, merge, braces, hash) come from Octicons.
 *
 * The glyph itself is a Private Use Area codepoint painted in the icon font, so
 * there is no path data or optical centering to tune here — the font supplies a
 * box-centered glyph. Regenerate the glyphmaps from upstream rather than editing
 * a codepoint here.
 *
 * A `mirrored` name renders its glyph flipped across the vertical axis. It exists
 * for a pair of affordances that are the same act at opposite edges of the window
 * — collapsing the left sidebar and collapsing the right panel — where only one
 * handedness is drawn. The flip is presentation, not a new glyph: the same shape
 * is painted, so the two edges read as one idea instead of borrowing an unrelated
 * symbol for one of them.
 *
 * The `drawn` set is the single hand-drawn family, kept to Ionicons' own stroke
 * and box metrics; see `drawnGlyphs.tsx` for why it exists and why nothing else
 * belongs in it.
 */
type IconGlyph = (
    | { set: "drawn"; name: DrawnGlyphName }
    | { set: "ionicons"; name: IoniconName }
    | { set: "octicons"; name: OcticonName }
) & { mirrored?: true };
const glyphs: Record<IconName, IconGlyph> = {
    home: { set: "ionicons", name: "home-outline" },
    inbox: { set: "ionicons", name: "file-tray-outline" },
    chat: { set: "ionicons", name: "chatbubble-outline" },
    agents: { set: "ionicons", name: "hardware-chip-outline" },
    tasks: { set: "ionicons", name: "checkbox-outline" },
    files: { set: "ionicons", name: "documents-outline" },
    search: { set: "ionicons", name: "search-outline" },
    settings: { set: "ionicons", name: "settings-outline" },
    clock: { set: "ionicons", name: "time-outline" },
    history: { set: "octicons", name: "history" },
    plus: { set: "ionicons", name: "add-outline" },
    send: { set: "ionicons", name: "paper-plane-outline" },
    check: { set: "ionicons", name: "checkmark-outline" },
    "check-circle": { set: "ionicons", name: "checkmark-circle-outline" },
    copy: { set: "ionicons", name: "copy-outline" },
    "chevron-down": { set: "ionicons", name: "chevron-down-outline" },
    "chevron-right": { set: "ionicons", name: "chevron-forward-outline" },
    // A bare cross: dismissing a thing where it is an affordance, and what went
    // wrong where it is not. In a danger or warning tone beside a failure it is
    // the house mark for trouble; `shield` says the opposite and is never it.
    close: { set: "ionicons", name: "close-outline" },
    // Octicons' compact plus/minus mark: the same code/diff family Happy uses
    // for repository affordances, and the tab-sized statement of a change set.
    diff: { set: "octicons", name: "diff" },
    branch: { set: "octicons", name: "git-branch" },
    merge: { set: "octicons", name: "git-merge" },
    spark: { set: "ionicons", name: "sparkles-outline" },
    doc: { set: "ionicons", name: "document-text-outline" },
    code: { set: "ionicons", name: "code-slash-outline" },
    braces: { set: "octicons", name: "code" },
    // A locally installed plugin's own contribution: the piece that was added to
    // this window rather than shipped in it.
    plugin: { set: "ionicons", name: "extension-puzzle-outline" },
    // The shipped thing a contribution arrives in: a version of some code that
    // can be installed, updated, or removed. Distinct from the puzzle piece on
    // purpose, so managing packages never wears the glyph of using one.
    package: { set: "ionicons", name: "cube-outline" },
    image: { set: "ionicons", name: "image-outline" },
    play: { set: "ionicons", name: "play-outline" },
    // A filled square: the universal "end what is running now".
    stop: { set: "ionicons", name: "square" },
    pause: { set: "ionicons", name: "pause-outline" },
    at: { set: "ionicons", name: "at-outline" },
    hash: { set: "octicons", name: "hash" },
    bell: { set: "ionicons", name: "notifications-outline" },
    more: { set: "ionicons", name: "ellipsis-horizontal" },
    "arrow-right": { set: "ionicons", name: "arrow-forward-outline" },
    "arrow-up": { set: "ionicons", name: "arrow-up-outline" },
    // A shield with a checkmark on it: it says a thing is safe, not that a thing
    // went wrong. Nothing that failed may wear it.
    shield: { set: "ionicons", name: "shield-checkmark-outline" },
    lock: { set: "ionicons", name: "lock-closed-outline" },
    eye: { set: "ionicons", name: "eye-outline" },
    link: { set: "ionicons", name: "link-outline" },
    mobile: { set: "ionicons", name: "phone-portrait-outline" },
    smile: { set: "ionicons", name: "happy-outline" },
    paperclip: { set: "ionicons", name: "attach-outline" },
    mic: { set: "ionicons", name: "mic-outline" },
    users: { set: "ionicons", name: "people-outline" },
    star: { set: "ionicons", name: "star-outline" },
    reply: { set: "ionicons", name: "arrow-undo-outline" },
    zap: { set: "ionicons", name: "flash-outline" },
    terminal: { set: "ionicons", name: "terminal-outline" },
    globe: { set: "ionicons", name: "globe-outline" },
    filter: { set: "ionicons", name: "funnel-outline" },
    edit: { set: "ionicons", name: "create-outline" },
    sun: { set: "ionicons", name: "sunny-outline" },
    moon: { set: "ionicons", name: "moon-outline" },
    // The panel and its column, with no arrow in it: the control says what the
    // window is made of, and the button's label says which way it goes. The
    // collapse name shows the column open, because that is the state you are in
    // when the control offers to close it; the expand name shows it put away
    // against the edge it hides at.
    "sidebar-collapse": { set: "drawn", name: "panel-rail" },
    "sidebar-expand": { set: "drawn", name: "panel-rail-collapsed" },
    // The column is drawn on the left, where the sidebar is. The panel names are
    // the same act at the other edge, so they paint the same shapes mirrored.
    "panel-collapse": { set: "drawn", name: "panel-rail", mirrored: true },
    "panel-expand": { set: "drawn", name: "panel-rail-collapsed", mirrored: true },
    trash: { set: "ionicons", name: "trash-outline" },
    archive: { set: "ionicons", name: "archive-outline" },
    // Something went wrong with the thing this glyph sits on — as distinct from
    // `shield`, which is about what an agent was allowed to do.
    alert: { set: "ionicons", name: "alert-circle-outline" },
    // The thing is still listed but what it pointed at is no longer there: a
    // checkout removed outside Happy, a link with nothing on the other end.
    unlink: { set: "ionicons", name: "unlink-outline" },
    dot: { set: "ionicons", name: "ellipse" },
};
export const iconNames = Object.keys(glyphs) as IconName[];
function glyphContent(glyph: IconGlyph) {
    if (glyph.set === "drawn") {
        /*
         * The drawing fills the icon box rather than taking `size` directly, so
         * a drawn glyph answers a surface's box override exactly as a font
         * glyph answers an overridden font-size.
         */
        return (
            <svg fill="none" focusable="false" height="100%" viewBox="0 0 16 16" width="100%">
                {drawnGlyphs[glyph.name]}
            </svg>
        );
    }
    const codepoint =
        glyph.set === "ionicons" ? ioniconsGlyphs[glyph.name] : octiconsGlyphs[glyph.name];
    return String.fromCodePoint(codepoint);
}
export function Icon(props: IconProps) {
    const [local] = partitionComponentProps(props, [
        "aria-label",
        "className",
        "color",
        "data-testid",
        "name",
        "size",
        "style",
    ]);
    const glyph = glyphs[local.name];
    const size = local.size ?? 16;
    return (
        <span
            aria-hidden={local["aria-label"] ? undefined : "true"}
            aria-label={local["aria-label"]}
            className={["happy-icon", local.className].filter(Boolean).join(" ")}
            data-glyph={glyph.name}
            data-happy-desktop-ui="icon"
            data-mirrored={glyph.mirrored ? "" : undefined}
            data-name={local.name}
            data-set={glyph.set}
            data-testid={local["data-testid"]}
            role={local["aria-label"] ? "img" : undefined}
            style={{
                fontSize: `${size}px`,
                lineHeight: 1,
                width: `${size}px`,
                height: `${size}px`,
                ...local.style,
                ...(local.color === undefined ? null : { color: local.color }),
            }}
        >
            {glyphContent(glyph)}
        </span>
    );
}
