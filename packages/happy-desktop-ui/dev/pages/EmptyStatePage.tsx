import { type ComposerSnapshot } from "happy-desktop-state";
import { ConversationView } from "../../src/ConversationView";
import { EmptyState } from "../../src/EmptyState";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-024";

const noop = () => {};

const composer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "chief-of-staff",
    submission: { status: "idle" },
    text: "",
};

const panelStage: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    width: "440px",
};

export function EmptyStatePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Centered icon medallion + title + description + action. Panel fills and vertically centers its host region; inline is a compact content-sized block. Replaces the app's raw .feature-empty."
            title="Empty state"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="panel · 48px medallion · title 15/20 · description 13/18 · medium action"
                    label="Panel — full"
                    number="E-01"
                    stage="app"
                >
                    <div style={panelStage}>
                        <div style={{ width: "440px", height: "320px" }}>
                            <EmptyState
                                action={{
                                    icon: "edit",
                                    label: "Start a conversation",
                                    onClick: noop,
                                }}
                                description="Messages you send and receive will show up here."
                                icon="inbox"
                                size="panel"
                                title="No messages yet"
                            />
                        </div>
                        <DimensionRule label="440 × 320 host · content vertically centered" />
                    </div>
                </Specimen>

                <Specimen
                    detail="panel · icon + title only (no description, no action)"
                    label="Panel — minimal"
                    number="E-02"
                    stage="app"
                >
                    <div style={panelStage}>
                        <div style={{ width: "440px", height: "320px" }}>
                            <EmptyState icon="search" size="panel" title="No results found" />
                        </div>
                        <DimensionRule label="medallion 48 · title only" />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="inline · 40px medallion · title 14/18 · small action"
                    label="Inline — full"
                    number="E-03"
                    stage="surface"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <EmptyState
                            action={{ icon: "plus", label: "New subchannel", onClick: noop }}
                            description="Create a subchannel to keep focused work here."
                            icon="branch"
                            size="inline"
                            title="No subchannels"
                        />
                        <DimensionRule label="content-sized · 24px padding" />
                    </div>
                </Specimen>

                <Specimen
                    detail="inline · description, no action"
                    label="Inline — no action"
                    number="E-04"
                    stage="surface"
                >
                    <EmptyState
                        description="Files shared in this channel will appear here."
                        icon="files"
                        size="inline"
                        title="No files shared"
                    />
                </Specimen>
            </div>
            <Specimen
                detail="128px silent MP4 · plays once · thumbhash preview · 14px rounded border · title 24/32"
                label="Chief of Staff conversation"
                number="E-05"
                stage="surface"
            >
                <div style={{ display: "flex", width: "560px", height: "480px" }}>
                    <ConversationView
                        composer={composer}
                        composerPlaceholder="Message Chief of Staff…"
                        emptyContent={
                            <EmptyState
                                animation="chief-of-staff"
                                animationPlay="on-demand"
                                description="This bot has elevated permissions to configure Happy around your needs. Tell it how you want Happy to work for you."
                                emphasis="prominent"
                                icon="shield"
                                size="panel"
                                title="Your Chief of Staff"
                            />
                        }
                        entries={[]}
                        onComposerSend={noop}
                        onComposerValueChange={noop}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
