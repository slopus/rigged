import { readFile } from "node:fs/promises";
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { Duplex } from "node:stream";
import {
    HappyAgentApiError,
    HappyAgentClient,
    type AgentResponse,
    type Cuid2,
    type DrainResponse,
    type FileContentResponse,
    type HealthResponse,
    type InspectorStartedResponse,
    type InspectorStoppedResponse,
    type ShutdownResponse,
    type WorkspaceResponse,
    type WriteFileRequest,
    type WriteFileResponse,
} from "@slopus/happy-agent-client";
import { WebSocket, createWebSocketStream } from "ws";

/**
 * Largest terminal frame carried by either side of the desktop bridge.
 *
 * Happy Agent's terminal protocol uses bounded binary frames. This remains
 * deliberately larger than the protocol's own largest frame while refusing an
 * unbounded WebSocket payload before it can reach the renderer.
 */
export const HAPPY_AGENT_TERMINAL_MAX_WIRE_BYTES = 4 * 1024 * 1024;

export interface HappyAgentDaemonClientOptions {
    readonly socketPath: string;
    readonly token: string;
    readonly connectionId?: string;
}

export interface HappyAgentDaemonPaths {
    readonly socketPath: string;
    readonly tokenPath: string;
}

export interface HappyAgentDaemonRawResponse {
    readonly statusCode: number;
    readonly headers: IncomingHttpHeaders;
    readonly body: IncomingMessage;
}

/** One runtime component whose admitted work has not finished draining. */
export type DrainWaitingFor = NonNullable<HealthResponse["drainWaitingFor"]>[number];

/** Where a debugger attaches once Happy Agent's inspector is listening. */
export type HappyAgentDaemonInspectorResponse = InspectorStartedResponse;

/** Whether an inspector was listening before the stop request. */
export type HappyAgentDaemonInspectorStopResponse = InspectorStoppedResponse;

/**
 * Authenticated Unix-socket boundary for Happy Agent.
 *
 * It intentionally does not reproduce the browser-safe HappyAgentClient API.
 * The renderer already owns that client and reaches it through `rawRequest`.
 * Main only keeps the few transport operations a sandboxed browser cannot do:
 * health during bootstrap, terminal WebSockets, browser CONNECT tunnels, and
 * workspace file/path reads for native preview and Open In services.
 */
export class HappyAgentDaemonClient {
    readonly socketPath: string;
    readonly #token: string;
    readonly #client: HappyAgentClient;
    readonly #connectionId?: string;
    readonly #connections = new Map<string, HappyAgentDaemonClient>();

    constructor(options: HappyAgentDaemonClientOptions) {
        this.socketPath = options.socketPath;
        this.#token = options.token;
        this.#connectionId = options.connectionId;
        const client = new HappyAgentClient({
            endpoint: "http://happy-agent/",
            token: options.token,
            fetch: (input, init) => unixSocketFetch(options.socketPath, input, init),
        });
        this.#client = options.connectionId ? client.connection(options.connectionId) : client;
    }

    connection(id: string): HappyAgentDaemonClient {
        let client = this.#connections.get(id);
        if (!client) {
            client = new HappyAgentDaemonClient({
                socketPath: this.socketPath,
                token: this.#token,
                connectionId: id,
            });
            this.#connections.set(id, client);
        }
        return client;
    }

    health(signal?: AbortSignal): Promise<HealthResponse> {
        return this.#client.getHealth(signal ? { signal } : undefined);
    }

    /**
     * Puts this daemon process into its sticky drain mode: it stops admitting
     * work and reports what is still finishing through `health`. There is no way
     * back out, which is why only a decided restart calls it.
     */
    drain(signal?: AbortSignal): Promise<DrainResponse> {
        return this.#client.drain(signal ? { signal } : undefined);
    }

    /** Asks the daemon to exit; it answers with its pid before going. */
    shutdown(signal?: AbortSignal): Promise<ShutdownResponse> {
        return this.#client.shutdown(signal ? { signal } : undefined);
    }

    startInspector(signal?: AbortSignal): Promise<HappyAgentDaemonInspectorResponse> {
        return this.#client.startInspector(signal ? { signal } : undefined);
    }

    stopInspector(signal?: AbortSignal): Promise<HappyAgentDaemonInspectorStopResponse> {
        return this.#client.stopInspector(signal ? { signal } : undefined);
    }

    getAgent(agentId: string, signal?: AbortSignal): Promise<AgentResponse> {
        return this.#client.getAgent(agentId as Cuid2, signal ? { signal } : undefined);
    }

    getWorkspace(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceResponse> {
        return this.#client.getWorkspace(workspaceId as Cuid2, signal ? { signal } : undefined);
    }

    readWorkspaceFile(
        workspaceId: string,
        filePath: string,
        signal?: AbortSignal,
    ): Promise<FileContentResponse> {
        return this.#client.readFile(
            workspaceId as Cuid2,
            filePath,
            signal ? { signal } : undefined,
        );
    }

