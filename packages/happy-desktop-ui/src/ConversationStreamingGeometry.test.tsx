import { useState } from "react";
import { flushSync } from "react-dom";
import type {
    ComposerSnapshot,
    ConversationAuthor,
    ConversationEntry,
    ConversationMessageEntry,
} from "happy-desktop-state";
import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { Message } from "./Message";
import {
    markdownBodyHeight,
    messageTextLayoutCacheCreate,
    monoOutputTextHeight,
} from "./messageTextLayout";
import { createRenderer } from "./testing";
import richTablePayload from "./fixtures/streaming-layout-rich-table.txt?raw";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const agent: ConversationAuthor = {
    id: "streaming-layout-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const composer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "streaming-layout",
    submission: { status: "idle" },
    text: "",
};
function message(text: string, streaming: boolean): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id: "streaming-prose",
            chatId: "streaming-layout",
            sequence: "1",
            changePts: "1",
            sender: agent,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-09-06T12:34:00.000Z",
            generationStatus: streaming ? "streaming" : "complete",
        },
    };
}
const tool: ConversationEntry = {
    kind: "agentActivity",
    id: "edit-tool",
    sequence: "2",
    activity: { kind: "labeled", label: "Edit", subject: "Write", status: "success", mono: true },
};
const screenshotProse = [
    "`full-access` — which is what yolo maps to. So the mapping is right; `never` just reads alarming in isolation.",
    "",
    "That said, your instinct to audit is well-placed — I spotted at least one that looks genuinely wrong (`plan` → `workspace-write`, i.e. plan mode can write files). Delegating a full audit to a **fresh** session rather than `gttdrb`, since it just concluded the mappings were fine and shouldn't grade its own homework.",
].join("\n");
const markdown = [
    screenshotProse,
    "",
    "- First check the [layout source](https://example.com/a/very/long/path/that/is/not/painted/as/the/link/label).",
    "- Then check **streaming geometry** and `inline-code`.",
    "",
    "> This quote must occupy only its rendered lines.",
    "",
    "```ts",
    "const complete = true;",
    "console.log(complete);",
    "```",
    "",
    "Kind | Result",
    "--- | ---",
    "Prose | Exact",
    "Tools | Exact",
].join("\n");

