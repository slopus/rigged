import {
    clearCache,
    layout,
    layoutNextLine,
    measureNaturalWidth,
    prepare,
    prepareWithSegments,
    type PreparedText,
} from "@chenglou/pretext";
import {
    measureRichInlineStats,
    prepareRichInline,
    type PreparedRichInline,
    type RichInlineItem,
} from "@chenglou/pretext/rich-inline";
import {
    MERMAID_DIAGRAM_BORDER,
    mermaidDiagramMeasure,
    mermaidDiagramNaturalHeight,
    type MermaidDiagramDimensions,
} from "./mermaidDiagramRender";
import { messageMarkdownParse, type MessageMarkdownAst } from "./messageMarkdownAst";

/**
 * Height of chat body copy, resolved from the font and the measure instead of
 * from a mounted element.
 *
 * The virtualized message list needs a row's height *before* that row mounts: a
 * constant guess makes the scrollbar lie and turns every offset the reader
 * scrolls into a correction. Pretext resolves the same line breaking the browser
 * would, so an unmounted row is sized to within a line of its painted height.
 *
 * Every constant below mirrors `styles/message.css` and the `--happy-font-*`
 * tokens in `theme.css`. They are duplicated deliberately — reading them back
 * out of the cascade needs a mounted element, which is the thing this module
 * exists to avoid — so a change to either must be made here too.
 */
const UI_FAMILY = '"happy Figtree", system-ui, sans-serif';
const MONO_FAMILY = '"happy Mono", ui-monospace, monospace';
/** `.happy-message__body p` — the shape almost every chat line takes. */
const PARAGRAPH_SIZE = 16;
const PARAGRAPH_LINE = 24;
/** `.happy-message__body pre code`, which never wraps (`white-space: pre`). */
const CODE_LINE = 20;
const CODE_PADDING = 16;
/** `.happy-message__body > * + *` stacking, and the wider margin around `pre`. */
const BLOCK_GAP = 8;
const CODE_GAP = 12;
/** `hr`, and the 8px vertical padding inside every table cell. */
const RULE_HEIGHT = 1;
const TABLE_CELL_PADDING = 8;
/** `blockquote` — a 2px rule plus its 10px inset, taken off the measure. */
const QUOTE_INSET = 12;
/** `ul/ol` indent, and the extra leading between consecutive `li`. */
const LIST_INDENT = 24;
const LIST_ITEM_GAP = 6;
/** Deterministic inline box reserved by a rendered GFM task checkbox. The
 * non-breaking space item beside it models remark-rehype's generated separator. */
const TASK_CHECKBOX_INLINE = 19;
/** The scrollport reports integer client widths while CSS inline layout retains
 * 1/64px units. Admit that one layout unit without accepting a genuinely wider
 * word at the next boundary. */
const INLINE_MEASURE_EPSILON = 1 / 64;
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });
/** Browser inline layout is the external boundary Pretext cannot describe.
 * Blink decides whether a slice-decorated inline word must fragment from its
 * glyphs plus start/end padding. WebKit first tests the glyph run alone, then
 * accounts for the padding after that run is already fragmenting. */
const WEBKIT_INLINE_SLICE =
    typeof navigator !== "undefined" &&
    /AppleWebKit\//u.test(navigator.userAgent) &&
    !/(?:Chrome|Chromium|CriOS|Edg|OPR)\//u.test(navigator.userAgent);
/** `.happy-system-notice__text` — 13px copy on a 20px line. */
const NOTICE_SIZE = 13;
const NOTICE_LINE = 20;
let fontsWatched = false;
let fontGeneration = 0;
const fontListeners = new Set<() => void>();
type Dictionary<T> = Record<string, T | undefined>;
const dictionaryCreate = <T>(): Dictionary<T> => Object.create(null) as Dictionary<T>;
export interface MessageTextLayoutCache {
    /** Font generation this cache was measured against. */
    generation: number;
    /** Width-independent Pretext preparation, grouped by font then source text. */
    prepared: Dictionary<Dictionary<PreparedText>>;
    /** Final Markdown body heights, grouped by source text then wrapping measure. */
    markdownHeights: Dictionary<Dictionary<number>>;
    /** Intrinsic Beautiful Mermaid geometry, or null for an invalid fence. */
    mermaidDimensions: Dictionary<MermaidDiagramDimensions | null>;
    /** Parsed remark/GFM documents, grouped by immutable message source. */
    markdownTrees: Dictionary<MessageMarkdownAst>;
    /** Footnote numbering and generated-footer geometry from each parsed document. */
    markdownFootnotes: Dictionary<MarkdownFootnotes>;
    /** Final wrapped-run heights, grouped by font, source text, then layout dimensions. */
    runHeights: Dictionary<Dictionary<Dictionary<number>>>;
    /** Prepared mixed-font AST inline runs, grouped by their explicit item signature. */
    richPrepared: Dictionary<PreparedRichInline>;
    /** Natural widths, grouped by font then source text. */
    naturalWidths: Dictionary<Dictionary<number>>;
}
/**
 * One conversation's text-layout cache. Settled transcript text is retained so
 * revisiting a long history does not reparse it. Streaming text deliberately
 * uses a measurement-local cache: each growing prefix receives the same exact
 * layout without retaining another Markdown tree and prepared run until the
 * view dies. The conversation surface owns the settled cache lifetime.
 */
