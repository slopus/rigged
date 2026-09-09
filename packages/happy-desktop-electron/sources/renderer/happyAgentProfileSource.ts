import {
    type HappyAgentClient,
    type HappyAgentProfile,
    type HappyAgentProfileActions,
    type HappyAgentProfileSource,
    type HappyAgentSync,
    happyAgentSyncRead,
    type happyAgentProtocol,
    UserError,
} from "happy-desktop-state";

const RETRY_MS = 1_000;

export interface HappyAgentProfileAdapter {
    readonly actions: HappyAgentProfileActions;
    readonly source: HappyAgentProfileSource;
}

/**
 * Adapts the daemon's installation profile to the profile surface. One
 * bootstrap establishes the authoritative value, then the daemon's complete
 * `profile.updated` replacements keep it current.
 */
export function happyAgentProfileSourceCreate(
    client: HappyAgentClient,
    sync: HappyAgentSync,
): HappyAgentProfileAdapter {
    const subscribers = new Map<
        (profile: HappyAgentProfile | undefined) => void,
        (error: unknown) => void
    >();
    let active: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let latest: happyAgentProtocol.Profile | undefined;
    let initialized = false;

    const profileProject = (profile: happyAgentProtocol.Profile): HappyAgentProfile | undefined => {
        if (profile.email === null && profile.name === null) return undefined;
        return {
            email: profile.email ?? "",
            name: profile.name ?? "",
            updatedAt: profile.updatedAt,
        };
    };

    const profileAdopt = (profile: happyAgentProtocol.Profile, force = false): void => {
        if (initialized && !force && profile.updatedAt < (latest?.updatedAt ?? 0)) return;
        latest = profile;
        initialized = true;
        // Re-deliver an unchanged successful value so a surface can clear its
        // previous read error without losing edits or replacing its snapshot.
        const projected = profileProject(profile);
        for (const listener of subscribers.keys()) listener(projected);
    };

    const follow = async (controller: AbortController): Promise<void> => {
        let failed = false;
        const profileRead = () =>
            happyAgentSyncRead(
                controller.signal,
                () => client.getProfile({ signal: controller.signal }),
                (error) => {
                    failed = true;
                    for (const onError of subscribers.values()) onError(error);
                },
            );
        for await (const input of sync.follow({
            signal: controller.signal,
            events: ["profile.updated"],
        })) {
            try {
                if (input.kind === "error") throw input.error;
                if (input.kind === "bootstrap") {
                    profileAdopt(input.bootstrap.profile, true);
                    failed = false;
                    continue;
                }
                if (input.kind === "reconcile" || (input.update.kind === "connected" && failed)) {
                    const response = await profileRead();
                    if (controller.signal.aborted) return;
                    profileAdopt(response.profile);
                    failed = false;
                    continue;
                }
                const update = input.update;
                if (update.kind === "event" && update.event.type === "profile.updated") {
                    const profile = update.event.payload.profile;
                    if (profile) profileAdopt(profile);
                    else {
                        const response = await profileRead();
                        if (controller.signal.aborted) return;
                        profileAdopt(response.profile);
                    }
                    failed = false;
                }
            } catch (error) {
                if (controller.signal.aborted) return;
                failed = true;
                for (const onError of subscribers.values()) onError(error);
            }
        }
    };

    const sourceStart = (): void => {
        if (active || subscribers.size === 0) return;
        const controller = new AbortController();
        active = controller;
        void follow(controller)
            .catch((error: unknown) => {
                if (controller.signal.aborted) return;
                for (const onError of subscribers.values()) onError(error);
            })
            .finally(() => {
                if (active === controller) active = undefined;
                if (!controller.signal.aborted && subscribers.size > 0)
                    retry = setTimeout(() => {
                        retry = undefined;
                        sourceStart();
                    }, RETRY_MS);
            });
    };

    return {
        actions: {
            async profileSave(input) {
                const current = latest ?? (await client.getProfile()).profile;
                const updated = await client.updateProfile(
                    {
                        email: input.email,
                        mutationId: crypto.randomUUID(),
                        name: input.name,
                    },
                    { ifMatch: current.version },
                );
                profileAdopt(updated.profile);
                const projected = profileProject(updated.profile);
                if (projected === undefined)
                    throw new UserError(
                        "Happy Agent saved an empty profile. Add a name and email, then try again.",
                    );
                return projected;
            },
        },
        source: {
            subscribe(listener, onError) {
                subscribers.set(listener, onError);
                if (initialized && latest) listener(profileProject(latest));
                sourceStart();
                let closed = false;
                return () => {
                    if (closed) return;
                    closed = true;
                    subscribers.delete(listener);
                    if (subscribers.size > 0) return;
                    active?.abort();
                    active = undefined;
                    if (retry) clearTimeout(retry);
                    retry = undefined;
                };
            },
        },
    };
}
