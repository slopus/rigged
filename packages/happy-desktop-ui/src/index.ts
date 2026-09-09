import "./styles.css";

export { happyLogoBlackUrl, happyLogoWhiteUrl } from "./assets";
export { ChangedFileDiff, type ChangedFileDiffProps } from "./ChangedFileDiff";
export { CompactActivityRow, type CompactActivityRowProps } from "./CompactActivityRow";
export { compactCount } from "./countText";
export { CodeBlock, codeBlockLanguage, type CodeBlockProps } from "./CodeBlock";
export { CodeEditor, type CodeEditorProps } from "./CodeEditor";
export {
    ScrollArea,
    ScrollbarTrack,
    ScrollbarTracks,
    scrollbarControllerCreate,
    type ScrollAreaProps,
    type ScrollbarAxes,
    type ScrollbarAxis,
    type ScrollbarController,
    type ScrollbarPlacement,
} from "./Scrollbar";
export { CodeHighlightWorkers } from "./CodeHighlightWorkers";
export { SplashScreen, type SplashScreenProps } from "./SplashScreen";
export { SplashCover, type SplashCoverProps } from "./SplashCover";
export {
    NightSkyShader,
    type NightSkyShaderMotion,
    type NightSkyShaderProps,
} from "./NightSkyShader";
export { SplitColumn, type SplitColumnProps } from "./SplitColumn";
export {
    AGENT_WORKING_STATUS_ROW_HEIGHT,
    AgentWorkingStatus,
    type AgentWaitStatus,
    type AgentWorkingPhase,
    type AgentWorkingStatusProps,
} from "./AgentWorkingStatus";
export { TurnSummary, type TurnSummaryProps } from "./TurnSummary";
export { Tooltip, type TooltipPlacement, type TooltipProps } from "./Tooltip";
export { CopyButton, type CopyButtonProps } from "./CopyButton";
export { ScrollingText, type ScrollingTextProps } from "./ScrollingText";
export { TypedText, type TypedTextProps } from "./TypedText";
export {
    ConversationComputeEvent,
    type ConversationComputeEventProps,
} from "./ConversationComputeEvent";
export { ConversationErrorCard, type ConversationErrorCardProps } from "./ConversationErrorCard";
export { AgentDesk, type AgentDeskProps, type DeskListItem, type DeskRun } from "./AgentDesk";
export {
    AgentTracePanel,
    type AgentTracePanelEntry,
    type AgentTracePanelProps,
    type AgentTracePanelStatus,
} from "./AgentTracePanel";
export {
    AgentTraceRow,
    type AgentTraceRowKind,
    type AgentTraceRowProps,
    type AgentTraceRowStatus,
} from "./AgentTraceRow";
export {
    AgentRunCard,
    type AgentRun,
    type AgentRunAction,
    type AgentRunCardProps,
    type AgentRunStatus,
    type AgentRunStep,
} from "./AgentRunCard";
export {
    ApprovalCard,
    type ApprovalCardProps,
    type ApprovalRequest,
    type ApprovalResolution,
} from "./ApprovalCard";
export {
    AppShell,
    APP_SHELL_PANEL_DEFAULT_WIDTH,
    type AppShellFocusedPane,
    type AppShellProps,
} from "./AppShell";
export {
    Avatar,
    type AvatarProps,
    type AvatarSize,
    type AvatarType,
    type ToneName,
} from "./Avatar";
export { AvatarBrutalist, type AvatarBrutalistProps } from "./AvatarBrutalist";
export { AutomatedTag, type AutomatedTagProps } from "./AutomatedTag";
export {
    Badge,
    type BadgeProps,
    type BadgeVariant,
    CountBadge,
    type CountBadgeProps,
    KeyCap,
    type KeyCapProps,
    ReactionChip,
    type ReactionChipProps,
} from "./Badge";
export { Box, type BoxProps } from "./Box";
export { DevBuildMenu, type DevBuildMenuProps } from "./DevBuildMenu";
export {
    LivePerformanceIndicator,
    type LivePerformanceSnapshot,
    type LivePerformanceStore,
} from "./LivePerformanceIndicator";
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./Button";
export { QRCode, type QRCodeProps } from "./QRCode";
export { ChannelHeader, type ChannelHeaderProps, type ChannelMember } from "./ChannelHeader";
export { PanelHeader, type PanelHeaderProps } from "./PanelHeader";
export { AudienceToggle, type AudienceToggleProps, type AudienceValue } from "./AudienceToggle";
export {
    Composer,
    type ComposerProps,
    ContextChips,
    type ContextChipsProps,
    type ContextItem,
    type ContextKind,
    type Mentionable,
    MentionPicker,
    type MentionPickerProps,
} from "./Composer";
export {
    type ComposerAttachmentPreview,
    type ComposerAttachmentPreviewKind,
    ComposerAttachmentPreviews,
    type ComposerAttachmentPreviewsProps,
} from "./ComposerAttachmentPreviews";
export {
    ComposerModelControl,
    type ComposerModelChoice,
    type ComposerModelControlProps,
} from "./ComposerModelControl";
export { happyAgentComposerModelControlProps } from "./happyAgentComposerModelControl";
export {
    DiffSnippet,
    type DiffLine,
    type DiffLineKind,
    type DiffSnippetProps,
} from "./DiffSnippet";
export { ToolCallPreview, type ToolCallPreviewProps } from "./ToolCallPreview";
export type { Dimension } from "./dimensions";
export { EventCard, type EventCardProps } from "./EventCard";
export { Fade, type FadeProps } from "./Fade";
export {
    FileTree,
    FileTreeFamilyIcon,
    fileTreeFamily,
    type FileTreeFamily,
    type FileTreeGitStatus,
    type FileTreeNode,
    type FileTreeProps,
    type FileTreeSelectModifiers,
} from "./FileTree";
export { FilePanel, type FilePanelProps } from "./FilePanel";
export {
    FileBrowser,
    type FileBrowserLayout,
    type FileBrowserProps,
    type FileBrowserScope,
} from "./FileBrowser";
export { FilePathLabel, type FilePathLabelProps } from "./FilePathLabel";
export {
    FilePreview,
    filePreviewKind,
    type FilePreviewContent,
    type FilePreviewKind,
    type FilePreviewProps,
} from "./FilePreview";
export { ImageViewer, type ImageViewerContent, type ImageViewerProps } from "./ImageViewer";
export { VideoViewer, type VideoViewerContent, type VideoViewerProps } from "./VideoViewer";
export { FileEditor, type FileEditorProps } from "./FileEditor";
export {
    commandShortcut,
    commandShortcutMatches,
    windowShortcutBlocked,
    type CommandShortcut,
    type KeyboardShortcut,
} from "./keyboardShortcut";
export { WindowShortcuts, type WindowShortcutAction } from "./WindowShortcuts";
export type { HtmlPreviewFailure, HtmlPreviewProps, HtmlPreviewRenderer } from "./htmlPreview";
export type { MediaWindowOpener, MediaWindowRequest } from "./mediaWindow";
export { HtmlPreviewFrame, type HtmlPreviewFrameProps } from "./HtmlPreviewFrame";
export { HtmlPreviewError, type HtmlPreviewErrorProps } from "./HtmlPreviewError";
export {
    MarkdownDocument,
    markdownDocumentLinkPath,
    type MarkdownDocumentProps,
} from "./MarkdownDocument";
export { MermaidDiagram, type MermaidDiagramProps } from "./MermaidDiagram";
export { Icon, type IconName, iconNames, type IconProps } from "./Icon";
export {
    Ionicon,
    type IoniconName,
    type IoniconProps,
    ioniconNames,
    Octicon,
    type OcticonName,
    type OcticonProps,
    octiconNames,
} from "./vectorIcons/VectorIcon";
export {
    DayDivider,
    Message,
    MessageList,
    type MessageDeliveryState,
    type MessageImage,
    type MessageListProps,
    type MessageListScrollPosition,
    type MessageProps,
    type MessageReaction,
    type MessageSegment,
    SteeringNotice,
    SystemNotice,
    type SystemNoticeSegment,
} from "./Message";
export { type MessageGenerationStatus } from "./MessageMarkdown";
export { Lightbox, type LightboxProps } from "./Lightbox";
export { Rail, type RailItem, type RailProps } from "./Rail";
export {
    ThemeScope,
    type ScrollbarVisibility,
    type ThemeMode,
    type ThemeScopeProps,
} from "./ThemeScope";
export { haptic, type HapticSignal } from "./haptics";
export {
    Sidebar,
    sidebarReorderMove,
    type SidebarItem,
    type SidebarItemAction,
    type SidebarNumberShortcutTarget,
    type SidebarProps,
    type SidebarReorder,
    type SidebarSection,
} from "./Sidebar";
export { SidebarFooter, type SidebarFooterProps } from "./SidebarFooter";
export {
    SIDEBAR_SPACES_BAR_HEIGHT,
    SIDEBAR_SPACES_DOT_SIZE,
    SidebarSpaces,
    type SidebarSpace,
    type SidebarSpacesProps,
} from "./SidebarSpaces";
export { SidebarUpdateAction, type SidebarUpdateActionProps } from "./SidebarUpdateAction";
export {
    DesktopStartupScreen,
    type DesktopStartupPhase,
    type DesktopStartupScreenProps,
    type DesktopStartupUpdate,
    type DesktopStartupValues,
} from "./DesktopStartupScreen";
export {
    HappyAgentConnectionStatus,
    type HappyAgentConnectionStatusProps,
} from "./HappyAgentConnectionStatus";
export {
    AgentActivityRow,
    type ActivityMotion,
    type ActivityTreatment,
    type AgentActivityRowProps,
} from "./AgentActivityRow";
export { ConversationEntryView, type ConversationEntryViewProps } from "./ConversationEntryView";
export { DelegatedAgentActivity, type DelegatedAgentActivityProps } from "./DelegatedAgentActivity";
export { ContextMeter, type ContextMeterProps } from "./ContextMeter";
export {
    fileTreeBuild,
    fileTreeExpanded,
    fileTreeFlatten,
    fileTreeVisibleFiles,
    type FileTreeBuildEntry,
    type FileTreeExpansion,
} from "./fileTreeBuild";
export { fileEntriesSort, fileNameCompare, filePathCompare } from "./fileTreeSort";
export {
    ConversationStatus,
    ConversationView,
    type ConversationViewProps,
} from "./ConversationView";
export {
    ComposerFooterBar,
    ConversationDock,
    FloatingConversationDock,
    type ComposerFooterBarProps,
    type ConversationDockProps,
    type FloatingConversationDockProps,
} from "./ConversationDock";
export { ComposerPanel, type ComposerPanelProps } from "./ComposerPanel";
export {
    HappyAgentUserInputPrompt,
    type HappyAgentUserInputAnswerMap,
    type HappyAgentUserInputPromptProps,
    type HappyAgentUserInputPromptVariant,
} from "./HappyAgentUserInputPrompt";
export {
    HappyAgentControlMenu,
    type HappyAgentControlMenuProps,
    HappyAgentSessionControls,
    type HappyAgentSessionControlsProps,
} from "./HappyAgentSessionControls";
export {
    CommandPicker,
    commandPickerItems,
    type CommandPickerItem,
    type CommandPickerProps,
} from "./CommandPicker";
export { HappyAgentUsagePanel, type HappyAgentUsagePanelProps } from "./HappyAgentUsagePanel";
export {
    HappyAgentProjectSettingsDialog,
    type HappyAgentProjectComputeChoice,
    type HappyAgentProjectComputeMode,
    type HappyAgentProjectComputeSection,
    type HappyAgentProjectSettingsDialogProps,
} from "./HappyAgentProjectSettingsDialog";
export {
    HappyAgentCreateSessionPage,
    type HappyAgentCreateSessionDestination,
    type HappyAgentCreateSessionPageProps,
} from "./HappyAgentCreateSessionPage";
export {
    HappySocialPage,
    type HappySocialOperation,
    type HappySocialPageProps,
    type HappySocialPerson,
    type HappySocialTeam,
} from "./HappySocialPage";
export {
    HappyAgentProjectCloneDialog,
    type HappyAgentProjectCloneDialogProps,
} from "./HappyAgentProjectCloneDialog";
export {
    HappyAgentActivityPanel,
    type HappyAgentActivityPanelProps,
} from "./HappyAgentActivityPanel";
export {
    HAPPY_AGENT_ACTIVITY_CONTROL_TRANSCRIPT_HEIGHT,
    HappyAgentActivityControl,
    type HappyAgentActivityControlProps,
} from "./HappyAgentActivityControl";
export {
    SearchField,
    type SearchFieldEditableProps,
    type SearchFieldOpenerProps,
    type SearchFieldProps,
    TitleBar,
    type TitleBarEditableProps,
    type TitleBarOpenerProps,
    type TitleBarPlainProps,
    type TitleBarProps,
    WindowDragRegion,
    type WindowDragRegionProps,
} from "./TitleBar";
export {
    TextField,
    type TextFieldProps,
    type TextFieldSize,
    type TextFieldType,
} from "./TextField";
export { Select, type SelectOption, type SelectProps, type SelectSize } from "./Select";
export { LoadingSwap, type LoadingSwapProps } from "./LoadingSwap";
export {
    SPINNER_FRAMES,
    SPINNER_VARIANTS,
    Spinner,
    type SpinnerProps,
    type SpinnerTone,
    type SpinnerVariant,
} from "./Spinner";
export {
    ShimmerText,
    type ShimmerTextProps,
    type ShimmerTextSweep,
    type ShimmerTextTone,
} from "./ShimmerText";
export { WaitRing, type WaitRingProps, waitFinishDateLabel, waitRemainingLabel } from "./WaitRing";
export { WorkspaceLifecycleLane, type WorkspaceLifecycleLaneProps } from "./WorkspaceLifecycleLane";
export {
    WorkspaceLifecycleNotice,
    type WorkspaceLifecycleNoticeProps,
    type WorkspaceLifecycleNoticeSize,
    type WorkspaceLifecyclePhase,
} from "./WorkspaceLifecycleNotice";
export { Switch, type SwitchProps, type SwitchSize } from "./Switch";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export {
    SegmentedControl,
    type SegmentedControlProps,
    type SegmentedControlSegment,
    type SegmentedControlSize,
} from "./SegmentedControl";
export {
    SegmentedProgress,
    type SegmentedProgressProps,
    type SegmentedProgressSegment,
    type SegmentedProgressState,
} from "./SegmentedProgress";
export { Banner, type BannerAction, type BannerProps, type BannerTone } from "./Banner";
export {
    EmptyState,
    type EmptyStateAction,
    type EmptyStateProps,
    type EmptyStateSize,
} from "./EmptyState";
export {
    LottieScene,
    type LottieSceneName,
    type LottieScenePlay,
    type LottieSceneProps,
} from "./LottieScene";
export { type TabItem, Tabs, type TabsProps, type TabsSize } from "./Tabs";
export { TabbedPane, type TabbedPaneProps } from "./TabbedPane";
export {
    DeferredPane,
    type DeferredPaneCurrent,
    type DeferredPanePending,
    type DeferredPaneProps,
} from "./DeferredPane";
export { TransferZone, type TransferZoneProps } from "./TransferZone";
export {
    TRANSFER_ZONE_ATTRIBUTE,
    type TabTransferTarget,
    type TransferZoneState,
} from "./tabTransfer";
export { Toolbar, type ToolbarProps, type ToolbarSearch } from "./Toolbar";
export { Menu, type MenuItem, type MenuProps } from "./Menu";
export { MenuButton, type MenuButtonProps } from "./MenuButton";
export { Modal, type ModalProps, type ModalSize, type ModalTone } from "./Modal";
export { ModalOverlay, type ModalOverlayProps } from "./ModalOverlay";
export {
    DefaultAgentForm,
    type DefaultAgentFormProps,
    DEFAULT_AGENT_LUCKY_LABEL,
} from "./DefaultAgentForm";
export { CommandPalette, type CommandPaletteProps } from "./CommandPalette";
export {
    CommandPaletteResults,
    commandPaletteResultsRows,
    type CommandPaletteCommandRow,
    type CommandPaletteControlRow,
    type CommandPaletteResultsAvatar,
    type CommandPaletteResultsProps,
    type CommandPaletteResultsRow,
    type CommandPaletteResultsSection,
    type CommandPaletteRowEmphasis,
} from "./CommandPaletteResults";
export { FormRow, type FormRowAlign, type FormRowLayout, type FormRowProps } from "./FormRow";
export {
    DocumentSurface,
    type DocumentSurfaceParticipant,
    type DocumentSurfaceProps,
} from "./DocumentSurface";
export {
    DataTable,
    type DataTableAlign,
    type DataTableColumn,
    type DataTableProps,
    type DataTableRow,
} from "./DataTable";
export {
    type StatDelta,
    StatTile,
    type StatTileProps,
    type StatTone,
    type StatTrend,
} from "./StatTile";
export {
    LocalOnboardingScreen,
    type LocalOnboardingAgentSetupPhase,
    type LocalOnboardingAssistant,
    type LocalOnboardingAssistantId,
    type LocalOnboardingDownload,
    type LocalOnboardingScreenProps,
    type LocalOnboardingView,
} from "./LocalOnboardingScreen";
export {
    AgentInstallScreen,
    type AgentInstallDrainAgent,
    type AgentInstallDrainComponent,
    type AgentInstallReason,
    type AgentInstallScreenProps,
    type AgentInstallView,
} from "./AgentInstallScreen";
export { ConnectionHeader, type ConnectionHeaderProps } from "./ConnectionHeader";
export {
    WelcomeScreen,
    type WelcomeScreenBackdrop,
    type WelcomeScreenProps,
} from "./WelcomeScreen";
export {
    WelcomeDeck,
    type WelcomeDeckProps,
    type WelcomeDeckTint,
    type WelcomeSlide,
    type WelcomeSlideArt,
} from "./WelcomeDeck";
export { SetupChoice, type SetupChoiceOption, type SetupChoiceProps } from "./SetupChoice";
export {
    SetupAssistants,
    type SetupAssistantEntry,
    type SetupAssistantsProps,
} from "./SetupAssistants";
export { AssistantMark, type AssistantMarkName, type AssistantMarkProps } from "./AssistantMark";
export {
    SetupPage,
    SetupProgress,
    type SetupPageAction,
    type SetupPageProgress,
    type SetupPageProps,
    type SetupProgressProps,
} from "./SetupPage";
export {
    SetupOptionCard,
    type SetupOptionCardProps,
    type SetupOptionHintTone,
    type SetupOptionStatus,
} from "./SetupOptionCard";
export {
    BuildProgressPanel,
    type BuildProgressPanelProps,
    type BuildProgressStatus,
} from "./BuildProgressPanel";
export { type Availability, StatusPicker, type StatusPickerProps } from "./StatusPicker";
export {
    type SearchResultAvatar,
    type SearchResultGroup,
    type SearchResultItem,
    SearchResults,
    type SearchResultsProps,
    type SearchResultsVariant,
    type SearchResultType,
} from "./SearchResults";
export {
    MediaGallery,
    type MediaGalleryProps,
    type MediaItem,
    type MediaKind,
} from "./MediaGallery";
export {
    FileAttachment,
    type FileAttachmentKind,
    type FileAttachmentProps,
    type FileAttachmentVariant,
} from "./FileAttachment";
export { type EmojiItem, EmojiPicker, type EmojiPickerProps } from "./EmojiPicker";
export { TerminalPanel, type TerminalPanelProps } from "./TerminalPanel";
export {
    BrowserPanel,
    type BrowserContentProps,
    type BrowserContentRenderer,
    type BrowserController,
    type BrowserFailure,
    type BrowserPanelProps,
} from "./BrowserPanel";
export {
    QuickActionsCard,
    type QuickActionsCardItem,
    type QuickActionsCardProps,
} from "./QuickActionsCard";
export { ZoomIndicator } from "./ZoomIndicator";
export {
    HappyAgentInboxPage,
    type HappyAgentInboxAnswerMap,
    type HappyAgentInboxPageProps,
} from "./pages/inbox/HappyAgentInboxPage";
export {
    HappyAgentSettingsSection,
    HappyAgentSettingsShell,
    type HappyAgentSettingsCategory,
    type HappyAgentSettingsSectionProps,
    type HappyAgentSettingsShellProps,
} from "./pages/settings/HappyAgentSettingsShell";
export {
    HappyAgentGeneralSettings,
    type HappyAgentAppearanceChoice,
    type HappyAgentGeneralSettingsProps,
    type HappyAgentScrollbarVisibilityChoice,
} from "./pages/settings/HappyAgentGeneralSettings";
export {
    HappySocialSetupModal,
    type HappySocialSetupModalProps,
} from "./pages/settings/HappySocialSetupModal";
export {
    HappySocialJoin,
    happySocialJoinDescription,
    happySocialJoinPresentation,
    happySocialJoinTitle,
    type HappySocialJoinPasswordRule,
    type HappySocialJoinProps,
    type HappySocialJoinStage,
    type HappySocialJoinState,
} from "./pages/settings/HappySocialJoin";
export {
    HappySocialSettings,
    type HappySocialEnrollment,
    type HappySocialKeysStatus,
    type HappySocialSettingsProps,
    type HappySocialStatus,
} from "./pages/settings/HappySocialSettings";
export {
    HappyAgentMobileSettings,
    type HappyAgentMobileSettingsProps,
    type HappyAgentMobileStatus,
} from "./pages/settings/HappyAgentMobileSettings";
export {
    HappyAgentDebugSettings,
    type HappyAgentDebugSettingsProps,
    type HappyAgentDebugTarget,
} from "./pages/settings/HappyAgentDebugSettings";
export {
    HappyAgentDebugLogPanel,
    type HappyAgentDebugLogPanelEntry,
    type HappyAgentDebugLogPanelProps,
} from "./pages/settings/HappyAgentDebugLogPanel";
export {
    HappyAgentProfilerSettings,
    type HappyAgentProfilerCapabilities,
    type HappyAgentProfilerSettingsProps,
    type HappyAgentProfilerStatus,
} from "./pages/settings/HappyAgentProfilerSettings";
export {
    HappyAgentInstructionsSettings,
    type HappyAgentInstructionDocument,
    type HappyAgentInstructionsSettingsProps,
} from "./pages/settings/HappyAgentInstructionsSettings";
export {
    HappyAgentProviderSettings,
    type HappyAgentProviderModelRow,
    type HappyAgentProviderRow,
    type HappyAgentProviderSettingsProps,
    type HappyAgentProviderStatus,
} from "./pages/settings/HappyAgentProviderSettings";
export {
    HappyAgentSecretSettings,
    type HappyAgentSecretCreateInput,
    type HappyAgentSecretRow,
    type HappyAgentSecretSettingsProps,
} from "./pages/settings/HappyAgentSecretSettings";
export {
    HappyAgentSecretCreateDialog,
    type HappyAgentSecretCreateDialogProps,
    type HappyAgentSecretCreateDraft,
    type HappyAgentSecretVariableDraft,
} from "./pages/settings/HappyAgentSecretCreateDialog";
export {
    HappyAgentProfileSettings,
    type HappyAgentProfileSettingsProps,
} from "./pages/settings/HappyAgentProfileSettings";
export {
    HappyAgentEncryptionSettings,
    type HappyAgentEncryption,
    type HappyAgentEncryptionSecret,
    type HappyAgentEncryptionSettingsProps,
} from "./pages/settings/HappyAgentEncryptionSettings";
export {
    HappyAgentDeviceSettings,
    type HappyAgentDevice,
    type HappyAgentDevicePlatform,
    type HappyAgentDeviceRead,
    type HappyAgentDeviceSettingsProps,
} from "./pages/settings/HappyAgentDeviceSettings";
export {
    HappyAgentStateSettings,
    type HappyAgentStateDocument,
    type HappyAgentStateSettingsProps,
} from "./pages/settings/HappyAgentStateSettings";
export {
    HappyAgentUsageSettings,
    type HappyAgentUsageSettingsProps,
} from "./pages/settings/HappyAgentUsageSettings";
export { providerAccountName } from "./pages/settings/providerAccountName";
export { ConnectionShell, type ConnectionShellItem } from "./ConnectionShell";
export { ConnectionSurface } from "./ConnectionSurface";
