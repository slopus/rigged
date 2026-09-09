import { useState } from "react";
import { Button } from "../../src/Button";
import { Composer } from "../../src/Composer";
import { ComposerModelControl, type ComposerModelChoice } from "../../src/ComposerModelControl";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-145";
const models: readonly ComposerModelChoice[] = [
    { id: "codex sol", label: "GPT-5.6 Sol", group: "Codex" },
    { id: "claude opus", label: "Opus 5", group: "Claude" },
];
const efforts: readonly ComposerModelChoice[] = [
    { id: "medium", label: "Medium" },
    { id: "high", label: "High" },
];

export function ComposerModelControlPage() {
    const [model, modelSelect] = useState("codex sol");
    const [effort, effortSelect] = useState("medium");
    const [configured, configuredSet] = useState(false);
    return (
        <ComponentPage
            number={componentNumber}
            title="Composer model control"
            summary="A compact model and effort picker. An empty catalog reports its configuration state without exposing stale defaults or empty menus."
        >
            <Specimen
                number="01"
                label="Configured"
                detail="Model and effort choices remain interactive."
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        width: 560,
                        height: 300,
                        alignItems: "flex-end",
                        justifyContent: "flex-end",
                    }}
                >
                    <ComposerModelControl
                        model={model}
                        models={models}
                        effort={effort}
                        efforts={efforts}
                        onModelChange={modelSelect}
                        onEffortChange={effortSelect}
                    />
                </div>
            </Specimen>
            <Specimen
                number="02"
                label="Models not configured"
                detail="An empty node may still report a default model and effort. Neither is presented as a usable configuration."
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: 800 }}>
                    <Composer
                        disabled
                        mentions={[]}
                        modelControl={
                            <ComposerModelControl
                                model="bedrock openai/gpt-5.6-sol"
                                models={[]}
                                effort="medium"
                                efforts={[]}
                            />
                        }
                        onAttachmentsSelect={() => undefined}
                        onSend={() => undefined}
                        onValueChange={() => undefined}
                        placeholder="Configure models to start messaging…"
                        value=""
                    />
                </div>
            </Specimen>
            <Specimen
                number="03"
                label="Catalog changes"
                detail="Adding models enables the picker. Removing all models closes it immediately."
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: 560, gap: 16 }}>
                    <Button onClick={() => configuredSet(!configured)}>
                        {configured ? "Remove configured models" : "Configure models"}
                    </Button>
                    <div
                        style={{
                            display: "flex",
                            height: 300,
                            alignItems: "flex-end",
                            justifyContent: "flex-end",
                        }}
                    >
                        <ComposerModelControl
                            model={model}
                            models={configured ? models : []}
                            effort={effort}
                            efforts={configured ? efforts : []}
                            onModelChange={modelSelect}
                            onEffortChange={effortSelect}
                        />
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