function expectRowGeometry(container: Element, label: string) {
    const rows = [...container.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")];
    expect(rows.length).toBeGreaterThan(1);
    for (let index = 0; index < rows.length - 1; index += 1) {
        const bounds = rows[index]!.getBoundingClientRect();
        const reserved = rows[index + 1]!.getBoundingClientRect().top - bounds.top;
        // The existing geometry gym allows fractional WebKit formatting-box
        // remainders, never a missing line (18px or more).
        expect(
            Math.abs(reserved - bounds.height),
            `${label}: row ${String(index)} painted ${bounds.height.toFixed(3)}px, reserved ${reserved.toFixed(3)}px, gap ${(reserved - bounds.height).toFixed(3)}px`,
        ).toBeLessThanOrEqual(2.1);
    }
    const viewport = container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    expect(
        Math.abs(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight),
        `${label}: following reader stays at the tail`,
    ).toBeLessThanOrEqual(1);
}

it("keeps live prose, tool, and status rows adjacent before and after settlement", async () => {
    const view = createRenderer();
    let update!: (state: { text: string; streaming: boolean; width: number }) => void;
    function Harness() {
        const [state, setState] = useState({ text: screenshotProse, streaming: true, width: 800 });
        update = setState;
        return (
            <div className="happy-theme-dark" style={{ width: state.width, height: 700 }}>
                <ConversationView
                    agentAuthor={agent}
                    composer={composer}
                    conversationId="streaming-layout"
                    elapsedMs={82_000}
                    entries={[message(state.text, state.streaming), tool]}
                    motion="calm"
                    onComposerSend={() => {}}
                    onComposerValueChange={() => {}}
                    running
                    workingLabel="Preparing tools"
                />
            </div>
        );
    }
    view.render(Harness, { width: 900, height: 700 });
    await view.ready();
    await nextFrame();
    await nextFrame();
    expect(window.devicePixelRatio).toBe(2);
    await view.screenshot("ConversationStreamingGeometry.test");
    expectRowGeometry(view.container, "screenshot-shaped live prose");

    const row = view.container.querySelector(".happy-message-list__virtual-row")!;
    const prefix = row.querySelector("p")!;
    const input = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
    input.focus();
    for (const width of [800, 560, 360, 800]) {
        for (const text of [
            screenshotProse,
            markdown,
            `${markdown}\n\n${"WWW WWW WWW ".repeat(24)}`,
        ]) {
            flushSync(() => update({ text, streaming: true, width }));
            await nextFrame();
            expect(view.container.querySelector(".happy-message-list__virtual-row")).toBe(row);
            expect(row.querySelector("p")).toBe(prefix);
            expect(document.activeElement).toBe(input);
            expectRowGeometry(view.container, `streaming at ${String(width)}px`);
            const liveHeight = row.getBoundingClientRect().height;
            flushSync(() => update({ text, streaming: false, width }));
            expectRowGeometry(view.container, `settled at ${String(width)}px`);
            expect(row.getBoundingClientRect().height).toBe(liveHeight);
            await nextFrame();
            expectRowGeometry(view.container, `first settled frame at ${String(width)}px`);
        }
    }
});

for (const width of [800, 560, 360]) {
    // Pretext 0.0.8 also undercounts SETTLED narrow Firefox URL text: Gecko
    // prefers breaks after path slashes where Pretext keeps the token together.
    // Keep the real failing replay executable, without weakening the geometry
    // assertion or hiding the wider Firefox / all Chromium and WebKit results.
    (server.browser === "firefox" && width === 360 ? it.fails : it)(
        `keeps the reported rich-table stream adjacent at ${String(width)}px`,
        async () => {
            const view = createRenderer();
            let update!: (text: string, streaming: boolean, width: number) => void;
            function Harness() {
                const [state, setState] = useState({ text: "", streaming: true, width });
                update = (text, streaming, width) => setState({ text, streaming, width });
                return (
                    <div className="happy-theme-dark" style={{ width: state.width, height: 700 }}>
                        <ConversationView
                            agentAuthor={agent}
                            composer={composer}
                            conversationId="reported-rich-table"
                            entries={[message(state.text, state.streaming), tool]}
                            motion="calm"
                            onComposerSend={() => {}}
                            onComposerValueChange={() => {}}
                            running
                        />
                    </div>
                );
            }
            view.render(Harness, { width: 900, height: 700 });
            await view.ready();
            await nextFrame();
            await nextFrame();
            const row = view.container.querySelector(".happy-message-list__virtual-row")!;
            const input = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
            input.focus();
            const ends = new Set([richTablePayload.length]);
            for (let end = 1; end < richTablePayload.length; end += 32) ends.add(end);
            // Exercise each structural delimiter as well as ordinary growing chunks:
            // the header is prose until its GFM separator arrives, and unfinished
            // links/code/formatting must have accurate geometry before they close.
            for (let index = 0; index < richTablePayload.length; index += 1) {
                if (!"\n|`]*".includes(richTablePayload[index]!)) continue;
                ends.add(index);
                ends.add(index + 1);
            }
            for (const end of [...ends].sort((a, b) => a - b)) {
                flushSync(() => update(richTablePayload.slice(0, end), true, width));
                await nextFrame();
                expectRowGeometry(
                    view.container,
                    `reported payload prefix ${String(end)} at ${String(width)}px`,
                );
                expect(view.container.querySelector(".happy-message-list__virtual-row")).toBe(row);
                expect(document.activeElement).toBe(input);
            }
            const liveHeight = row.getBoundingClientRect().height;
            flushSync(() => update(richTablePayload, false, width));
            expectRowGeometry(view.container, `reported payload settled at ${String(width)}px`);
            expect(row.getBoundingClientRect().height).toBe(liveHeight);
            expect(row.querySelectorAll("table")).toHaveLength(1);
            expect(row.querySelectorAll("tr")).toHaveLength(7);
            const tableViewport = row.querySelector<HTMLElement>(
                ".happy-message__table-scroll-viewport",
            )!;
            expect(tableViewport.scrollWidth).toBeGreaterThan(tableViewport.clientWidth);
        },
    );
}

it("matches empty streamed heading, list and table boxes", async () => {
    const view = createRenderer();
    let update!: (text: string) => void;
    function Harness() {
        const [text, setText] = useState("");
        update = setText;
        return (
            <ConversationView
                agentAuthor={agent}
                composer={composer}
                conversationId="empty-streamed-blocks"
                entries={[message(text, true), tool]}
                motion="calm"
                onComposerSend={() => {}}
                onComposerValueChange={() => {}}
                running
            />
        );
    }
    view.render(Harness, { width: 360, height: 700 });
    await view.ready();
    await nextFrame();
    await nextFrame();
    for (const text of [
        "##",
        "Before\n\n##\n\nAfter",
        "Before\n\n##",
        "1. ",
        "| |\n|---|\n| |",
        "| H |\n|---|\n| <b></b> |",
        "| H |\n|---|\n| &nbsp; |",
        "| H |\n|---|\n| ` ` |",
        "| H |\n|---|\n| | discarded |",
    ]) {
        flushSync(() => update(text));
        await nextFrame();
        expectRowGeometry(view.container, `empty-block contract ${JSON.stringify(text)}`);
    }
});

(server.browser === "firefox" ? it.fails : it)(
    "documents the pre-existing settled narrow-URL line-break mismatch in Gecko",
    async () => {
        const text = richTablePayload.slice(0, 417);
        const view = createRenderer();
        view.render(() => <Message agent author="Happy" body={text} />, {
            width: 360,
            height: 700,
        });
        await view.ready();
        await document.fonts.load('16px "happy Figtree"');
        await document.fonts.load('700 16px "happy Figtree"');
        await nextFrame();
        const body = view.container.querySelector<HTMLElement>(".happy-message__body")!;
        const bounds = body.getBoundingClientRect();
        const settled = markdownBodyHeight(text, bounds.width, messageTextLayoutCacheCreate());
        expect(Math.abs(settled - bounds.height)).toBeLessThanOrEqual(2.1);
    },
);

it("keeps expanded shell output adjacent to the live status while output grows", async () => {
    const view = createRenderer();
    let update!: (output: string, running: boolean) => void;
    function Harness() {
        const [state, setState] = useState({ output: "Starting build", running: true });
        update = (output, running) => setState({ output, running });
        const shell: ConversationEntry = {
            kind: "agentActivity",
            id: "streaming-shell",
            sequence: "1",
            activity: {
                kind: "shell",
                command: "build",
                output: state.output,
                running: state.running,
                timedOut: false,
                exitCode: state.running ? null : 0,
            },
        };
        return (
            <ConversationView
                agentAuthor={agent}
                composer={composer}
                conversationId="streaming-output"
                entries={[shell]}
                motion="calm"
                onComposerSend={() => {}}
                onComposerValueChange={() => {}}
                running
            />
        );
    }
    view.render(Harness, { width: 560, height: 700 });
    await view.ready();
    await nextFrame();
    await nextFrame();
    const row = view.container.querySelector(".happy-message-list__virtual-row")!;
    for (const output of [
        "Starting build\nBundling packages\n",
        `Starting build\n${"漢字 ".repeat(48)}\nBundling packages\n`,
        `Starting build\n${"packages/happy-desktop-ui ".repeat(18)}\nDone\n`,
    ]) {
        flushSync(() => update(output, true));
        expectRowGeometry(view.container, "streaming shell output");
        await nextFrame();
        expectRowGeometry(view.container, "first streamed shell frame");
        const liveHeight = row.getBoundingClientRect().height;
        flushSync(() => update(output, false));
        expect(view.container.querySelector(".happy-message-list__virtual-row")).toBe(row);
        expectRowGeometry(view.container, "settled shell output");
        expect(row.getBoundingClientRect().height).toBe(liveHeight);
    }
});

it("lays out each live prefix exactly without retaining it in the settled text cache", async () => {
    const view = createRenderer();
    view.render(() => <div>Font readiness</div>, { width: 800, height: 40 });
    await view.ready();
    await document.fonts.load('16px "happy Figtree"');
    await document.fonts.load('12px "happy Mono"');
    const cache = messageTextLayoutCacheCreate();
    markdownBodyHeight("Existing settled history", 640, cache);
    // Let the layout module's font-generation notification settle before
    // taking the retained-cache baseline.
    await nextFrame();
    markdownBodyHeight("Existing settled history", 640, cache);
    const retained = JSON.stringify(cache);
    const cases = [
        screenshotProse,
        markdown,
        "WWW WWW WWW ".repeat(40),
        "first line\nsoft break\n\nsecond paragraph",
        "```mermaid\ngraph TD\nA --> B\n```",
    ];
    for (const text of cases) {
        for (let end = 1; end <= text.length; end += 23) {
            const prefix = text.slice(0, end);
            for (const width of [266, 466, 706]) {
                expect(
                    markdownBodyHeight(prefix, width, cache, 0, false, true),
                    `live Markdown prefix ${String(end)} at ${String(width)}px`,
                ).toBe(markdownBodyHeight(prefix, width, messageTextLayoutCacheCreate(), 0, false));
                expect(
                    monoOutputTextHeight(prefix, width, cache, true),
                    `live shell prefix ${String(end)} at ${String(width)}px`,
                ).toBe(monoOutputTextHeight(prefix, width, messageTextLayoutCacheCreate()));
            }
        }
    }
    expect(JSON.stringify(cache), "live prefixes must not enter the retained history cache").toBe(
        retained,
    );
});
