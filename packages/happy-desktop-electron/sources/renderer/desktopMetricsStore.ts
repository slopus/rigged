import type { LivePerformanceSnapshot, LivePerformanceStore } from "happy-desktop-ui";

const SAMPLE_INTERVAL_MS = 1_000;
// Keep dropped-frame reporting comparable across displays. The FPS readout is
// the observed callback rate and may exceed 60 on a high-refresh display.
const FRAME_BUDGET_MS = 1_000 / 60;

type PerformanceWithMemory = Performance & {
    readonly memory?: {
        readonly jsHeapSizeLimit: number;
        readonly totalJSHeapSize: number;
        readonly usedJSHeapSize: number;
    };
};

const initialSnapshot: LivePerformanceSnapshot = {
    droppedFrames: 0,
    paused: false,
};

function memoryRead(): Pick<LivePerformanceSnapshot, "jsHeapLimitBytes" | "jsHeapUsedBytes"> {
    const memory = (globalThis.performance as PerformanceWithMemory | undefined)?.memory;
    if (!memory) return {};
    return {
        ...(Number.isFinite(memory.jsHeapSizeLimit) && memory.jsHeapSizeLimit > 0
            ? { jsHeapLimitBytes: memory.jsHeapSizeLimit }
            : {}),
        ...(Number.isFinite(memory.usedJSHeapSize) && memory.usedJSHeapSize >= 0
            ? { jsHeapUsedBytes: memory.usedJSHeapSize }
            : {}),
    };
}

/**
 * Measures only the renderer that owns the footer. Frame timestamps are kept
 * locally and published at one-second boundaries, so the sampler itself never
 * creates a per-frame React update. It is intentionally not a product store:
 * no loop exists until the indicator subscribes, and every loop is removed when
 * the footer (or the whole app during an agent restart) goes away.
 */
export function desktopMetricsStoreCreate(): LivePerformanceStore {
    let snapshot = initialSnapshot;
    const listeners = new Set<() => void>();
    let frameHandle: number | undefined;
    let sampleTimer: ReturnType<typeof setInterval> | undefined;
    let running = false;
    let visibilityListener: (() => void) | undefined;
    let frameWindowStart: number | undefined;
    let previousFrameAt: number | undefined;
    let frameCount = 0;
    let droppedFrames = 0;
    let longestFrameMs = 0;

    const publish = (): void => {
        for (const listener of listeners) listener();
    };

    const update = (patch: Partial<LivePerformanceSnapshot>): void => {
        const next = { ...snapshot, ...patch };
        if (
            next.droppedFrames === snapshot.droppedFrames &&
            next.fps === snapshot.fps &&
            next.jsHeapLimitBytes === snapshot.jsHeapLimitBytes &&
            next.jsHeapUsedBytes === snapshot.jsHeapUsedBytes &&
            next.longestFrameMs === snapshot.longestFrameMs &&
            next.paused === snapshot.paused
        )
            return;
        snapshot = next;
        publish();
    };

    const frameReset = (at?: number): void => {
        frameWindowStart = at;
        previousFrameAt = at;
        frameCount = 0;
        droppedFrames = 0;
        longestFrameMs = 0;
    };

    const frameStop = (): void => {
        if (frameHandle === undefined) return;
        globalThis.cancelAnimationFrame(frameHandle);
        frameHandle = undefined;
    };

    const frameSchedule = (): void => {
        if (
            !running ||
            document.hidden ||
            frameHandle !== undefined ||
            typeof globalThis.requestAnimationFrame !== "function"
        )
            return;
        frameHandle = globalThis.requestAnimationFrame(frameReceive);
    };

    const frameReceive = (at: number): void => {
        frameHandle = undefined;
        if (!running || document.hidden) return;
        if (frameWindowStart === undefined) frameReset(at);
        if (previousFrameAt !== undefined) {
            const elapsed = Math.max(0, at - previousFrameAt);
            frameCount += 1;
            longestFrameMs = Math.max(longestFrameMs, elapsed);
            droppedFrames += Math.max(0, Math.round(elapsed / FRAME_BUDGET_MS) - 1);
        }
        previousFrameAt = at;
        const windowStart = frameWindowStart ?? at;
        const elapsed = at - windowStart;
        if (elapsed >= SAMPLE_INTERVAL_MS) {
            update({
                droppedFrames,
                fps: Math.round((frameCount * 1_000) / elapsed),
                ...(longestFrameMs > 0 ? { longestFrameMs: Math.round(longestFrameMs) } : {}),
                paused: false,
            });
            frameReset(at);
        }
        frameSchedule();
    };

    const sampleMemory = (): void => {
        if (!running || document.hidden) return;
        update(memoryRead());
    };

    const sampleTimerStop = (): void => {
        if (sampleTimer === undefined) return;
        clearInterval(sampleTimer);
        sampleTimer = undefined;
    };

    const sampleTimerStart = (): void => {
        if (sampleTimer !== undefined || !running || document.hidden) return;
        sampleTimer = setInterval(sampleMemory, SAMPLE_INTERVAL_MS);
    };

    const samplingStop = (): void => {
        frameStop();
        sampleTimerStop();
        if (visibilityListener !== undefined) {
            document.removeEventListener("visibilitychange", visibilityListener);
            visibilityListener = undefined;
        }
        frameReset();
        snapshot = initialSnapshot;
    };

    const samplingStart = (): void => {
        running = true;
        snapshot = initialSnapshot;
        frameReset();
        const visibilityChanged = (): void => {
            if (document.hidden) {
                frameStop();
                sampleTimerStop();
                frameReset();
                update({
                    droppedFrames: 0,
                    fps: undefined,
                    longestFrameMs: undefined,
                    paused: true,
                });
                return;
            }
            update({
                droppedFrames: 0,
                fps: undefined,
                longestFrameMs: undefined,
                paused: false,
            });
            sampleMemory();
            frameSchedule();
            sampleTimerStart();
        };
        visibilityListener = visibilityChanged;
        document.addEventListener("visibilitychange", visibilityChanged);
        if (document.hidden) {
            update({ paused: true });
        } else {
            sampleMemory();
            frameSchedule();
            sampleTimerStart();
        }
    };

    const samplingStopAndForget = (): void => {
        running = false;
        samplingStop();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) samplingStart();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) samplingStopAndForget();
            };
        },
    };
}
