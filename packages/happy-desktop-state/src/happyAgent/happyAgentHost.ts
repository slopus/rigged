/**
 * Host/UI operations the Happy Agent surface may invoke on its desktop shell. This is the
 * application-window boundary only — it never carries the daemon data connection,
 * which flows through the injected HTTP probe on the connection loader. Keeping it
 * a small closed interface lets Blueprint and tests run the surface standalone.
 */
export interface HappyAgentHost {
    /** Remote work is created from a repository, not a folder on the reader's Mac. */
    readonly projectSource?: "repository";
    /** Opens the native application menu (or its dev-server equivalent). */
    applicationMenuOpen(): void;
    /** Prompts for a working directory; resolves to undefined when cancelled. */
    directoryPick(): Promise<string | undefined>;
}

/** Inert host for Blueprint fixtures and tests that need no real shell integration. */
export const happyAgentHostNoop: HappyAgentHost = {
    applicationMenuOpen: () => undefined,
    directoryPick: () => Promise.resolve(undefined),
};
