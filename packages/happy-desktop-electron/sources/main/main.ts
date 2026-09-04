import {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    Menu,
    nativeTheme,
    screen,
    session as electronSession,
    shell,
    type BrowserWindowConstructorOptions,
    type MenuItemConstructorOptions,
    type OpenDialogOptions,
    type WebContents,
} from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DesktopRuntime } from "./desktopRuntime";
import { desktopInstanceMenuTargets } from "./applicationMenu";
import {
    desktopWindowTarget,
    localWebNavigationAllowed,
    rendererNavigationAllowed,
} from "./navigation";
import { desktopFlavor } from "./desktopFlavor";
import { dockBadgeApply, dockBadgeClear, dockUnreadCountRead } from "./dockBadge";
import { desktopUpdaterCreate } from "./updater";
import { DesktopWindowLifecycle, type DesktopWindowBounds } from "./windowLifecycle";
import {
    desktopDaemonVersionValidate,
    desktopStartRequestValidate,
    desktopTopologyIdValidate,
} from "./runtimeValidation";
import {
    buildIdentityArgument,
    debugMetricsArgument,
    desktopIpc,
    happyBrowserPartition,
    happyHtmlPreviewPartition,
    mediaPreviewArgument,
    mediaPreviewView,
    type DesktopBrowserProxyTarget,
    type DesktopBrowserStatus,
    type DesktopCloudAuthConfiguration,
    type DesktopDebugSnapshot,
    type DesktopGuestKeyEvent,
    type DesktopMediaPreview,
    type DesktopNavigationStep,
    type DesktopPreviewNavigation,
    type DesktopPreviewNavigationStep,
} from "../shared/desktopContract";
import {
    desktopReactDevtoolsMessageValidate,
    type DesktopProfilerBuildMode,
    type DesktopProfilerRequest,
    type DesktopProfilerSnapshot,
    type DesktopReactDevtoolsMessage,
} from "../shared/desktopProfiler";
import {
    mediaPreviewAddressAllowed,
    mediaPreviewNavigationAllowed,
    mediaPreviewResolve,
    mediaPreviewTitle,
} from "./mediaPreviewWindow";
import { localHappyAgentConnectorCreate, localRuntimeProbe } from "./localHappyAgent";
import { LocalOnboarding } from "./localOnboarding";
import { desktopBrowserProxyTargetValidate } from "./happyAgentIpcValidation";
import { htmlPreviewProxyCreate, type HtmlPreviewProxyHandle } from "./htmlPreviewProxy";
import {
    happyAgentBrowserProxyCreate,
    type HappyAgentBrowserProxyHandle,
} from "./happyAgentBrowserProxy";
import { desktopConfigPath, DesktopConfigStore } from "./desktopConfig";
import { DesktopDebugController } from "./desktopDebugController";
import { desktopMainInspectorStart } from "./desktopInspector";
import { DesktopProfilerController } from "./desktopProfilerController";
import { DesktopWindowStateStore } from "./windowState";
import { desktopBuildIdentityRead } from "./buildIdentity";
import { DesktopDaemonController } from "./desktopDaemonController";
import { cloudAuthProductionRedirectUri } from "../shared/cloudAuthConfig";

if (process.platform !== "darwin" && process.platform !== "linux" && process.platform !== "win32") {
    console.error("Happy Place desktop is available only on macOS, Linux, and Windows.");
    app.exit(1);
}
const buildIdentity = desktopBuildIdentityRead(app.isPackaged, app.getAppPath());
const desktopGymActive = process.env.HAPPY_DESKTOP_GYM_PROFILE !== undefined;
const desktopProfilerLaunchMode =
    process.env.HAPPY_DESKTOP_PROFILE_MODE === "optimized" || desktopGymActive
        ? "optimized"
        : process.env.HAPPY_DESKTOP_PROFILE_MODE === "development"
          ? "development"
          : undefined;
const desktopProfilerNamePreserving =
    desktopProfilerLaunchMode === "optimized" && process.env.HAPPY_DESKTOP_PROFILE === "1";

function desktopProfilerBuildLabel(): string | undefined {
    const checkout = buildIdentity?.label;
    const namePreservingSuffix = desktopProfilerNamePreserving
        ? " + keepNames requested (profile launch)"
        : "";
    if (desktopProfilerLaunchMode === "development") {
        return checkout
            ? `development/non-representative${namePreservingSuffix} — ${checkout}`
            : `development/non-representative${namePreservingSuffix}`;
    }
    if (desktopProfilerLaunchMode === "optimized") {
        return checkout
            ? `optimized${namePreservingSuffix} — ${checkout}`
            : `optimized${namePreservingSuffix}`;
    }
    return checkout;
}

function desktopProfilerBuildMode(): DesktopProfilerBuildMode {
    return desktopProfilerLaunchMode ?? "standard";
}
/*
 * A development build says so everywhere the system can name an application. The
 * menu bar and the About item read the application name, which is otherwise
 * literally "Electron" while running unpackaged — a window that claims to be
 * Electron tells the reader nothing about which of their checkouts it came from.
 */
const applicationName = buildIdentity ? "Happy Dev" : "Happy";
app.setName(applicationName);
/*
 * Each checkout is its own installation of the app. Everything below is keyed on
 * the user-data directory — the single-instance lock above all — so sharing one
 * would mean the second checkout's window silently quitting into the first
 * checkout's window instead of opening, which is precisely what someone running
 * two builds side by side is trying to avoid. Separate directories also keep one
 * worktree's settings, window geometry, and saved instances out of another's.
 */
if (buildIdentity) app.setPath("userData", `${app.getPath("userData")}-${buildIdentity.label}`);
// Only now is this process identifiable, so only now can it claim to be the one.
if (!app.requestSingleInstanceLock()) app.quit();

const dirname = fileURLToPath(new URL(".", import.meta.url));
const generatedApplicationIconPath = join(
    dirname,
    "..",
    "assets",
    "app-icon",
    "generated",
    "app-icon.png",
);
const applicationIconPath = existsSync(generatedApplicationIconPath)
    ? generatedApplicationIconPath
    : undefined;
/*
 * The title carries the checkout as well, because that is what Mission Control,
 * the Window menu, and the app switcher's window list have room to show. The
 * ordinary checkout on the default branch is simply "Happy Dev": it is the one
 * window with nothing to distinguish it from, and naming it twice says nothing.
 */
const windowTitle =
    buildIdentity && buildIdentity.label !== "dev"
        ? `${applicationName} — ${buildIdentity.label}`
        : applicationName;
const desktopDebugEnabled =
    !app.isPackaged &&
    (process.env.HAPPY_DESKTOP_DEBUG === "1" || process.argv.includes("--debug"));

function desktopDebugRendererDefaultPort(): number {
    if (!buildIdentity || buildIdentity.label === "dev") return 9222;
    let hash = 2_166_136_261;
    for (const character of buildIdentity.path) {
        hash ^= character.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 16_777_619);
    }
    return 10_000 + ((hash >>> 0) % 20_000);
}

function desktopDebugRendererPortRead(): number {
    const fallback = desktopDebugRendererDefaultPort();
    const raw = process.env.HAPPY_DEBUG_RENDERER_PORT?.trim();
    if (raw === undefined || raw.length === 0) return fallback;
    const port = Number(raw);
    if (Number.isInteger(port) && port >= 1024 && port <= 65_535) return port;
    console.warn(`[happy debug] Invalid HAPPY_DEBUG_RENDERER_PORT=${raw}; using ${fallback}.`);
    return fallback;
}

const desktopDebugRendererPort = desktopDebugEnabled
    ? desktopDebugRendererPortRead()
    : desktopDebugRendererDefaultPort();

function desktopDebugLog(message: string): void {
    if (desktopDebugEnabled) console.log(`[happy debug] ${message}`);
}

