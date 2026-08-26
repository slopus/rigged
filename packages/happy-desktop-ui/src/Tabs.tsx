import { partitionComponentProps } from "./componentProps";
import {
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent,
    type PointerEvent as ReactPointerEvent,
} from "react";
import { AvatarBrutalist } from "./AvatarBrutalist";
import { CountBadge } from "./Badge";
import { haptic } from "./haptics";
import { Icon, type IconName } from "./Icon";
import type { KeyboardShortcut } from "./keyboardShortcut";
import { Menu, type MenuItem } from "./Menu";
import { ShimmerText } from "./ShimmerText";
import { Spinner } from "./Spinner";
import {
    transferFocusClaim,
    transferFocusRequest,
    transferZoneAt,
    transferZonesArm,
    transferZonesDisarm,
    type TabTransferTarget,
} from "./tabTransfer";
export type TabsSize = "small" | "medium" | "large";
export type TabItem = {
    id: string;
    label: string;
    /** Whether a busy tab shimmers its label. Defaults to true. */
    labelShimmer?: boolean;
    icon?: IconName;
    badge?: number;
    /** False keeps a permanent tab visible when sibling tabs can be closed. */
    closable?: boolean;
    /** Keeps a fixed tab visible but unavailable, and states why in its tooltip. */
    disabledReason?: string;
    /** Shows only the leading icon while keeping `label` as the accessible name. */
    iconOnly?: boolean;
    /** An italic, replaceable document preview rather than a permanent tab. */
    preview?: boolean;
    /**
     * Whether the work behind this tab is running. It spins in the trailing
     * lane, the one the close control uses, so a busy tab reads as busy without
     * giving up the icon or generated mark the reader picks the tab out by, and
     * a band of light travels through the tab's own title for as long as the
     * work lasts — the strip is read by its titles, and a 12px spinner at the
     * far edge of a tab is easy to pass over.
     */
    busy?: boolean;
    /**
     * Whether the work behind this tab is sitting inside a scheduled wait. A
     * lower-priority sibling of `busy`: it takes the same trailing lane with a
     * highlighted clock instead of the spinner, so a tab that is deliberately
     * doing nothing reads as waiting rather than as working or stalled. `busy`
     * outranks it — real work is the thing worth showing.
     */
    waiting?: boolean;
    /** Unsaved file content. Drawn as the classic dot in the tab's trailing lane. */
    dirty?: boolean;
    /** Marks the tab as carrying unread activity with a dot on its leading mark. */
    unread?: boolean;
    /**
     * Gives the tab a generated brutalist mark derived from this string, so a
     * tab that has no icon still has a face the reader can aim at. Supply the
     * entity's own id — the session's, the project's — and the mark stays the
     * same for as long as the entity does. `icon` outranks it.
     */
    avatarId?: string;
};

/**
 * Whether a tab keeps its leading lane even when nothing is in it. A tab that
 * reports `unread` at all owns the lane permanently, so news arriving and going
 * never slides the tab's own label sideways underneath it. A tab that never
 * speaks of it — a fixed section, say — has no lane to hold open and its label
 * starts at the edge.
 */
function tabHoldsLeadingLane(tab: TabItem): boolean {
    return tab.unread !== undefined;
}

/**
 * The tab's leading lane: what the tab *is*. An explicit icon outranks the
 * generated mark, and a tab with neither still holds the lane open if it ever
 * speaks of `unread`. Unread rides on top of whichever mark is there as a corner
 * dot, and only stands in the lane alone when there is no mark to ride — so the
 * news arriving never moves the label.
 *
 * What the tab is *doing* is reported at the trailing edge instead. The two are
 * different questions, and answering both in one lane meant a busy tab lost the
 * only thing distinguishing it from its neighbours at exactly the moment the
 * reader was most likely to be looking for it.
 */
