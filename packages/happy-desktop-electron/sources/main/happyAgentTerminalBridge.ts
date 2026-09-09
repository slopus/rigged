import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, createWebSocketStream } from "ws";
import {
    HAPPY_AGENT_TERMINAL_MAX_WIRE_BYTES,
    type HappyAgentDaemonClient,
} from "./happyAgentDaemonClient";

/**
 * The subprotocol a renderer must ask for to reach a terminal. It is the same
 * name the renderer transport uses, so one renderer-side connection implementation
 * addresses either stack.
 */
export const HAPPY_AGENT_TERMINAL_PROTOCOL = "happy2-terminal.v1";
export const HAPPY_AGENT_TERMINAL_CAPABILITY_PROTOCOL_PREFIX = "happy-capability.";

/** The subset of the daemon client a terminal attachment needs. */
export type HappyAgentTerminalClient = Pick<HappyAgentDaemonClient, "attachTerminal">;

export interface HappyAgentTerminalBridgeOptions {
    /** Resolves the local daemon client to attach through, per upgrade. */
    readonly client: () => Promise<HappyAgentTerminalClient>;
    /** Opaque authority advertised only to the trusted renderer. */
    readonly capability?: string;
    /** Exact HTTP Host accepted by the separately-bound packaged proxy. */
    readonly expectedHost?: () => string | undefined;
    /**
     * Path prefix the renderer addresses this bridge under, matching the prefix
     * its HTTP routes are served at (`""` for the packaged app's own loopback
     * port, `/__happy_local_happy_agent` for the Vite development bridge).
     */
    readonly prefix?: string;
    /**
     * One extra browser origin allowed to attach: either the development Vite
     * origin or the local-web distribution's build-pinned hosted origin. The
     * standard packaged renderer's `file:` page is accepted through its opaque
     * origin; anything else is refused.
     */
    readonly allowedOrigin?: string;
}

export interface HappyAgentTerminalBridge {
    /**
     * Handles one HTTP upgrade. Returns `true` when the request addressed a
     * terminal — the socket is this bridge's from then on, answered or rejected —
     * and `false` when it did not, so the host can offer it to its other upgrade
     * listeners (Vite's HMR socket, for one).
     */
    upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean;
    close(): void;
}

interface TerminalRoute {
    readonly connectionId?: string;
    readonly workspaceId: string;
    readonly terminalId: string;
}

/**
 * The renderer's way onto a Happy Agent terminal. The daemon publishes each terminal's
 * live bytes over a WebSocket on its Unix socket, which a sandboxed renderer
 * cannot open and whose bearer token it must never hold; this bridge accepts the
 * renderer's loopback WebSocket, opens the matching daemon attachment, and pipes
 * the two together frame for frame.
 *
 * It is deliberately a byte relay and nothing more: the terminal protocol's
 * epochs, input leases, and resume offsets are end-to-end between the renderer's
 * protocol client and the daemon, so a reconnect resumes against the daemon's own
 * state rather than against anything remembered here.
 */
export function happyAgentTerminalBridgeCreate(
    options: HappyAgentTerminalBridgeOptions,
): HappyAgentTerminalBridge {
    const prefix = options.prefix ?? "";
    const sockets = new WebSocketServer({
        noServer: true,
        maxPayload: HAPPY_AGENT_TERMINAL_MAX_WIRE_BYTES,
        perMessageDeflate: false,
        // The upgrade handler has already established the request asked for it.
        handleProtocols: () => HAPPY_AGENT_TERMINAL_PROTOCOL,
    });
    return {
        upgrade(request, socket, head) {
            const claim = terminalClaim(prefix, request.url);
            if (!claim) return false;
            const protocols = protocolsOf(request.headers["sec-websocket-protocol"]);
            if (
                (options.expectedHost !== undefined &&
                    request.headers.host !== options.expectedHost()) ||
                !originAllowed(
                    request.headers.origin,
                    options.allowedOrigin,
                    options.capability !== undefined,
                ) ||
                (options.capability !== undefined &&
                    !protocols.includes(
                        `${HAPPY_AGENT_TERMINAL_CAPABILITY_PROTOCOL_PREFIX}${options.capability}`,
                    ))
            ) {
                upgradeReject(socket, 403, "Forbidden");
                return true;
            }
            if (!protocols.includes(HAPPY_AGENT_TERMINAL_PROTOCOL)) {
                upgradeReject(socket, 400, "Bad Request");
                return true;
            }
            void (async () => {
                const client = await options.client();
                const daemon = await (claim.connectionId
                    ? client.attachTerminal(claim.workspaceId, claim.terminalId, claim.connectionId)
                    : client.attachTerminal(claim.workspaceId, claim.terminalId));
                if (socket.destroyed) {
                    daemon.destroy();
                    return;
                }
                sockets.handleUpgrade(request, socket, head, (webSocket) => {
                    const renderer = createWebSocketStream(webSocket, { allowHalfOpen: false });
                    // Either end going away must tear the other down, or a closed
                    // renderer tab would leave its PTY attached to a stream nobody
                    // reads and the daemon would keep buffering for it.
                    webSocket.once("close", () => daemon.destroy());
                    webSocket.once("error", () => daemon.destroy());
                    renderer.once("error", () => daemon.destroy());
                    daemon.once("close", () => renderer.destroy());
                    daemon.once("error", () => renderer.destroy());
                    renderer.pipe(daemon);
                    daemon.pipe(renderer);
                });
            })().catch(() => upgradeReject(socket, 502, "Bad Gateway"));
            return true;
        },
        close() {
            for (const client of sockets.clients) client.terminate();
            sockets.close();
        },
    };
}

