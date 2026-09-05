import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { LottieScene, type LottieSceneName, type LottieScenePlay } from "./LottieScene";
import { EmptyStateVideo } from "./emptyState/EmptyStateVideo";
import chiefOfStaffVideo from "./assets/animations/chief-of-staff.mp4?url";
import chiefOfStaffPoster from "./assets/animations/chief-of-staff.png?url";
import { thumbHashToDataURL } from "thumbhash";

// Generated from the bundled chief-of-staff.png poster at 100 × 100 RGBA.
const chiefOfStaffPreview = thumbHashToDataURL(
    new Uint8Array([
        28, 8, 6, 95, 16, 85, 106, 230, 144, 72, 166, 86, 152, 217, 138, 22, 104, 102, 134, 48, 40,
        9, 131, 2,
    ]),
);
export type EmptyStateSize = "panel" | "inline";
export type EmptyStateAction = {
    label: string;
    icon?: IconName;
    onClick: () => void;
};
export type EmptyStateProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    icon: IconName;
    title: string;
    description?: string;
    action?: EmptyStateAction;
    size?: EmptyStateSize;
    /** Larger, higher-contrast copy for an introduction that deserves attention. */
    emphasis?: "standard" | "prominent";
    /**
     * Replaces the icon medallion with a large animated scene: its own
     * transparent region above the words, with no card, medallion, or fill
     * behind it. Reserved for states a reader actually sits in — a screen
     * waiting to be started, something being read, a settled absence — and
     * chosen for what it says, not for decoration. See `LottieScene` for what
     * each name means.
     *
     * The Chief of Staff scene uses a rounded silent MP4 with a still poster.
     * Other scenes use Lottie. The glyph stays required and is drawn until Lottie
     * paints: it is what the reader sees while the runtime loads, and what they
     * keep if it cannot load at all.
     */
    animation?: LottieSceneName | "chief-of-staff";
    /**
     * When the animated scene takes its one play. Defaults to `on-appear`.
     * Fixtures that must photograph identically every time pass `on-demand`,
     * which holds a still frame from the start (the poster for MP4 scenes).
     */
    animationPlay?: LottieScenePlay;
};
/* Icon size for the medallion, per empty-state size. Both land the glyph box on
 * an integer inset inside the medallion (48→14, 40→11) so the composed icon
 * stays optically centered without a bespoke nudge. */
const mediaIconSize: Record<EmptyStateSize, 18 | 20> = { panel: 20, inline: 18 };
/* The scene's own region, on the 16px layout rhythm: 128 under a panel, 96 in
 * the tighter inline block. Large enough that the artwork is the first thing
 * read, small enough that a panel with a description and an action still fits
 * the 720x480 Electron minimum without clipping. */
const sceneSize: Record<EmptyStateSize, 96 | 128> = { panel: 128, inline: 96 };
/* The glyph held inside a scene region until the artwork paints is the same
 * glyph at the same size as the medallion's — it is a placeholder, not a second
 * illustration, and growing it to fill a 128px box would only make the swap
 * louder. */
const actionSize: Record<EmptyStateSize, "small" | "medium"> = { panel: "medium", inline: "small" };
/**
 * C-024 EmptyState — centered icon medallion (or animated scene) + title +
 * optional description + optional action. Replaces the app's raw
 * `.feature-empty` markup. Props-only, desktop-only; the `panel` size fills and
 * vertically centers inside its host region, `inline` is a compact
 * content-sized block.
 */
export function EmptyState(props: EmptyStateProps) {
    const [local] = partitionComponentProps(props, [
        "action",
        "animation",
        "animationPlay",
        "className",
        "data-testid",
        "description",
        "emphasis",
        "icon",
        "size",
        "style",
        "title",
    ]);
    const size = () => local.size ?? "panel";
    return (
        <div
            className={["happy-empty-state", local.className].filter(Boolean).join(" ")}
            data-animated={local.animation === undefined ? undefined : ""}
            data-emphasis={local.emphasis}
            data-happy-desktop-ui="empty-state"
            data-size={size()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            {local.animation === "chief-of-staff" ? (
                <EmptyStateVideo
                    play={local.animationPlay ?? "on-appear"}
                    poster={chiefOfStaffPoster}
                    preview={chiefOfStaffPreview}
                    size={sceneSize[size()]}
                    src={chiefOfStaffVideo}
                />
            ) : local.animation === undefined ? (
                <span
                    className="happy-empty-state__media"
                    data-happy-desktop-ui="empty-state-media"
                >
                    <Icon name={local.icon} size={mediaIconSize[size()]} />
                </span>
            ) : (
                <span
                    className="happy-empty-state__scene"
                    data-happy-desktop-ui="empty-state-scene"
                >
                    <Icon name={local.icon} size={mediaIconSize[size()]} />
                    <LottieScene
                        className="happy-empty-state__art"
                        name={local.animation}
                        {...(local.animationPlay ? { play: local.animationPlay } : {})}
                        replayLabel="Play the illustration again"
                        size={sceneSize[size()]}
                    />
                </span>
            )}
            <h2 className="happy-empty-state__title" data-happy-desktop-ui="empty-state-title">
                {local.title}
            </h2>
            {local.description ? (
                <p
                    className="happy-empty-state__description"
                    data-happy-desktop-ui="empty-state-description"
                >
                    {local.description}
                </p>
            ) : null}
            {local.action
                ? ((action) => (
                      <span
                          className="happy-empty-state__actions"
                          data-happy-desktop-ui="empty-state-actions"
                      >
                          <Button
                              icon={action.icon}
                              onClick={action.onClick}
                              size={actionSize[size()]}
                              variant="secondary"
                          >
                              {action.label}
                          </Button>
                      </span>
                  ))(local.action)
                : null}
        </div>
    );
}