function tabLeadingMark(tab: TabItem, iconSize: 14 | 16 | 18) {
    const mark = tab.icon ? (
        <Icon name={tab.icon} size={iconSize} />
    ) : tab.avatarId !== undefined ? (
        <AvatarBrutalist id={tab.avatarId} size={iconSize} />
    ) : null;
    if (mark === null && !tab.unread && !tabHoldsLeadingLane(tab)) return null;
    return (
        <span
            aria-label={tab.unread ? `${tab.label} has unread activity` : undefined}
            className="happy-tabs__tab-icon"
            data-happy-desktop-ui={
                tab.unread ? "tab-unread" : mark === null ? "tab-lane" : "tab-icon"
            }
        >
            {mark}
            {tab.unread ? (
                <span
                    className={
                        mark === null
                            ? "happy-tabs__tab-unread"
                            : "happy-tabs__tab-unread happy-tabs__tab-unread--corner"
                    }
                />
            ) : null}
        </span>
    );
}

/**
 * What the tab is doing, for the trailing lane. Running work outranks a
 * scheduled wait: a tab doing both is doing real work, and that is the thing
 * worth showing.
 */
function tabActivityMark(tab: TabItem) {
    if (tab.busy) return <Spinner label={`${tab.label} is working`} size={12} tone="muted" />;
    if (tab.waiting)
        return (
            <span
                aria-label={`${tab.label} is waiting`}
                className="happy-tabs__tab-waiting"
                data-happy-desktop-ui="tab-waiting"
                role="img"
            >
                <Icon name="clock" size={12} />
            </span>
        );
    if (tab.dirty)
        return (
            <span
                aria-label={`${tab.label} has unsaved changes`}
                className="happy-tabs__tab-dirty"
                data-happy-desktop-ui="tab-dirty"
                role="img"
            />
        );
    return null;
}
export type TabsProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    activeId: string;
    onSelect: (id: string) => void;
    /** Reports a tab activated with a double click, such as pinning a preview. */
    onDoubleClick?: (id: string) => void;
    tabs: TabItem[];
    size?: TabsSize;
    /**
     * Closes a tab. Supplying it gives every tab a trailing close control that
     * appears while the pointer is over that tab, and whenever it holds keyboard
     * focus. Omit it for a bar whose tabs are fixed sections rather than
     * documents the reader opens and closes.
     */
    onClose?: (id: string) => void;
    /** Accessible name of the close control, for example `Close session`. */
    closeLabel?: string;
    /** Non-visual shortcut announced on the active tab's close control. */
    closeShortcut?: KeyboardShortcut;
    /**
     * Commits a drag with the tab ids in their new order. Supplying it makes the
     * tabs draggable; the component only reports the order it was dragged into
     * and never reorders `tabs` itself, so the owner stays the one source of
     * order.
     */
    onReorder?: (ids: readonly string[]) => void;
    /** Returns the context-menu actions available for one tab. Empty means no menu. */
    tabMenuItems?: (tab: TabItem) => MenuItem[];
    onTabMenuSelect?: (tab: TabItem, actionId: string) => void;
    /**
     * The other places in the window a tab from this strip may be moved to.
     * Supplying them is what makes a tab leave the strip at all: it can be
     * dragged into the matching `TransferZone`, sent there with alt and the
     * arrow pointing at it, or moved from its own context menu.
     */
    transferTargets?: readonly TabTransferTarget[];
    /**
     * Whether one tab may leave this strip. Some cannot — a permanent section,
     * a view the other side has no form for — and they simply stay put rather
     * than offering a move that would have to be refused. Default: all may.
     */
    transferable?: (tab: TabItem) => boolean;
    /** Reports a tab moved into one of the targets. The owner performs the move. */
    onTransfer?: (tabId: string, zone: string) => void;
};
const iconSizes: Record<TabsSize, 14 | 16 | 18> = {
    small: 14,
    medium: 16,
    large: 18,
};

/** Pointer travel that separates a click on a tab from a drag of it. */
const DRAG_THRESHOLD = 4;