export function messageTextLayoutCacheCreate(): MessageTextLayoutCache {
    return {
        generation: fontGeneration,
        prepared: dictionaryCreate(),
        markdownHeights: dictionaryCreate(),
        mermaidDimensions: dictionaryCreate(),
        markdownTrees: dictionaryCreate(),
        markdownFootnotes: dictionaryCreate(),
        runHeights: dictionaryCreate(),
        richPrepared: dictionaryCreate(),
        naturalWidths: dictionaryCreate(),
    };
}
/** Standalone callers keep the old no-setup API; chat surfaces supply their own cache. */
const sharedCache = messageTextLayoutCacheCreate();
/**
 * Every cached layout was resolved against whichever face was installed at the
 * time. A webfont arriving later changes real line breaking, so the generation
 * advances once and Pretext's own cache is dropped. Conversation caches clear
 * lazily the next time they are read, without a global registry retaining them.
 */
function watchFonts() {
    if (fontsWatched || typeof document === "undefined" || !document.fonts) return;
    fontsWatched = true;
    /* Canvas measurement does not reliably initiate a webfont request. Ask for
       both owned variable faces explicitly; `document.fonts.ready` alone can
       resolve while an as-yet-unused face is still absent, leaving the model's
       first prepared runs permanently backed by fallback metrics. */
    void Promise.all([
        document.fonts.load(`16px ${UI_FAMILY}`),
        document.fonts.load(`14px ${MONO_FAMILY}`),
    ]).then(() => {
        fontGeneration += 1;
        clearCache();
        for (const listener of fontListeners) listener();
    });
}
/** Current generation of the faces every text estimate was resolved against. */
export function messageTextLayoutFontGenerationGet(): number {
    return fontGeneration;
}
/** Notifies mounted transcript estimators when webfont arrival changes line breaking. */
export function messageTextLayoutFontGenerationSubscribe(listener: () => void): () => void {
    watchFonts();
    fontListeners.add(listener);
    return () => fontListeners.delete(listener);
}
/** Clears one conversation's text-layout results when the installed font changes. */
export function messageTextLayoutCacheRefresh(cache: MessageTextLayoutCache): boolean {
    watchFonts();
    if (cache.generation === fontGeneration) return false;
    cache.prepared = dictionaryCreate();
    cache.markdownHeights = dictionaryCreate();
    cache.runHeights = dictionaryCreate();
    cache.richPrepared = dictionaryCreate();
    cache.naturalWidths = dictionaryCreate();
    cache.generation = fontGeneration;
    return true;
}

/**
 * Height of pre-wrapped monospace output. Newlines remain hard boundaries and
 * each physical line wraps at the same measure as the browser's `pre-wrap`
 * block; a trailing newline does not create another painted line box.
 */
export function monoOutputTextHeight(
    text: string,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
    streaming = false,
): number {
    const measurementCache = streaming ? messageTextLayoutCacheCreate() : cache;
    const lines = text.split("\n");
    if (lines.length > 1 && lines.at(-1) === "") lines.pop();
    let height = 0;
    for (const line of lines)
        height += runHeight(line, `12px ${MONO_FAMILY}`, 18, measure, measurementCache);
    return Math.max(18, height);
}
function cacheReady(cache: MessageTextLayoutCache): MessageTextLayoutCache {
    messageTextLayoutCacheRefresh(cache);
    return cache;
}
function preparedText(text: string, font: string, cache: MessageTextLayoutCache): PreparedText {
    const ready = cacheReady(cache);
    let byText = ready.prepared[font];
    if (!byText) {
        byText = dictionaryCreate();
        ready.prepared[font] = byText;
    }
    const hit = byText[text];
    if (hit !== undefined) return hit;
    const value = prepare(text, font, { whiteSpace: "normal" });
    byText[text] = value;
    return value;
}
/** Painted height of one wrapped run, never less than a single line box. */
function runHeight(
    text: string,
    font: string,
    lineHeight: number,
    measure: number,
    cache: MessageTextLayoutCache,
): number {
    if (measure <= 0 || text.trim().length === 0) return lineHeight;
    const ready = cacheReady(cache);
    const value = preparedText(text, font, ready);
    let byText = ready.runHeights[font];
    if (!byText) {
        byText = dictionaryCreate();
        ready.runHeights[font] = byText;
    }
    let layouts = byText[text];
    if (!layouts) {
        layouts = dictionaryCreate();
        byText[text] = layouts;
    }
    const key = `${String(measure)}:${String(lineHeight)}`;
    const hit = layouts[key];
    if (hit !== undefined) return hit;
    const height = Math.max(lineHeight, layout(value, measure, lineHeight).height);
    layouts[key] = height;
    return height;
}

