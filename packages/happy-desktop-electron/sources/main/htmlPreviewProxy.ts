import { createHmac, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { workspaceFileLoad, type HappyAgentProxyClient } from "./happyAgentProxyHandle";

export interface HtmlPreviewProxyHandle {
    /** Loopback port Chromium's preview profile is pointed at as its HTTP proxy. */
    readonly port: number;
    readonly username: string;
    readonly password: string;
    /**
     * Opens previews backed by one Happy Agent connection. The returned function
     * names the site a document is served as; the client it closes over reads
     * every asset through the workspace-rooted `/v0` file API.
     */
    register(client: HappyAgentProxyClient): {
        readonly workspace: (
            workspaceId: string,
            filePath: string,
            connectionId?: string,
        ) => string;
    };
    close(): void;
}

/**
 * What a page is allowed to load, by lowercase extension, and the media type it
 * is served as.
 *
 * This list is the whole file-level boundary of the preview: a document can only
 * ever reach the parts of a checkout that a web page is made of. There is no
 * entry for `.env`, a key, a database, or a source file that is not itself web
 * content, so a page that asks for one is answered exactly as it would be for a
 * file that does not exist.
 */
const PREVIEW_CONTENT_TYPE: Record<string, string> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    mjs: "text/javascript; charset=utf-8",
    cjs: "text/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    map: "application/json; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    csv: "text/csv; charset=utf-8",
    xml: "application/xml; charset=utf-8",
    webmanifest: "application/manifest+json; charset=utf-8",
    wasm: "application/wasm",
    pdf: "application/pdf",
    svg: "image/svg+xml",
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    heic: "image/heic",
    ico: "image/x-icon",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    tiff: "image/tiff",
    webp: "image/webp",
    m4v: "video/x-m4v",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    mp4: "video/mp4",
    webm: "video/webm",
    aac: "audio/aac",
    flac: "audio/flac",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    otf: "font/otf",
    ttf: "font/ttf",
    woff: "font/woff",
    woff2: "font/woff2",
};

/** Cap on the bytes one previewed page may pull for a single asset. */
const PREVIEW_MAX_BYTES = 64 * 1024 * 1024;

/**
 * How many document folders keep a site at once. A reader looks at a handful of
 * documents and a site costs one small entry, so this exists only to keep an app
 * left open for a week from remembering every page ever previewed.
 */
const PREVIEW_SITE_LIMIT = 32;

/** One isolated preview origin backed by a Happy Agent workspace folder. */
interface PreviewSite {
    readonly client: HappyAgentProxyClient;
    readonly connectionId?: string;
    readonly workspaceId: string;
    readonly directory: string;
}

/**
 * Serves a workspace document as a site of its own.
 *
 * A document is not a picture: opening one means opening everything it names —
 * its stylesheet, its script, its fonts, the images beside it — by the paths the
 * markup already uses, `/assets/app.css` as readily as `./app.css`. Only a site
 * at the root of an origin answers both, so a preview is exactly that: the
 * document's folder published at `http://<site>.localhost/`, with the document
 * itself as one page in it.
 *
 * It is an HTTP proxy rather than a listening web server because the origin has
 * to be a name rather than a port, and because the proxy is where the whole
 * preview's network boundary can live. Chromium's preview profile is pointed
 * here with loopback included, so every request a previewed page makes arrives
 * at this function: a site it knows is answered from the checkout, and
 * everything else in the world — a tracker, a CDN, an endpoint a page was told
 * to call — is refused here rather than reaching a socket. The proxy
 * credentials, which only the main process holds and only Electron hands to that
 * profile, are what keeps anything else on this machine from using it.
 *
 * `.localhost` is deliberate: the specification makes that name loopback, so
 * Chromium treats the origin as trustworthy and a previewed page runs in a
 * secure context — the one it would have when the document is finally served for
 * real.
 */
