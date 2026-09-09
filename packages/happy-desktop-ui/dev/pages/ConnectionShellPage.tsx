import { useState } from "react";
import { ConnectionShell, type ConnectionShellItem } from "../../src/ConnectionShell";
import { ConnectionSurface } from "../../src/ConnectionSurface";
import { LocalOnboardingScreen } from "../../src/LocalOnboardingScreen";
import { SplashScreen } from "../../src/SplashScreen";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-280";
const items: readonly ConnectionShellItem[] = [
    { id: "local", label: "This Mac", local: true, status: "connected" },
    { id: "work", label: "Work", local: false, status: "connected" },
    { id: "offline", label: "Offline server", local: false, status: "disconnected" },
    { id: "starting", label: "Starting", local: false, status: "connecting" },
    { id: "failed", label: "Unavailable", local: false, status: "error" },
];
export function ConnectionShellPage() {
    const [selected, select] = useState("local");
    const [connectingSelected, connectingSelect] = useState("starting");
    return (
        <ComponentPage
            number={componentNumber}
            title="Connections"
            summary="A 64px connection rail outside each independent workspace. Hidden for a single connection; offline machines remain selectable."
        >
            <Specimen
                number="01"
                label="Multiple connections"
                detail="Switch without losing each connection's draft."
                stage="surface"
            >
                <div style={{ display: "flex", width: 900, height: 600 }}>
                    <ConnectionShell items={items} selectedId={selected} onSelect={select}>
                        {items.map((item) => (
                            <ConnectionSurface key={item.id} active={item.id === selected}>
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 16,
                                        padding: 32,
                                    }}
                                >
                                    <h2>{item.label}</h2>
                                    <label>
                                        Local draft{" "}
                                        <input
                                            aria-label={`${item.label} draft`}
                                            defaultValue="Keep this draft when switching"
                                        />
                                    </label>
                                </div>
                            </ConnectionSurface>
                        ))}
                    </ConnectionShell>
                </div>
            </Specimen>
            <Specimen
                number="02"
                label="Single connection"
                detail="No rail and no reserved width."
                stage="surface"
            >
                <div style={{ display: "flex", width: 900, height: 300 }}>
                    <ConnectionShell
                        items={items.slice(0, 1)}
                        selectedId="local"
                        onSelect={() => undefined}
                    >
                        <ConnectionSurface active>
                            <p>One full-width workspace.</p>
                        </ConnectionSurface>
                    </ConnectionShell>
                </div>
            </Specimen>
            <Specimen
                number="03"
                label="Roster unavailable"
                detail="Retains the last known list."
                stage="surface"
            >
                <div style={{ display: "flex", width: 900, height: 400 }}>
                    <ConnectionShell
                        items={items}
                        selectedId="local"
                        onSelect={() => undefined}
                        error="Offline"
                    >
                        <ConnectionSurface active>
                            <p>Cached workspace remains available.</p>
                        </ConnectionSurface>
                    </ConnectionShell>
                </div>
            </Specimen>
            <Specimen
                number="04"
                label="Existing onboarding"
                detail="The app's original profile screen, contained beside the rail."
                stage="surface"
            >
                <div style={{ display: "flex", width: 1000, height: 700 }}>
                    <ConnectionShell
                        items={items.slice(0, 2)}
                        selectedId="work"
                        onSelect={() => undefined}
                    >
                        <ConnectionSurface active>
                            <LocalOnboardingScreen
                                appearance="light"
                                view={{
                                    kind: "profile-required",
                                    name: "",
                                    email: "",
                                    busy: false,
                                }}
                                onAssistantsContinue={() => undefined}
                                onConnectRetry={() => undefined}
                                onHappyMobileConnect={() => undefined}
                                onHappyMobileSkip={() => undefined}
                                onProjectChoose={() => undefined}
                                onProfileNameChange={() => undefined}
                                onProfileEmailChange={() => undefined}
                                onProfileCreate={() => undefined}
                            />
                        </ConnectionSurface>
                    </ConnectionShell>
                </div>
            </Specimen>
            <Specimen
                number="05"
                label="Initial connection"
                detail="The existing splash stays beside the rail. Switch to This Mac while the remote connects."
                stage="surface"
            >
                <div style={{ display: "flex", width: 900, height: 600 }}>
                    <ConnectionShell
                        items={items.filter(
                            (item) => item.id === "local" || item.id === "starting",
                        )}
                        selectedId={connectingSelected}
                        onSelect={connectingSelect}
                    >
                        <ConnectionSurface active={connectingSelected === "local"}>
                            <p>This Mac remains available while the remote connects.</p>
                        </ConnectionSurface>
                        <ConnectionSurface active={connectingSelected === "starting"}>
                            <SplashScreen note="Connecting to Starting…" />
                        </ConnectionSurface>
                    </ConnectionShell>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
