const HAPPY_MOBILE_ONBOARDING_KEY = "happy.onboarding.mobile.v1";

interface HappyMobileOnboardingDocument {
    readonly skipped: true;
    readonly version: 1;
}

function documentParse(value: unknown): HappyMobileOnboardingDocument | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const document = value as { skipped?: unknown; version?: unknown };
    return document.skipped === true && document.version === 1
        ? { skipped: true, version: 1 }
        : undefined;
}

/** Whether this app installation has permanently dismissed optional mobile pairing. */
export function desktopHappyMobileOnboardingSkipped(id = "local"): boolean {
    try {
        const value = localStorage.getItem(
            id === "local" ? HAPPY_MOBILE_ONBOARDING_KEY : `${HAPPY_MOBILE_ONBOARDING_KEY}:${id}`,
        );
        return value ? documentParse(JSON.parse(value)) !== undefined : false;
    } catch {
        return false;
    }
}

/** Records the explicit Skip decision before onboarding advances. */
export function desktopHappyMobileOnboardingSkip(id = "local"): void {
    try {
        localStorage.setItem(
            id === "local" ? HAPPY_MOBILE_ONBOARDING_KEY : `${HAPPY_MOBILE_ONBOARDING_KEY}:${id}`,
            JSON.stringify({ skipped: true, version: 1 } satisfies HappyMobileOnboardingDocument),
        );
    } catch {
        // A storage-denied renderer still honours Skip for this window through
        // the in-memory store; only a future launch can offer the step again.
    }
}