    writeWorkspaceFile(
        workspaceId: string,
        request: WriteFileRequest,
        signal?: AbortSignal,
    ): Promise<WriteFileResponse> {
        return this.#client.writeFile(
            workspaceId as Cuid2,
            request,
            signal ? { signal } : undefined,
        );
    }

    /**
     * Opens one daemon request without interpreting its response.
     *
     * Only `/v0` is accepted. The renderer supplies ordinary HTTP headers, but
     * the daemon credential is always replaced here and never leaves main.
     */
    rawRequest(options: {
        readonly method: string;
        readonly path: string;
        readonly body?: Buffer;
        readonly headers?: Readonly<Record<string, string>>;
        readonly signal?: AbortSignal;
    }): Promise<HappyAgentDaemonRawResponse> {
        const path = happyAgentPath(options.path);
        return new Promise((resolvePromise, reject) => {
            if (options.signal?.aborted) {
                reject(abortedError());
                return;
            }
            const headers: Record<string, string | number> = {
                accept: "application/json",
                ...options.headers,
                authorization: `Bearer ${this.#token}`,
            };
            if (options.body !== undefined) headers["content-length"] = options.body.byteLength;
            const request = httpRequest(
                {
                    headers,
                    method: options.method,
                    path,
                    socketPath: this.socketPath,
                },
                (response) => {
                    response.once("close", cleanup);
                    resolvePromise({
                        statusCode: response.statusCode ?? 500,
                        headers: response.headers,
                        body: response,
                    });
                },
            );
            const abort = () => request.destroy(abortedError());
            const cleanup = () => options.signal?.removeEventListener("abort", abort);
            options.signal?.addEventListener("abort", abort, { once: true });
            request.once("close", cleanup);
            request.once("error", reject);
            request.end(options.body);
        });
    }

    /**
     * Resolves the product's agent identity through Happy Agent, then opens the
     * browser tunnel owned by that agent's workspace.
     */
    async openHttpProxy(agentId: string): Promise<Duplex> {
        const { agent } = await this.getAgent(agentId);
        return this.openWorkspaceHttpProxy(agent.workspaceId);
    }

    /** Opens `CONNECT /v0/workspaces/:workspaceId/proxy`. */
    openWorkspaceHttpProxy(workspaceId: string): Promise<Duplex> {
        const path = `/v0/workspaces/${encodeURIComponent(workspaceId)}/proxy`;
        return new Promise((resolvePromise, reject) => {
            const request = httpRequest({
                headers: { authorization: `Bearer ${this.#token}` },
                method: "CONNECT",
                path,
                socketPath: this.socketPath,
            });
            let settled = false;
            const fail = (statusCode: number | undefined): void => {
                if (settled) return;
                settled = true;
                const status = statusCode ?? 500;
                reject(
                    new HappyAgentDaemonHttpError(
                        status,
                        `Happy Agent browser proxy returned ${String(status)}.`,
                    ),
                );
            };
            request.once("connect", (response, socket, head) => {
                if (response.statusCode !== 200) {
                    socket.destroy();
                    fail(response.statusCode);
                    return;
                }
                if (settled) {
                    socket.destroy();
                    return;
                }
                settled = true;
                if (head.length > 0) socket.unshift(head);
                resolvePromise(socket);
            });
            request.once("response", (response) => {
                response.resume();
                fail(response.statusCode);
            });
            request.once("error", (error) => {
                if (settled) return;
                settled = true;
                reject(error);
            });
            request.end();
        });
    }

    /**
     * Opens the binary Happy Agent terminal attachment as a byte stream.
     *
     * The workspace and terminal IDs are already authoritative `/v0`
     * identities; main performs no session lookup or legacy route projection.
     */
    attachTerminal(
        workspaceId: string,
        terminalId: string,
        connectionId?: string,
    ): Promise<Duplex> {
        const remote = connectionId ?? this.#connectionId;
        // The SDK validates the connection ID and owns the proxy prefix.
        const prefix = remote
            ? new URL(
                  this.#connectionId === remote
                      ? this.#client.endpoint
                      : this.#client.connection(remote).endpoint,
              ).pathname.replace(/\/$/u, "")
            : "";
        const path = `${prefix}/v0/workspaces/${encodeURIComponent(
            workspaceId,
        )}/terminals/${encodeURIComponent(terminalId)}/attach`;
        return new Promise((resolvePromise, reject) => {
            const socket = new WebSocket(`ws+unix://${this.socketPath}:${path}`, {
                handshakeTimeout: 10_000,
                headers: { authorization: `Bearer ${this.#token}` },
                maxPayload: HAPPY_AGENT_TERMINAL_MAX_WIRE_BYTES,
                perMessageDeflate: false,
            });
            let settled = false;
            const fail = (error: Error): void => {
                if (settled) return;
                settled = true;
                socket.terminate();
                reject(error);
            };
            const unexpected = (_request: unknown, response: { statusCode?: number }): void => {
                fail(
                    new HappyAgentDaemonHttpError(
                        response.statusCode ?? 500,
                        "The Happy Agent terminal attachment was refused.",
                    ),
                );
            };
            socket.once("error", fail);
            socket.once("unexpected-response", unexpected);
            socket.once("open", () => {
                if (settled) return;
                settled = true;
                socket.off("error", fail);
                socket.off("unexpected-response", unexpected);
                resolvePromise(createWebSocketStream(socket, { allowHalfOpen: false }));
            });
        });
    }
}

