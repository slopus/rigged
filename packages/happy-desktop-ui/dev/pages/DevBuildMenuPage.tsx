import { DevBuildMenu } from "../../src/DevBuildMenu";
import type {
    LivePerformanceSnapshot,
    LivePerformanceStore,
} from "../../src/LivePerformanceIndicator";
import { Sidebar } from "../../src/Sidebar";
import { SidebarFooter } from "../../src/SidebarFooter";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-177";

const PATH = "/Users/kirilldubovitskiy/Happy/Workspaces/happy-desktop";
const performanceStore: LivePerformanceStore = {
    get: (): LivePerformanceSnapshot => ({
        droppedFrames: 0,
        fps: 60,
        jsHeapLimitBytes: 512 * 1024 * 1024,
        jsHeapUsedBytes: 123 * 1024 * 1024,
        longestFrameMs: 17,
        paused: false,
    }),
    subscribe: () => () => {},
};

export function DevBuildMenuPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Development-only branch identity in the sidebar footer. The quiet Blueprint glyph and truncated branch name open an upward menu with the component workbench and checkout actions."
            title="Development build menu"
        >
            <Specimen
                detail="28px footer trigger · Blueprint glyph · branch name truncates · development panel carries a compact renderer readout"
                label="Sidebar footer"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ border: "1px solid var(--divider)", width: "280px" }}>
                        <Sidebar
                            activeItemId=""
                            footer={
                                <SidebarFooter
                                    appearance="light"
                                    devMenu={
                                        <DevBuildMenu
                                            branch="feature/connection-indicator-styling"
                                            onBlueprintOpen={() => {}}
                                            onCopyPath={() => {}}
                                            performance={performanceStore}
                                            path={PATH}
                                        />
                                    }
                                    onAppearanceToggle={() => {}}
                                    onSettingsOpen={() => {}}
                                />
                            }
                            onItemSelect={() => {}}
                            sections={[]}
                            title="Happy"
                        />
                    </div>
                    <DimensionRule label="sidebar footer · trigger 28 px · popup opens above the footer" />
                </div>
            </Specimen>

            <Specimen
                detail="The label uses the actual branch rather than the worktree directory name; a detached HEAD falls back to the supplied worktree label."
                label="Branch identity"
                number="02"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        width: "300px",
                    }}
                >
                    <DevBuildMenu branch="main" label="dev" path={PATH} />
                    <DevBuildMenu
                        branch="feature/this-is-a-deliberately-long-branch-name"
                        label="workspace-23"
                        path={PATH}
                    />
                    <DevBuildMenu branch="HEAD" label="workspace-23" path={PATH} />
                    <DimensionRule label="branch name · fallback label only for detached HEAD" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
