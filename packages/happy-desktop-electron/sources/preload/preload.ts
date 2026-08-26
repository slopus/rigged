import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
    buildIdentityArgument,
    desktopIpc,
    mediaPreviewArgument,
    type DesktopBrowserStatus,
    type DesktopNavigationStep,
    type DesktopPreviewNavigation,
    type DesktopBuildIdentity,
    type DesktopDebugSnapshot,
    type DesktopDaemonSnapshot,
    type DesktopEditUndoRequest,
    type DesktopGuestKeyEvent,
    type DesktopMediaPreview,
    type DesktopRuntimeSnapshot,
    type DesktopStartRequest,
    type DesktopWindowState,
    type HappyDesktopBridge,
    type HappyMediaPreviewBridge,
    type LocalOnboardingSnapshot,
} from "../shared/desktopContract";
import type {
    DesktopProfilerRequest,
    DesktopProfilerSnapshot,
    DesktopReactDevtoolsCommand,
    DesktopReactDevtoolsMessage,
} from "../shared/desktopProfiler";

/**
 * The development identity main launched this window with. A packaged build
 * passes none, and anything unparseable is treated as none: an identity is a
 * label on a window, never something the renderer should fail over.
 */
function buildIdentityRead(): DesktopBuildIdentity | undefined {
    const argument = process.argv.find((value) => value.startsWith(buildIdentityArgument));
    if (!argument) return undefined;
    try {
        return JSON.parse(argument.slice(buildIdentityArgument.length)) as DesktopBuildIdentity;
    } catch {
        return undefined;
    }
}

const identity = buildIdentityRead();

