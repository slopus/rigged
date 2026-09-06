import {
    LivePerformanceIndicator,
    type LivePerformanceSnapshot,
    type LivePerformanceStore,
} from "../../src/LivePerformanceIndicator";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-280";

function fixtureStore(snapshot: LivePerformanceSnapshot): LivePerformanceStore {
    return {
        get: () => snapshot,
        subscribe: () => () => {},
    };
}

const normal = fixtureStore({
    droppedFrames: 0,
    fps: 60,
    jsHeapLimitBytes: 512 * 1024 * 1024,
    jsHeapUsedBytes: 123 * 1024 * 1024,
    longestFrameMs: 17,
    paused: false,
});
const dropped = fixtureStore({
    droppedFrames: 12,
    fps: 42,
    jsHeapLimitBytes: 512 * 1024 * 1024,
    jsHeapUsedBytes: 412 * 1024 * 1024,
    longestFrameMs: 84,
    paused: false,
});
const paused = fixtureStore({ droppedFrames: 0, paused: true });
const heapUnavailable = fixtureStore({ droppedFrames: 0, fps: 60, paused: false });

export function LivePerformanceIndicatorPage() {
    return (
        <ComponentPage
            contract="Surface store"
            number={componentNumber}
            summary="A quiet debug readout for the renderer that owns the window: observed FPS, dropped frames, and JavaScript heap usage. It starts only while the development panel is open, publishes once per second, and pauses while the window is hidden."
            title="Live performance indicator"
        >
            <Specimen
                detail="compact development-panel readout · fixed metric/value columns · tabular values"
                label="Normal renderer"
                number="01"
                stage="chrome"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <LivePerformanceIndicator store={normal} />
                    <DimensionRule label="panel readout · 11px mono · one-second publication" />
                </div>
            </Specimen>

            <Specimen
                detail="dropped-frame signal uses the warning token and the full count remains in the accessible label"
                label="Frame pressure"
                number="02"
                stage="chrome"
            >
                <LivePerformanceIndicator store={dropped} />
            </Specimen>

            <Specimen
                detail="hidden windows say paused instead of reporting a false zero while requestAnimationFrame is throttled"
                label="Window hidden"
                number="03"
                stage="chrome"
            >
                <LivePerformanceIndicator store={paused} />
            </Specimen>

            <Specimen
                detail="when the renderer does not expose performance.memory, FPS remains useful and the heap field says unavailable"
                label="Heap unavailable"
                number="04"
                stage="chrome"
            >
                <LivePerformanceIndicator store={heapUnavailable} />
            </Specimen>
        </ComponentPage>
    );
}