function desktopDebugError(message: string, error?: unknown): void {
    if (!desktopDebugEnabled) return;
    console.error(
        `[happy debug] ${message}${error === undefined ? "" : `: ${errorMessage(error)}`}`,
    );
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function windowBackgroundColor(): string {
    return nativeTheme.shouldUseDarkColors ? "#1e1e1e" : "#f5f5f5";
}
const developmentRendererOrigin = process.env.VITE_DEV_SERVER_URL
    ? new URL(process.env.VITE_DEV_SERVER_URL).origin
    : undefined;
const updateCheckIntervalMs = 15 * 60 * 1000;
const titleBarHeight = 40;
const macosTrafficLightSize = 14;
/*
 * macOS hides the native title bar and positions its traffic lights inside the
 * renderer's own 40px bar. Windows does the same with the native caption
 * buttons drawn as an overlay at the same height. Linux keeps its native frame:
 * with no overlay mechanism, a hidden title bar would leave the window without
 * close/minimize controls entirely.
 */
const platformWindowChrome: Electron.BrowserWindowConstructorOptions =
    process.platform === "darwin"
        ? {
              titleBarStyle: "hidden",
              trafficLightPosition: {
                  x: 14,
                  y: (titleBarHeight - macosTrafficLightSize) / 2,
              },
          }
        : process.platform === "win32"
          ? {
                titleBarStyle: "hidden",
                titleBarOverlay: { height: titleBarHeight },
            }
          : {};

nativeTheme.themeSource = "system";
app.commandLine.appendSwitch("disable-quic");
app.commandLine.appendSwitch("force-webrtc-ip-handling-policy", "disable_non_proxied_udp");
if (desktopDebugEnabled) {
    // This branch is unavailable in packaged builds. Chromium's raw CDP server
    // has no authentication, so even an explicit flag must remain development
    // tooling bound to loopback.
    app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
    app.commandLine.appendSwitch("remote-debugging-port", String(desktopDebugRendererPort));
    try {
        const mainInspectorUrl = desktopMainInspectorStart();
        desktopDebugLog(`main inspector: ${mainInspectorUrl}`);
    } catch (error) {
        desktopDebugError("could not start the main-process inspector", error);
    }
    desktopDebugLog(`renderer CDP: http://127.0.0.1:${desktopDebugRendererPort}`);
    desktopDebugLog(`renderer targets: http://127.0.0.1:${desktopDebugRendererPort}/json/list`);
    desktopDebugLog(
        `attach with Playwright: connectOverCDP("http://127.0.0.1:${desktopDebugRendererPort}")`,
    );
}

let runtime: DesktopRuntime;
let daemonController: DesktopDaemonController;
let desktopConfigStore: DesktopConfigStore;
let desktopDebugController: DesktopDebugController | undefined;
let desktopDebugDaemonAttemptedConnectionId: number | undefined;
let desktopProfilerController: DesktopProfilerController;
let desktopWindowStateStore: DesktopWindowStateStore;
let onboarding: LocalOnboarding;
let quitting = false;
let happyBrowserUserAgent = "";
let browserProxy: HappyAgentBrowserProxyHandle | undefined;
let htmlPreviewProxy: HtmlPreviewProxyHandle | undefined;
let browserProxyConnectionId: number | undefined;
/** Which local session the live tunnel was built for. */
let browserProxyTarget: DesktopBrowserProxyTarget | undefined;
let browserProxyOperation = Promise.resolve();
// Automation needs a real laid-out window without taking focus from the work
// happening beside it.
const windowLifecycle = new DesktopWindowLifecycle<BrowserWindow>((window) => {
    if (desktopGymActive) window.showInactive();
    else window.show();
});
const cloudAuthConfiguration: DesktopCloudAuthConfiguration = {
    environment: "production",
    redirectUri: cloudAuthProductionRedirectUri,
};
const cloudAuthProtocol = new URL(cloudAuthConfiguration.redirectUri).protocol.slice(0, -1);
let cloudAuthCallback: string | undefined;

function cloudAuthCallbackRead(candidate: string): string | undefined {
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === `${cloudAuthProtocol}:` && parsed.hostname === "callback"
            ? parsed.href
            : undefined;
    } catch {
        return undefined;
    }
}

if (
    !(app.isPackaged
        ? app.setAsDefaultProtocolClient(cloudAuthProtocol)
        : process.argv[1]
          ? app.setAsDefaultProtocolClient(cloudAuthProtocol, process.execPath, [process.argv[1]])
          : app.setAsDefaultProtocolClient(cloudAuthProtocol))
)
    console.warn(`Happy could not register the ${cloudAuthProtocol}: callback protocol.`);

app.on("open-url", (event, candidate) => {
    const callback = cloudAuthCallbackRead(candidate);
    if (!callback) return;
    event.preventDefault();
    cloudAuthCallback = callback;
    const window = windowLifecycle.get();
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(desktopIpc.cloudAuthCallbackReceived);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
});
const unavailableBrowserProxy = "http://127.0.0.1:9";
/*
 * The one window a file is shown in outside the application. There is exactly
 * one because a reader looking at a file is looking at a file: opening another
 * points this window at the new one rather than accumulating windows nobody
 * asked for and nobody will close.
 */
let mediaPreviewWindow: BrowserWindow | undefined;
let mediaPreviewSubject: DesktopMediaPreview | undefined;
function desktopDebugPublish(snapshot: DesktopDebugSnapshot): void {
    const window = windowLifecycle.get();
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(desktopIpc.debugChanged, snapshot);
}

function desktopDaemonSenderRequire(sender: WebContents): void {
    const presenting = windowLifecycle.get();
    if (!presenting || presenting.webContents !== sender)
        throw new Error("This window cannot control Happy Agent.");
}

function desktopDebugSenderRequire(sender: WebContents): void {
    const presenting = windowLifecycle.get();
    if (!presenting || presenting.webContents !== sender)
        throw new Error("This window cannot control the debugger.");
}

function desktopDebugRuntimeLog(snapshot: ReturnType<DesktopRuntime["get"]>): void {
    if (!desktopDebugEnabled) return;
    switch (snapshot.phase) {
        case "choosing":
            desktopDebugLog("runtime phase=choosing");
            return;
        case "starting":
            desktopDebugLog(`runtime phase=starting: ${snapshot.message}`);
            return;
        case "error":
            desktopDebugError(`runtime phase=error: ${snapshot.message}`);
            return;
        case "ready":
            desktopDebugLog(
                `runtime phase=ready mode=${snapshot.mode} connection=${snapshot.connectionId}`,
            );
            return;
        default: {
            const exhaustive: never = snapshot;
            return exhaustive;
        }
    }
}

/** Starts the Happy Agent inspector for each fresh local connection in CLI debug mode. */
function desktopDebugDaemonStartIfReady(snapshot: ReturnType<DesktopRuntime["get"]>): void {
    const debugController = desktopDebugController;
    if (
        !desktopDebugEnabled ||
        !debugController ||
        snapshot.phase !== "ready" ||
        snapshot.mode !== "local"
    )
        return;
    const connectionId = snapshot.connectionId;
    if (desktopDebugDaemonAttemptedConnectionId === connectionId) return;
    desktopDebugDaemonAttemptedConnectionId = connectionId;
    void debugController
        .start("daemon")
        .then((debugSnapshot) => {
            const target = debugSnapshot.daemon;
            if (target.status === "running" && target.url) {
                desktopDebugLog(`Happy Agent daemon inspector: ${target.url}`);
            } else {
                desktopDebugError(
                    `Happy Agent daemon inspector did not start (${target.status})${
                        target.error ? `: ${target.error}` : ""
                    }`,
                );
            }
        })
        .catch((error) => desktopDebugError("Happy Agent daemon inspector startup failed", error));
}

function desktopProfilerPublish(snapshot: DesktopProfilerSnapshot): void {
    const window = windowLifecycle.get();
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(desktopIpc.profilerChanged, snapshot);
}

function desktopProfilerSenderRequire(sender: WebContents): void {
    const presenting = windowLifecycle.get();
    if (!presenting || presenting.webContents !== sender)
        throw new Error("This window cannot control the profiler.");
}

function desktopProfilerRequestValidate(input: unknown): DesktopProfilerRequest {
    if (input === undefined) return {};
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("The profiler request is invalid.");
    const durationMs = (input as { readonly durationMs?: unknown }).durationMs;
    if (durationMs === undefined) return {};
    if (
        typeof durationMs !== "number" ||
        !Number.isInteger(durationMs) ||
        durationMs < 1_000 ||
        durationMs > 10 * 60_000
    )
        throw new Error("The profiler duration must be between one second and ten minutes.");
    return { durationMs };
}

/** The one native folder chooser, shared by the renderer's request and first-run setup. */
async function directoryPickShow(owner: BrowserWindow | undefined): Promise<string | undefined> {
    const options: OpenDialogOptions = {
        buttonLabel: "Choose",
        properties: ["openDirectory", "createDirectory"],
        title: "Choose a Happy Agent working directory",
    };
    const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
    return result.canceled ? undefined : result.filePaths[0];
}

