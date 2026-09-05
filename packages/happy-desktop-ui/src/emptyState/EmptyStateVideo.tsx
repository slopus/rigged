import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { reducedMotionGet, reducedMotionSubscribe } from "../lottie/dotLottieRuntime";

/** A silent, rounded illustration with the same play-once/replay behavior as Lottie scenes. */
export function EmptyStateVideo(props: {
    src: string;
    poster: string;
    preview: string;
    size: number;
    play: "on-appear" | "on-demand";
}) {
    const video = useRef<HTMLVideoElement>(null);
    const replay = useRef<() => void>(() => {});
    const [ready, setReady] = useState(false);
    const [posterReady, setPosterReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const reducedMotion = useSyncExternalStore(
        reducedMotionSubscribe,
        reducedMotionGet,
        () => true,
    );

    // eslint-disable-next-line happy-react/no-layout-effect -- The video player, intersection observer, and document visibility listener share one imperative lifetime with complete cleanup.
    useLayoutEffect(() => {
        const element = video.current;
        if (!element || reducedMotion || failed) return;
        const document = element.ownerDocument;
        const view = document.defaultView;
        if (!view) return;
        let visible = false;
        let owed = props.play === "on-appear";
        let disposed = false;

        const settle = () => {
            const playing = owed && visible && !document.hidden;
            element.dataset.state = owed ? (playing ? "playing" : "waiting") : "rested";
            if (playing) {
                void element.play().catch((error: unknown) => {
                    if (error instanceof DOMException && error.name === "AbortError") return;
                    // Autoplay can be refused; a deliberate replay remains available.
                    if (!disposed && visible && !document.hidden) {
                        owed = false;
                        element.dataset.state = "rested";
                    }
                });
            } else {
                element.pause();
            }
        };
        const ended = () => {
            owed = false;
            settle();
        };
        replay.current = () => {
            if (owed) return;
            element.currentTime = 0;
            owed = true;
            settle();
        };
        const observer = new view.IntersectionObserver((entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
            settle();
        });
        observer.observe(element);
        document.addEventListener("visibilitychange", settle);
        element.addEventListener("ended", ended);
        return () => {
            disposed = true;
            replay.current = () => {};
            observer.disconnect();
            document.removeEventListener("visibilitychange", settle);
            element.removeEventListener("ended", ended);
            element.pause();
        };
    }, [props.play, props.src, reducedMotion, failed]);

    return (
        <button
            aria-label="Play the illustration again"
            className="happy-empty-state-video"
            data-happy-desktop-ui="empty-state-video"
            data-motion={reducedMotion ? "reduced" : "full"}
            data-playing-image={
                ready && !failed && !reducedMotion ? "video" : posterReady ? "poster" : "thumbhash"
            }
            data-poster-ready={posterReady ? "true" : "false"}
            disabled={reducedMotion || failed}
            onClick={() => replay.current()}
            onPointerEnter={() => replay.current()}
            style={{
                width: props.size,
                height: props.size,
                backgroundImage: `url(${props.preview})`,
            }}
            type="button"
        >
            <img
                alt=""
                className="happy-empty-state-video__poster"
                onError={() => setPosterReady(false)}
                onLoad={() => setPosterReady(true)}
                src={props.poster}
            />
            <video
                aria-hidden="true"
                className="happy-empty-state-video__clip"
                disablePictureInPicture
                loop={false}
                muted
                onCanPlay={() => setReady(true)}
                onError={() => setFailed(true)}
                playsInline
                poster={props.poster}
                preload="none"
                ref={video}
                src={reducedMotion || failed ? undefined : props.src}
                tabIndex={-1}
            />
        </button>
    );
}
