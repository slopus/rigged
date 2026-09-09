import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import { HappyAgentApiError } from "@slopus/happy-agent-client";
import {
    happyAgentDaemonConnectionUnavailable,
    HappyAgentDaemonHttpError,
    type HappyAgentDaemonClient,
} from "./happyAgentDaemonClient";
import { openInRun, openInTargetsRead } from "./openIn";
import { happyAgentDaemonHealthProject } from "./happyAgentHttpProxy";

/** The minimal Happy Agent surface used by the loopback bridge. */
export type HappyAgentProxyClient = Pick<
    HappyAgentDaemonClient,
    "getWorkspace" | "health" | "rawRequest" | "readWorkspaceFile" | "writeWorkspaceFile"
> & { readonly connection?: (id: string) => HappyAgentProxyClient };

export interface HappyAgentProxyHandleOptions {
    readonly client: HappyAgentProxyClient;
    readonly method: string;
    readonly path: string;
    readonly query: URLSearchParams;
    readonly request: IncomingMessage;
    readonly response: ServerResponse;
    readonly onConnectionError?: (error: unknown) => void;
    /** Publishes one workspace file as an isolated local preview site. */
    readonly htmlPreviewUrl?: (
        workspaceId: string,
        filePath: string,
        connectionId?: string,
    ) => string;
}

/**
 * The status a refused daemon call carried, whichever boundary raised it.
 *
 * Both are the daemon answering, and both must be read the same way. Reading
 * only one of them is how an ordinary "not there yet" 404 became a hard failure:
 * the file routes moved onto `HappyAgentClient` while the checks below still
 * asked for the transport's own error type, so every probe for a name that was
 * free was rethrown instead of answered.
 */
function daemonErrorStatus(error: unknown): number | undefined {
    if (error instanceof HappyAgentDaemonHttpError) return error.statusCode;
    if (error instanceof HappyAgentApiError) return error.status;
    return undefined;
}

/**
 * Handles the desktop's capability-scoped loopback bridge.
 *
 * `/v0/**` is a transparent authenticated Happy Agent bridge. The few routes
 * beside it are genuinely desktop-local services: native Open In and
 * credential-free media/HTML preview URLs. There is no daemon protocol
 * projection here and no legacy route fallback.
 */
export async function happyAgentProxyHandle(
    options: HappyAgentProxyHandleOptions,
): Promise<boolean> {
    const { method, query, request, response } = options;
    let { client, path } = options;
    const remote = /^\/connections\/([a-z][a-z0-9_-]{0,63})(\/[^/]+)$/u.exec(path);
    const connectionId = remote?.[1];
    if (connectionId) {
        if (!client.connection) {
            writeJson(response, 501, {
                error: "Update the desktop shell to use remote file services.",
            });
            return true;
        }
        client = client.connection(connectionId);
        path = remote![2]!;
    }
    const daemonPath = happyAgentDaemonPath(path, query);
    if (daemonPath !== undefined) {
        await happyAgentForward(
            client,
            request,
            response,
            method,
            daemonPath,
            path.startsWith("/v0/connections/") ? undefined : options.onConnectionError,
        );
        return true;
    }

    try {
        if (method === "GET" && path === "/health") {
            writeJson(response, 200, happyAgentDaemonHealthProject(await client.health()));
            return true;
        }
        if (method === "GET" && path === "/open-in-targets") {
            writeJson(response, 200, connectionId ? [] : await openInTargetsRead());
            return true;
        }
        if (method === "POST" && path === "/open-in") {
            if (connectionId)
                throw new Error("A remote workspace cannot be opened as a local folder.");
            const body = await bodyReadJson(request);
            const workspaceId = requiredString(body.workspaceId, "workspaceId");
            const target = requiredString(body.target, "target");
            const { workspace } = await client.getWorkspace(workspaceId);
            if (workspace.compute.type !== "host")
                throw new Error("A container workspace cannot be opened as a local folder.");
            await openInRun(target, workspace.compute.path);
            writeJson(response, 200, {});
            return true;
        }
        if (method === "POST" && path === "/attachment") {
            const body = await bodyReadJson(request);
            writeJson(
                response,
                200,
                await attachmentWrite(
                    client,
                    requiredString(body.workspaceId, "workspaceId"),
                    stringValue(body.name, "name"),
                    stringValue(body.content, "content"),
                ),
            );
            return true;
        }
        if (method === "POST" && path === "/attachment-source-reachable") {
            const body = await bodyReadJson(request);
            writeJson(response, 200, {
                reachable:
                    !connectionId &&
                    (await attachmentSourceReachable(
                        client,
                        requiredString(body.workspaceId, "workspaceId"),
                        requiredString(body.sourcePath, "sourcePath"),
                    )),
            });
            return true;
        }
        if (method === "GET" && path === "/workspace-file-bytes") {
            const workspaceId = requiredQuery(query, "workspaceId");
            const filePath = requiredQuery(query, "path");
            const file = await requestWithAbort(request, (signal) =>
                workspaceFileBytesLoad(client, workspaceId, filePath, undefined, signal),
            );
            writeJson(response, 200, {
                contentType: file.contentType,
                hash: file.hash,
                path: filePath,
                size: file.bytes.byteLength,
            });
            return true;
        }
        if (method === "GET" && path === "/html-preview") {
            if (!options.htmlPreviewUrl) {
                writeJson(response, 501, {
                    error: "This desktop cannot show a rendered workspace document.",
                });
                return true;
            }
            const workspaceId = requiredQuery(query, "workspaceId");
            const filePath = requiredQuery(query, "path");
            writeJson(response, 200, {
                url: options.htmlPreviewUrl(workspaceId, filePath, connectionId),
            });
            return true;
        }
        if ((method === "GET" || method === "HEAD") && path === "/workspace-file-media") {
            await requestWithAbort(request, (signal) =>
                workspaceFileMediaServe(
                    client,
                    requiredQuery(query, "workspaceId"),
                    requiredQuery(query, "path"),
                    query.get("hash") ?? undefined,
                    request,
                    response,
                    signal,
                ),
            );
            return true;
        }
        return false;
    } catch (error) {
        if (!connectionId && happyAgentDaemonConnectionUnavailable(error))
            options.onConnectionError?.(error);
        if (!response.headersSent) {
            const status = daemonErrorStatus(error);
            writeJson(response, status ?? 502, { error: errorMessage(error) });
        } else {
            response.end();
        }
        return true;
    }
}