/**
 * Which document is presenting Happy. It advances on every main-frame navigation
 * or reload, on a renderer that is lost or crashes, and on a window that is
 * replaced, so a `webContents` id — which survives all of those — is never the
 * whole answer to "is this still the reader who asked?".
 */
let presentationEpoch = 0;

function presentationAdvance(): void {
    presentationEpoch += 1;
}

/** The presenting document's identity: which renderer, and which of its lives. */
function presentationIdentity(): string {
    const window = windowLifecycle.get();
    const presenting = window && !window.isDestroyed() ? window.webContents.id : undefined;
    return `${presenting ?? "none"}:${presentationEpoch}`;
}

/**
 * Only the window that is actually presenting Happy right now may drive first-run
 * setup. Every one of these operations installs software, writes durable choices,
 * or opens a native picker, so a renderer that has been replaced — a reload, a
 * topology change, a window that lost its turn — must not be able to reach them
 * with a preload it still holds. Which step may run is checked separately and
 * authoritatively by first-run setup itself, against the stage it is on.
 */
function onboardingSenderRequire(sender: Electron.WebContents): void {
    const presenting = windowLifecycle.get();
    if (!presenting || presenting.isDestroyed() || presenting.webContents !== sender)
        throw new Error("First-run setup is not being presented by this window.");
}

function browserSessionGet() {
    return electronSession.fromPartition(happyBrowserPartition, { cache: true });
}

async function browserProxyFailClosed(): Promise<void> {
    browserProxy?.close();
    browserProxy = undefined;
    browserProxyConnectionId = undefined;
    browserProxyTarget = undefined;
    const browserSession = browserSessionGet();
    await browserSession.setProxy({
        mode: "fixed_servers",
        proxyBypassRules: "<-loopback>",
        proxyRules: unavailableBrowserProxy,
    });
    await browserSession.closeAllConnections();
}

function browserProxySerial<T>(work: () => Promise<T>): Promise<T> {
    const next = browserProxyOperation.then(work, work);
    browserProxyOperation = next.then(
        () => undefined,
        () => undefined,
    );
    return next;
}

/** Opens the daemon tunnel a browser tab's traffic goes through. */
function browserProxyOpen(target: DesktopBrowserProxyTarget): Promise<Duplex> {
    return runtime.openHttpProxy(target.sessionId);
}

function browserProxyApply(target: DesktopBrowserProxyTarget): Promise<void> {
    return browserProxySerial(async () => {
        const snapshot = runtime.get();
        if (snapshot.phase !== "ready" || snapshot.mode !== "local")
            throw new Error("The local Happy Agent daemon is unavailable.");
        if (
            browserProxyTarget?.sessionId === target.sessionId &&
            browserProxyConnectionId === snapshot.connectionId
        )
            return;

        await browserProxyFailClosed();
        const connectionId = snapshot.connectionId;
        const candidate = await happyAgentBrowserProxyCreate({
            sessionId: target.sessionId,
            openHttpProxy: () => browserProxyOpen(target),
        });
        const current = runtime.get();
        if (
            current.phase !== "ready" ||
            current.mode !== "local" ||
            current.connectionId !== connectionId
        ) {
            candidate.close();
            throw new Error("The local Happy Agent connection changed while opening the browser.");
        }
        try {
            const browserSession = browserSessionGet();
            await browserSession.setProxy({
                mode: "fixed_servers",
                proxyBypassRules: "<-loopback>",
                proxyRules: `http://127.0.0.1:${String(candidate.port)}`,
            });
            await browserSession.closeAllConnections();
            browserProxy = candidate;
            browserProxyConnectionId = connectionId;
            browserProxyTarget = target;
        } catch (error) {
            candidate.close();
            await browserProxyFailClosed();
            throw error;
        }
    });
}

function browserWebUrl(candidate: string, allowBlank = false): string | undefined {
    if (allowBlank && candidate === "about:blank") return candidate;
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === "http:" || parsed.protocol === "https:"
            ? parsed.href
            : undefined;
    } catch {
        return undefined;
    }
}

function browserOpenPublish(window: BrowserWindow, candidate: string): void {
    const url = browserWebUrl(candidate);
    if (!url || window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(desktopIpc.browserOpenRequested, url);
}

/**
 * Keeps Chromium's true engine/version while removing the Electron/app tokens
 * that make sites serve an embedded-shell variant.
 */
function browserUserAgent(defaultUserAgent: string): string {
    return defaultUserAgent
        .replace(/\sElectron\/\S+/giu, "")
        .replace(/\sHappy(?:%20|\s)Place(?:%20|\s)Desktop\/\S+/giu, "")
        .replace(/\s{2,}/gu, " ")
        .trim();
}

async function browserSessionConfigure(): Promise<void> {
    const browserSession = browserSessionGet();
    happyBrowserUserAgent = browserUserAgent(browserSession.getUserAgent());
    browserSession.setUserAgent(happyBrowserUserAgent, app.getLocale());
    await browserProxyFailClosed();

    const permissionLabels = new Map<string, string>([
        ["clipboard-read", "read the clipboard"],
        ["display-capture", "share the screen"],
        ["geolocation", "use your location"],
        ["media", "use the camera or microphone"],
        ["midi", "use MIDI devices"],
        ["notifications", "show notifications"],
        ["pointerLock", "capture the pointer"],
    ]);
    browserSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        const label = permissionLabels.get(permission);
        const requestingUrl = browserWebUrl(details.requestingUrl || webContents.getURL());
        if (!label || !requestingUrl) {
            callback(false);
            return;
        }
        const requestingOrigin = new URL(requestingUrl).origin;
        const host = webContents.hostWebContents;
        const owner = host ? BrowserWindow.fromWebContents(host) : undefined;
        const options = {
            buttons: ["Don't Allow", "Allow"],
            cancelId: 0,
            defaultId: 0,
            detail: `${requestingOrigin} wants to ${label}.`,
            message: "Website permission",
            noLink: true,
            type: "question" as const,
        };
        void (owner ? dialog.showMessageBox(owner, options) : dialog.showMessageBox(options))
            .then((result) => callback(result.response === 1))
            .catch(() => callback(false));
    });
}

function htmlPreviewSessionGet() {
    return electronSession.fromPartition(happyHtmlPreviewPartition, { cache: false });
}

/**
 * Points the preview profile at Happy's own HTML preview proxy and walls it off
 * from everything else.
 *
 * A workspace document runs its own scripts, and a page in a checkout may name
 * any address in the world — a tracker, an endpoint it was told to call, a
 * script from a CDN. Loopback is deliberately *not* bypassed, so every request
 * such a page makes, including the one for the document itself, arrives at the
 * preview proxy: it answers for the document's own folder and refuses the rest
 * of the internet. A preview therefore shows what the file contains, and can
 * neither call home nor reach anything Happy is signed in to.
 */
async function htmlPreviewSessionConfigure(): Promise<void> {
    const previewSession = htmlPreviewSessionGet();
    await previewSession.setProxy({
        mode: "fixed_servers",
        proxyBypassRules: "<-loopback>",
        proxyRules: htmlPreviewProxy
            ? `http://127.0.0.1:${String(htmlPreviewProxy.port)}`
            : unavailableBrowserProxy,
    });
    previewSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
        callback(false),
    );
    previewSession.setPermissionCheckHandler(() => false);
    await previewSession.closeAllConnections();
}

/**
 * Whether an address is one of this process's own preview sites. The proxy
 * publishes each document folder under `.localhost`, which is loopback by
 * specification, so a page keeps the secure context it would have when served
 * for real.
 */
function htmlPreviewUrl(candidate: string): string | undefined {
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === "http:" &&
            parsed.port === "" &&
            parsed.hostname.endsWith(".localhost")
            ? parsed.href
            : undefined;
    } catch {
        return undefined;
    }
}

app.on("login", (event, _webContents, _details, authInfo, callback) => {
    if (!authInfo.isProxy || authInfo.host !== "127.0.0.1") return;
    // Both loopback proxies this process runs are credentialed, and the
    // credentials never leave it: the port says which one is asking.
    if (authInfo.port === browserProxy?.port) {
        event.preventDefault();
        callback(browserProxy.username, browserProxy.password);
        return;
    }
    if (authInfo.port === htmlPreviewProxy?.port) {
        event.preventDefault();
        callback(htmlPreviewProxy.username, htmlPreviewProxy.password);
    }
});