/**
 * One in-progress drag. `widths` is measured once at pointer-down so the
 * geometry the drag reasons about cannot change under it while neighbours slide
 * around; `to` is where the dragged tab would land if the pointer lifted now.
 */
interface TabDrag {
    readonly id: string;
    readonly pointerId: number;
    readonly startX: number;
    readonly from: number;
    readonly to: number;
    readonly deltaX: number;
    readonly widths: readonly number[];
    /** False until the pointer passes the threshold, so a click still selects. */
    readonly moved: boolean;
    /** Where the pointer is, for the label that follows it out of the strip. */
    readonly pointerX: number;
    readonly pointerY: number;
    /** True once the pointer has left the strip: the tab is being carried. */
    readonly carried: boolean;
    /** The transfer zone under the pointer, if the drop would land in one. */
    readonly zone?: string;
    /**
     * The element holding the pointer capture, so a gesture that ends without a
     * pointer-up — Escape, or this strip going away — can hand it back.
     */
    readonly captured?: HTMLElement;
}

/** Action ids of the menu's own move entries, which cannot collide with the owner's. */
const TRANSFER_MENU_PREFIX = "happy-tabs-transfer:";

/** Where the dragged tab lands: each neighbour it has passed by half its width. */
function dragTargetIndex(drag: TabDrag, deltaX: number): number {
    let index = drag.from;
    let travel = deltaX;
    while (travel > 0 && index < drag.widths.length - 1) {
        const next = drag.widths[index + 1]!;
        if (travel <= next / 2) break;
        travel -= next;
        index += 1;
    }
    while (travel < 0 && index > 0) {
        const previous = drag.widths[index - 1]!;
        if (-travel <= previous / 2) break;
        travel += previous;
        index -= 1;
    }
    return index;
}

/** The dragged id moved from its old index to its new one. */
function orderAfterDrag(ids: readonly string[], from: number, to: number): readonly string[] {
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    return next;
}

/**
 * How far a tab slides while another one is dragged across it: every tab between
 * the drag's origin and its target steps aside by exactly the dragged tab's
 * width, which is what makes the gap follow the pointer.
 */
function tabShift(drag: TabDrag, index: number): number {
    if (index === drag.from) return 0;
    const width = drag.widths[drag.from] ?? 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -width;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return width;
    return 0;
}
/**
 * C-025 Tabs — horizontal tab bar on a bottom hairline. Each tab is a `role=tab`
 * button that optionally carries a leading Icon and a trailing CountBadge; the
 * active tab paints a 2px accent underline that overlaps the container hairline
 * and switches its label/icon to the primary text color. Sizes 32/40/48 high.
 * With `onClose` each tab also carries a close control that reveals on hover,
 * and with `onReorder` the tabs can be dragged into a different order: the
 * dragged tab follows the pointer while its neighbours slide aside, and the new
 * order is reported once on release. Dragging a tab never selects it — a drag
 * rearranges the bar, and only a press that stays put chooses a tab. With
 * `tabMenuItems` a right click on a tab opens a context menu of the actions the
 * owner returns for it — archive this one, the ones beside it, all of them —
 * clamped to the viewport and dismissed by a click elsewhere or Escape.
 */