export function htmlPreviewProxyCreate(): Promise<HtmlPreviewProxyHandle> {
    const username = randomBytes(24).toString("base64url");
    const password = randomBytes(32).toString("base64url");
    const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    // Site names are derived rather than allocated, so reopening a document
    // lands on the origin it had before — with whatever storage the page kept —
    // and forgetting one costs nothing but the next look-up.
    const siteSecret = randomBytes(32);
    const sites = new Map<string, PreviewSite>();

    const siteName = (...parts: readonly string[]): string =>
        createHmac("sha256", siteSecret).update(parts.join("\u0000")).digest("hex").slice(0, 32);

    const server = createServer((request, response) => {
        if (request.headers["proxy-authorization"] !== authorization) {
            response.writeHead(407, {
                connection: "close",
                "proxy-authenticate": 'Basic realm="Happy"',
            });
            response.end();
            return;
        }
        void serve(sites, request, response).catch(() => {
            if (!response.headersSent) response.writeHead(500);
            response.end();
        });
    });
    // A preview has no use for a tunnel: a checkout cannot be served as `https`,
    // and CONNECT is the one way a page could reach past this function to a real
    // socket.
    server.on("connect", (_request, socket) => {
        socket.on("error", () => socket.destroy());
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    });
    // A preview has nothing to talk a socket to either: an upgrade is dropped
    // rather than left open, so a page cannot hold a connection through here.
    server.on("upgrade", (_request, socket) => socket.destroy());
    server.on("clientError", (_error, socket) => socket.destroy());

    return new Promise<HtmlPreviewProxyHandle>((resolvePromise, reject) => {
        const onError = (error: unknown) => reject(error as Error);
        server.once("error", onError);
        server.listen(0, "127.0.0.1", () => {
            server.removeListener("error", onError);
            const address = server.address() as AddressInfo | null;
            if (!address) {
                server.close();
                reject(new Error("The HTML preview proxy did not bind a loopback port."));
                return;
            }
            resolvePromise({
                port: address.port,
                username,
                password,
                register: (client) => {
                    // The registration separates identically named workspaces
                    // reached through different daemon connections.
                    const registration = randomBytes(16).toString("hex");
                    const remember = (name: string, site: PreviewSite): void => {
                        // Re-inserted so insertion order stays use order and the
                        // oldest site nobody is looking at is the one that goes.
                        sites.delete(name);
                        sites.set(name, site);
                        for (const stale of sites.keys()) {
                            if (sites.size <= PREVIEW_SITE_LIMIT) break;
                            sites.delete(stale);
                        }
                    };
                    return {
                        workspace: (workspaceId, filePath, connectionId) => {
                            const site = previewSite(filePath);
                            const name = siteName(
                                registration,
                                connectionId ?? "",
                                "workspace",
                                workspaceId,
                                site.directory,
                            );
                            remember(name, {
                                client,
                                ...(connectionId ? { connectionId } : {}),
                                workspaceId,
                                directory: site.directory,
                            });
                            const page = site.name
                                .split("/")
                                .map((segment) => encodeURIComponent(segment))
                                .join("/");
                            return `http://${name}.localhost/${page}`;
                        },
                    };
                },
                close: () => {
                    sites.clear();
                    server.close();
                },
            });
        });
    });
}

/**
 * Splits a document's path into the folder that becomes its site and the page
 * inside it. A document at the root of a checkout publishes the checkout root,
 * which is the same rule said out loud for the one path where it is not obvious.
 */
function previewSite(filePath: string): { readonly directory: string; readonly name: string } {
    const normalized = filePath.replaceAll("\\", "/").replace(/^\/+/u, "");
    const cut = normalized.lastIndexOf("/");
    return {
        directory: cut < 0 ? "" : normalized.slice(0, cut),
        name: cut < 0 ? normalized : normalized.slice(cut + 1),
    };
}