/** Resolves the standard Happy Agent daemon endpoint and optional exact overrides. */
export function happyAgentDaemonPathsResolve(
    environment: NodeJS.ProcessEnv = process.env,
    homeDirectory = homedir(),
): HappyAgentDaemonPaths {
    const configuredHome = environment.HAPPY_HOME_DIR?.trim();
    const happyHome =
        configuredHome === undefined || configuredHome.length === 0
            ? join(homeDirectory, ".happy")
            : configuredHome.startsWith("~")
              ? join(homeDirectory, configuredHome.slice(1))
              : isAbsolute(configuredHome)
                ? configuredHome
                : resolve(homeDirectory, configuredHome);
    const directory = join(happyHome, "agent");
    return {
        socketPath:
            environment.HAPPY_AGENT_SERVER_SOCKET_PATH?.trim() || join(directory, "server.sock"),
        tokenPath: environment.HAPPY_AGENT_SERVER_TOKEN_PATH?.trim() || join(directory, "token"),
    };
}

export async function happyAgentDaemonTokenRead(tokenPath: string): Promise<string | undefined> {
    try {
        return (await readFile(tokenPath, "utf8")).trim() || undefined;
    } catch {
        return undefined;
    }
}

/** A daemon response the caller could not use, preserving its HTTP status. */
export class HappyAgentDaemonHttpError extends Error {
    constructor(
        readonly statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = "HappyAgentDaemonHttpError";
    }
}

/**
 * True when this immutable socket/token pair cannot be used again and the
 * desktop runtime must reconnect and reread the token.
 */
export function happyAgentDaemonConnectionUnavailable(error: unknown): boolean {
    let current: unknown = error;
    for (let depth = 0; current && depth < 4; depth += 1) {
        if (typeof current !== "object") return false;
        if (current instanceof HappyAgentApiError)
            return current.status === 401 || current.status === 403;
        if (current instanceof HappyAgentDaemonHttpError)
            return current.statusCode === 401 || current.statusCode === 403;
        const value = current as { readonly cause?: unknown; readonly code?: unknown };
        if (
            value.code === "ECONNREFUSED" ||
            value.code === "ECONNRESET" ||
            value.code === "EPIPE" ||
            value.code === "ENOENT"
        )
            return true;
        current = value.cause;
    }
    return false;
}

function happyAgentPath(path: string): string {
    let parsed: URL;
    try {
        parsed = new URL(path, "http://happy");
    } catch {
        throw new Error("The Happy Agent request path is invalid.");
    }
    if (
        parsed.origin !== "http://happy" ||
        (parsed.pathname !== "/v0" && !parsed.pathname.startsWith("/v0/"))
    )
        throw new Error("Only Happy Agent /v0 routes may cross the desktop bridge.");
    return `${parsed.pathname}${parsed.search}`;
}

function abortedError(): Error {
    return new Error("The Happy Agent request was aborted.");
}

async function unixSocketFetch(
    socketPath: string,
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
    return new Promise((resolvePromise, reject) => {
        if (request.signal.aborted) {
            reject(abortedError());
            return;
        }
        const outgoing = httpRequest(
            {
                headers: Object.fromEntries(request.headers.entries()),
                method: request.method,
                path: `${url.pathname}${url.search}`,
                socketPath,
            },
            (incoming) => {
                const chunks: Buffer[] = [];
                incoming.on("data", (chunk: Buffer | string) =>
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
                );
                incoming.once("error", reject);
                incoming.once("end", () => {
                    const headers = new Headers();
                    for (const [name, value] of Object.entries(incoming.headers)) {
                        if (Array.isArray(value))
                            for (const item of value) headers.append(name, item);
                        else if (value !== undefined) headers.set(name, value);
                    }
                    const payload = Buffer.concat(chunks);
                    resolvePromise(
                        new Response(payload.length === 0 ? null : new Uint8Array(payload), {
                            headers,
                            status: incoming.statusCode ?? 500,
                            statusText: incoming.statusMessage,
                        }),
                    );
                });
            },
        );
        const abort = () => outgoing.destroy(abortedError());
        const cleanup = () => request.signal.removeEventListener("abort", abort);
        request.signal.addEventListener("abort", abort, { once: true });
        outgoing.once("close", cleanup);
        outgoing.once("error", reject);
        outgoing.end(body);
    });
}
