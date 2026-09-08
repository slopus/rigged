import { connectWithCustomMessagingProtocol, initialize } from "react-devtools-core";
import {
    desktopReactDevtoolsMessageParse,
    DESKTOP_REACT_DEVTOOLS_CORE_VERSION,
    DESKTOP_REACT_VERSION,
    type DesktopReactDevtoolsCommand,
} from "../shared/desktopProfiler";

let performanceMeasureDrain: PerformanceObserver | undefined;

/**
 * React DOM's profiling renderer emits a `PerformanceMeasure` for every
 * component render whether or not React DevTools is actively recording.
 * Chromium retains those entries (including changed-prop detail) until they
 * are explicitly cleared. A streaming conversation can otherwise leave
 * hundreds of thousands of entries in the renderer and eventually make the
 * next `performance.measure` fail while cloning its detail out of memory.
 *
 * React DevTools sends its profile through the custom backend below, so its
 * artifact does not depend on entries remaining in the browser's Performance
 * Timeline after observers have received them.
 */
function performanceMeasureRetentionBound(): void {
    if (performanceMeasureDrain || typeof PerformanceObserver === "undefined") return;
    performance.clearMeasures();
    performanceMeasureDrain = new PerformanceObserver(() => performance.clearMeasures());
    performanceMeasureDrain.observe({ entryTypes: ["measure"] });
}

/**
 * The profile HTML entry calls this synchronously before it dynamically imports
 * renderer.tsx. React DOM reads __REACT_DEVTOOLS_GLOBAL_HOOK__ while its
 * renderer initializes; a sibling static import cannot make that ordering
 * contract explicit enough.
 *
 * The profile build owns this official, version-pinned backend. Standard builds
 * do not import this entry and retain the ordinary React DOM renderer.
 */
export function happyProfilerBootstrap(): void {
    performanceMeasureRetentionBound();
    const bridge = window.happyDesktop;
    const hookAlreadyInstalled = Object.prototype.hasOwnProperty.call(
        window as object,
        "__REACT_DEVTOOLS_GLOBAL_HOOK__",
    );
    if (!bridge || hookAlreadyInstalled) return;

    const backendListeners = new Set<
        (message: { readonly event: string; readonly payload: unknown }) => void
    >();

    // Install the official hook only when no extension or other embedder owns
    // the global. The profile stays attribution-unavailable rather than
    // replacing an existing renderer/fiber identity owner.
    initialize({
        appendComponentStack: false,
        breakOnConsoleErrors: false,
        hideConsoleLogsInStrictMode: true,
        showInlineWarningsAndErrors: false,
    });

    bridge.profilerReactSubscribe((command: DesktopReactDevtoolsCommand) => {
        // react-devtools-core's Bridge wall listener receives one envelope,
        // not two positional arguments. Keeping the official envelope shape
        // here is what makes Settings start/stop/get commands reach Agent.
        for (const listener of backendListeners)
            listener({ event: command.event, payload: command.payload });
    });

    connectWithCustomMessagingProtocol({
        onMessage(event, payload) {
            const message = desktopReactDevtoolsMessageParse(event, payload);
            if (message) bridge.profilerReactMessage(message);
        },
        onSubscribe(listener) {
            backendListeners.add(listener);
        },
        onUnsubscribe(listener) {
            backendListeners.delete(listener);
        },
    });

    bridge.profilerReactMessage({
        devtoolsVersion: DESKTOP_REACT_DEVTOOLS_CORE_VERSION,
        profileBuild: true,
        reactVersion: DESKTOP_REACT_VERSION,
        type: "ready",
    });
}