/**
 * Reads one workspace file through Happy Agent.
 *
 * Exported for the isolated HTML preview server, whose page assets must use the
 * same authenticated workspace-rooted file API as the renderer.
 */
export function workspaceFileLoad(
    client: HappyAgentProxyClient,
    workspaceId: string,
    filePath: string,
    signal?: AbortSignal,
): Promise<{ readonly content: string; readonly hash: string }> {
    return client.readWorkspaceFile(workspaceId, filePath, signal);
}

function attachmentNameSafe(name: string): string {
    const base = name.split(/[\\/]/u).pop() ?? "";
    const printable = [...base]
        .filter((character) => (character.codePointAt(0) ?? 0) >= 0x20)
        .join("");
    return printable.replace(/^\.+/u, "").trim().slice(0, 120) || "attachment";
}

function attachmentNameNumbered(name: string, attempt: number): string {
    const dot = name.lastIndexOf(".");
    if (dot <= 0) return `${name}-${String(attempt)}`;
    return `${name.slice(0, dot)}-${String(attempt)}${name.slice(dot)}`;
}

const ATTACHMENT_NAME_ATTEMPTS = 50;

async function attachmentWrite(
    client: HappyAgentProxyClient,
    workspaceId: string,
    name: string,
    content: string,
): Promise<{ readonly path: string }> {
    const wanted = attachmentNameSafe(name);
    for (let attempt = 1; attempt <= ATTACHMENT_NAME_ATTEMPTS; attempt += 1) {
        const path = attempt === 1 ? wanted : attachmentNameNumbered(wanted, attempt);
        if (await workspaceFileExists(client, workspaceId, path)) continue;
        try {
            await client.writeWorkspaceFile(workspaceId, {
                content,
                expectedHash: null,
                path,
            });
            return { path };
        } catch (error) {
            if (
                daemonErrorStatus(error) !== 409 ||
                !(await workspaceFileExists(client, workspaceId, path))
            )
                throw error;
        }
    }
    throw new Error(`The workspace already holds every available name for ${wanted}.`);
}

/**
 * Whether an agent working in this workspace could open the reader's file where
 * it already lies.
 *
 * When the answer is yes the attachment needs no transfer at all: the file and
 * the agent are on one machine, so naming the path is the whole of the work.
 * That is why an attachment's size stops mattering — nothing is read, encoded,
 * or written, and a screen recording costs exactly what a text file costs.
 *
 * The answer is no when work happens somewhere the reader's disk is not: a
 * container workspace has its own filesystem, and a Happy Agent on another machine
 * would resolve this path against a stranger's disk. Both send the bytes
 * instead. A path that is not there any more is also no, because the check that
 * matters is whether it can be opened rather than whether it once existed.
 */