function browserGuestAttach(window: BrowserWindow): void {
    window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
        const previewGuest = params.partition === happyHtmlPreviewPartition;
        const allowed = previewGuest
            ? htmlPreviewUrl(params.src) !== undefined
            : params.partition === happyBrowserPartition && browserWebUrl(params.src, true);
        if (!allowed) {
            event.preventDefault();
            return;
        }
        // Guest pages never inherit a preload or Node privilege from the app.
        delete webPreferences.preload;
        webPreferences.contextIsolation = true;
        webPreferences.nodeIntegration = false;
        webPreferences.nodeIntegrationInSubFrames = false;
        webPreferences.nodeIntegrationInWorker = false;
        webPreferences.sandbox = true;
        webPreferences.webSecurity = true;
        webPreferences.allowRunningInsecureContent = false;
    });
    window.webContents.on("did-attach-webview", (_event, guest) => {
        guest.on("before-input-event", (_inputEvent, input) => {
            const type =
                input.type === "keyDown"
                    ? ("keydown" as const)
                    : input.type === "keyUp"
                      ? ("keyup" as const)
                      : undefined;
            // Ordinary guest typing stays wholly inside the guest. Command
            // input also reaches the host so window shortcuts and held-Command
            // discovery keep working after the page itself takes focus.
            if (!type || (!input.meta && input.key !== "Meta") || window.isDestroyed()) return;
            window.webContents.send(desktopIpc.guestKey, {
                altKey: input.alt,
                code: input.code,
                ctrlKey: input.control,
                isComposing: input.isComposing,
                key: input.key,
                location: input.location,
                metaKey: input.meta,
                repeat: input.isAutoRepeat,
                shiftKey: input.shift,
                type,
            } satisfies DesktopGuestKeyEvent);
        });
        if (guest.session === htmlPreviewSessionGet()) {
            // A preview is one page of one file. Following a link out of it, or
            // opening a window from it, is browsing, and browsing is the browser
            // tab's job — so the guest stays on the document it was opened with.
            guest.setWindowOpenHandler(({ url }) => {
                browserOpenPublish(window, url);
                return { action: "deny" };
            });
            const stayOnPreview = (event: Electron.Event, candidate: string) => {
                if (htmlPreviewUrl(candidate) === undefined) event.preventDefault();
            };
            guest.on("will-navigate", stayOnPreview);
            guest.on("will-redirect", stayOnPreview);
            htmlPreviewLifecyclePublish(window, guest);
            return;
        }
        guest.setUserAgent(happyBrowserUserAgent);
        guest.setWindowOpenHandler(({ url }) => {
            browserOpenPublish(window, url);
            return { action: "deny" };
        });
        const navigationGuard = (event: Electron.Event, candidate: string) => {
            if (!browserWebUrl(candidate, true)) event.preventDefault();
        };
        guest.on("will-navigate", navigationGuard);
        guest.on("will-redirect", navigationGuard);
        // Only the main process observes a guest's response code. The renderer
        // needs it to tell a served error page from a blank failed navigation.
        guest.on("did-navigate", (_navigation, url, status, statusText) => {
            if (window.isDestroyed()) return;
            window.webContents.send(desktopIpc.browserStatusChanged, {
                guestId: guest.id,
                url,
                status,
                statusText,
            } satisfies DesktopBrowserStatus);
        });
    });
}

/**
 * Publishes the life of a preview guest's main-frame document as one ordered
 * stream, numbered by navigation.
 *
 * A preview reloads in place whenever the file behind it changes, so a guest
 * outlives many documents and its id says nothing about which one an event
 * belongs to. Only this process sees the whole sequence — the start, the
 * response code, the finish, the failure, the lost renderer — so it is the only
 * place that can put those in one order and stamp each with the navigation it
 * came from. The renderer then ignores anything older than the document it is
 * on, and cannot be told by a slow answer from a previous revision that the
 * page it is showing is broken.
 *
 * The counter is monotonic per guest and never restarts: a reload is a new
 * navigation, and the number only ever goes up while the guest exists.
 */
function htmlPreviewLifecyclePublish(window: BrowserWindow, guest: WebContents): void {
    let navigation = 0;
    const publish = (step: DesktopPreviewNavigationStep): void => {
        if (window.isDestroyed() || guest.isDestroyed()) return;
        window.webContents.send(desktopIpc.previewNavigationChanged, {
            guestId: guest.id,
            navigationId: navigation,
            ...step,
        } satisfies DesktopPreviewNavigation);
    };
    guest.on("did-start-navigation", (details) => {
        // A fragment or a history entry inside the same document is not a new
        // page, and the document on screen keeps whatever it already said.
        if (!details.isMainFrame || details.isSameDocument) return;
        navigation += 1;
        publish({ phase: "started", url: details.url });
    });
    guest.on("did-navigate", (_event, url, status, statusText) => {
        publish({ phase: "responded", url, status, statusText });
    });
    guest.on("did-finish-load", () => {
        publish({ phase: "loaded", url: guest.getURL() });
    });
    guest.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
        // ERR_ABORTED is how Chromium reports a load this guest replaced or
        // stopped itself, which is the superseding navigation's business.
        if (!isMainFrame || code === -3) return;
        publish({ phase: "failed", url: validatedURL, code, description });
    });
    guest.on("render-process-gone", (_event, details) => {
        publish({ phase: "gone", url: guest.getURL(), reason: details.reason });
    });
}

function windowOptions(
    bounds: DesktopWindowBounds | undefined,
    webPreferences: BrowserWindowConstructorOptions["webPreferences"],
): BrowserWindowConstructorOptions {
    return {
        backgroundColor: windowBackgroundColor(),
        title: windowTitle,
        width: bounds?.width ?? 1100,
        height: bounds?.height ?? 760,
        ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
        /* Happy's native desktop minimum; AppShell states the same contract. */
        minWidth: 720,
        minHeight: 480,
        ...(applicationIconPath ? { icon: applicationIconPath } : {}),
        show: false,
        ...platformWindowChrome,
        webPreferences,
    };
}

/**
 * Keeps the window wearing the name this build was given. Every page here
 * carries the same `<title>`, and Chromium hands it to the window on load, which
 * would put one identical name on every checkout's window — exactly the
 * confusion this title exists to prevent.
 *
 * Refusing the page's title is not enough on its own: the name is also applied
 * around navigation, when no title event is emitted to refuse. So the window is
 * renamed again at each point a load can have overwritten it, which is cheap and
 * leaves no ordering to get wrong.
 */
function windowTitleHold(window: BrowserWindow): void {
    const hold = () => {
        if (!window.isDestroyed()) window.setTitle(windowTitle);
    };
    window.on("page-title-updated", (event) => {
        event.preventDefault();
        hold();
    });
    window.webContents.on("did-finish-load", hold);
    window.webContents.on("did-navigate", hold);
    window.webContents.on("did-navigate-in-page", hold);
    hold();
}

function windowGeometryRemember(window: BrowserWindow): void {
    const remember = () => {
        if (!window.isDestroyed()) desktopWindowStateStore.remember(window.getNormalBounds());
    };
    window.on("move", remember);
    window.on("resize", remember);
    remember();
}