const bridge: HappyDesktopBridge = {
    ...(identity ? { buildIdentity: identity } : {}),
    appearanceSet: (mode) => ipcRenderer.send(desktopIpc.appearanceSet, mode),
    attachmentSourcePath(file: File) {
        // Chromium hands the renderer a `File` that hides where it came from,
        // and asking is the only way back to the path. A file that never had
        // one answers with an empty string rather than failing.
        try {
            return webUtils.getPathForFile(file) || undefined;
        } catch {
            return undefined;
        }
    },
    browserProxyApply: (target) => ipcRenderer.invoke(desktopIpc.browserProxyApply, target),
    browserOpenSubscribe(listener: (url: string) => void) {
        const receive = (_event: Electron.IpcRendererEvent, url: string) => listener(url);
        ipcRenderer.on(desktopIpc.browserOpenRequested, receive);
        return () => ipcRenderer.removeListener(desktopIpc.browserOpenRequested, receive);
    },
    browserStatusSubscribe(listener: (status: DesktopBrowserStatus) => void) {
        const receive = (_event: Electron.IpcRendererEvent, status: DesktopBrowserStatus) =>
            listener(status);
        ipcRenderer.on(desktopIpc.browserStatusChanged, receive);
        return () => ipcRenderer.removeListener(desktopIpc.browserStatusChanged, receive);
    },
    cloudAuthCallbackSubscribe(listener: () => void) {
        const receive = () => listener();
        ipcRenderer.on(desktopIpc.cloudAuthCallbackReceived, receive);
        return () => ipcRenderer.removeListener(desktopIpc.cloudAuthCallbackReceived, receive);
    },
    cloudAuthCallbackPending: () => ipcRenderer.invoke(desktopIpc.cloudAuthCallbackPending),
    cloudAuthCallbackTake: () => ipcRenderer.invoke(desktopIpc.cloudAuthCallbackTake),
    cloudAuthConfigurationGet: () => ipcRenderer.invoke(desktopIpc.cloudAuthConfigurationGet),
    cloudAuthOpen: (url) => ipcRenderer.invoke(desktopIpc.cloudAuthOpen, url),
    guestKeySubscribe(listener: (event: DesktopGuestKeyEvent) => void) {
        const receive = (_event: Electron.IpcRendererEvent, input: DesktopGuestKeyEvent) =>
            listener(input);
        ipcRenderer.on(desktopIpc.guestKey, receive);
        return () => ipcRenderer.removeListener(desktopIpc.guestKey, receive);
    },
    previewNavigationSubscribe(listener: (step: DesktopPreviewNavigation) => void) {
        const receive = (_event: Electron.IpcRendererEvent, step: DesktopPreviewNavigation) =>
            listener(step);
        ipcRenderer.on(desktopIpc.previewNavigationChanged, receive);
        return () => ipcRenderer.removeListener(desktopIpc.previewNavigationChanged, receive);
    },
    navigationStepSubscribe(listener: (step: DesktopNavigationStep) => void) {
        const receive = (_event: Electron.IpcRendererEvent, step: DesktopNavigationStep) =>
            listener(step);
        ipcRenderer.on(desktopIpc.navigationStep, receive);
        return () => ipcRenderer.removeListener(desktopIpc.navigationStep, receive);
    },
    editUndoSubscribe(listener: (request: DesktopEditUndoRequest) => boolean) {
        const receive = (_event: Electron.IpcRendererEvent, request: DesktopEditUndoRequest) => {
            let handled = false;
            try {
                handled = listener(request);
            } catch {
                // A renderer that failed to answer has not claimed the command;
                // the native editor remains the safe owner of Undo.
            }
            if (!handled) ipcRenderer.send(desktopIpc.editUndoNative);
        };
        ipcRenderer.on(desktopIpc.editUndoRequested, receive);
        return () => ipcRenderer.removeListener(desktopIpc.editUndoRequested, receive);
    },
    // `send`, not `invoke`: the shell has nothing to answer, and a badge that
    // made the window await the operating system would be a worse badge.
    dockUnreadSet: (count: number) => ipcRenderer.send(desktopIpc.dockUnreadSet, count),
    /* The View menu does the zooming and says so; this side only relays. Reading
       it back from `webFrame` on a viewport change cannot see ⌘0 at 100% or a
       ⌘− that the floor refused, which are the two answers worth showing. */
    zoomSubscribe: (listener: (percent: number) => void) => {
        const relay = (_event: unknown, percent: number) => listener(percent);
        ipcRenderer.on(desktopIpc.zoomChanged, relay);
        return () => {
            ipcRenderer.off(desktopIpc.zoomChanged, relay);
        };
    },
    mediaPreviewOpen: (url: string) => ipcRenderer.invoke(desktopIpc.mediaPreviewOpen, url),
    directoryPick: () => ipcRenderer.invoke(desktopIpc.directoryPick),
    desktopConfigGet: () => ipcRenderer.invoke(desktopIpc.desktopConfigGet),
    desktopConfigWrite: (config) => ipcRenderer.invoke(desktopIpc.desktopConfigWrite, config),
    daemonCheck: () => ipcRenderer.invoke(desktopIpc.daemonCheck),
    daemonDownload: () => ipcRenderer.invoke(desktopIpc.daemonDownload),
    daemonInstall: () => ipcRenderer.invoke(desktopIpc.daemonInstall),
    daemonInstallDismiss: () => ipcRenderer.invoke(desktopIpc.daemonInstallDismiss),
    daemonInstallKill: () => ipcRenderer.invoke(desktopIpc.daemonInstallKill),
    daemonRestart: () => ipcRenderer.invoke(desktopIpc.daemonRestart),
    daemonGet: () => ipcRenderer.invoke(desktopIpc.daemonGet),
    daemonStart: () => ipcRenderer.invoke(desktopIpc.daemonStart),
    daemonSubscribe(listener: (snapshot: DesktopDaemonSnapshot) => void) {
        const receive = (_event: Electron.IpcRendererEvent, snapshot: DesktopDaemonSnapshot) =>
            listener(snapshot);
        ipcRenderer.on(desktopIpc.daemonChanged, receive);
        return () => ipcRenderer.removeListener(desktopIpc.daemonChanged, receive);
    },
    daemonUpgrade: () => ipcRenderer.invoke(desktopIpc.daemonUpgrade),
    daemonVersionSelect: (version: string) =>
        ipcRenderer.invoke(desktopIpc.daemonVersionSelect, version),
    debugGet: () => ipcRenderer.invoke(desktopIpc.debugGet),
    debugAllStart: () => ipcRenderer.invoke(desktopIpc.debugAllStart),
    debugAllStop: () => ipcRenderer.invoke(desktopIpc.debugAllStop),
    debugMainInspectorStart: () => ipcRenderer.invoke(desktopIpc.debugMainInspectorStart),
    debugMainInspectorStop: () => ipcRenderer.invoke(desktopIpc.debugMainInspectorStop),
    debugRendererInspectorStart: () => ipcRenderer.invoke(desktopIpc.debugRendererInspectorStart),
    debugRendererInspectorStop: () => ipcRenderer.invoke(desktopIpc.debugRendererInspectorStop),
    debugDaemonInspectorStart: () => ipcRenderer.invoke(desktopIpc.debugDaemonInspectorStart),
    debugDaemonInspectorStop: () => ipcRenderer.invoke(desktopIpc.debugDaemonInspectorStop),
    debugSubscribe(listener: (snapshot: DesktopDebugSnapshot) => void) {
        const receive = (_event: Electron.IpcRendererEvent, snapshot: DesktopDebugSnapshot) =>
            listener(snapshot);
        ipcRenderer.on(desktopIpc.debugChanged, receive);
        return () => ipcRenderer.removeListener(desktopIpc.debugChanged, receive);
    },
    profilerGet: () => ipcRenderer.invoke(desktopIpc.profilerGet),
    profilerStart: (request?: DesktopProfilerRequest) =>
        ipcRenderer.invoke(desktopIpc.profilerStart, request),
    profilerStop: () => ipcRenderer.invoke(desktopIpc.profilerStop),
    profilerSubscribe(listener: (snapshot: DesktopProfilerSnapshot) => void) {
        const receive = (_event: Electron.IpcRendererEvent, snapshot: DesktopProfilerSnapshot) =>
            listener(snapshot);
        ipcRenderer.on(desktopIpc.profilerChanged, receive);
        return () => ipcRenderer.removeListener(desktopIpc.profilerChanged, receive);
    },
    profilerReactMessage(message: DesktopReactDevtoolsMessage) {
        ipcRenderer.send(desktopIpc.profilerReactMessage, message);
    },
    profilerReactSubscribe(listener: (command: DesktopReactDevtoolsCommand) => void) {
        const receive = (_event: Electron.IpcRendererEvent, command: DesktopReactDevtoolsCommand) =>
            listener(command);
        ipcRenderer.on(desktopIpc.profilerReactCommand, receive);
        return () => ipcRenderer.removeListener(desktopIpc.profilerReactCommand, receive);
    },
    applicationMenuOpen: () => ipcRenderer.invoke(desktopIpc.applicationMenuOpen),
    onboardingGet: () => ipcRenderer.invoke(desktopIpc.onboardingGet),
    onboardingSubscribe(listener: (snapshot: LocalOnboardingSnapshot) => void) {
        const receive = (_event: Electron.IpcRendererEvent, snapshot: LocalOnboardingSnapshot) =>
            listener(snapshot);
        ipcRenderer.on(desktopIpc.onboardingChanged, receive);
        return () => ipcRenderer.removeListener(desktopIpc.onboardingChanged, receive);
    },
    onboardingProfileCreate: (input) =>
        ipcRenderer.invoke(desktopIpc.onboardingProfileCreate, input),
    onboardingProjectChoose: () => ipcRenderer.invoke(desktopIpc.onboardingProjectChoose),
    onboardingAssistantsContinue: () => ipcRenderer.invoke(desktopIpc.onboardingAssistantsContinue),
    runtimeGet: () => ipcRenderer.invoke(desktopIpc.runtimeGet),
    runtimeReset: () => ipcRenderer.invoke(desktopIpc.runtimeReset),
    runtimeRetry: () => ipcRenderer.invoke(desktopIpc.runtimeRetry),
    runtimeStart: (request: DesktopStartRequest) =>
        ipcRenderer.invoke(desktopIpc.runtimeStart, request),
    topologySelect: (topologyId) => ipcRenderer.invoke(desktopIpc.topologySelect, topologyId),
    updateInstall: () => ipcRenderer.invoke(desktopIpc.updateInstall),
    windowStateGet: () => ipcRenderer.invoke(desktopIpc.windowStateGet),
    windowStateSubscribe(listener: (state: DesktopWindowState) => void) {
        const receive = (_event: Electron.IpcRendererEvent, state: DesktopWindowState) =>
            listener(state);
        ipcRenderer.on(desktopIpc.windowStateChanged, receive);
        return () => ipcRenderer.removeListener(desktopIpc.windowStateChanged, receive);
    },
    subscribe(listener: (snapshot: DesktopRuntimeSnapshot) => void) {
        const receive = (_event: Electron.IpcRendererEvent, snapshot: DesktopRuntimeSnapshot) =>
            listener(snapshot);
        ipcRenderer.on(desktopIpc.runtimeChanged, receive);
        return () => ipcRenderer.removeListener(desktopIpc.runtimeChanged, receive);
    },
};

const mediaPreview: HappyMediaPreviewBridge = {
    mediaPreviewGet: () => ipcRenderer.invoke(desktopIpc.mediaPreviewGet),
    mediaPreviewClose: () => ipcRenderer.invoke(desktopIpc.mediaPreviewClose),
    mediaPreviewSubscribe(listener: (preview: DesktopMediaPreview | undefined) => void) {
        const receive = (
            _event: Electron.IpcRendererEvent,
            preview: DesktopMediaPreview | undefined,
        ) => listener(preview);
        ipcRenderer.on(desktopIpc.mediaPreviewChanged, receive);
        return () => ipcRenderer.removeListener(desktopIpc.mediaPreviewChanged, receive);
    },
};

/*
 * A window gets one bridge or the other, never both, and which one is settled by
 * how the window was launched rather than by what the page it loads says about
 * itself. The preview window therefore has no route to the application's
 * capabilities at all, instead of having them and being asked not to use them.
 */
if (process.argv.includes(mediaPreviewArgument))
    contextBridge.exposeInMainWorld("happyMediaPreview", mediaPreview);
else contextBridge.exposeInMainWorld("happyDesktop", bridge);
