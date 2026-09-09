import { createHistory, type HistoryLocation, type RouterHistory } from "@tanstack/react-router";
import {
    happyAgentRouteInGroup,
    happyAgentRouteParse,
    happyAgentRoutePath,
    happyAgentRoutePathParse,
    happyAgentRouteSame,
    HAPPY_AGENT_ROUTE_HOME,
    type HappyAgentRoute,
} from "./happyAgentRoute";

/** How many places a window remembers, oldest dropped first. */
const ENTRY_LIMIT = 100;

type LocationState = HistoryLocation["state"];

/**
 * One window's stack as it is written down: places it has been, oldest first,
 * and which it was showing. Entries are places, not paths.
 */
export interface HappyAgentHistoryDocument {
    readonly entries: readonly HappyAgentRoute[];
    readonly index: number;
}

/** Where a window's navigation stack is kept between runs. */
export interface HappyAgentHistoryPersistence {
    read(): unknown;
    write(document: HappyAgentHistoryDocument): void;
}

/**
 * A window's navigation stack, owned here rather than by the browser.
 *
 * The browser's stack can only be pushed onto and walked — an entry naming
 * something that stopped existing cannot be taken out of it, or even read. These
 * entries are an array, so such an entry is removed outright.
 *
 * Where the window has a Navigation API, each entry is mirrored as a real
 * browser entry so the browser's own Back and Forward walk this stack; a mirror
 * whose entry was removed is recognised by key and stepped over. Without one,
 * the URL is rewritten in place and only this stack moves the window.
 */
export interface HappyAgentRouterHistory extends RouterHistory {
    /**
     * Removes every remembered visit to one file tab. A selected file falls
     * back through the surviving stack, or to the session/workspace behind it
     * when it was the only place in the window.
     */
    fileForget(happyAgentId: string, groupId: string, path: string): boolean;
    /** Removes every remembered address backed by one archived session. */
    sessionForget(
        happyAgentId: string,
        groupId: string,
        sessionId: string,
        fallbackSessionId?: string,
    ): boolean;
    /**
     * Removes every remembered place inside one group, showing the nearest
     * survivor if the window stood on one. Answers whether the stack changed,
     * which is not the same as the window having moved: places behind the reader
     * can go without disturbing where they stand.
     */
    groupForget(happyAgentId: string, groupId: string): boolean;
}

function locationOf(route: HappyAgentRoute, state: LocationState): HistoryLocation {
    const path = happyAgentRoutePath(route);
    return { hash: "", href: path, pathname: path, search: "", state };
}

function stateOf(): LocationState {
    const key = Math.random().toString(36).slice(2, 10);
    return { __TSR_index: 0, __TSR_key: key, key };
}

/**
 * The place the router just asked for. A path that does not parse means the
 * route tree grew a place `HappyAgentRoute` was never told about — a defect in this
 * module. Nothing at the type level ties the two together, so the drift is only
 * found by walking into it: worth stopping on in development, worth a console
 * line and the one always-addressable place in a reader's hands.
 */
function routeOf(path: string): HappyAgentRoute {
    const route = happyAgentRoutePathParse(path);
    if (route !== undefined) return route;
    const complaint = `[happyAgentHistory] no place matches ${path}; add it to HappyAgentRoute`;
    if (import.meta.env.DEV) throw new Error(complaint);
    console.error(complaint);
    return HAPPY_AGENT_ROUTE_HOME;
}

/**
 * Reads a stored stack, keeping the places it can still read. An older build's
 * record can name a place this one lacks: that is one entry lost, not a reason
 * to forget the session.
 */
function documentParse(value: unknown): HappyAgentHistoryDocument | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as { entries?: unknown; index?: unknown };
    if (!Array.isArray(record.entries)) return undefined;
    const stored = record.index;
    const at = typeof stored === "number" && Number.isInteger(stored) ? stored : 0;
    const entries: HappyAgentRoute[] = [];
    // Where the reader was, after the unreadable entries around it are gone.
    let index = 0;
    for (let position = 0; position < record.entries.length; position++) {
        const route = happyAgentRouteParse(record.entries[position]);
        if (route === undefined) continue;
        entries.push(route);
        if (position <= at) index = entries.length - 1;
    }
    return entries.length === 0 ? undefined : { entries, index };
}