function preparedRichItems(
    items: readonly RichInlineItem[],
    cache: MessageTextLayoutCache,
): PreparedRichInline {
    const ready = cacheReady(cache);
    const key = JSON.stringify(
        items.map((item) => [
            item.text,
            item.font,
            item.letterSpacing ?? null,
            item.break ?? null,
            item.extraWidth ?? null,
        ]),
    );
    const hit = ready.richPrepared[key];
    if (hit !== undefined) return hit;
    const value = prepareRichInline([...items]);
    ready.richPrepared[key] = value;
    return value;
}
function richItemsHeight(
    items: readonly RichInlineItem[],
    lineHeight: number,
    measure: number,
    cache: MessageTextLayoutCache,
): number {
    if (measure <= 0 || items.length === 0) return lineHeight;
    const measured = preparedRichItems(items, cache);
    const relaxedMeasure = measure + INLINE_MEASURE_EPSILON;
    const relaxed = measureRichInlineStats(measured, relaxedMeasure);
    /* Pretext can hang a token slightly beyond its supplied measure. Keep the
       one-layout-unit tolerance only when the resulting line also stays inside
       that contract; otherwise resolve the real, unrelaxed line break. */
    const stats =
        relaxed.maxLineWidth <= relaxedMeasure
            ? relaxed
            : measureRichInlineStats(measured, measure);
    return Math.max(1, stats.lineCount) * lineHeight;
}
function richItemsNaturalWidth(
    items: readonly RichInlineItem[],
    cache: MessageTextLayoutCache,
): number {
    return measureRichInlineStats(preparedRichItems(items, cache), Number.MAX_SAFE_INTEGER)
        .maxLineWidth;
}

type MarkdownRootContent = MessageMarkdownAst["children"][number];
type MarkdownParagraph = Extract<MarkdownRootContent, { type: "paragraph" }>;
type MarkdownPhrasing = MarkdownParagraph["children"][number];
type MarkdownFootnoteDefinition = Extract<MarkdownRootContent, { type: "footnoteDefinition" }>;
type MarkdownFootnotes = {
    readonly counts: ReadonlyMap<string, number>;
    readonly definitions: ReadonlyMap<string, MarkdownFootnoteDefinition>;
    readonly numbers: ReadonlyMap<string, number>;
    readonly order: readonly string[];
};
type MarkdownInlineStyle = {
    readonly italic: boolean;
    readonly size: number;
    readonly weight: number;
};
function markdownInlineFont(style: MarkdownInlineStyle): string {
    return `${style.italic ? "italic " : ""}${style.weight === 400 ? "" : `${String(style.weight)} `}${String(style.size)}px ${UI_FAMILY}`;
}
function markdownImageLabel(node: Extract<MarkdownPhrasing, { type: "image" }>): string {
    return node.alt?.trim() || node.url || "image";
}
/** Preserve the browser's Unicode line-breaking boundary across adjacent AST
 * nodes. In particular, punctuation immediately after a styled node belongs to
 * that preceding word; it cannot start a new line independently just because
 * Markdown represented the two fonts as separate nodes. */
function markdownInlineLeadingTokenAttach(
    items: RichInlineItem[],
    text: string,
    font: string,
    cache: MessageTextLayoutCache,
    measure: number,
    enabled: boolean,
): string {
    const previous = items.at(-1);
    if (!enabled || !previous || /\s$/u.test(previous.text) || /^\s/u.test(text)) return text;
    const match = /^\S+/u.exec(text);
    if (!match) return text;
    const tokenWidth = naturalTextWidth(match[0], font, cache);
    /* Punctuation and other no-space continuations belong to the preceding
       fragment only while that combined fragment fits. Otherwise CSS can wrap
       at the inline-element boundary; charging the continuation as chrome would
       incorrectly repeat it on every emergency fragment. */
    if (
        naturalTextWidth(previous.text, previous.font, cache) +
            (previous.extraWidth ?? 0) +
            tokenWidth >
        measure
    )
        return text;
    previous.extraWidth = (previous.extraWidth ?? 0) + tokenWidth;
    return text.slice(match[0].length);
}
/** Split one overlong decorated segment. Pretext chooses the grapheme
 * boundaries; separate atomic items expose the true final fragment for link
 * punctuation and keep code padding on only its first/last fragments. */