async function attachmentSourceReachable(
    client: HappyAgentProxyClient,
    workspaceId: string,
    sourcePath: string,
): Promise<boolean> {
    const { workspace } = await client.getWorkspace(workspaceId);
    if (workspace.compute.type !== "host") return false;
    try {
        return (await stat(sourcePath)).isFile();
    } catch {
        return false;
    }
}

async function workspaceFileExists(
    client: HappyAgentProxyClient,
    workspaceId: string,
    path: string,
): Promise<boolean> {
    try {
        await client.readWorkspaceFile(workspaceId, path);
        return true;
    } catch (error) {
        if (daemonErrorStatus(error) === 404) return false;
        throw error;
    }
}

/**
 * The daemon's own versioned surface, forwarded as it stands. It needs no
 * prefix of its own: `/v0` is the daemon's namespace, and every desktop-local
 * route beside it is named for what it does.
 */
function happyAgentDaemonPath(path: string, query: URLSearchParams): string | undefined {
    if (path !== "/v0" && !path.startsWith("/v0/")) return undefined;
    const suffix = query.toString();
    return `${path}${suffix.length > 0 ? `?${suffix}` : ""}`;
}

const HOP_BY_HOP_HEADERS = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);

function omittedHeaderNames(
    connection: string | string[] | undefined,
    additional: readonly string[],
): Set<string> {
    const omitted = new Set([...HOP_BY_HOP_HEADERS, ...additional]);
    const values = Array.isArray(connection) ? connection : [connection];
    for (const value of values) {
        for (const name of value?.split(",") ?? []) omitted.add(name.trim().toLowerCase());
    }
    return omitted;
}

async function happyAgentForward(
    client: HappyAgentProxyClient,
    request: IncomingMessage,
    response: ServerResponse,
    method: string,
    path: string,
    onConnectionError?: (error: unknown) => void,
): Promise<void> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.once("aborted", abort);
    response.once("close", abort);
    try {
        const hasBody =
            Number(request.headers["content-length"] ?? 0) > 0 ||
            request.headers["transfer-encoding"] !== undefined;
        const body = hasBody ? await bodyReadBuffer(request, RAW_BODY_MAX_BYTES) : undefined;
        const omittedRequestHeaders = omittedHeaderNames(request.headers.connection, [
            "authorization",
            "content-length",
            "cookie",
            "host",
            "origin",
            "referer",
        ]);
        const forwardedHeaders: Record<string, string> = {};
        for (const [name, value] of Object.entries(request.headers)) {
            if (value === undefined || omittedRequestHeaders.has(name)) continue;
            forwardedHeaders[name] = Array.isArray(value) ? value.join(", ") : value;
        }
        const upstream = await client.rawRequest({
            method,
            path,
            ...(body === undefined ? {} : { body }),
            ...(Object.keys(forwardedHeaders).length === 0 ? {} : { headers: forwardedHeaders }),
            signal: controller.signal,
        });
        const omittedResponseHeaders = omittedHeaderNames(upstream.headers.connection, [
            "access-control-allow-credentials",
            "access-control-allow-headers",
            "access-control-allow-methods",
            "access-control-allow-origin",
            "access-control-expose-headers",
            "set-cookie",
        ]);
        for (const [name, value] of Object.entries(upstream.headers)) {
            if (value === undefined || omittedResponseHeaders.has(name)) continue;
            if (name === "vary" && response.hasHeader(name)) response.appendHeader(name, value);
            else response.setHeader(name, value);
        }
        response.writeHead(upstream.statusCode);
        await pipeline(upstream.body, response);
    } catch (error) {
        if (controller.signal.aborted) return;
        if (happyAgentDaemonConnectionUnavailable(error)) onConnectionError?.(error);
        throw error;
    } finally {
        request.off("aborted", abort);
        response.off("close", abort);
    }
}

const PREVIEW_CONTENT_TYPE: Readonly<Record<string, string>> = {
    aac: "audio/aac",
    avif: "image/avif",
    bmp: "image/bmp",
    flac: "audio/flac",
    gif: "image/gif",
    heic: "image/heic",
    ico: "image/x-icon",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    m4a: "audio/mp4",
    m4v: "video/x-m4v",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    ogg: "audio/ogg",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    tiff: "image/tiff",
    wav: "audio/wav",
    webm: "video/webm",
    webp: "image/webp",
};

