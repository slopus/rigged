import { useState } from "react";
import { ConnectionSurface } from "../../src/ConnectionSurface";
import { ComponentPage, Specimen } from "../kit";
export const componentNumber = "C-281";
export function ConnectionSurfacePage() {
    const [active, select] = useState(true);
    return (
        <ComponentPage
            number={componentNumber}
            title="Connection surface"
            summary="Retains an inactive connection's DOM and local state while suspending its global event listeners."
        >
            <Specimen
                number="01"
                label="Retained draft"
                detail="Hide and show: the input keeps its value."
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        width: 900,
                        height: 400,
                        gap: 16,
                    }}
                >
                    <button type="button" onClick={() => select(!active)}>
                        Toggle connection
                    </button>
                    <ConnectionSurface active={active}>
                        <input aria-label="Retained draft" defaultValue="Draft" />
                    </ConnectionSurface>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