export function Tabs(props: TabsProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "closeLabel",
        "closeShortcut",
        "style",
        "activeId",
        "onClose",
        "onDoubleClick",
        "onReorder",
        "onSelect",
        "onTabMenuSelect",
        "onTransfer",
        "tabMenuItems",
        "tabs",
        "size",
        "transferTargets",
        "transferable",
    ]);
    const size = () => local.size ?? "medium";
    // The context menu is local UI state: it exists between the right click
    // that opened it and the dismissal or selection that closes it, and never
    // becomes product state.
    const menuRoot = useRef<HTMLDivElement>(null);
    const [tabMenu, setTabMenu] = useState<{
        tab: TabItem;
        items: MenuItem[];
        x: number;
        y: number;
    }>();
    // eslint-disable-next-line happy-react/no-layout-effect -- the context menu must measure its rendered height before clamping the fixed popover to the viewport, and global dismissal listeners require imperative cleanup
    useLayoutEffect(() => {
        if (!tabMenu) return;
        const bounds = menuRoot.current?.getBoundingClientRect();
        if (bounds) {
            const x = Math.max(8, Math.min(tabMenu.x, window.innerWidth - bounds.width - 8));
            const y = Math.max(8, Math.min(tabMenu.y, window.innerHeight - bounds.height - 8));
            if (x !== tabMenu.x || y !== tabMenu.y) {
                setTabMenu({ ...tabMenu, x, y });
                return;
            }
        }
        const close = (event: Event) => {
            if (!menuRoot.current?.contains(event.target as Node)) setTabMenu(undefined);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setTabMenu(undefined);
        };
        const dismiss = () => setTabMenu(undefined);
        document.addEventListener("pointerdown", close);
        document.addEventListener("keydown", closeOnEscape);
        window.addEventListener("resize", dismiss);
        return () => {
            document.removeEventListener("pointerdown", close);
            document.removeEventListener("keydown", closeOnEscape);
            window.removeEventListener("resize", dismiss);
        };
    }, [tabMenu]);
    const openTabMenu = (tab: TabItem, event: MouseEvent<HTMLButtonElement>) => {
        const owned = local.tabMenuItems?.(tab) ?? [];
        // Moving the tab is this component's own act, so it offers it itself
        // rather than making every strip in the product word it again.
        const moves: MenuItem[] = movable(tab)
            ? targets().map((target) => ({
                  icon:
                      target.side === "leading"
                          ? ("panel-collapse" as const)
                          : ("panel-expand" as const),
                  id: `${TRANSFER_MENU_PREFIX}${target.zone}`,
                  kind: "item" as const,
                  label: `Move to ${target.label}`,
              }))
            : [];
        const items: MenuItem[] =
            moves.length > 0 && owned.some((entry) => entry.kind === "item")
                ? [...owned, { kind: "separator" as const }, ...moves]
                : [...owned, ...moves];
        if (!items.some((entry) => entry.kind === "item")) {
            setTabMenu(undefined);
            return;
        }
        event.preventDefault();
        setTabMenu({
            items,
            tab,
            x: event.clientX,
            y: event.clientY,
        });
    };
    // The drag is local UI state: it exists only between pointer-down and
    // pointer-up and never becomes the order, which the owner keeps owning. The
    // ref is what the handlers read, so a pointer event that arrives before
    // React has re-rendered still sees the drag that the previous one started;
    // the state exists only to paint it.
    const dragRef = useRef<TabDrag | undefined>(undefined);
    // A drag ends in a click on the tab that was dragged. Rearranging tabs is
    // not choosing one, so that click is swallowed; the flag is cleared by the
    // click it belongs to, or by the next press if the browser fires none.
    const dragClick = useRef(false);
    const [drag, dragPaint] = useState<TabDrag | undefined>(undefined);
    const list = useRef<HTMLDivElement>(null);
    const dragSet = (next: TabDrag | undefined): void => {
        dragRef.current = next;
        dragPaint(next);
    };
    /**
     * Ends the gesture whatever ended it: the tab stops being carried, the
     * pointer goes back to the document, and every zone in the window goes dark.
     * Releasing the capture is not automatic when the drag ends by any route
     * other than the pointer coming up.
     */
    const dragRelease = (): void => {
        const current = dragRef.current;
        if (current?.captured?.hasPointerCapture(current.pointerId))
            current.captured.releasePointerCapture(current.pointerId);
        dragSet(undefined);
        transferZonesDisarm();
    };
    // What a move has just done, for a reader who cannot see the tab travel.
    // Written into two regions in turn: a region given the same words twice has
    // not changed, and a screen reader says nothing about it, so each move
    // speaks from the region the previous one left silent.
    const [announcements, setAnnouncements] = useState<readonly [string, string]>(["", ""]);
    const [announceSlot, setAnnounceSlot] = useState(0);
    const moveAnnounce = (text: string): void => {
        const slot = announceSlot === 0 ? 1 : 0;
        setAnnounceSlot(slot);
        setAnnouncements(slot === 0 ? [text, ""] : ["", text]);
    };
    const targets = (): readonly TabTransferTarget[] => local.transferTargets ?? [];
    /** Whether this tab is one the owner lets leave the strip. */
    const movable = (tab: TabItem): boolean =>
        tab.disabledReason === undefined &&
        targets().length > 0 &&
        local.onTransfer !== undefined &&
        (local.transferable?.(tab) ?? true);
    /**
     * Moves one tab to a destination. `handed` is true when the reader moved it
     * without a pointer — with the keyboard, or from the menu — which is when
     * the moved tab should be waiting for them on the other side rather than
     * leaving focus on a strip that no longer holds it.
     */
    const transferRun = (tab: TabItem, target: TabTransferTarget, handed = false): void => {
        if (handed) transferFocusRequest(tab.id);
        local.onTransfer?.(tab.id, target.zone);
        haptic("impact");
        moveAnnounce(`${tab.label} moved to ${target.label}`);
    };

    // Whether a drag is in flight, rather than which one: the drag object is
    // replaced on every pointer move, and the listener below cares only that
    // there is something to cancel.
    const dragging = drag !== undefined;
    // eslint-disable-next-line happy-react/no-layout-effect -- Escape has to reach a drag that owns the pointer capture, and only the document hears it; the listener and the capture both live for one gesture and must be released imperatively
    useLayoutEffect(() => {
        if (!dragging) return;
        // Written out here rather than called from the render body: this effect
        // runs for the whole gesture, and a helper rebuilt on every render would
        // make its cleanup run — and so end the drag — on every render too.
        const release = () => {
            const current = dragRef.current;
            if (current?.captured?.hasPointerCapture(current.pointerId))
                current.captured.releasePointerCapture(current.pointerId);
            dragRef.current = undefined;
            dragPaint(undefined);
            transferZonesDisarm();
        };
        const cancel = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            // Dropped nowhere: the strip keeps the order it had and the tab
            // stays where it was, which is what makes a drag reversible.
            dragClick.current = true;
            release();
        };
        document.addEventListener("keydown", cancel);
        return () => {
            document.removeEventListener("keydown", cancel);
            // The zones are marked in the document rather than in this tree, so
            // a strip torn down mid-gesture — the project closed, the group
            // replaced — would otherwise leave them lit with nothing to drop.
            release();
        };
    }, [dragging]);

    // A tab moved here without a pointer is one the reader is still holding, in
    // the sense that matters to a keyboard: it has to be where the next key
    // press lands. The strip that lost it cannot do this, because by the time
    // the move has happened the tab is drawn here instead.
    // eslint-disable-next-line happy-react/no-layout-effect -- focus is a property of the document, not of this tree, and must be set on the rendered element before the reader's next key press reaches it
    useLayoutEffect(() => {
        const claimed = transferFocusClaim(local.tabs.map((tab) => tab.id));
        if (claimed === undefined) return;
        const arrived = list.current?.querySelector<HTMLElement>(
            `[data-happy-desktop-ui="tab"][data-tab-id="${CSS.escape(claimed)}"]`,
        );
        arrived?.focus();
    });

    const dragStart = (event: ReactPointerEvent<HTMLButtonElement>, index: number): void => {
        dragClick.current = false;
        if (local.tabs[index]?.disabledReason !== undefined) return;
        // A strip whose tabs can only be moved to the other side of the window
        // is still a strip whose tabs are dragged: rearranging and moving out
        // are the same gesture, and either one alone is enough to start it.
        const draggable = local.onReorder !== undefined || movable(local.tabs[index]!);
        if (!draggable || event.button !== 0) return;
        // A pointer-down on the close control is that control's, not a drag.
        if ((event.target as HTMLElement).closest('[data-happy-desktop-ui="tab-close"]')) return;
        const widths = [...(list.current?.children ?? [])].map(
            (child) => (child as HTMLElement).offsetWidth,
        );
        const captured = event.currentTarget;
        captured.setPointerCapture(event.pointerId);
        // Every place this tab could go lights up as it is picked up, so where
        // a drag is allowed to end is visible before it has gone anywhere.
        if (movable(local.tabs[index]!)) transferZonesArm(targets().map((target) => target.zone));
        dragSet({
            captured,
            carried: false,
            deltaX: 0,
            from: index,
            id: local.tabs[index]!.id,
            moved: false,
            pointerId: event.pointerId,
            pointerX: event.clientX,
            pointerY: event.clientY,
            startX: event.clientX,
            to: index,
            widths,
        });
    };

    const dragMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
        const current = dragRef.current;
        if (!current || event.pointerId !== current.pointerId) return;
        const deltaX = event.clientX - current.startX;
        const strip = list.current?.getBoundingClientRect();
        const outside =
            strip !== undefined &&
            (event.clientY < strip.top ||
                event.clientY > strip.bottom ||
                event.clientX < strip.left ||
                event.clientX > strip.right);
        const tab = local.tabs[current.from];
        const carried = outside && tab !== undefined && movable(tab);
        if (!current.moved && !carried && Math.abs(deltaX) < DRAG_THRESHOLD) return;
        const zone = carried
            ? transferZoneAt(
                  event.clientX,
                  event.clientY,
                  targets().map((target) => target.zone),
              )
            : undefined;
        if (!carried && current.carried) transferZonesArm(targets().map((target) => target.zone));
        // A tick when the tab crosses into a new slot, and one when it crosses
        // into a zone: both are the moment the drop's meaning changes.
        if (zone !== current.zone) haptic("selection");
        // While the tab is being carried the strip stops rearranging itself:
        // the drag has stopped being about the order it came from.
        const to = carried ? current.to : dragTargetIndex(current, deltaX);
        if (!carried && to !== current.to) haptic("selection");
        dragSet({
            ...current,
            carried,
            deltaX,
            moved: true,
            pointerX: event.clientX,
            pointerY: event.clientY,
            to,
            ...(zone === undefined ? { zone: undefined } : { zone }),
        });
    };

    const dragEnd = (event: ReactPointerEvent<HTMLButtonElement>): void => {
        const current = dragRef.current;
        if (!current || event.pointerId !== current.pointerId) return;
        dragRelease();
        if (!current.moved) return;
        dragClick.current = true;
        const tab = local.tabs[current.from];
        // Released over a zone, the tab goes there. Released anywhere else
        // outside the strip it goes nowhere: a drag that ends over the
        // transcript is a drag the reader thought better of, not a drop.
        if (current.zone !== undefined && tab) {
            const target = targets().find((candidate) => candidate.zone === current.zone);
            if (target) transferRun(tab, target);
            return;
        }
        if (current.carried) return;
        if (current.to === current.from) return;
        haptic("impact");
        local.onReorder?.(
            orderAfterDrag(
                local.tabs.map((tab) => tab.id),
                current.from,
                current.to,
            ),
        );
    };

    /**
     * Alt and the arrow pointing at the destination, which is how a row is moved
     * in the sidebar too. A strip with one destination answers both arrows that
     * name it; a tab that cannot leave answers neither.
     */
    const moveByKey = (event: ReactKeyboardEvent<HTMLButtonElement>, tab: TabItem): void => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (!movable(tab)) return;
        const side = event.key === "ArrowLeft" ? "leading" : "trailing";
        const target = targets().find((candidate) => candidate.side === side);
        if (!target) return;
        event.preventDefault();
        // A hand already holds this tab: two moves of the same tab at once would
        // each be stated against a strip the other has already changed.
        if (dragRef.current) return;
        transferRun(tab, target, true);
    };

    return (
        <div
            {...rest}
            className={["happy-tabs", local.className].filter(Boolean).join(" ")}
            data-dragging={drag?.moved ? "" : undefined}
            data-happy-desktop-ui="tabs"
            data-size={size()}
            ref={list}
            role="tablist"
            style={local.style}
        >
            {local.tabs.map((tab, index) => {
                const active = () => tab.id === local.activeId;
                const dragged = () => drag?.moved === true && drag.from === index;
                const shift = () => (drag?.moved ? tabShift(drag, index) : 0);
                return (
                    <button
                        aria-disabled={tab.disabledReason === undefined ? undefined : true}
                        aria-label={tab.iconOnly ? tab.label : undefined}
                        aria-selected={active() ? "true" : "false"}
                        key={tab.id}
                        className="happy-tabs__tab"
                        data-active={active() ? "" : undefined}
                        data-carried={dragged() && drag?.carried ? "" : undefined}
                        data-dragged={dragged() ? "" : undefined}
                        data-disabled={tab.disabledReason === undefined ? undefined : ""}
                        data-happy-desktop-ui="tab"
                        data-preview={tab.preview ? "" : undefined}
                        data-reorderable={local.onReorder || movable(tab) ? "" : undefined}
                        data-tab-id={tab.id}
                        onClick={() => {
                            if (dragClick.current) {
                                dragClick.current = false;
                                return;
                            }
                            if (tab.disabledReason !== undefined) return;
                            local.onSelect(tab.id);
                        }}
                        onContextMenu={(event) => {
                            if (tab.disabledReason === undefined) openTabMenu(tab, event);
                        }}
                        onDoubleClick={() => {
                            if (tab.disabledReason === undefined) local.onDoubleClick?.(tab.id);
                        }}
                        onKeyDown={(event) => moveByKey(event, tab)}
                        onPointerCancel={dragEnd}
                        onPointerDown={(event) => dragStart(event, index)}
                        onPointerMove={dragMove}
                        onPointerUp={dragEnd}
                        role="tab"
                        style={
                            dragged()
                                ? { transform: `translateX(${drag!.deltaX}px)` }
                                : shift() !== 0
                                  ? { transform: `translateX(${shift()}px)` }
                                  : undefined
                        }
                        title={tab.disabledReason ?? (tab.iconOnly ? tab.label : undefined)}
                        type="button"
                    >
                        {tabLeadingMark(tab, iconSizes[size()])}
                        {tab.iconOnly ? null : (
                            <span
                                className="happy-tabs__tab-label"
                                data-happy-desktop-ui="tab-label"
                            >
                                {/* The tab's own colour, with a pale band wiping
                                    through it. Busy is a passing state, so it may
                                    not restyle the title: the active tab is already
                                    the darkest one in the strip, and painting its
                                    title again here would stack a second emphasis
                                    on top of one the tab had already earned. Only
                                    the travelling band is new. */}
                                {tab.busy && tab.labelShimmer !== false ? (
                                    <ShimmerText sweep="sheen" tone="inherit">
                                        {tab.label}
                                    </ShimmerText>
                                ) : (
                                    tab.label
                                )}
                            </span>
                        )}
                        {tab.badge !== undefined ? (
                            <CountBadge
                                className="happy-tabs__tab-badge"
                                count={tab.badge!}
                                tone={active() ? "accent" : "neutral"}
                            />
                        ) : null}
                        {((closable, activity) =>
                            /* One lane at the trailing edge, holding what the
                               tab is doing and the control that closes it. They
                               share it rather than sitting side by side: both
                               answer "this tab, right now", the reader only ever
                               wants one of them, and a second box would leave a
                               permanent gap on every tab that is merely
                               closable. The close control wins whenever it is
                               revealed, so reaching for it is never a race
                               against a spinner appearing under the pointer. */
                            closable || activity ? (
                                <span
                                    className="happy-tabs__tab-trailing"
                                    data-happy-desktop-ui="tab-trailing"
                                >
                                    {activity ? (
                                        <span
                                            className="happy-tabs__tab-activity"
                                            data-happy-desktop-ui="tab-activity"
                                        >
                                            {activity}
                                        </span>
                                    ) : null}
                                    {closable ? (
                                        /* A `span` because the tab itself is the
                                           button: nesting one button inside
                                           another is invalid, and this control
                                           must sit inside the tab box so it
                                           tracks its hover. */
                                        <span
                                            aria-keyshortcuts={
                                                active() ? local.closeShortcut?.aria : undefined
                                            }
                                            aria-label={local.closeLabel ?? "Close tab"}
                                            className="happy-tabs__tab-close"
                                            data-happy-desktop-ui="tab-close"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                local.onClose!(tab.id);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key !== "Enter" && event.key !== " ")
                                                    return;
                                                event.preventDefault();
                                                event.stopPropagation();
                                                local.onClose!(tab.id);
                                            }}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <Icon name="close" size={12} />
                                        </span>
                                    ) : null}
                                </span>
                            ) : null)(
                            local.onClose !== undefined &&
                                tab.closable !== false &&
                                tab.disabledReason === undefined,
                            tabActivityMark(tab),
                        )}
                        {active() ? (
                            <span
                                aria-hidden="true"
                                className="happy-tabs__tab-underline"
                                data-happy-desktop-ui="tab-underline"
                            />
                        ) : null}
                    </button>
                );
            })}
            {drag?.carried && local.tabs[drag.from] ? (
                /* The tab under the pointer once it has left the strip. It is
                   drawn at the pointer rather than in the bar because that is
                   where the tab now is, and it never takes the pointer: the
                   drop zone is found by hit-testing what is underneath. */
                <span
                    aria-hidden="true"
                    className="happy-tabs__carried"
                    data-happy-desktop-ui="tab-carried"
                    data-over={drag.zone === undefined ? undefined : ""}
                    style={{ left: drag.pointerX, top: drag.pointerY }}
                >
                    {tabLeadingMark(local.tabs[drag.from]!, iconSizes[size()])}
                    <span className="happy-tabs__tab-label">{local.tabs[drag.from]!.label}</span>
                </span>
            ) : null}
            {/* Said out loud, never drawn. Both regions stay mounted, because a
                region that arrives with its own text is one a screen reader may
                never have been watching. */}
            {announcements.map((text, slot) => (
                <span
                    aria-live="polite"
                    className="happy-tabs__announcement"
                    data-happy-desktop-ui="tabs-announcement"
                    key={slot === 0 ? "first" : "second"}
                    role="status"
                >
                    {text}
                </span>
            ))}
            {tabMenu ? (
                <div
                    className="happy-tabs__menu"
                    data-happy-desktop-ui="tabs-menu"
                    ref={menuRoot}
                    style={{ left: tabMenu.x, top: tabMenu.y }}
                >
                    <Menu
                        items={tabMenu.items}
                        onSelect={(actionId) => {
                            const tab = tabMenu.tab;
                            setTabMenu(undefined);
                            if (actionId.startsWith(TRANSFER_MENU_PREFIX)) {
                                const zone = actionId.slice(TRANSFER_MENU_PREFIX.length);
                                const target = targets().find(
                                    (candidate) => candidate.zone === zone,
                                );
                                if (target) transferRun(tab, target, true);
                                return;
                            }
                            local.onTabMenuSelect?.(tab, actionId);
                        }}
                        width={216}
                    />
                </div>
            ) : null}
        </div>
    );
}
