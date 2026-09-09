import { HAPPY_AGENT_PROTOCOL_VERSION, type DaemonVersion } from "@slopus/happy-agent-client";
import type { ServerCompatibility } from "./types.js";

export const MINIMUM_HAPPY_AGENT_PROTOCOL_VERSION = HAPPY_AGENT_PROTOCOL_VERSION;

/**
 * The oldest Happy Agent this build works with, as the daemon's own product
 * version — the number people see, install, and update to.
 *
 * This is the one knob to raise when Happy starts requiring a newer daemon.
 * The wire protocol number stays the hard gate underneath: a daemon speaking
 * an older protocol cannot be talked to at all, whatever its version says.
 * The screens quote this version, not the protocol number.
 */
export const MINIMUM_HAPPY_AGENT_VERSION = "0.4.44";

/**
 * Orders two daemon product versions by their dotted numeric fields. A
 * prerelease suffix on a field ("29-beta") counts as the number it starts
 * with; the daemon and this client share one version scheme, so nothing finer
 * is needed to say "at least".
 */
function versionCompare(left: string, right: string): number {
    const leftParts = left.split(".");
    const rightParts = right.split(".");
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
        const leftValue = Number.parseInt(leftParts[index] ?? "0", 10) || 0;
        const rightValue = Number.parseInt(rightParts[index] ?? "0", 10) || 0;
        if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1;
    }
    return 0;
}

/** Whether the last daemon product version observed supports a versioned feature. */
export function happyAgentVersionAtLeast(
    version: string | undefined,
    minimumVersion: string,
): boolean {
    return version !== undefined && versionCompare(version, minimumVersion) >= 0;
}

export const CHECKING_SERVER_COMPATIBILITY: ServerCompatibility = {
    status: "checking",
    minimumSupportedProtocolVersion: MINIMUM_HAPPY_AGENT_PROTOCOL_VERSION,
    minimumSupportedVersion: MINIMUM_HAPPY_AGENT_VERSION,
};

export function serverCompatibility(
    version: DaemonVersion,
): Exclude<ServerCompatibility, { status: "checking" }> {
    const protocol =
        Number.isSafeInteger(version.protocol) && version.protocol >= 0 ? version.protocol : 0;
    const supported = {
        minimumSupportedProtocolVersion: MINIMUM_HAPPY_AGENT_PROTOCOL_VERSION,
        minimumSupportedVersion: MINIMUM_HAPPY_AGENT_VERSION,
        serverProtocolVersion: protocol,
        serverVersion: version.daemon,
    };
    if (
        protocol < MINIMUM_HAPPY_AGENT_PROTOCOL_VERSION ||
        !happyAgentVersionAtLeast(version.daemon, MINIMUM_HAPPY_AGENT_VERSION)
    )
        return { ...supported, status: "server_outdated" };
    return { ...supported, status: "compatible" };
}

export function describeServerCompatibility(compatibility: ServerCompatibility): string {
    if (compatibility.status === "server_outdated") {
        return `Happy Agent on this machine is version ${compatibility.serverVersion}, but this build of Happy needs at least version ${compatibility.minimumSupportedVersion}.`;
    }
    return compatibility.status === "compatible"
        ? "The Happy Agent server is compatible."
        : "The Happy Agent server compatibility check is still in progress.";
}