/**
 * The place the document was opened at, when somebody asked for one. A bare
 * document addresses nothing and is left to what the window remembers. An
 * address is a request — except when it is this window's own reflection, since
 * the URL is kept in step and a reload finds the record's current place sitting
 * in it; restoring that one entry would throw the rest of the stack away.
 */
function documentRoute(
    restored: HappyAgentHistoryDocument | undefined,
): HappyAgentRoute | undefined {
    if (typeof window === "undefined") return undefined;
    const route = happyAgentRoutePathParse(window.location.hash.slice(1));
    if (route === undefined || route.kind === "home") return undefined;
    const standing = restored?.entries[restored.index];
    return standing !== undefined && happyAgentRoutePath(standing) === happyAgentRoutePath(route)
        ? undefined
        : route;
}

/**
 * Creates the navigation stack for one window. Given somewhere to keep it, the
 * window reopens where it was left. The stored stack is parsed rather than
 * trusted, so a damaged record costs the reader their position and nothing else.
 */
export function happyAgentHistoryCreate(
    options: {
        readonly persistence?: HappyAgentHistoryPersistence;
        readonly initialEntries?: readonly HappyAgentRoute[];
        /** Independent connection histories must not compete for the browser URL. */
        readonly browser?: boolean;
    } = {},
): HappyAgentRouterHistory {
    const persistence = options.persistence;
    const restored = persistence ? documentParse(persistence.read()) : undefined;
    const asked = options.initialEntries?.length
        ? { entries: [...options.initialEntries], index: options.initialEntries.length - 1 }
        : undefined;
    const opened = options.browser === false ? undefined : documentRoute(restored);
    const initial = asked ??
        (opened ? { entries: [opened], index: 0 } : undefined) ??
        restored ?? { entries: [HAPPY_AGENT_ROUTE_HOME], index: 0 };

    let entries: HappyAgentRoute[] = [...initial.entries];
    let states: LocationState[] = entries.map(() => stateOf());
    let index = initial.index;

    // The browser-side mirror. Each entry's browser twin is named by the key
    // the browser issued for it; an entry restored from persistence has none.
    const nav =
        options.browser === false || typeof window === "undefined" ? undefined : window.navigation;
    let slots: (string | undefined)[] = entries.map(() => undefined);
    // Mirrors whose entries were archived away: walked over, never shown.
    const forgotten = new Set<string>();
    // Raised around this module's own URL writes, so the navigate listener
    // acts only on movement it did not cause.
    let writing = false;
    // URL writes wait for an in-flight browser traversal to land.
    let landing: { readonly key: string } | undefined;
    let mirrorWrites: { action: "push" | "replace"; path: string; state: LocationState }[] = [];
    const ownTraversals = new Map<string, number>();
    let browserDispose = (): void => {};
    if (nav?.currentEntry) slots[index] = nav.currentEntry.key;

    const persist = (): void => {
        if (!persistence) return;
        // The window kept has to contain the cursor: trimming past it would
        // write a position that is not in the record.
        const from = Math.min(Math.max(0, entries.length - ENTRY_LIMIT), index);
        persistence.write({
            entries: entries.slice(from, from + ENTRY_LIMIT),
            index: index - from,
        });
    };

    const urlWrite = (action: () => void): void => {
        writing = true;
        try {
            action();
        } catch {
            // A document refusing a URL rewrite still navigates; only the
            // address shown goes stale.
        } finally {
            writing = false;
        }
    };

    const urlReplace = (path: string): void => {
        if (options.browser === false || typeof window === "undefined") return;
        urlWrite(() => window.history.replaceState(null, "", `#${path}`));
    };

    const slotClaim = (at: number, key: string): void => {
        const displaced = slots[at];
        if (displaced !== undefined && displaced !== key) forgotten.add(displaced);
        const previous = slots.indexOf(key);
        if (previous !== -1 && previous !== at) slots[previous] = undefined;
        slots[at] = key;
        forgotten.delete(key);
    };

    const slotsForget = (removed: readonly (string | undefined)[]): void => {
        for (const key of removed) if (key !== undefined) forgotten.add(key);
    };

    /** Drops browser keys that a branch-changing push or entry cap disposed. */
    const mirrorPrune = (): void => {
        if (!nav) return;
        const present = new Set(nav.entries().map((entry) => entry.key));
        for (let at = 0; at < slots.length; at++) {
            const key = slots[at];
            if (key !== undefined && !present.has(key)) slots[at] = undefined;
        }
        for (const key of forgotten) if (!present.has(key)) forgotten.delete(key);
    };

    const mirrorFlush = (): void => {
        const writes = mirrorWrites;
        mirrorWrites = [];
        for (const write of writes) {
            const at = states.indexOf(write.state);
            if (at === -1) continue;
            if (write.action === "push") mirrorPushAt(at, write.path);
            else mirrorReplaceAt(at, write.path);
        }
        if (nav?.currentEntry?.key !== slots[index]) mirrorAlign();
    };

    const landingFail = (own: { readonly key: string }): void => {
        if (landing !== own) return;
        landing = undefined;
        if (mirrorWrites.length > 0) mirrorFlush();
        else mirrorReplaceAt(index, happyAgentRoutePath(entries[index]));
    };

    /** Steps the browser to a mirror; false when the browser dropped it. */
    const slotTraverse = (key: string, own?: { readonly key: string }): boolean => {
        if (!nav) return false;
        if (!nav.entries().some((entry) => entry.key === key)) return false;
        const release = (): void => {
            if (own === undefined) return;
            const count = ownTraversals.get(key) ?? 0;
            if (count <= 1) ownTraversals.delete(key);
            else ownTraversals.set(key, count - 1);
        };
        if (own !== undefined) ownTraversals.set(key, (ownTraversals.get(key) ?? 0) + 1);
        try {
            const moved = nav.traverseTo(key);
            if (own !== undefined) void moved.committed?.catch(() => landingFail(own));
            const finished = moved.finished ?? moved.committed;
            if (finished) void finished.then(release, release);
            else release();
            return true;
        } catch {
            release();
            return false;
        }
    };

    const mirrorReplaceAt = (at: number, path: string): void => {
        if (nav?.currentEntry) {
            const current = nav.currentEntry.key;
            slotClaim(at, current);
        }
        urlReplace(path);
        mirrorPrune();
    };

    /** Makes the current browser entry the mirror of one virtual entry. */
    const mirrorReplace = (path: string): void => {
        if (landing === undefined) mirrorReplaceAt(index, path);
        else mirrorWrites.push({ action: "replace", path, state: states[index] });
    };

    const mirrorPushAt = (at: number, path: string): boolean => {
        if (!nav) {
            urlReplace(path);
            return true;
        }
        // An address set from outside already made a browser entry holding
        // this place; claim it rather than add a twin behind it.
        const current = nav.currentEntry;
        const standing = current?.url
            ? happyAgentRoutePathParse(new URL(current.url).hash.slice(1))
            : undefined;
        if (
            current !== null &&
            !slots.includes(current.key) &&
            standing !== undefined &&
            happyAgentRouteSame(standing, entries[at])
        ) {
            slotClaim(at, current.key);
            // Identity ignores a file's current presentation and backing chat;
            // the virtual entry is still the newest complete address.
            urlReplace(path);
            mirrorPrune();
            return true;
        }
        const before = current?.key;
        urlWrite(() => window.history.pushState(null, "", `#${path}`));
        mirrorPrune();
        const after = nav.currentEntry;
        if (after === null || after.key === before) return false;
        slotClaim(at, after.key);
        return true;
    };

    const mirrorPush = (path: string): boolean | undefined => {
        if (landing !== undefined) {
            mirrorWrites.push({ action: "push", path, state: states[index] });
            return undefined;
        }
        return mirrorPushAt(index, path);
    };

    const mirrorSurvivor = (from: number, here: number): string | undefined => {
        if (!nav) return undefined;
        const all = nav.entries();
        const direction = from < here ? -1 : 1;
        for (let at = from; at >= 0 && at < all.length; at += direction)
            if (slots.includes(all[at].key)) return all[at].key;
        for (let at = from - direction; at >= 0 && at < all.length; at -= direction)
            if (slots.includes(all[at].key)) return all[at].key;
        return undefined;
    };

    /** Brings the browser to where this stack stands after a local move. */
    const mirrorAlign = (): void => {
        const path = happyAgentRoutePath(entries[index]);
        if (!nav) {
            urlReplace(path);
            return;
        }
        const current = nav.currentEntry?.key;
        const slot = slots[index];
        if (slot !== undefined && slot !== current) {
            if (landing?.key === slot) return;
            const own = { key: slot };
            landing = own;
            if (slotTraverse(slot, own)) return;
            if (landing === own) landing = undefined;
            slots[index] = undefined;
        }
        mirrorReplace(path);
    };

    const settle = (): void => {
        mirrorAlign();
        persist();
    };

    let blockers: Parameters<NonNullable<Parameters<typeof createHistory>[0]["setBlockers"]>>[0] =
        [];

    const history = createHistory({
        back: () => {
            index = Math.max(index - 1, 0);
            settle();
        },
        createHref: (path) => `#${path}`,
        destroy: () => browserDispose(),
        forward: () => {
            index = Math.min(index + 1, entries.length - 1);
            settle();
        },
        getBlockers: () => blockers,
        getLength: () => entries.length,
        getLocation: () =>
            locationOf(entries[index], {
                ...states[index],
                // `canGoBack` reads this, so it is answered from the array at
                // every read instead of stored and kept in step.
                __TSR_index: index,
            }),
        go: (step) => {
            index = Math.min(Math.max(index + step, 0), entries.length - 1);
            settle();
        },
        pushState: (path, state) => {
            const route = routeOf(path);
            // Choosing what is already on screen is not another visit. Keep
            // the router's newest location state without growing the stack.
            if (happyAgentRouteSame(entries[index], route)) {
                const previousState = states[index];
                // File identity deliberately ignores its presentation and the
                // chat behind it. A revisit updates those fields in place so a
                // later Back reopens the newest form of that one destination.
                entries[index] = route;
                states[index] = state as LocationState;
                for (const write of mirrorWrites)
                    if (write.state === previousState) write.state = states[index];
                mirrorReplace(path);
                persist();
                return;
            }

            // Somewhere new from part-way back abandons what was ahead.
            let forwardSlots: (string | undefined)[] = [];
            if (index < entries.length - 1) {
                entries.splice(index + 1);
                states.splice(index + 1);
                forwardSlots = slots.splice(index + 1);
            }

            // A revisit moves to the front rather than leaving an older copy
            // behind. Otherwise bouncing between two tabs makes Back appear to
            // loop forever without ever reaching genuinely older work.
            const revisitedSlots: (string | undefined)[] = [];
            for (let at = entries.length - 1; at >= 0; at--) {
                if (!happyAgentRouteSame(entries[at], route)) continue;
                entries.splice(at, 1);
                states.splice(at, 1);
                revisitedSlots.push(...slots.splice(at, 1));
                if (at <= index) index -= 1;
            }

            entries.push(route);
            states.push(state as LocationState);
            slots.push(undefined);
            index = entries.length - 1;
            const result = mirrorPush(path);
            // A browser push from part-way back physically disposes its forward
            // branch. Older revisits remain real entries and are always ghosts.
            slotsForget(revisitedSlots);
            if (result !== true) slotsForget(forwardSlots);
            persist();
        },
        replaceState: (path, state) => {
            const previousState = states[index];
            entries[index] = routeOf(path);
            states[index] = state as LocationState;
            for (const write of mirrorWrites)
                if (write.state === previousState) write.state = states[index];
            mirrorReplace(path);
            persist();
        },
        setBlockers: (next) => {
            blockers = next;
        },
    });

    // Traversals identify their virtual destination before commitment. URL
    // writes wait for `currententrychange`; outside addresses are adopted there.
    if (nav) {
        const navigate = (event: NavigateEvent): void => {
            if (writing || !event.destination.sameDocument) return;
            if (event.navigationType !== "traverse") return;
            const key = event.destination.key;
            if (ownTraversals.has(key)) return;
            if (key === landing?.key) return;
            const at = slots.indexOf(key);
            if (at === index) return;
            if (at !== -1) {
                const own = { key };
                landing = own;
                event.signal.addEventListener("abort", () => landingFail(own), { once: true });
                const step = at - index;
                index = at;
                persist();
                history.notify({ index: step, type: "GO" });
                return;
            }
            if (!forgotten.has(key)) return;

            // Archived: step over the ghost to the nearest surviving mirror,
            // preferring the direction of travel.
            const target = mirrorSurvivor(
                event.destination.index,
                nav.currentEntry?.index ?? event.destination.index,
            );
            if (!event.cancelable) return;
            event.preventDefault();
            if (target !== undefined && target !== nav.currentEntry?.key)
                queueMicrotask(() => slotTraverse(target));
        };

        const currentEntryChange = (event: NavigationCurrentEntryChangeEvent): void => {
            if (writing) return;
            mirrorPrune();
            const current = nav.currentEntry;
            if (current === null) return;

            const landed = landing?.key === current.key;
            if (landed) {
                landing = undefined;
                if (mirrorWrites.length > 0) {
                    mirrorFlush();
                    return;
                }
            }

            if (ownTraversals.has(current.key) && current.key !== slots[index]) {
                mirrorAlign();
                return;
            }

            if (forgotten.has(current.key)) {
                const target = mirrorSurvivor(current.index, event.from.index);
                if (target !== undefined && target !== current.key) {
                    slotTraverse(target);
                } else if (target === undefined) {
                    mirrorReplace(happyAgentRoutePath(entries[index]));
                }
                return;
            }

            const route = current.url
                ? happyAgentRoutePathParse(new URL(current.url).hash.slice(1))
                : undefined;

            // An outside replace reuses the physical key, so it replaces the
            // virtual place too. Treating it as a push would create a twin.
            if (event.navigationType === "replace") {
                if (
                    route !== undefined &&
                    happyAgentRoutePath(entries[index]) !== happyAgentRoutePath(route)
                )
                    history.replace(happyAgentRoutePath(route));
                else if (!slots.includes(current.key)) {
                    slotClaim(index, current.key);
                    persist();
                }
                return;
            }

            const mirroredAt = slots.indexOf(current.key);
            if (mirroredAt !== -1) {
                // A virtual route can be rewritten without removing its browser
                // twin (restoring a file after its backing session closes, for
                // example). Correct that twin as soon as a traversal lands on
                // it so the address bar and a later reload name the live route.
                const expected = happyAgentRoutePath(entries[index]);
                const committed = current.url ? new URL(current.url).hash.slice(1) : undefined;
                if (mirroredAt === index && committed !== expected)
                    mirrorReplaceAt(index, expected);
                return;
            }
            if (route === undefined) return;

            // This committed browser entry predates this history instance or
            // came from an outside hash write. Adopt its real key directly.
            const same = happyAgentRouteSame(entries[index], route);
            if (index < entries.length - 1) {
                entries.splice(index + 1);
                states.splice(index + 1);
                const removed = slots.splice(index + 1);
                // A push already disposed its forward branch; a traversal did
                // not, so those live browser entries become ghosts.
                if (event.navigationType === "traverse") slotsForget(removed);
            }
            if (same) {
                // An outside address may update how this one file is shown.
                // It stays one destination while its complete route follows
                // the address the reader explicitly supplied.
                entries[index] = route;
                slotClaim(index, current.key);
                persist();
                history.notify({ type: "REPLACE" });
                return;
            }

            entries.push(route);
            states.push(stateOf());
            slots.push(undefined);
            index = entries.length - 1;
            slotClaim(index, current.key);
            persist();
            history.notify({ type: "PUSH" });
        };

        nav.addEventListener("navigate", navigate);
        nav.addEventListener("currententrychange", currentEntryChange);
        browserDispose = () => {
            nav.removeEventListener("navigate", navigate);
            nav.removeEventListener("currententrychange", currentEntryChange);
        };
    } else if (options.browser !== false && typeof window !== "undefined") {
        // An address arriving in the URL after startup is the same request as
        // one sitting there at startup. Only an address from outside reaches
        // here, since `replaceState` raises no such event.
        const hashChange = (): void => {
            const route = happyAgentRoutePathParse(window.location.hash.slice(1));
            // A hash naming no place, and the reflection of a step already
            // taken, are both nothing to act on.
            if (route === undefined) return;
            if (happyAgentRouteSame(entries[index], route)) {
                if (happyAgentRoutePath(entries[index]) !== happyAgentRoutePath(route))
                    history.replace(happyAgentRoutePath(route));
                return;
            }
            history.push(happyAgentRoutePath(route));
        };
        window.addEventListener("hashchange", hashChange);
        browserDispose = () => window.removeEventListener("hashchange", hashChange);
    }

    /** Removes matching places and repairs the cursor around what survives. */
    const forget = (
        matches: (route: HappyAgentRoute) => boolean,
        fallback: HappyAgentRoute,
        preferred?: (route: HappyAgentRoute) => boolean,
    ): boolean => {
        const standingRemoved = matches(entries[index]);
        const keptEntries: HappyAgentRoute[] = [];
        const keptStates: LocationState[] = [];
        const keptSlots: (string | undefined)[] = [];
        let keptIndex = -1;
        for (let at = 0; at < entries.length; at++) {
            const route = entries[at];
            const slot = slots[at];
            if (matches(route)) {
                if (slot !== undefined) forgotten.add(slot);
                continue;
            }
            // Removing what sat between two visits to one place would leave
            // it twice in a row, and a Back that appears to do nothing.
            const previous = keptEntries[keptEntries.length - 1];
            if (previous === undefined || !happyAgentRouteSame(previous, route)) {
                keptEntries.push(route);
                keptStates.push(states[at]);
                keptSlots.push(slot);
            } else if (slot !== undefined) forgotten.add(slot);
            if (at <= index) keptIndex = keptEntries.length - 1;
        }
        if (keptEntries.length === entries.length) return false;
        entries = keptEntries;
        states = keptStates;
        slots = keptSlots;
        index = keptIndex === -1 ? 0 : keptIndex;

        if (standingRemoved && preferred) {
            // Closing stays in the workspace when any previously visited tab
            // there survives, regardless of older visits elsewhere.
            for (let at = entries.length - 1; at >= 0; at--)
                if (preferred(entries[at])) {
                    index = at;
                    settle();
                    history.notify({ type: "REPLACE" });
                    return true;
                }
        }

        if (entries.length === 0 || (standingRemoved && preferred)) {
            // Nothing visited in this workspace survived. Move its underlying
            // session/workspace to the front, preserving older global history
            // behind it and keeping one entry per destination.
            for (let at = entries.length - 1; at >= 0; at--) {
                if (!happyAgentRouteSame(entries[at], fallback)) continue;
                const slot = slots[at];
                if (slot !== undefined) forgotten.add(slot);
                entries.splice(at, 1);
                states.splice(at, 1);
                slots.splice(at, 1);
            }
            entries.push(fallback);
            states.push(stateOf());
            slots.push(undefined);
            index = entries.length - 1;
        }
        settle();
        // Told whether or not the place changed: what it can go back to has.
        history.notify({ type: "REPLACE" });
        return true;
    };

    return Object.assign(history, {
        fileForget: (happyAgentId: string, groupId: string, path: string): boolean => {
            const standing = entries[index];
            const fallback: HappyAgentRoute =
                standing.kind === "file" &&
                standing.happyAgentId === happyAgentId &&
                standing.groupId === groupId &&
                standing.path === path
                    ? standing.chatId
                        ? {
                              chatId: standing.chatId,
                              groupId,
                              kind: "chat",
                              happyAgentId,
                          }
                        : { groupId, kind: "group", happyAgentId }
                    : HAPPY_AGENT_ROUTE_HOME;
            return forget(
                (route) =>
                    route.kind === "file" &&
                    route.happyAgentId === happyAgentId &&
                    route.groupId === groupId &&
                    route.path === path,
                fallback,
                (route) =>
                    (route.kind === "chat" || route.kind === "file") &&
                    route.happyAgentId === happyAgentId &&
                    route.groupId === groupId,
            );
        },
        sessionForget: (
            happyAgentId: string,
            groupId: string,
            sessionId: string,
            fallbackSessionId?: string,
        ): boolean => {
            let fileRouteUpdated = false;
            entries = entries.map((route) => {
                if (
                    route.kind !== "file" ||
                    route.happyAgentId !== happyAgentId ||
                    route.groupId !== groupId ||
                    route.chatId !== sessionId
                )
                    return route;
                fileRouteUpdated = true;
                return {
                    fileKind: route.fileKind,
                    groupId: route.groupId,
                    kind: "file",
                    happyAgentId: route.happyAgentId,
                    path: route.path,
                };
            });
            const removed = forget(
                (route) =>
                    route.kind === "chat" &&
                    route.happyAgentId === happyAgentId &&
                    route.groupId === groupId &&
                    route.chatId === sessionId,
                fallbackSessionId === undefined
                    ? { groupId, kind: "group", happyAgentId }
                    : {
                          chatId: fallbackSessionId,
                          groupId,
                          kind: "chat",
                          happyAgentId,
                      },
                (route) =>
                    (route.kind === "chat" || route.kind === "file") &&
                    route.happyAgentId === happyAgentId &&
                    route.groupId === groupId,
            );
            if (removed || !fileRouteUpdated) return removed;
            settle();
            history.notify({ type: "REPLACE" });
            return true;
        },
        groupForget: (happyAgentId: string, groupId: string): boolean =>
            forget(
                (route) => happyAgentRouteInGroup(route, happyAgentId, groupId),
                HAPPY_AGENT_ROUTE_HOME,
            ),
    });
}