function localWindowCreate(bounds?: DesktopWindowBounds) {
    const hostedOrigin =
        desktopFlavor.kind === "local-web" ? desktopFlavor.rendererOrigin : undefined;
    const developmentUrl = hostedOrigin ? undefined : process.env.VITE_DEV_SERVER_URL;
    const rendererPath = join(dirname, "renderer", "index.html");
    const hostedUrl = hostedOrigin ? `${hostedOrigin}/?desktop=1&mode=local` : undefined;
    const rendererUrl = hostedUrl ?? developmentUrl ?? pathToFileURL(rendererPath).toString();
    const window = new BrowserWindow({
        ...windowOptions(bounds, {
            // The build a window runs is fixed for its whole life, so the preload
            // is handed it as a launch argument rather than made to ask for it:
            // the shell can then render its identity in the first frame.
            ...(buildIdentity
                ? {
                      additionalArguments: [
                          `${buildIdentityArgument}${JSON.stringify(buildIdentity)}`,
                          ...(desktopDebugEnabled ? [debugMetricsArgument] : []),
                      ],
                  }
                : desktopDebugEnabled
                  ? { additionalArguments: [debugMetricsArgument] }
                  : {}),
            contextIsolation: true,
            nodeIntegration: false,
            preload: join(dirname, "preload.cjs"),
            sandbox: true,
            webviewTag: true,
        }),
    });
    if (desktopDebugEnabled) {
        desktopDebugLog(`renderer window created; loading ${rendererUrl}`);
        window.webContents.on("dom-ready", () =>
            desktopDebugLog(`renderer DOM ready: ${window.webContents.getURL()}`),
        );
        window.webContents.on("did-finish-load", () =>
            desktopDebugLog(`renderer finished loading: ${window.webContents.getURL()}`),
        );
        window.webContents.on(
            "did-fail-load",
            (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
                if (isMainFrame)
                    desktopDebugError(
                        `renderer failed to load ${validatedURL} (${errorCode} ${errorDescription})`,
                    );
            },
        );
        // Renderer output is intentionally mirrored only in explicit local
        // debug mode; it may contain URLs or other development-only details.
        window.webContents.on("console-message", (details) =>
            desktopDebugLog(
                `renderer console level=${details.level}: ${details.message} (${details.sourceId}:${details.lineNumber})`,
            ),
        );
        window.webContents.on("render-process-gone", (_event, details) =>
            desktopDebugError(
                `renderer process exited (${details.reason}, code ${details.exitCode})`,
            ),
        );
        window.webContents.on("unresponsive", () =>
            desktopDebugError("renderer became unresponsive"),
        );
        window.webContents.on("responsive", () => desktopDebugLog("renderer responsive again"));
    }
    windowTitleHold(window);
    windowGeometryRemember(window);
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (browserWebUrl(url)) browserOpenPublish(window, url);
        else if (url.startsWith("mailto:")) void shell.openExternal(url);
        return { action: "deny" };
    });
    browserGuestAttach(window);
    const preventUntrustedNavigation = (event: Electron.Event, url: string) => {
        const allowed = hostedOrigin
            ? localWebNavigationAllowed(url, hostedOrigin)
            : rendererNavigationAllowed(url, rendererUrl, developmentUrl !== undefined);
        if (!allowed) event.preventDefault();
    };
    window.webContents.on("will-navigate", preventUntrustedNavigation);
    window.webContents.on("will-redirect", preventUntrustedNavigation);
    const ownerId = window.webContents.id;
    // A document is not a window. The same `webContents` survives a reload and a
    // main-frame navigation, so setup's idea of who it is working for advances
    // with the document rather than with the window: work started by the page
    // that was here a moment ago is not owed to the page that replaced it.
    window.webContents.on("did-start-navigation", (details) => {
        if (!details.isMainFrame) return;
        if (!details.isSameDocument) desktopProfilerController?.navigationStarted();
        presentationAdvance();
    });
    presentationAdvance();
    const cleanup = () => {
        presentationAdvance();
        desktopProfilerController?.refresh();
        // The mark on the Dock belongs to the window that reported it. This one
        // is going away — reloaded, gone, or replaced — so it takes its own mark
        // with it, unless another window is already presenting and has set its
        // own; wiping that would leave the icon lying about the live window.
        const presenting = windowLifecycle.get();
        if (!presenting || presenting.webContents.id === ownerId) dockBadgeClear();
    };
    window.webContents.on("render-process-gone", cleanup);
    window.webContents.on("destroyed", cleanup);
    // macOS full screen hides the traffic lights without changing anything the
    // renderer can query, so the window tells it directly and the shell drops the
    // lane it reserves for them.
    const windowStatePublish = () => {
        if (window.isDestroyed() || window.webContents.isDestroyed()) return;
        window.webContents.send(desktopIpc.windowStateChanged, {
            fullScreen: window.isFullScreen(),
        });
    };
    window.on("enter-full-screen", windowStatePublish);
    window.on("leave-full-screen", windowStatePublish);
    // Back and Forward. The window owns its stack, so only a direction travels;
    // where it lands is the renderer's to decide.
    const navigationStepPublish = (direction: "back" | "forward") => {
        if (window.isDestroyed() || window.webContents.isDestroyed()) return;
        window.webContents.send(desktopIpc.navigationStep, {
            direction,
        } satisfies DesktopNavigationStep);
    };
    // The mouse's side buttons on Windows and Linux; macOS delivers the same
    // buttons to the renderer as pointer buttons, and they are read there.
    window.on("app-command", (_event, command) => {
        if (command === "browser-backward") navigationStepPublish("back");
        if (command === "browser-forward") navigationStepPublish("forward");
    });
    // macOS two-finger swipe, delivered only while its system preference is on.
    window.on("swipe", (_event, direction) => {
        if (direction === "right") navigationStepPublish("back");
        if (direction === "left") navigationStepPublish("forward");
    });
    window.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) cleanup();
    });
    return {
        load: () => {
            const load = hostedUrl
                ? window.loadURL(hostedUrl)
                : developmentUrl
                  ? window.loadURL(developmentUrl)
                  : window.loadFile(rendererPath);
            return load.catch((error) => {
                desktopDebugError("renderer load promise rejected", error);
                throw error;
            });
        },
        window,
    };
}

/**
 * Every Happy Agent proxy this process is currently running. A file may be shown in a
 * window of its own only if its address is on one of them, which is what keeps a
 * privileged window pointed at this machine's own Happy Agents and nothing else.
 */
function mediaPreviewBases(): readonly (string | undefined)[] {
    const snapshot = runtime.get();
    return [
        snapshot.phase === "ready" && snapshot.activeTarget.authentication === "happyAgent"
            ? snapshot.activeTarget.happyAgentHttpUrl
            : undefined,
    ];
}

/**
 * Keeps the preview window named after the file rather than after the bundle.
 * Every page in this build carries the same `<title>`, which Chromium would
 * otherwise hand to the window and put one generic name on a window whose whole
 * job is to say which file it is showing.
 */
function mediaPreviewNameHold(window: BrowserWindow): void {
    const hold = () => {
        if (window.isDestroyed()) return;
        window.setTitle(
            mediaPreviewSubject ? mediaPreviewTitle(mediaPreviewSubject.path) : windowTitle,
        );
    };
    window.on("page-title-updated", (event) => {
        event.preventDefault();
        hold();
    });
    window.webContents.on("did-finish-load", hold);
    window.webContents.on("did-navigate", hold);
    hold();
}

/**
 * The window one file is shown in, outside the application window.
 *
 * It is the same renderer document, loaded with the view it should mount, so it
 * inherits the page's Content-Security-Policy, context isolation, and sandbox
 * rather than being a second, laxer boundary. It is launched with the argument
 * that makes the preload hand it the preview bridge instead of the
 * application's, so it can ask this process for the file, close itself, and
 * nothing else. It hosts no plugin bundle and no browser guest, opens no window,
 * and cannot leave the one document it was opened with.
 */
function mediaPreviewWindowCreate(): BrowserWindow {
    const hostedOrigin =
        desktopFlavor.kind === "local-web" ? desktopFlavor.rendererOrigin : undefined;
    const developmentUrl = hostedOrigin ? undefined : process.env.VITE_DEV_SERVER_URL;
    const rendererPath = join(dirname, "renderer", "index.html");
    const address = (base: string): string => {
        const url = new URL(base);
        url.searchParams.set(mediaPreviewView.key, mediaPreviewView.value);
        return url.toString();
    };
    const rendererUrl = hostedOrigin
        ? address(`${hostedOrigin}/?desktop=1&mode=local`)
        : developmentUrl
          ? address(developmentUrl)
          : address(pathToFileURL(rendererPath).toString());
    const window = new BrowserWindow({
        backgroundColor: windowBackgroundColor(),
        title: windowTitle,
        width: 1100,
        height: 760,
        minWidth: 480,
        minHeight: 360,
        ...(applicationIconPath ? { icon: applicationIconPath } : {}),
        show: false,
        webPreferences: {
            additionalArguments: [mediaPreviewArgument],
            contextIsolation: true,
            nodeIntegration: false,
            preload: join(dirname, "preload.cjs"),
            sandbox: true,
        },
    });
    mediaPreviewNameHold(window);
    // A preview window opens no windows and goes nowhere: a link inside it
    // would be a link inside a picture or a recording, which does not exist.
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    const stay = (event: Electron.Event, candidate: string) => {
        if (!mediaPreviewNavigationAllowed(candidate, rendererUrl)) event.preventDefault();
    };
    window.webContents.on("will-navigate", stay);
    window.webContents.on("will-redirect", stay);
    window.once("ready-to-show", () => {
        if (window.isDestroyed()) return;
        // Maximized rather than macOS full screen: full screen would take the
        // file to a Space of its own and hide the window it was opened from,
        // which is the opposite of looking at a file beside the work it belongs to.
        window.maximize();
        window.show();
    });
    window.on("closed", () => {
        if (mediaPreviewWindow === window) {
            mediaPreviewWindow = undefined;
            mediaPreviewSubject = undefined;
        }
    });
    // A window that never loaded is not a window showing a file. It is
    // retired rather than shown empty, so the next open builds a live one instead
    // of reusing a blank frame that would answer nothing it is sent.
    const failed = () => {
        if (mediaPreviewWindow === window) {
            mediaPreviewWindow = undefined;
            mediaPreviewSubject = undefined;
        }
        if (!window.isDestroyed()) window.destroy();
    };
    window.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
        // Only the document failing counts, and only when it failed rather than
        // was superseded: an aborted load (-3) is a load that was replaced.
        if (isMainFrame && code !== -3) failed();
    });
    // A renderer that died leaves a frame that can still be raised and sent
    // files, and would answer none of them. It retires on the same path as a
    // document that never arrived.
    window.webContents.on("render-process-gone", failed);
    void window.loadURL(rendererUrl).catch(failed);
    return window;
}

