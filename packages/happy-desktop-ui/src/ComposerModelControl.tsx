import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";

export type ComposerModelChoice = {
    /** Optional heading this choice belongs to; consecutive choices sharing it are one group. */
    group?: string;
    id: string;
    label: string;
};
export type ComposerModelControlProps = {
    className?: string;
    "data-testid"?: string;
    disabled?: boolean;
    effort: string;
    efforts: readonly ComposerModelChoice[];
    model: string;
    models: readonly ComposerModelChoice[];
    onEffortChange?(id: string): void;
    onModelChange?(id: string): void;
    style?: CSSProperties;
};

type Panel = "effort" | "main" | "model";

/** Breathing room kept between an opened choice list and the top of the window. */
const VIEWPORT_GAP = 16;

/**
 * The choice list hangs upwards from the composer, so how tall it may grow is
 * only knowable once it is placed: measure its anchored bottom edge and let it
 * use every pixel above it except one gap, scrolling only past that.
 */
function fitToViewport(node: HTMLDivElement | null) {
    if (node === null) return;
    node.style.maxHeight = `${Math.max(96, node.getBoundingClientRect().bottom - VIEWPORT_GAP)}px`;
}

function labelFor(choices: readonly ComposerModelChoice[], value: string) {
    return choices.find((choice) => choice.id === value)?.label ?? value;
}

/**
 * C-145 ComposerModelControl — a compact, composer-only model configuration
 * pill. Its controlled model and effort props keep product policy outside this
 * visual control, while local panel state handles the transient two-level
 * popover without a global overlay.
 */
export function ComposerModelControl(props: ComposerModelControlProps) {
    const [panel, setPanel] = useState<Panel | null>(null);
    const hasModels = props.models.length > 0;
    // A removed catalog closes the picker; restoring it must not reopen an old panel.
    if (!hasModels && panel !== null) setPanel(null);
    const root = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line happy-react/no-layout-effect -- an open model panel owns document-level outside-pointer and Escape listeners that are attached after commit and completely removed when it closes
    useLayoutEffect(() => {
        if (panel === null) return;
        const outsidePointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target))
                setPanel(null);
        };
        document.addEventListener("pointerdown", outsidePointerDown, true);
        return () => document.removeEventListener("pointerdown", outsidePointerDown, true);
    }, [panel]);
    const modelLabel = hasModels ? labelFor(props.models, props.model) : "Models not configured";
    const effortLabel = labelFor(props.efforts, props.effort);
    const choicesFor = (next: "effort" | "model") =>
        next === "model" ? props.models : props.efforts;
    const valueFor = (next: "effort" | "model") => (next === "model" ? props.model : props.effort);
    const change = (next: "effort" | "model", value: string) => {
        if (next === "model") props.onModelChange?.(value);
        if (next === "effort") props.onEffortChange?.(value);
        setPanel(null);
    };
    const row = (label: string, value: string, next: "effort" | "model") => (
        <button
            className="happy-composer-model-control__row"
            data-happy-desktop-ui="composer-model-control-row"
            onClick={() => setPanel(next)}
            type="button"
        >
            <span>{label}</span>
            <span className="happy-composer-model-control__row-value">{value}</span>
            <Icon name="chevron-right" size={20} />
        </button>
    );
    const choicePanel = (next: "effort" | "model") => (
        <div
            aria-label={`Select ${next}`}
            className="happy-composer-model-control__choices"
            data-happy-desktop-ui="composer-model-control-choices"
            ref={fitToViewport}
            role="dialog"
        >
            <ScrollArea
                className="happy-composer-model-control__list"
                data-happy-desktop-ui="composer-model-control-list"
                viewportClassName="happy-composer-model-control__list-viewport"
            >
                {choicesFor(next).map((choice, index) => {
                    const group = choice.group;
                    const startsGroup =
                        group !== undefined && group !== choicesFor(next)[index - 1]?.group;
                    return (
                        <Fragment key={choice.id}>
                            {startsGroup ? (
                                <div
                                    className="happy-composer-model-control__group"
                                    data-happy-desktop-ui="composer-model-control-group"
                                >
                                    {group}
                                </div>
                            ) : null}
                            <button
                                aria-pressed={choice.id === valueFor(next)}
                                className="happy-composer-model-control__choice"
                                data-happy-desktop-ui="composer-model-control-choice"
                                onClick={() => change(next, choice.id)}
                                type="button"
                            >
                                <span>{choice.label}</span>
                                {choice.id === valueFor(next) ? (
                                    <Icon name="check" size={20} />
                                ) : null}
                            </button>
                        </Fragment>
                    );
                })}
            </ScrollArea>
        </div>
    );
    return (
        <div
            className={["happy-composer-model-control", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="composer-model-control"
            data-open={panel === null ? undefined : ""}
            data-testid={props["data-testid"]}
            onKeyDown={(event) => {
                if (event.key === "Escape") setPanel(null);
            }}
            ref={root}
            style={props.style}
        >
            <button
                aria-expanded={hasModels ? panel !== null : undefined}
                aria-haspopup={hasModels ? "dialog" : undefined}
                aria-label={
                    hasModels ? `Model: ${modelLabel}. Effort: ${effortLabel}.` : modelLabel
                }
                className="happy-composer-model-control__trigger"
                data-happy-desktop-ui="composer-model-control-trigger"
                data-empty={hasModels ? undefined : ""}
                disabled={props.disabled || !hasModels}
                onClick={() => setPanel((current) => (current === null ? "main" : null))}
                type="button"
            >
                <span className="happy-composer-model-control__summary">
                    <span>{modelLabel}</span>
                    {hasModels ? (
                        <span className="happy-composer-model-control__effort">{effortLabel}</span>
                    ) : null}
                </span>
                {hasModels ? <Icon name="chevron-down" size={20} /> : null}
            </button>
            {hasModels && panel !== null ? (
                <div
                    aria-label="Model configuration"
                    className="happy-composer-model-control__menu"
                    data-happy-desktop-ui="composer-model-control-menu"
                    role="dialog"
                >
                    {row("Model", modelLabel, "model")}
                    {row("Effort", effortLabel, "effort")}
                    {panel === "model" || panel === "effort" ? choicePanel(panel) : null}
                </div>
            ) : null}
        </div>
    );
}
