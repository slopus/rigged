import { useSyncExternalStore, type ReactNode } from "react";
import type {
    AppearanceStore,
    HappyAgentOnboardingStore,
    HappyAgentProfileStore,
    WelcomeStore,
} from "happy-desktop-state";
import { LocalOnboardingScreen, WelcomeScreen, type LocalOnboardingView } from "happy-desktop-ui";
import { happyAgentWelcomeSlides } from "../onboarding/happyAgentWelcomeSlides";

export function HappyAgentOnboardingBoundary(props: {
    readonly store: HappyAgentOnboardingStore;
    readonly welcome: WelcomeStore;
    readonly appearance: AppearanceStore;
    readonly profile: HappyAgentProfileStore;
    readonly online: boolean;
    readonly onRetry: () => void;
    readonly children: ReactNode;
}) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const welcome = useSyncExternalStore(
        props.welcome.subscribe,
        props.welcome.get,
        props.welcome.get,
    );
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    const profile = useSyncExternalStore(
        props.profile.subscribe,
        props.profile.get,
        props.profile.get,
    );
    const mobile = useSyncExternalStore(
        props.store.mobile.subscribe,
        props.store.mobile.get,
        props.store.mobile.get,
    );
    if (snapshot.state?.completed) return props.children;
    if (snapshot.state && !welcome.welcomeAcknowledged)
        return (
            <WelcomeScreen
                appearance={appearance.mode}
                backdrop={{ kind: "sky" }}
                onAction={() => {
                    props.welcome.welcomeAcknowledge();
                    props.store.onboardingBegin();
                }}
                onAppearanceChange={props.appearance.appearanceSelect}
                slides={happyAgentWelcomeSlides}
            />
        );
    const view = ((): LocalOnboardingView => {
        if (!snapshot.state)
            return { kind: "checking", ...(snapshot.error ? { message: snapshot.error } : {}) };
        if (!snapshot.state.steps.profile.done)
            return {
                kind: "profile-required",
                busy: profile.saving || !props.online,
                name: profile.name,
                email: profile.email,
                ...(profile.saveError || snapshot.error
                    ? { message: profile.saveError ?? snapshot.error }
                    : {}),
            };
        switch (mobile.status) {
            case "checking":
                return { kind: "happy-mobile-checking" };
            case "offer":
                return {
                    kind: "happy-mobile-offer",
                    busy: mobile.pending || !props.online,
                    ...(mobile.message ? { message: mobile.message } : {}),
                };
            case "pairing":
                return {
                    kind: "happy-mobile-pairing",
                    data: mobile.data,
                    expiresAt: mobile.expiresAt,
                };
            case "failed":
                return {
                    kind: "happy-mobile-failed",
                    busy: mobile.pending || !props.online,
                    message: mobile.message,
                };
            case "configured":
            case "disabled":
            case "skipped":
                return { kind: "checking", message: snapshot.error ?? "Finishing setup…" };
        }
    })();
    return (
        <LocalOnboardingScreen
            appearance={appearance.mode}
            view={view}
            onAssistantsContinue={() => undefined}
            onConnectRetry={props.onRetry}
            onHappyMobileConnect={props.store.mobile.happyMobileConnect}
            onHappyMobileSkip={props.store.mobile.happyMobileSkip}
            onProfileNameChange={props.profile.displayNameUpdate}
            onProfileEmailChange={props.profile.emailUpdate}
            onProfileCreate={() => {
                if (props.online && profile.name.trim() && profile.email.trim())
                    void props.profile.profileSave().catch(() => undefined);
            }}
            onProjectChoose={() => undefined}
        />
    );
}
