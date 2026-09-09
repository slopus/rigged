/** Retries an authoritative surface read without touching the shared transport. */
export async function happyAgentSyncRead<T>(
    signal: AbortSignal,
    read: () => Promise<T>,
    failed: (error: unknown) => void,
): Promise<T> {
    let delay = 1_000;
    while (!signal.aborted) {
        try {
            return await read();
        } catch (error) {
            if (signal.aborted) break;
            failed(error);
            await new Promise<void>((resolve) => {
                const finish = (): void => {
                    clearTimeout(timer);
                    signal.removeEventListener("abort", finish);
                    resolve();
                };
                const timer = setTimeout(finish, delay);
                signal.addEventListener("abort", finish, { once: true });
                if (signal.aborted) finish();
            });
            delay = Math.min(delay * 2, 10_000);
        }
    }
    throw signal.reason;
}