function markdownInlineFragmentItems(
    text: string,
    font: string,
    measure: number,
    startExtraWidth: number,
    endExtraWidth: number,
    cache: MessageTextLayoutCache,
    decoratedFlow = false,
): RichInlineItem[] {
    /* `overflow-wrap: break-word` emergency-breaks the glyph run, not an intact
       word whose text fits and whose inline start/end decoration alone hangs
       beyond the measure. Keep that word atomic and let its box chrome occupy
       the same slight overflow the browser paints. */
    const textWidth = naturalTextWidth(text, font, cache);
    if (
        textWidth + (decoratedFlow ? startExtraWidth + endExtraWidth : 0) <=
        measure + INLINE_MEASURE_EPSILON
    )
        return [
            {
                break: "never",
                extraWidth: startExtraWidth + endExtraWidth,
                font,
                text,
            },
        ];
    const graphemes = [...GRAPHEME_SEGMENTER.segment(text)].map((part) => part.segment);
    const items: RichInlineItem[] = [];
    let graphemeIndex = 0;
    let first = true;
    while (graphemeIndex < graphemes.length) {
        const firstExtraWidth = first ? startExtraWidth : 0;
        const finalAvailable = Math.max(1, measure - firstExtraWidth - endExtraWidth);
        const remaining = graphemes.slice(graphemeIndex).join("");
        const prepared = prepareWithSegments(remaining, font, { whiteSpace: "normal" });
        let available = finalAvailable;
        let line = layoutNextLine(prepared, { graphemeIndex: 0, segmentIndex: 0 }, available);
        if (!line) break;
        let count = [...GRAPHEME_SEGMENTER.segment(line.text)].length;
        if (count < graphemes.length - graphemeIndex && endExtraWidth > 0) {
            const fullAvailable = Math.max(1, measure - firstExtraWidth);
            const fullLine = layoutNextLine(
                prepared,
                { graphemeIndex: 0, segmentIndex: 0 },
                fullAvailable,
            );
            if (fullLine) {
                const fullCount = [...GRAPHEME_SEGMENTER.segment(fullLine.text)].length;
                /* The closing inset belongs only to the code element's final
                   fragment. Use the unreserved candidate only when content
                   still remains after it. */
                if (fullCount < graphemes.length - graphemeIndex) {
                    available = fullAvailable;
                    count = fullCount;
                    line = fullLine;
                }
            }
        }
        let fragment = graphemes.slice(graphemeIndex, graphemeIndex + count).join("");
        let fragmentWidth = naturalTextWidth(fragment, font, cache);
        /* Pretext follows Blink's punctuation hanging and can return a preferred
           hyphen breakpoint whose painted width exceeds the supplied measure.
           A padded inline fragment has no space for that overhang in WebKit.
           Retreat to the last real grapheme fit, retaining Pretext's chosen
           boundary whenever it already fits. */
        while (count > 1 && fragmentWidth > available + INLINE_MEASURE_EPSILON) {
            count -= 1;
            fragment = graphemes.slice(graphemeIndex, graphemeIndex + count).join("");
            fragmentWidth = naturalTextWidth(fragment, font, cache);
        }
        const final = graphemeIndex + count >= graphemes.length;
        items.push({
            break: "never",
            extraWidth: firstExtraWidth + (final ? endExtraWidth : 0),
            font,
            text: fragment,
        });
        graphemeIndex += count;
        first = false;
    }
    return items;
}
function markdownInlineItemsAppend(
    node: MarkdownPhrasing,
    style: MarkdownInlineStyle,
    runs: RichInlineItem[][],
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    measure: number,
    bindDecoratedPunctuation: boolean,
    fragmentLong = false,
    atomic = false,
): void {
    const current = () => runs[runs.length - 1]!;
    if (node.type === "text") {
        const font = markdownInlineFont(style);
        const text = markdownInlineLeadingTokenAttach(
            current(),
            node.value,
            font,
            cache,
            measure,
            bindDecoratedPunctuation,
        );
        if (text.length === 0) return;
        const tokens = atomic ? [text] : (text.match(/\s*\S+|\s+$/gu) ?? [text]);
        for (const token of tokens) {
            const match = /^(\s*)(\S+)$/u.exec(token);
            if (
                fragmentLong &&
                match &&
                naturalTextWidth(match[2]!, font, cache) > measure + INLINE_MEASURE_EPSILON
            ) {
                if (match[1]!.length > 0) current().push({ font, text: match[1]! });
                current().push(
                    ...markdownInlineFragmentItems(match[2]!, font, measure, 0, 0, cache),
                );
                continue;
            }
            current().push({
                break: atomic ? "never" : undefined,
                font,
                text: token,
            });
        }
        return;
    }
    if (node.type === "inlineCode") {
        const text = node.value.replace(/\r?\n|\r/gu, " ");
        const font = `14px ${MONO_FAMILY}`;
        const textWidth = naturalTextWidth(text, font, cache);
        const decoratedFlow =
            textWidth + (WEBKIT_INLINE_SLICE ? 0 : 10) > measure + INLINE_MEASURE_EPSILON;
        const segments = prepareWithSegments(text, font, { whiteSpace: "normal" }).segments;
        for (const [index, segment] of segments.entries()) {
            const items = markdownInlineFragmentItems(
                segment,
                font,
                measure,
                index === 0 ? 5 : 0,
                index === segments.length - 1 ? 5 : 0,
                cache,
                decoratedFlow,
            );
            current().push(...items);
        }
        return;
    }
    if (node.type === "break") {
        runs.push([]);
        return;
    }
    if (node.type === "image") {
        current().push({
            break: atomic ? "never" : undefined,
            font: markdownInlineFont(style),
            text: markdownImageLabel(node),
        });
        return;
    }
    if (node.type === "imageReference") {
        current().push({
            break: atomic ? "never" : undefined,
            font: markdownInlineFont(style),
            text: node.alt?.trim() || node.label || node.identifier || "image",
        });
        return;
    }
    if (node.type === "footnoteReference") {
        const number = footnotes.numbers.get(node.identifier.toUpperCase());
        current().push({
            break: "never",
            font: markdownInlineFont(style),
            text: number === undefined ? (node.label ?? node.identifier) : String(number),
        });
        return;
    }
    if (node.type === "html") return;
    const nestedStyle: MarkdownInlineStyle =
        node.type === "strong"
            ? { ...style, weight: 700 }
            : node.type === "emphasis"
              ? { ...style, italic: true }
              : style;
    const nestedAtomic = atomic;
    const nestedFragmentLong =
        fragmentLong || node.type === "link" || node.type === "linkReference";
    for (const child of node.children)
        markdownInlineItemsAppend(
            child,
            nestedStyle,
            runs,
            cache,
            footnotes,
            measure,
            bindDecoratedPunctuation,
            nestedFragmentLong,
            nestedAtomic,
        );
}
function markdownTrailingInlineApply(
    runs: RichInlineItem[][],
    lastChildStart: { readonly item: number; readonly run: number },
    lastChild: MarkdownPhrasing,
    trailingExtraWidth: number,
    baseFont: string,
    cache: MessageTextLayoutCache,
): void {
    if (trailingExtraWidth <= 0) return;
    const finalRun = runs.at(-1);
    if (!finalRun || lastChildStart.run !== runs.length - 1) return;
    if (lastChild.type === "text") {
        const finalItem = finalRun.at(-1);
        if (!finalItem) return;
        const match = /^(.*?)(\s+)(\S+)$/u.exec(finalItem.text);
        if (match) {
            finalRun.splice(
                finalRun.length - 1,
                1,
                { ...finalItem, text: `${match[1]!}${match[2]!}` },
                {
                    ...finalItem,
                    break: "never",
                    extraWidth: (finalItem.extraWidth ?? 0) + trailingExtraWidth,
                    text: match[3]!,
                },
            );
            return;
        }
        finalRun[finalRun.length - 1] = {
            ...finalItem,
            break: "never",
            extraWidth: (finalItem.extraWidth ?? 0) + trailingExtraWidth,
        };
        return;
    }
    const childItems = finalRun.splice(lastChildStart.item);
    if (childItems.length === 0) return;
    const childWidth = richItemsNaturalWidth(childItems, cache);
    const spaceWidth = naturalTextWidth("\u00a0", baseFont, cache);
    finalRun.push({
        break: "never",
        extraWidth: Math.max(0, childWidth + trailingExtraWidth - spaceWidth),
        font: baseFont,
        text: "\u00a0",
    });
}
function markdownInlineRuns(
    children: readonly MarkdownPhrasing[],
    style: MarkdownInlineStyle,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    trailingExtraWidth: number,
    task: boolean,
    suffixText: string,
): readonly RichInlineItem[][] {
    const baseFont = markdownInlineFont(style);
    const runs: RichInlineItem[][] = [[]];
    if (task) {
        runs[0]!.push({
            break: "never",
            extraWidth: TASK_CHECKBOX_INLINE,
            font: baseFont,
            text: "\u00a0",
        });
    }
    let lastChildStart = { item: runs[0]!.length, run: 0 };
    for (const [index, child] of children.entries()) {
        if (index === children.length - 1)
            lastChildStart = { item: runs.at(-1)!.length, run: runs.length - 1 };
        markdownInlineItemsAppend(
            child,
            style,
            runs,
            cache,
            footnotes,
            measure,
            suffixText.length === 0,
            false,
        );
    }
    const lastChild = children.at(-1);
    if (lastChild)
        markdownTrailingInlineApply(
            runs,
            lastChildStart,
            lastChild,
            trailingExtraWidth,
            baseFont,
            cache,
        );
    if (suffixText.length > 0) runs.at(-1)!.push({ font: baseFont, text: suffixText });
    return runs;
}
function markdownInlineHeight(
    children: readonly MarkdownPhrasing[],
    style: MarkdownInlineStyle,
    lineHeight: number,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    trailingExtraWidth = 0,
    task = false,
    suffixText = "",
): number {
    if (
        !markdownInlineHasLineBox(children) &&
        trailingExtraWidth === 0 &&
        !task &&
        suffixText.length === 0
    )
        return 0;
    const runs = markdownInlineRuns(
        children,
        style,
        measure,
        cache,
        footnotes,
        trailingExtraWidth,
        task,
        suffixText,
    );
    const height = runs.reduce(
        (total, items) => total + richItemsHeight(items, lineHeight, measure, cache),
        0,
    );
    return height;
}

