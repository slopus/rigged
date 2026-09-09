/**
 * What the surface must know about the window drawing it. macOS full screen
 * hides the traffic lights and no CSS display mode reports it, so the shell can
 * only learn it from the host; the surface reads it as an ordinary immutable
 * snapshot with a subscription, exactly like every other store it renders.
 */
export interface HappyAgentWindowSnapshot {
    /** The window fills the display and the native window controls are gone. */
    readonly fullScreen: boolean;
    /**
     * A connection rail stands between the window's left edge and this surface.
     * The rail owns the top-left corner, so the surface neither clears a lane
     * for the native controls nor heads itself with the product mark. It is
     * independent of `fullScreen`, which keeps reporting the window itself.
     */
    readonly connectionRail: boolean;
}

export interface HappyAgentWindowStore {
    get(): HappyAgentWindowSnapshot;
    subscribe(listener: () => void): () => void;
}

const windowed: HappyAgentWindowSnapshot = { fullScreen: false, connectionRail: false };

/** Inert windowed chrome for Blueprint fixtures, tests, and the browser shell. */
export const happyAgentWindowStoreNoop: HappyAgentWindowStore = {
    get: () => windowed,
    subscribe: () => () => undefined,
};
