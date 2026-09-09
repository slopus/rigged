import { BrowserTerminalConnection, TERMINAL_PROTOCOL, terminalSocketUrl } from "happy-desktop-app";
import type {
    HappyAgentHostServices,
    HappyAgentOpenInTarget,
    HappyAgentOpenInTargets,
    HappyAgentWorkspaceFileBytes,
} from "happy-desktop-state";

/**
 * Where the application a project was last opened in is remembered. It holds the
 * whole target rather than its id, because the control that wears it is drawn
 * long before the host has finished detecting what is installed — that answer
 * costs a Spotlight query and an icon conversion per application — and a reader
 * who reloads should see the application they chose, not an empty control that
 * fills in a few seconds later.
 *
 * The `v1` key held a bare id and is simply left behind: the first Open in after
 * an upgrade writes this one, and until then the control is as blank as it was
 * before.
 */
const OPEN_IN_RECENT_KEY = "happy.happy-agent.open-in-recent.v2";
const TERMINAL_CAPABILITY_PROTOCOL_PREFIX = "happy-capability.";

type WorkspaceFileBytesResponse = Omit<HappyAgentWorkspaceFileBytes, "url">;

function recentTargetRead(): HappyAgentOpenInTarget | undefined {
    try {
        const stored = localStorage.getItem(OPEN_IN_RECENT_KEY);
        if (stored === null) return undefined;
        const value = JSON.parse(stored) as Partial<HappyAgentOpenInTarget>;
        // Written by an older version of this same code, so the shape is checked
        // rather than trusted: a record without a name to show is no use to the
        // control and is treated as nothing remembered.
        if (typeof value.id !== "string" || typeof value.label !== "string") return undefined;
        return {
            id: value.id,
            label: value.label,
            ...(typeof value.iconUrl === "string" ? { iconUrl: value.iconUrl } : {}),
        };
    } catch {
        return undefined;
    }
}

function recentTargetWrite(target: HappyAgentOpenInTarget): void {
    try {
        localStorage.setItem(OPEN_IN_RECENT_KEY, JSON.stringify(target));
    } catch {
        // The workspace store retains this selection for the current renderer.
    }
}

function capabilityOf(baseUrl: string): string | undefined {
    return new URL(baseUrl, globalThis.location?.href).pathname.split("/").filter(Boolean).at(0);
}

function serviceUrl(
    baseUrl: string,
    path: string,
    parameters: Readonly<Record<string, string>> = {},
): string {
    const url = new URL(`${baseUrl.replace(/\/$/u, "")}${path}`, globalThis.location?.href);
    for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
    return url.toString();
}

async function jsonRead<Value>(response: Response): Promise<Value> {
    if (!response.ok) {
        let message = `The desktop service request failed (${String(response.status)}).`;
        try {
            const body = (await response.json()) as { readonly error?: unknown };
            if (typeof body.error === "string" && body.error.length > 0) message = body.error;
        } catch {
            // Keep the status-based message when the host did not return JSON.
        }
        throw new Error(message);
    }
    return (await response.json()) as Value;
}

async function getJson<Value>(
    baseUrl: string,
    path: string,
    parameters?: Readonly<Record<string, string>>,
    signal?: AbortSignal,
): Promise<Value> {
    return await jsonRead<Value>(await fetch(serviceUrl(baseUrl, path, parameters), { signal }));
}

async function postJson<Value>(baseUrl: string, path: string, body: unknown): Promise<Value> {
    return await jsonRead<Value>(
        await fetch(serviceUrl(baseUrl, path), {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
            method: "POST",
        }),
    );
}

/**
 * Renderer access to the small set of services that truly belong to the
 * desktop host. Agent resources use `HappyAgentClient` directly.
 */
export function happyAgentHostServicesCreate(
    baseUrl: string,
    agentUrl = baseUrl,
): HappyAgentHostServices {
    const capability = capabilityOf(baseUrl);
    return {
        openInTargetsRead: async (): Promise<HappyAgentOpenInTargets> => {
            const targets = await getJson<readonly HappyAgentOpenInTarget[]>(
                baseUrl,
                "/open-in-targets",
            );
            const recent = recentTargetRead();
            return { targets, ...(recent ? { recent } : {}) };
        },
        openIn: async (workspaceId, target) => {
            // Remembered before the launch rather than after it. Choosing the
            // application is the reader's act and is already done; whether the
            // application then starts is the machine's business, and a slow or
            // failed launch must not make the next reload forget what they
            // picked.
            recentTargetWrite(target);
            await postJson<Record<string, never>>(baseUrl, "/open-in", {
                workspaceId,
                target: target.id,
            });
        },
        workspaceFileBytesRead: async (
            workspaceId,
            path,
            signal,
        ): Promise<HappyAgentWorkspaceFileBytes> => {
            const file = await getJson<WorkspaceFileBytesResponse>(
                baseUrl,
                "/workspace-file-bytes",
                { workspaceId, path },
                signal,
            );
            return {
                ...file,
                url: serviceUrl(baseUrl, "/workspace-file-media", {
                    workspaceId,
                    path,
                    hash: file.hash,
                }),
            };
        },
        htmlPreviewOpen: async (workspaceId, path) =>
            (
                await getJson<{ readonly url: string }>(baseUrl, "/html-preview", {
                    workspaceId,
                    path,
                })
            ).url,
        attachmentSourcePath: (file) => window.happyDesktop?.attachmentSourcePath(file),
        attachmentSourceReachable: async (workspaceId, sourcePath) =>
            (
                await postJson<{ readonly reachable: boolean }>(
                    baseUrl,
                    "/attachment-source-reachable",
                    { workspaceId, sourcePath },
                )
            ).reachable,
        attachmentWrite: (workspaceId, name, content) =>
            postJson<{ readonly path: string }>(baseUrl, "/attachment", {
                workspaceId,
                name,
                content,
            }),
        terminalConnect: (workspaceId, terminalId) =>
            new BrowserTerminalConnection(
                terminalSocketUrl(
                    agentUrl.replace(/\/$/u, ""),
                    `/v0/workspaces/${encodeURIComponent(workspaceId)}/terminals/${encodeURIComponent(terminalId)}/attach`,
                ),
                [
                    TERMINAL_PROTOCOL,
                    ...(capability === undefined
                        ? []
                        : [`${TERMINAL_CAPABILITY_PROTOCOL_PREFIX}${capability}`]),
                ],
            ),
    };
}