/** Empty cells have padding but no line box. Mirror the rendered inline tree:
 * skipped HTML and collapsed ASCII whitespace do not create one, whereas code
 * decoration, images-as-labels, references and explicit breaks do. */
function markdownInlineHasLineBox(children: readonly MarkdownPhrasing[]): boolean {
    return children.some((node) => {
        if (node.type === "html") return false;
        if (node.type === "text") return /[^\t\n\r ]/u.test(node.value);
        if (
            node.type === "inlineCode" ||
            node.type === "break" ||
            node.type === "image" ||
            node.type === "imageReference" ||
            node.type === "footnoteReference"
        )
            return true;
        return markdownInlineHasLineBox(node.children);
    });
}

/** Height of one ordinary UI-font run at an explicit type ramp and measure. */
export function uiTextHeight(
    text: string,
    size: number,
    lineHeight: number,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
): number {
    return runHeight(text, `${String(size)}px ${UI_FAMILY}`, lineHeight, measure, cache);
}
/** The heading ramp: h2 is the largest, h3 alone carries a taller line. */
const HEADINGS = [
    { size: 16, line: 24, weight: 900 },
    { size: 20, line: 24, weight: 600 },
    { size: 16, line: 28, weight: 600 },
    { size: 16, line: 24, weight: 600 },
    { size: 16, line: 24, weight: 600 },
    { size: 16, line: 24, weight: 600 },
] as const;
/** A block's painted box plus the margins that separate it from its neighbours. */
type Block = { readonly height: number; readonly marginTop: number; readonly marginBottom: number };
const flow = (height: number): Block => ({ height, marginTop: 0, marginBottom: 0 });
type MarkdownList = Extract<MarkdownRootContent, { type: "list" }>;
type MarkdownTrailingInline = {
    readonly endOffset: number;
    readonly extraWidth: number;
};

