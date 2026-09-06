import { useSyncExternalStore } from "react";

/** The small, renderer-local diagnostic sample shown in an explicit debug window. */
export interface LivePerformanceSnapshot {
    readonly droppedFrames: number;
    readonly fps?: number;
    readonly jsHeapLimitBytes?: number;
    readonly jsHeapUsedBytes?: number;
    readonly longestFrameMs?: number;
    readonly paused: boolean;
}

/** A lifecycle-bound source for live renderer diagnostics. */
export interface LivePerformanceStore {
    get(): LivePerformanceSnapshot;
    subscribe(listener: () => void): () => void;
}

const bytesNumberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function bytesShort(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value) || value < 0) return "—";
    if (value >= 1024 * 1024 * 1024)
        return `${bytesNumberFormat.format(value / (1024 * 1024 * 1024))}G`;
    if (value >= 1024 * 1024) return `${bytesNumberFormat.format(value / (1024 * 1024))}M`;
    if (value >= 1024) return `${bytesNumberFormat.format(value / 1024)}K`;
    return `${bytesNumberFormat.format(value)}B`;
}

function performanceLabel(snapshot: LivePerformanceSnapshot): string {
    if (snapshot.paused) return "Performance paused while the window is hidden.";
    const fps =
        snapshot.fps === undefined ? "waiting for a sample" : `${snapshot.fps} frames per second`;
    const heap =
        snapshot.jsHeapUsedBytes === undefined
            ? "JavaScript heap unavailable"
            : `JavaScript heap ${bytesShort(snapshot.jsHeapUsedBytes)}${
                  snapshot.jsHeapLimitBytes === undefined
                      ? ""
                      : ` of ${bytesShort(snapshot.jsHeapLimitBytes)}`
              }`;
    const dropped = `${snapshot.droppedFrames} dropped frames in the last sample window`;
    const longest =
        snapshot.longestFrameMs === undefined
            ? ""
            : `; longest frame ${snapshot.longestFrameMs} milliseconds`;
    return `Renderer performance: ${fps}; ${heap}; ${dropped}${longest}.`;
}

/**
 * A quiet readout for the development panel. It subscribes to one external
 * sampler and never opens a product-state subscription or announces each
 * one-second change to assistive technology.
 */
export function LivePerformanceIndicator(props: { store: LivePerformanceStore }) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const label = performanceLabel(snapshot);
    const fps = snapshot.paused ? "paused" : `${snapshot.fps ?? "—"} fps`;
    const heap =
        snapshot.jsHeapUsedBytes === undefined
            ? "unavailable"
            : `${bytesShort(snapshot.jsHeapUsedBytes)}${
                  snapshot.jsHeapLimitBytes === undefined
                      ? ""
                      : ` / ${bytesShort(snapshot.jsHeapLimitBytes)}`
              }`;
    const longest = snapshot.longestFrameMs === undefined ? "—" : `${snapshot.longestFrameMs} ms`;
    return (
        <div
            aria-label={label}
            className="happy-live-performance"
            data-happy-desktop-ui="live-performance"
            role="group"
            title={label}
        >
            <span
                className="happy-live-performance__metric"
                data-happy-desktop-ui="live-performance-fps-label"
            >
                FPS
            </span>
            <span
                className="happy-live-performance__value"
                data-happy-desktop-ui="live-performance-fps"
            >
                {fps}
            </span>
            <span
                className="happy-live-performance__metric"
                data-happy-desktop-ui="live-performance-heap-label"
            >
                JS heap
            </span>
            <span
                className="happy-live-performance__value"
                data-happy-desktop-ui="live-performance-heap"
            >
                {heap}
            </span>
            <span
                className="happy-live-performance__metric"
                data-happy-desktop-ui="live-performance-longest-label"
            >
                Longest frame
            </span>
            <span
                className="happy-live-performance__value"
                data-happy-desktop-ui="live-performance-longest"
            >
                {longest}
            </span>
            <span
                className="happy-live-performance__metric"
                data-happy-desktop-ui="live-performance-dropped-label"
            >
                Dropped
            </span>
            <span
                className="happy-live-performance__value"
                data-dropped={snapshot.droppedFrames > 0 ? "true" : undefined}
                data-happy-desktop-ui="live-performance-dropped"
            >
                {snapshot.droppedFrames}
            </span>
        </div>
    );
}