/** Points the preview window at `preview`, opening it the first time. */
function mediaPreviewShow(preview: DesktopMediaPreview): void {
    mediaPreviewSubject = preview;
    const existing = mediaPreviewWindow;
    if (existing && !existing.isDestroyed()) {
        existing.setTitle(mediaPreviewTitle(preview.path));
        if (!existing.webContents.isDestroyed())
            existing.webContents.send(desktopIpc.mediaPreviewChanged, preview);
        if (existing.isMinimized()) existing.restore();
        existing.show();
        existing.focus();
        return;
    }
    mediaPreviewWindow = mediaPreviewWindowCreate();
}

/**
 * Retires the preview window once the address behind it can no longer be served.
 * The file is addressed on a Happy Agent proxy, so a Happy Agent that goes away takes the
 * window with it rather than leaving a frame around a request that will now fail.
 */
function mediaPreviewRevalidate(): void {
    const window = mediaPreviewWindow;
    if (!window || window.isDestroyed()) return;
    const subject = mediaPreviewSubject;
    if (subject && mediaPreviewAddressAllowed(subject.url, mediaPreviewBases())) return;
    mediaPreviewSubject = undefined;
    mediaPreviewWindow = undefined;
    window.destroy();
}

function windowSynchronize(snapshot: ReturnType<DesktopRuntime["get"]>): BrowserWindow {
    const restoredBounds = desktopWindowStateStore.restore(
        screen.getAllDisplays(),
        screen.getPrimaryDisplay(),
    );
    if (desktopFlavor.kind === "local-web")
        return windowLifecycle.synchronize("local-web", (bounds) =>
            localWindowCreate(bounds ?? restoredBounds),
        );
    return windowLifecycle.synchronize(desktopWindowTarget(snapshot).key, (bounds) =>
        localWindowCreate(bounds ?? restoredBounds),
    );
}

/*
 * One zoom step, and the report that goes with it.
 *
 * The factor is read back after the level is set rather than predicted from it,
 * so a step the engine refused at its own floor or ceiling reports where the
 * window actually ended up. The report is sent unconditionally, including when
 * the level did not move: ⌘0 at 100% and ⌘− against the floor are exactly the
 * two moments the reader needs telling that the command was heard.
 */
function zoomStep(next: (level: number) => number): void {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!window) return;
    const contents = window.webContents;
    contents.zoomLevel = next(contents.zoomLevel);
    contents.send(desktopIpc.zoomChanged, Math.round(contents.zoomFactor * 100));
}

/*
 * The View menu, stated rather than taken from `role: "viewMenu"`. The roles
 * zoom the window without telling it, and a window that cannot hear its own
 * zoom cannot show what it is now at. The items and their accelerators are the
 * roles' own, including the half-level step.
 */
const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { label: "Actual Size", accelerator: "CmdOrCtrl+0", click: () => zoomStep(() => 0) },
        {
            label: "Zoom In",
            accelerator: "CmdOrCtrl+Plus",
            click: () => zoomStep((level) => level + 0.5),
        },
        /* The key actually under the finger. "Plus" is the shifted name of it,
           and it is the one the menu prints, but nobody holds shift to zoom;
           taking the menu on ourselves means owning both spellings, where the
           role had the platform's own. Hidden, so the menu still reads ⌘+. */
        {
            label: "Zoom In",
            accelerator: "CmdOrCtrl+=",
            click: () => zoomStep((level) => level + 0.5),
            visible: false,
        },
        {
            label: "Zoom Out",
            accelerator: "CmdOrCtrl+-",
            click: () => zoomStep((level) => level - 0.5),
        },
        { type: "separator" },
        { role: "togglefullscreen" },
    ],
};