function messageMarkdownTree(text: string, cache: MessageTextLayoutCache): MessageMarkdownAst {
    const hit = cache.markdownTrees[text];
    if (hit !== undefined) return hit;
    const tree = messageMarkdownParse(text);
    cache.markdownTrees[text] = tree;
    return tree;
}
type MutableMarkdownFootnotes = {
    readonly counts: Map<string, number>;
    readonly definitions: Map<string, MarkdownFootnoteDefinition>;
    readonly numbers: Map<string, number>;
    readonly order: string[];
};
function markdownFootnoteReferenceCollect(
    node: MarkdownPhrasing,
    footnotes: MutableMarkdownFootnotes,
): void {
    if (node.type === "footnoteReference") {
        const identifier = node.identifier.toUpperCase();
        if (!footnotes.numbers.has(identifier)) {
            footnotes.order.push(identifier);
            footnotes.numbers.set(identifier, footnotes.order.length);
        }
        footnotes.counts.set(identifier, (footnotes.counts.get(identifier) ?? 0) + 1);
        return;
    }
    if (
        node.type === "text" ||
        node.type === "inlineCode" ||
        node.type === "break" ||
        node.type === "image" ||
        node.type === "imageReference" ||
        node.type === "html"
    )
        return;
    for (const child of node.children) markdownFootnoteReferenceCollect(child, footnotes);
}
function markdownFootnoteReferencesCollect(
    node: MarkdownRootContent,
    footnotes: MutableMarkdownFootnotes,
): void {
    if (node.type === "paragraph" || node.type === "heading") {
        for (const child of node.children) markdownFootnoteReferenceCollect(child, footnotes);
        return;
    }
    if (node.type === "blockquote") {
        for (const child of node.children) markdownFootnoteReferencesCollect(child, footnotes);
        return;
    }
    if (node.type === "list") {
        for (const item of node.children)
            for (const child of item.children) markdownFootnoteReferencesCollect(child, footnotes);
        return;
    }
    if (node.type === "table") {
        for (const row of node.children)
            for (const cell of row.children)
                for (const child of cell.children)
                    markdownFootnoteReferenceCollect(child, footnotes);
    }
}
/** Mirrors mdast-util-to-hast's reference-order numbering and generated footer. */
function messageMarkdownFootnotes(
    text: string,
    tree: MessageMarkdownAst,
    cache: MessageTextLayoutCache,
): MarkdownFootnotes {
    const hit = cache.markdownFootnotes[text];
    if (hit !== undefined) return hit;
    const footnotes: MutableMarkdownFootnotes = {
        counts: new Map(),
        definitions: new Map(),
        numbers: new Map(),
        order: [],
    };
    for (const node of tree.children)
        if (node.type === "footnoteDefinition")
            footnotes.definitions.set(node.identifier.toUpperCase(), node);
    /* Definitions are collected but skipped during the main transform. Their
       content is transformed later, in first-reference order, and can itself
       introduce another referenced definition. */
    for (const node of tree.children)
        if (node.type !== "footnoteDefinition") markdownFootnoteReferencesCollect(node, footnotes);
    for (let index = 0; index < footnotes.order.length; index += 1) {
        const definition = footnotes.definitions.get(footnotes.order[index]!);
        if (!definition) continue;
        for (const child of definition.children)
            markdownFootnoteReferencesCollect(child, footnotes);
    }
    cache.markdownFootnotes[text] = footnotes;
    return footnotes;
}
function markdownBlocksHeight(
    nodes: readonly MarkdownRootContent[],
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    gap: number,
    codeMargins: boolean,
    trailing: MarkdownTrailingInline | undefined,
    mermaidEnabled: boolean,
): number {
    const blocks = nodes
        .map((node) =>
            markdownBlockHeight(
                node,
                measure,
                cache,
                footnotes,
                codeMargins,
                trailing,
                false,
                mermaidEnabled,
            ),
        )
        .filter((block) => block !== undefined);
    let total = 0;
    let pendingMargin = 0;
    for (const [index, block] of blocks.entries()) {
        pendingMargin = Math.max(pendingMargin, index > 0 ? gap : 0, block.marginTop);
        if (block.height === 0) {
            // Empty block margins collapse through the element, rather than
            // adding another paragraph gap before the next painted block.
            pendingMargin = Math.max(pendingMargin, block.marginBottom);
            continue;
        }
        total += pendingMargin + block.height;
        pendingMargin = block.marginBottom;
    }
    return total + pendingMargin;
}
function markdownListHeight(
    list: MarkdownList,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    trailing: MarkdownTrailingInline | undefined,
    mermaidEnabled: boolean,
): number {
    const itemMeasure = measure - LIST_INDENT;
    let total = 0;
    for (const [itemIndex, item] of list.children.entries()) {
        const blocks = item.children
            .map((node, childIndex) =>
                markdownBlockHeight(
                    node,
                    itemMeasure,
                    cache,
                    footnotes,
                    false,
                    trailing,
                    childIndex === 0 && item.checked !== null,
                    mermaidEnabled,
                ),
            )
            .filter((block) => block !== undefined);
        const first = blocks[0];
        if (itemIndex > 0) total += LIST_ITEM_GAP;
        if (!first) {
            // The list marker creates a body line even before the item's
            // first text node arrives (for example a streamed "1. ").
            total += PARAGRAPH_LINE;
            continue;
        }
        let itemHeight = first.height;
        for (let index = 1; index < blocks.length; index += 1) {
            /* Tight-list paragraphs render as bare phrasing inside `<li>`, not
               as an element. Consequently `li > * + *` does not open a gap
               before the following nested list. Spread items render `<p>` and
               take the explicit child-block gap. */
            const previous = item.children[index - 1];
            const gap =
                previous?.type === "paragraph" && !list.spread && !item.spread ? 0 : LIST_ITEM_GAP;
            itemHeight += gap + blocks[index]!.height;
        }
        total += itemHeight;
    }
    return total;
}