/** Answers one request from a previewed page, or refuses it. */
async function serve(
    sites: ReadonlyMap<string, PreviewSite>,
    request: IncomingMessage,
    response: ServerResponse,
): Promise<void> {
    // A proxied request carries the whole address. A page reaching anywhere but
    // one of this process's own sites is told plainly that the preview does not
    // go there, rather than being left against a socket that is not there.
    const target = requestUrl(request);
    const site =
        target && target.protocol === "http:" && target.port === ""
            ? sites.get(target.hostname.replace(/\.localhost$/u, ""))
            : undefined;
    if (!target || !site) {
        refuse(response, 502, "A preview only loads files from the document's own folder.");
        return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
        // A folder published as a site has nothing to submit to.
        response.writeHead(405, { allow: "GET, HEAD" });
        response.end();
        return;
    }
    // A link to a folder is a link to its page, which is what every other static
    // server answers with and what the markup was written against.
    const requested = target.pathname.endsWith("/")
        ? `${target.pathname}index.html`
        : target.pathname;
    const within = pathWithin(requested.split("/").map(pathSegmentDecode));
    if (within === undefined) {
        refuse(response, 404, "Not found.");
        return;
    }
    // A file a web page is not made of is answered as missing rather than as
    // refused: what else a checkout holds is not this page's business.
    const contentType = PREVIEW_CONTENT_TYPE[extensionOf(within)];
    if (contentType === undefined) {
        refuse(response, 404, "Not found.");
        return;
    }
    let bytes: Buffer;
    try {
        const filePath = site.directory === "" ? within : `${site.directory}/${within}`;
        const client = site.connectionId
            ? site.client.connection?.(site.connectionId)
            : site.client;
        if (!client) throw new Error("Remote previews are unavailable.");
        const file = await workspaceFileLoad(client, site.workspaceId, filePath);
        bytes = Buffer.from(file.content, "base64");
    } catch {
        // A file the checkout no longer holds and a file this page may not
        // read are the same answer: it is not there.
        refuse(response, 404, "Not found.");
        return;
    }
    if (bytes.byteLength > PREVIEW_MAX_BYTES) {
        refuse(response, 413, "This file is too large to preview.");
        return;
    }
    writeAsset(request, response, contentType, bytes);
}

/** The absolute address of a proxied request, as the proxy protocol states it. */
function requestUrl(request: IncomingMessage): URL | undefined {
    try {
        return new URL(request.url ?? "", `http://${request.headers.host ?? ""}`);
    } catch {
        return undefined;
    }
}

function pathSegmentDecode(segment: string): string {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

/**
 * The requested path relative to the site root, or nothing when it leaves it.
 *
 * The root is the document's own folder, so `..` is not a path this proxy has an
 * answer for: it is the one way a page could ask for the rest of the machine,
 * and it is refused before anything is read rather than clamped into something
 * that looks like it worked.
 */
function pathWithin(segments: readonly string[]): string | undefined {
    const kept: string[] = [];
    for (const segment of segments) {
        if (segment === "" || segment === ".") continue;
        if (segment === ".." || segment.includes("\\") || segment.includes("\0")) return undefined;
        // A dotfile is never part of a page and is frequently a secret.
        if (segment.startsWith(".")) return undefined;
        kept.push(segment);
    }
    return kept.length > 0 ? kept.join("/") : undefined;
}

function extensionOf(path: string): string {
    const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot + 1) : "";
}

function refuse(response: ServerResponse, status: number, message: string): void {
    response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    response.end(message);
}

/**
 * Writes one asset, answering a range request when the element asking made one.
 * A `video` seeks by asking for the bytes it wants, so a preview that could only
 * reply with the whole file would give the reader a scrubber that does nothing.
 */
function writeAsset(
    request: IncomingMessage,
    response: ServerResponse,
    contentType: string,
    bytes: Buffer,
): void {
    const total = bytes.byteLength;
    const headers: Record<string, string> = {
        "content-type": contentType,
        "accept-ranges": "bytes",
        // The file under a preview is being worked on: what it holds now is the
        // only correct answer, and reloading must never show the previous one.
        "cache-control": "no-store",
        // The media type here is decided by the extension allowlist, so a page
        // must not be able to talk Chromium into reading it as another kind.
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
        response.writeHead(206, {
            ...headers,
            "content-range": `bytes ${String(start)}-${String(end)}/${String(total)}`,
            "content-length": String(end - start + 1),
        });
        response.end(request.method === "HEAD" ? undefined : bytes.subarray(start, end + 1));
        return;
    }
    response.writeHead(200, { ...headers, "content-length": String(total) });
    response.end(request.method === "HEAD" ? undefined : bytes);
}