function applicationMenuInstall(snapshot: ReturnType<DesktopRuntime["get"]>): void {
    const targets = desktopInstanceMenuTargets(snapshot);
    const instances: MenuItemConstructorOptions[] = targets.map((target) => ({
        label: target.label,
        type: "checkbox",
        checked: target.active,
        click: () => void runtime.topologySelect(target.id).catch(() => undefined),
    }));
    if (instances.length === 0) instances.push({ label: "No saved instances", enabled: false });
    instances.push(
        { type: "separator" },
        {
            label: "Choose or Add Instance…",
            accelerator: "CmdOrCtrl+Shift+I",
            click: () => void runtime.reset().catch(() => undefined),
        },
    );
    const navigationStepSend = (direction: "back" | "forward"): void => {
        const focused = BrowserWindow.getFocusedWindow();
        if (!focused || focused.webContents.isDestroyed()) return;
        focused.webContents.send(desktopIpc.navigationStep, {
            direction,
        } satisfies DesktopNavigationStep);
    };
    const template: MenuItemConstructorOptions[] = [
        process.platform === "darwin"
            ? {
                  // macOS reads the bold first menu from this label. Left to the
                  // default it is the running binary's name — "Electron" in any
                  // build that is not packaged — which names the toolkit rather
                  // than the app.
                  label: applicationName,
                  role: "appMenu",
                  submenu: [
                      { role: "about" },
                      { type: "separator" },
                      { role: "services" },
                      { type: "separator" },
                      { role: "hide" },
                      { role: "hideOthers" },
                      { role: "unhide" },
                      { type: "separator" },
                      { role: "quit" },
                  ],
              }
            : {
                  // The services/hide roles above exist only on macOS; other
                  // platforms put quit under an ordinary first menu.
                  label: applicationName,
                  submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
              },
        ...(desktopFlavor.kind === "local-web"
            ? []
            : [{ label: "Instances", submenu: instances } as MenuItemConstructorOptions]),
        { role: "editMenu" },
        viewMenu,
        {
            // The two items every browser puts here, on the same keys. They
            // carry a direction to the focused window, which alone knows where
            // going back lands.
            label: "History",
            submenu: [
                {
                    label: "Back",
                    accelerator: "CmdOrCtrl+[",
                    click: () => navigationStepSend("back"),
                },
                {
                    label: "Forward",
                    accelerator: "CmdOrCtrl+]",
                    click: () => navigationStepSend("forward"),
                },
            ],
        },
        { role: "windowMenu" },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

void app
    .whenReady()
    .then(async () => {
        if (desktopGymActive) app.dock?.hide();
        else if (!app.isPackaged && applicationIconPath) app.dock?.setIcon(applicationIconPath);
        await browserSessionConfigure();
        htmlPreviewProxy = await htmlPreviewProxyCreate();
        await htmlPreviewSessionConfigure();
        const desktopRoot = join(app.getPath("userData"), "desktop");
        desktopWindowStateStore = await DesktopWindowStateStore.create(
            join(desktopRoot, "window-state.json"),
        );
        desktopConfigStore = await DesktopConfigStore.create(desktopConfigPath());
        // Apply the remembered source before the first window is created, so
        // its native background and Chromium guests start in the chosen theme.
        nativeTheme.themeSource = desktopConfigStore.get().appearance;
        const launchEnvironment = await localRuntimeProbe().then(
            (probe) => probe.environment,
            () => process.env,
        );
        const managedDaemon = !(
            launchEnvironment.HAPPY_AGENT_SERVER_SOCKET_PATH?.trim() &&
            launchEnvironment.HAPPY_AGENT_SERVER_TOKEN_PATH?.trim()
        );
        daemonController = await DesktopDaemonController.create({
            environment: launchEnvironment,
            launchEnvironment: async () => launchEnvironment,
            managed: managedDaemon,
        });
        daemonController.subscribe((snapshot) => {
            const window = windowLifecycle.get();
            if (window && !window.isDestroyed())
                window.webContents.send(desktopIpc.daemonChanged, snapshot);
        });
        const connector = localHappyAgentConnectorCreate({
            daemonBinary: daemonController,
            debug: desktopDebugLog,
            environment: launchEnvironment,
        });
        const rendererOrigin =
            desktopFlavor.kind === "local-web"
                ? desktopFlavor.rendererOrigin
                : developmentRendererOrigin;
        runtime = await DesktopRuntime.create(
            {
                root: desktopRoot,
            },
            {
                localHappyAgentConnector: connector,
                // A hosted local renderer and the Vite development renderer both
                // call the loopback proxy cross-origin. Only their exact,
                // build-owned origin receives CORS access.
                ...(rendererOrigin ? { rendererOrigin } : {}),
                ...(htmlPreviewProxy ? { htmlPreview: htmlPreviewProxy } : {}),
            },
        );
        const debugController = new DesktopDebugController({
            changed: desktopDebugPublish,
            daemon: () => {
                const snapshot = runtime.get();
                if (snapshot.phase !== "ready" || snapshot.mode !== "local") return undefined;
                const connectionId = snapshot.connectionId;
                return {
                    connectionId,
                    startInspector: () => runtime.localInspectorStart(connectionId),
                    stopInspector: () => runtime.localInspectorStop(connectionId),
                };
            },
            renderer: () => {
                const window = windowLifecycle.get();
                return window && !window.isDestroyed() ? window.webContents : undefined;
            },
        });
        desktopDebugController = debugController;
        if (desktopDebugEnabled) {
            // The main inspector was opened before app readiness so a failure
            // during runtime initialization is still attachable. This call
            // records that existing endpoint in the controller as well.
            void debugController.start("main").then((debugSnapshot) => {
                if (debugSnapshot.main.status !== "running")
                    desktopDebugError(
                        `main inspector state is ${debugSnapshot.main.status}${
                            debugSnapshot.main.error ? `: ${debugSnapshot.main.error}` : ""
                        }`,
                    );
            });
        }
        desktopProfilerController = new DesktopProfilerController({
            artifactRoot: desktopRoot,
            buildMode: desktopProfilerBuildMode(),
            ...(desktopProfilerBuildLabel() ? { buildLabel: desktopProfilerBuildLabel() } : {}),
            changed: desktopProfilerPublish,
            renderer: () => {
                const window = windowLifecycle.get();
                return window && !window.isDestroyed() ? window.webContents : undefined;
            },
        });
        // First-run setup follows the runtime rather than owning a connection of
        // its own: the daemon is started, connected, and left running by the
        // runtime alone, and setup only reads its state and asks it to try again.
        onboarding = await LocalOnboarding.create({
            ...(managedDaemon ? { daemon: daemonController } : {}),
            directoryPick: () => directoryPickShow(windowLifecycle.get()),
            // Which window setup is working for. A native picker outlives the
            // window that opened it, so setup reads this again before it acts on
            // what came back.
            presentation: presentationIdentity,
            recordPath: join(desktopRoot, "local-onboarding.json"),
            runtime,
        });
        onboarding.subscribe((snapshot) => {
            const window = windowLifecycle.get();
            if (window && !window.isDestroyed())
                window.webContents.send(desktopIpc.onboardingChanged, snapshot);
        });
        const updater = desktopUpdaterCreate({
            // Releases publish macOS update manifests only; a packaged Linux or
            // Windows build has nothing to check against yet.
            packaged: app.isPackaged && process.platform === "darwin",
            update: (snapshot) => runtime.updateSet(snapshot),
        });
        runtime.subscribe((snapshot) => {
            daemonController.runtimeSet(snapshot);
            desktopDebugRuntimeLog(snapshot);
            if (
                browserProxyConnectionId !== undefined &&
                (snapshot.phase !== "ready" ||
                    snapshot.mode !== "local" ||
                    snapshot.connectionId !== browserProxyConnectionId)
            )
                void browserProxySerial(browserProxyFailClosed);
            mediaPreviewRevalidate();
            const previous = windowLifecycle.get();
            const window = windowSynchronize(snapshot);
            applicationMenuInstall(snapshot);
            if (
                window === previous &&
                (desktopFlavor.kind === "local-web" ||
                    desktopWindowTarget(snapshot).kind === "local")
            )
                window.webContents.send(desktopIpc.runtimeChanged, snapshot);
            debugController.refresh();
            desktopDebugDaemonStartIfReady(snapshot);
            desktopProfilerController.refresh();
        });
        daemonController.runtimeSet(runtime.get());
        ipcMain.handle(desktopIpc.runtimeGet, () => runtime.get());
        ipcMain.handle(desktopIpc.desktopConfigGet, () => desktopConfigStore.get());
        ipcMain.handle(desktopIpc.desktopConfigWrite, (_event, config: unknown) =>
            desktopConfigStore.write(config),
        );
        ipcMain.handle(desktopIpc.cloudAuthCallbackTake, (event) => {
            desktopDaemonSenderRequire(event.sender);
            const callback = cloudAuthCallback;
            cloudAuthCallback = undefined;
            return callback;
        });
        ipcMain.handle(desktopIpc.cloudAuthCallbackPending, (event) => {
            desktopDaemonSenderRequire(event.sender);
            return cloudAuthCallback !== undefined;
        });
        ipcMain.handle(desktopIpc.cloudAuthConfigurationGet, (event) => {
            desktopDaemonSenderRequire(event.sender);
            return cloudAuthConfiguration;
        });
        ipcMain.handle(desktopIpc.cloudAuthOpen, (event, candidate: unknown) => {
            desktopDaemonSenderRequire(event.sender);
            if (typeof candidate !== "string")
                throw new Error("Happy Agent returned an invalid Cloud authorization URL.");
            const url = new URL(candidate);
            if (url.protocol !== "https:")
                throw new Error("Happy Agent returned an invalid Cloud authorization URL.");
            return shell.openExternal(url.href);
        });
        ipcMain.handle(desktopIpc.daemonGet, (event) => {
            desktopDaemonSenderRequire(event.sender);
            return daemonController.get();
        });
        ipcMain.handle(desktopIpc.daemonDownload, (event) => {
            desktopDaemonSenderRequire(event.sender);
            return daemonController.download();
        });
        ipcMain.handle(desktopIpc.daemonStart, (event) => {
            desktopDaemonSenderRequire(event.sender);
            return daemonController.start();
        });
        ipcMain.handle(desktopIpc.daemonUpgrade, (event) => {
            desktopDaemonSenderRequire(event.sender);
            return daemonController.upgrade();
        });
        ipcMain.handle(desktopIpc.daemonCheck, (event) => {
            desktopDaemonSenderRequire(event.sender);
            return daemonController.checkForUpdate();
        });
        ipcMain.handle(desktopIpc.daemonInstall, (event) => {
            desktopDaemonSenderRequire(event.sender);
            return daemonController.install();
        });
        ipcMain.handle(desktopIpc.daemonInstallDismiss, (event) => {
            desktopDaemonSenderRequire(event.sender);
            daemonController.installDismiss();
        });
        ipcMain.handle(desktopIpc.daemonInstallKill, (event) => {
            desktopDaemonSenderRequire(event.sender);
            daemonController.installKill();
        });
        ipcMain.handle(desktopIpc.daemonRestart, (event) => {
            desktopDaemonSenderRequire(event.sender);
            return daemonController.restart();
        });
        ipcMain.handle(desktopIpc.daemonVersionSelect, (event, version: unknown) => {
            desktopDaemonSenderRequire(event.sender);
            return daemonController.versionSelect(desktopDaemonVersionValidate(version));
        });
        ipcMain.handle(desktopIpc.debugGet, (event) => {
            desktopDebugSenderRequire(event.sender);
            return debugController.get();
        });
        ipcMain.handle(desktopIpc.debugAllStart, (event) => {
            desktopDebugSenderRequire(event.sender);
            return debugController.startAll();
        });
        ipcMain.handle(desktopIpc.debugAllStop, (event) => {
            desktopDebugSenderRequire(event.sender);
            return debugController.stopAll();
        });
        ipcMain.handle(desktopIpc.debugMainInspectorStart, (event) => {
            desktopDebugSenderRequire(event.sender);
            return debugController.start("main");
        });
        ipcMain.handle(desktopIpc.debugMainInspectorStop, (event) => {
            desktopDebugSenderRequire(event.sender);
            return debugController.stop("main");
        });
        ipcMain.handle(desktopIpc.debugRendererInspectorStart, (event) => {
            desktopDebugSenderRequire(event.sender);
            return debugController.start("renderer");
        });
        ipcMain.handle(desktopIpc.debugRendererInspectorStop, (event) => {
            desktopDebugSenderRequire(event.sender);
            return debugController.stop("renderer");
        });
        ipcMain.handle(desktopIpc.debugDaemonInspectorStart, (event) => {
            desktopDebugSenderRequire(event.sender);
            return debugController.start("daemon");
        });
        ipcMain.handle(desktopIpc.debugDaemonInspectorStop, (event) => {
            desktopDebugSenderRequire(event.sender);
            return debugController.stop("daemon");
        });
        ipcMain.handle(desktopIpc.profilerGet, (event) => {
            desktopProfilerSenderRequire(event.sender);
            return desktopProfilerController.get();
        });
        ipcMain.handle(desktopIpc.profilerStart, (event, request: unknown) => {
            desktopProfilerSenderRequire(event.sender);
            return desktopProfilerController.start(desktopProfilerRequestValidate(request));
        });
        ipcMain.handle(desktopIpc.profilerStop, (event) => {
            desktopProfilerSenderRequire(event.sender);
            return desktopProfilerController.stop();
        });
        ipcMain.on(desktopIpc.profilerReactMessage, (event, raw: unknown) => {
            const presenting = windowLifecycle.get();
            if (!presenting || presenting.webContents !== event.sender) return;
            const message: DesktopReactDevtoolsMessage | undefined =
                desktopReactDevtoolsMessageValidate(raw);
            if (message) desktopProfilerController.reactMessage(message);
        });
        ipcMain.handle(desktopIpc.browserProxyApply, (_event, target: unknown) =>
            browserProxyApply(desktopBrowserProxyTargetValidate(target)),
        );
        ipcMain.handle(desktopIpc.applicationMenuOpen, () => {
            Menu.getApplicationMenu()?.popup();
        });
        // `nativeTheme` is Chromium's preferred-color-scheme source for every
        // WebContents in this process, including webview guests and nested
        // frames. Only the currently presented local window may choose it.
        ipcMain.on(desktopIpc.appearanceSet, (event, raw: unknown) => {
            const presenting = windowLifecycle.get();
            if (!presenting || presenting.webContents !== event.sender) return;
            if (raw !== "dark" && raw !== "light" && raw !== "system") return;
            nativeTheme.themeSource = raw;
            const background = windowBackgroundColor();
            presenting.setBackgroundColor(background);
            if (mediaPreviewWindow && !mediaPreviewWindow.isDestroyed())
                mediaPreviewWindow.setBackgroundColor(background);
        });
        // One-way: the window states what is waiting and the shell marks the
        // icon. Only the window this shell is currently presenting may do so, so
        // a superseded renderer still shutting down cannot repaint over the one
        // that replaced it, and a malformed count is dropped rather than guessed.
        ipcMain.on(desktopIpc.dockUnreadSet, (event, raw: unknown) => {
            const presenting = windowLifecycle.get();
            if (!presenting || presenting.webContents !== event.sender) return;
            const count = dockUnreadCountRead(raw);
            if (count !== undefined) dockBadgeApply(count);
        });
        ipcMain.handle(desktopIpc.mediaPreviewOpen, (event, raw: unknown) => {
            // Only the window this shell is presenting opens a preview window, so
            // a superseded renderer still shutting down cannot put one on screen
            // after the window that asked for it is gone.
            const presenting = windowLifecycle.get();
            if (!presenting || presenting.webContents !== event.sender)
                throw new Error("This window cannot open a preview window.");
            // The renderer names the file; this process decides whether that
            // name is one of its own Happy Agent's, so a window is never opened onto an
            // address this build is not already serving.
            const preview = mediaPreviewResolve(raw, mediaPreviewBases());
            if (!preview)
                throw new Error("That file is not served by a Happy Agent in this window.");
            mediaPreviewShow(preview);
        });
        ipcMain.handle(desktopIpc.mediaPreviewGet, (event) =>
            mediaPreviewWindow &&
            !mediaPreviewWindow.isDestroyed() &&
            mediaPreviewWindow.webContents === event.sender
                ? mediaPreviewSubject
                : undefined,
        );
        ipcMain.handle(desktopIpc.mediaPreviewClose, (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window && window === mediaPreviewWindow) window.close();
        });
        ipcMain.handle(desktopIpc.directoryPick, async (event) => {
            const owner = BrowserWindow.fromWebContents(event.sender);
            const options: OpenDialogOptions = {
                buttonLabel: "Add",
                // No `createDirectory`: what is chosen here becomes a project,
                // and Happy Agent only accepts the top level of a Git repository — so a
                // folder made in this dialog could only ever be refused.
                properties: ["openDirectory"],
                title: "Choose a project folder",
            };
            const result = owner
                ? await dialog.showOpenDialog(owner, options)
                : await dialog.showOpenDialog(options);
            return result.canceled ? undefined : result.filePaths[0];
        });
        ipcMain.handle(desktopIpc.onboardingGet, (event) => {
            onboardingSenderRequire(event.sender);
            return onboarding.get();
        });
        ipcMain.handle(desktopIpc.onboardingProjectChoose, (event) => {
            onboardingSenderRequire(event.sender);
            return onboarding.projectChoose();
        });
        ipcMain.handle(desktopIpc.onboardingAssistantsContinue, (event) => {
            onboardingSenderRequire(event.sender);
            onboarding.assistantsContinue();
        });
        ipcMain.handle(desktopIpc.onboardingProfileCreate, (event, input: unknown) => {
            onboardingSenderRequire(event.sender);
            if (
                !input ||
                typeof input !== "object" ||
                typeof (input as { name?: unknown }).name !== "string" ||
                typeof (input as { email?: unknown }).email !== "string"
            )
                throw new Error("That profile is invalid.");
            const profile = input as { readonly email: string; readonly name: string };
            return onboarding.profileCreate({ email: profile.email, name: profile.name });
        });
        ipcMain.handle(desktopIpc.runtimeStart, (_event, request: unknown) =>
            runtime.start(desktopStartRequestValidate(request)),
        );
        ipcMain.handle(desktopIpc.runtimeRetry, () => runtime.retry());
        ipcMain.handle(desktopIpc.runtimeReset, () => runtime.reset());
        ipcMain.handle(desktopIpc.topologySelect, (_event, topologyId: unknown) =>
            runtime.topologySelect(desktopTopologyIdValidate(topologyId)),
        );
        ipcMain.handle(desktopIpc.updateInstall, () => updater.install());
        ipcMain.handle(desktopIpc.windowStateGet, (event) => ({
            fullScreen: BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false,
        }));
        windowSynchronize(runtime.get());
        applicationMenuInstall(runtime.get());
        desktopDebugRuntimeLog(runtime.get());
        desktopDebugDaemonStartIfReady(runtime.get());
        const updateCheck = () => {
            void updater.check().catch(() => undefined);
            void daemonController.checkForUpdate().catch(() => undefined);
        };
        const updateCheckInterval = setInterval(updateCheck, updateCheckIntervalMs);
        updateCheckInterval.unref();
        app.once("will-quit", () => clearInterval(updateCheckInterval));
        updateCheck();
        app.on("activate", () => {
            if (!windowLifecycle.get()) windowSynchronize(runtime.get());
        });
    })
    .catch((error: unknown) => {
        dialog.showErrorBox(
            "Happy could not start",
            error instanceof Error ? error.message : "The desktop runtime failed to initialize.",
        );
        app.quit();
    });

app.on("second-instance", () => {
    const window = windowLifecycle.get();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
});

app.on("before-quit", (event) => {
    if (quitting || !runtime) return;
    event.preventDefault();
    void Promise.all([
        runtime.close(),
        desktopWindowStateStore?.flush(),
        desktopProfilerController?.close(),
    ]).finally(() => {
        browserProxy?.close();
        browserProxy = undefined;
        htmlPreviewProxy?.close();
        htmlPreviewProxy = undefined;
        onboarding?.[Symbol.dispose]();
        // The preview window belongs to this application, not to the desktop, so
        // it goes when the application does rather than keeping it alive.
        if (mediaPreviewWindow && !mediaPreviewWindow.isDestroyed()) mediaPreviewWindow.destroy();
        mediaPreviewWindow = undefined;
        mediaPreviewSubject = undefined;
        quitting = true;
        app.quit();
    });
});