function mermaidBlockHeight(
    source: string,
    measure: number,
    cache: MessageTextLayoutCache,
    enabled: boolean,
): number {
    const lines = Math.max(1, source.split("\n").length);
    const sourceHeight = MERMAID_DIAGRAM_BORDER + CODE_PADDING * 2 + lines * CODE_LINE;
    if (!enabled) return sourceHeight;
    let dimensions = cache.mermaidDimensions[source];
    if (dimensions === undefined) {
        try {
            dimensions = mermaidDiagramMeasure(source);
        } catch {
            dimensions = null;
        }
        cache.mermaidDimensions[source] = dimensions;
    }
    return dimensions === null ? sourceHeight : mermaidDiagramNaturalHeight(dimensions, measure);
}

/** Measures one actual remark/GFM block node with the same type ramp as its renderer. */
function markdownBlockHeight(
    node: MarkdownRootContent,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    codeMargins: boolean,
    trailing: MarkdownTrailingInline | undefined,
    task: boolean,
    mermaidEnabled: boolean,
    suffixText = "",
): Block | undefined {
    if (node.type === "paragraph") {
        const extraWidth =
            trailing !== undefined && node.position?.end.offset === trailing.endOffset
                ? trailing.extraWidth
                : 0;
        return flow(
            markdownInlineHeight(
                node.children,
                { italic: false, size: PARAGRAPH_SIZE, weight: 400 },
                PARAGRAPH_LINE,
                measure,
                cache,
                footnotes,
                extraWidth,
                task,
                suffixText,
            ),
        );
    }
    if (node.type === "heading") {
        const ramp = HEADINGS[node.depth - 1]!;
        return flow(
            markdownInlineHeight(
                node.children,
                { italic: false, size: ramp.size, weight: ramp.weight },
                ramp.line,
                measure,
                cache,
                footnotes,
            ),
        );
    }
    if (node.type === "code") {
        if (node.lang?.trim().toLowerCase() === "mermaid")
            return {
                height: mermaidBlockHeight(node.value, measure, cache, mermaidEnabled),
                marginTop: codeMargins ? CODE_GAP : 0,
                marginBottom: codeMargins ? CODE_GAP : 0,
            };
        const lines = Math.max(1, node.value.split("\n").length);
        return {
            height: CODE_PADDING * 2 + lines * CODE_LINE,
            marginTop: codeMargins ? CODE_GAP : 0,
            marginBottom: codeMargins ? CODE_GAP : 0,
        };
    }
    if (node.type === "table") {
        const columns = node.children[0]?.children.length ?? 0;
        return flow(
            node.children.reduce(
                (total, row) =>
                    total +
                    TABLE_CELL_PADDING * 2 +
                    (row.children
                        .slice(0, columns)
                        .some((cell) => markdownInlineHasLineBox(cell.children))
                        ? PARAGRAPH_LINE
                        : 0),
                0,
            ),
        );
    }
    if (node.type === "thematicBreak") return flow(RULE_HEIGHT);
    if (node.type === "blockquote")
        return flow(
            markdownBlocksHeight(
                node.children,
                measure - QUOTE_INSET,
                cache,
                footnotes,
                BLOCK_GAP,
                false,
                trailing,
                mermaidEnabled,
            ),
        );
    if (node.type === "list")
        return flow(markdownListHeight(node, measure, cache, footnotes, trailing, mermaidEnabled));
    /* Definitions and skipped HTML create no DOM box. That is distinct from
       an empty heading/paragraph: its zero-height element still participates
       in the CSS sibling-margin sequence while the next token is arriving. */
    return undefined;
}
function markdownFootnoteBackrefs(count: number): string {
    let text = "";
    for (let reference = 1; reference <= count; reference += 1)
        text += ` ↩${reference === 1 ? "" : String(reference)}`;
    return text;
}
function markdownFootnoteDefinitionHeight(
    definition: MarkdownFootnoteDefinition,
    count: number,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    mermaidEnabled: boolean,
): number {
    const itemMeasure = measure - LIST_INDENT;
    const last = definition.children.at(-1);
    const suffix = markdownFootnoteBackrefs(count);
    const suffixAttached = last?.type === "paragraph";
    const blocks = definition.children
        .map((node) =>
            markdownBlockHeight(
                node,
                itemMeasure,
                cache,
                footnotes,
                false,
                undefined,
                false,
                mermaidEnabled,
                node === last && suffixAttached ? suffix : "",
            ),
        )
        .filter((block) => block !== undefined);
    const first = blocks[0];
    let total = first?.height ?? 0;
    for (let index = 1; index < blocks.length; index += 1)
        total += LIST_ITEM_GAP + blocks[index]!.height;
    /* mdast-util-to-hast appends backreferences directly to a definition whose
       final child is not a paragraph. That anonymous inline run still paints
       one body line after the preceding block. */
    if (!suffixAttached) total += PARAGRAPH_LINE;
    return total;
}
function markdownFootnotesHeight(
    footnotes: MarkdownFootnotes,
    measure: number,
    cache: MessageTextLayoutCache,
    mermaidEnabled: boolean,
): number {
    let total = 0;
    let rendered = 0;
    for (const identifier of footnotes.order) {
        const definition = footnotes.definitions.get(identifier);
        if (!definition) continue;
        if (rendered > 0) total += LIST_ITEM_GAP;
        total += markdownFootnoteDefinitionHeight(
            definition,
            footnotes.counts.get(identifier) ?? 0,
            measure,
            cache,
            footnotes,
            mermaidEnabled,
        );
        rendered += 1;
    }
    return total;
}
/**
 * Painted height of a Markdown message body wrapped at `measure` px. Adjacent
 * block margins collapse to the larger of the two, exactly as they do in flow,
 * and only a block carrying its own margin (fenced code) contributes one at the
 * body's outer edges. An empty source string occupies one line box, matching
 * the anchor paragraph a generation keeps before text arrives. Nonempty source
 * that renders empty syntax (such as `##`) keeps its actual zero-height box.
 */