/**
 * Reads one upgrade path as this bridge's business, or not.
 *
 * A query string is refused rather than ignored — nothing in this route takes
 * one, so its presence means the caller expected behavior this bridge does not
 * have.
 */
function terminalClaim(prefix: string, requestUrl: string | undefined): TerminalRoute | undefined {
    let path: string;
    try {
        const url = new URL(requestUrl ?? "/", "http://127.0.0.1");
        if (url.search) return undefined;
        path = url.pathname;
    } catch {
        return undefined;
    }
    if (!path.startsWith(prefix)) return undefined;
    const remainder = path.slice(prefix.length) || "/";
    return terminalRoute(remainder);
}

/** Matches `/v0/workspaces/:workspaceId/terminals/:terminalId/attach` exactly. */
function terminalRoute(path: string): TerminalRoute | undefined {
    let parts = path.split("/").filter((part) => part.length > 0);
    let connectionId: string | undefined;
    if (
        parts.length === 10 &&
        parts[0] === "v0" &&
        parts[1] === "connections" &&
        parts[3] === "api"
    ) {
        connectionId = parts[2];
        if (!connectionId || !/^[a-z][a-z0-9_-]{0,63}$/u.test(connectionId)) return undefined;
        parts = parts.slice(4);
    }
    if (
        parts.length !== 6 ||
        parts[0] !== "v0" ||
        parts[1] !== "workspaces" ||
        parts[3] !== "terminals" ||
        parts[5] !== "attach"
    )
        return undefined;
    try {
        const workspaceId = decodeURIComponent(parts[2]!);
        const terminalId = decodeURIComponent(parts[4]!);
        if (!workspaceId || !terminalId) return undefined;
        return { workspaceId, terminalId, ...(connectionId ? { connectionId } : {}) };
    } catch {
        return undefined;
    }
}

/**
 * Whether this origin may open a terminal. The packaged renderer's `file:` page
 * sends `null` or no origin at all, and the development renderer is served by the
 * very server this bridge is bound to, so it is same-origin. Anything else has to
 * be the origin the host explicitly allowed — a browser sends `Origin` on a
 * WebSocket handshake it cannot forge, so this is what keeps a random page the
 * user has open from opening a shell on their machine.
 */
function originAllowed(
    origin: string | undefined,
    allowed: string | undefined,
    allowOpaqueOrigin: boolean,
): boolean {
    if (origin === undefined || origin === "null" || origin.startsWith("file:"))
        return allowOpaqueOrigin;
    return allowed !== undefined && origin === allowed;
}

function protocolsOf(header: string | string[] | undefined): string[] {
    return (typeof header === "string" ? header : (header ?? []).join(","))
        .split(",")
        .map((protocol) => protocol.trim())
        .filter(Boolean);
}

function upgradeReject(socket: Duplex, status: number, text: string): void {
    if (!socket.writable) {
        socket.destroy();
        return;
    }
    socket.write(`HTTP/1.1 ${status} ${text}\r\nconnection: close\r\n\r\n`);
    socket.destroy();
}