const PREVIEW_MAX_BYTES = 64 * 1024 * 1024;
const RAW_BODY_MAX_BYTES = 64 * 1024 * 1024;
const JSON_BODY_MAX_BYTES = 40 * 1024 * 1024;

const previewHeld = new WeakMap<
    HappyAgentProxyClient,
    { readonly key: string; readonly contentType: string; readonly bytes: Buffer }
>();

function previewKey(workspaceId: string, filePath: string, hash?: string): string {
    return `${workspaceId}\u0000${filePath}\u0000${hash ?? ""}`;
}

function previewContentType(filePath: string): string {
    const name = filePath.slice(filePath.lastIndexOf("/") + 1).toLowerCase();
    const dot = name.lastIndexOf(".");
    return PREVIEW_CONTENT_TYPE[dot > 0 ? name.slice(dot + 1) : ""] ?? "application/octet-stream";
}

async function workspaceFileBytesLoad(
    client: HappyAgentProxyClient,
    workspaceId: string,
    filePath: string,
    hash?: string,
    signal?: AbortSignal,
): Promise<{ readonly contentType: string; readonly bytes: Buffer; readonly hash: string }> {
    const held = previewHeld.get(client);
    if (held && hash !== undefined && held.key === previewKey(workspaceId, filePath, hash))
        return { contentType: held.contentType, bytes: held.bytes, hash };
    const file = await workspaceFileLoad(client, workspaceId, filePath, signal);
    const bytes = Buffer.from(file.content, "base64");
    if (bytes.byteLength > PREVIEW_MAX_BYTES) throw new Error("This file is too large to preview.");
    const contentType = previewContentType(filePath);
    previewHeld.set(client, {
        key: previewKey(workspaceId, filePath, file.hash),
        contentType,
        bytes,
    });
    return { contentType, bytes, hash: file.hash };
}

async function workspaceFileMediaServe(
    client: HappyAgentProxyClient,
    workspaceId: string,
    filePath: string,
    hash: string | undefined,
    request: IncomingMessage,
    response: ServerResponse,
    signal?: AbortSignal,
): Promise<void> {
    const file = await workspaceFileBytesLoad(client, workspaceId, filePath, hash, signal);
    const total = file.bytes.byteLength;
    const headers: Record<string, string> = {
        "accept-ranges": "bytes",
        "cache-control": hash === undefined ? "no-store" : "private, max-age=3600",
        "content-type": file.contentType,
        "x-content-type-options": "nosniff",
    };
    const range = /^bytes=(\d*)-(\d*)$/u.exec(request.headers.range ?? "");
    if (range && (range[1] !== "" || range[2] !== "")) {
        const suffix = range[1] === "";
        const start = suffix ? Math.max(total - Number(range[2]), 0) : Number(range[1]);
        const end = suffix || range[2] === "" ? total - 1 : Math.min(Number(range[2]), total - 1);
        if (start > end || start >= total) {
            response.writeHead(416, { ...headers, "content-range": `bytes */${String(total)}` });
            response.end();
            return;
        }
        const part = file.bytes.subarray(start, end + 1);
        response.writeHead(206, {
            ...headers,
            "content-length": String(part.byteLength),
            "content-range": `bytes ${String(start)}-${String(end)}/${String(total)}`,
        });
        response.end(request.method === "HEAD" ? undefined : part);
        return;
    }
    response.writeHead(200, { ...headers, "content-length": String(total) });
    response.end(request.method === "HEAD" ? undefined : file.bytes);
}

async function requestWithAbort<T>(
    request: IncomingMessage,
    operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.once("aborted", abort);
    try {
        return await operation(controller.signal);
    } finally {
        request.off("aborted", abort);
    }
}

async function bodyReadJson(request: IncomingMessage): Promise<Record<string, unknown>> {
    const body = (await bodyReadBuffer(request, JSON_BODY_MAX_BYTES)).toString("utf8");
    if (body.trim().length === 0) return {};
    return JSON.parse(body) as Record<string, unknown>;
}

async function bodyReadBuffer(request: IncomingMessage, maximumBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > maximumBytes) throw new Error("The request body is too large.");
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}

function requiredQuery(query: URLSearchParams, name: string): string {
    return requiredString(query.get(name), name);
}

function requiredString(value: unknown, name: string): string {
    if (typeof value !== "string" || value.trim().length === 0)
        throw new Error(`${name} is required.`);
    return value;
}

function stringValue(value: unknown, name: string): string {
    if (typeof value !== "string") throw new Error(`${name} is required.`);
    return value;
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