export function markdownBodyHeight(
    text: string,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
    trailingExtraWidth = 0,
    mermaidEnabled = true,
    streaming = false,
): number {
    /* A virtual row's size is authoritative even while it streams. Bound the
       lifetime of prefix layout, not its accuracy: use the same Markdown/font
       model in a scratch cache that cannot accumulate in settled history. The
       row-height cache still reuses the result for an unchanged entry/width. */
    const ready = cacheReady(streaming ? messageTextLayoutCacheCreate() : cache);
    let byMeasure = ready.markdownHeights[text];
    if (!byMeasure) {
        byMeasure = dictionaryCreate();
        ready.markdownHeights[text] = byMeasure;
    }
    const measureKey = `${String(measure)}:${String(trailingExtraWidth)}:${mermaidEnabled ? "diagram" : "source"}`;
    const cached = byMeasure[measureKey];
    if (cached !== undefined) return cached;
    const tree = messageMarkdownTree(text, ready);
    const trailing =
        trailingExtraWidth > 0
            ? { endOffset: text.trimEnd().length, extraWidth: trailingExtraWidth }
            : undefined;
    const footnotes = messageMarkdownFootnotes(text, tree, ready);
    const content = tree.children.filter((node) => node.type !== "footnoteDefinition");
    const contentHeight = markdownBlocksHeight(
        content,
        measure,
        ready,
        footnotes,
        BLOCK_GAP,
        true,
        trailing,
        mermaidEnabled,
    );
    const footnotesHeight = markdownFootnotesHeight(footnotes, measure, ready, mermaidEnabled);
    const height =
        contentHeight +
        (contentHeight > 0 && footnotesHeight > 0 ? BLOCK_GAP : 0) +
        footnotesHeight;
    const painted = text.length === 0 ? PARAGRAPH_LINE : height;
    byMeasure[measureKey] = painted;
    return painted;
}

/** Painted height of a service line's 13px copy wrapped at `measure` px. */
export function noticeTextHeight(
    text: string,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
): number {
    return runHeight(text, `${NOTICE_SIZE}px ${UI_FAMILY}`, NOTICE_LINE, measure, cache);
}
/**
 * Width of the 11px mono time that shares the own-message bubble line. It is
 * transparent until hover but always in flow, so it takes real measure away
 * from the bubble beside it.
 */
export function asideTimeWidth(time: string, cache: MessageTextLayoutCache = sharedCache): number {
    if (time.length === 0) return 0;
    const font = `11px ${MONO_FAMILY}`;
    return naturalTextWidth(time, font, cache);
}
/** Natural width of ordinary message UI text at one explicit size. */
export function uiTextNaturalWidth(
    text: string,
    size: number,
    cache: MessageTextLayoutCache = sharedCache,
    weight = 400,
): number {
    const font = `${weight === 400 ? "" : `${String(weight)} `}${String(size)}px ${UI_FAMILY}`;
    return naturalTextWidth(text, font, cache);
}
/** Natural width of one mono run at an explicit size. */
export function monoTextNaturalWidth(
    text: string,
    size: number,
    cache: MessageTextLayoutCache = sharedCache,
): number {
    return naturalTextWidth(text, `${String(size)}px ${MONO_FAMILY}`, cache);
}
function naturalTextWidth(text: string, font: string, cache: MessageTextLayoutCache): number {
    const ready = cacheReady(cache);
    let byText = ready.naturalWidths[font];
    if (!byText) {
        byText = dictionaryCreate();
        ready.naturalWidths[font] = byText;
    }
    const hit = byText[text];
    if (hit !== undefined) return hit;
    const width = measureNaturalWidth(prepareWithSegments(text, font, { whiteSpace: "normal" }));
    byText[text] = width;
    return width;
}
