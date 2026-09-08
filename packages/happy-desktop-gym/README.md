# happy-desktop-gym

`happy-desktop-gym` contains the reusable browser-rendering harness and an
isolated, host-native Electron performance gym for Happy Agent.

## Electron Happy Agent gym

The gym creates one disposable run under `<system-temp>/hdg/g-<run-id>` by
default. Every mutable path belongs to that one short root: `HOME`, `TMPDIR`,
`HAPPY_HOME_DIR`, the Happy Agent socket and token, Electron user data,
deterministic Git repositories, real Happy Agent worktrees, and profiler
artifacts. A stopped, prepared run has this representative shape:

```text
<system-temp>/hdg/g-1234abcd/
├── .happy/
│   ├── agent/
│   │   ├── agent.sqlite{,-shm,-wal,.lock}
│   │   ├── auto-agent.sqlite{,-shm,-wal,.lock}
│   │   ├── daemon.log
│   │   ├── observation/agent.log
│   │   ├── runtime.toml
│   │   └── token
├── Happy/
│   ├── Config/
│   │   ├── AGENTS.md
│   │   ├── SECURITY.md
│   │   └── happy.toml
│   └── Generated/
├── home/
│   ├── .cache/
│   ├── .config/
│   ├── .local/
│   ├── .bash_profile
│   └── .zprofile
├── tmp/
├── projects/
│   └── gym-project-01/
├── workspaces/
│   └── gym-project-01/gym-project-01-work-02/
├── bin/
│   └── happy-agent -> <selected installed Happy Agent>
├── artifacts/
├── electron-user-data/
├── electron-user-data-<build>/
├── .happy-desktop-gym-owner.json
├── manifest.json
├── inference.ndjson
├── stream-events.ndjson
├── session-cluster.json
├── achieved.json
└── prepared.json
```

While the daemon is live it creates `.happy/agent/server.sock`, its PID file,
and its internal module sockets beneath the same agent directory; shutdown
removes the live socket. Electron first creates the empty `electron-user-data/`
launch base, then the development app selects `electron-user-data-<build>/` for
its actual profile. The installed Agent adds extracted runtime assets beneath
`tmp`, but nothing gets a parallel external root.

`HAPPY_HOME_DIR=<run>/.happy` is the authoritative Agent boundary. The Agent
derives its socket and token there; the launcher also names those same two paths
explicitly to tell Electron this particular daemon is owned by Gym, not by the
desktop's install/update lifecycle. All three values remain within the one run
root. The launcher supplies an exact allowlisted environment and uses the
run-owned `Happy/Config/happy.toml` with
`settings.happy_integration = false`, and supplies no Happy credentials.
Consequently a local desktop Gym does not start the optional Happy account/mobile
session mirror or pollute the developer's production account.

The gym writes an ownership marker, then seeds agents and durable transcripts
through the Happy Agent `/v0` API.
It never writes daemon storage directly. Preparation proves the exact
project/worktree catalog, durable agent transcript, and seeded-turn invariants
through that public API. The live event journal drives the streaming workloads;
it is intentionally treated as bounded delivery, not durable history. The run
root retains `achieved.json` before validation, including failed
realistic/stress preparations, so no unprepared host snapshot is claimed as
seeded history. The fixture manifest also validates the regular-repository shape:
smoke is 38 files with 9 changed records, 1,120 large-text lines, and 101,280
large-text bytes; realistic and stress scale those same nested modified,
added, renamed, and deleted paths to their declared file/byte/line targets.

Measured Electron stays host-native on macOS. Docker is intentionally not used
for the measured app; it remains an optional place to isolate a backend/tool
fixture if a workload needs one.

Build the app once, then prepare and run:

```sh
pnpm --dir packages/happy-desktop-electron build:profile:optimized
pnpm --dir packages/happy-desktop-gym gym:electron prepare --profile smoke
pnpm --dir packages/happy-desktop-gym gym:electron run --root <printed-run-root> --workload all
```

`build:profile:optimized` enables the checked-in React DevTools profiling bridge
with the production-shaped renderer. The `gym:electron:run` script rebuilds this
optimized flavor, then launches the built `dist/main.js` through host Electron
with `HAPPY_DESKTOP_PROFILE_MODE=optimized`; it never launches `pnpm dev`,
`dev:electron`, or a Vite server. Runs invoke the app's native profiler bridge
at each workload boundary and record the returned app-owned artifact manifest,
alongside workload timing/context and Playwright action traces under the owned
run root. The app owns React/DevTools, heap/DOM/process, and native trace
collection and artifact writing; Gym only starts/stops that bridge and records
its returned paths. Playwright UI traces are disabled by default and can be
requested with `--ui-trace`; they are debugging aids, not profiler artifacts.
Each workload sample references its unchanged manifest, Chromium trace, raw
metrics, and any React DevTools 6.1.5 backend profile payloads the bridge produced;
scenario timestamps and browser marks are the only Gym metadata added beside
them. An empty React-profile list remains an explicit bridge-capability result,
never a Gym replacement or re-serialization. If the profile build or bridge is
unavailable, Gym falls back to bounded heap/DOM/process snapshots and reports
the capability honestly.

`window-edge-resize` reuses the prepared profile's first durable long-chat
session; it does not submit messages or manufacture another fixture. The
workload refuses to run until the seeded long-chat marker is visible and the
message list is hydrated, virtualized, scrollable, and nonempty. With the right
panel open, it drives fixed-origin and moving-origin 380px round trips in 2px
updates every 5ms. Animation-frame gaps are calibrated against idle frames
captured immediately around each sweep and reported with estimated dropped
frames, long frames, browser long tasks, delivered viewport widths, and panel
geometry. Every sampled frame must keep rendered transcript rows mounted. The
gym window remains inactive and the workload never controls the system cursor.

Run it repeatedly against one already-prepared root:

```sh
pnpm --dir packages/happy-desktop-gym gym:electron run \
  --root <printed-run-root> \
  --workload window-edge-resize
```

The Gym selects the Happy Agent installation recorded by the current Happy home.
To use another installed executable, set
`HAPPY_DESKTOP_AGENT_EXECUTABLE=/absolute/path/to/happy-agent`.

`mixed-replay` is the end-to-end lane. It reads the existing
`gold-five-minute-session.v1.json` recording for its real submitted-message
patterns, submits those prompts concurrently to several durable Happy Agent conversations,
and starts one real isolated `exec_command` turn that appends deterministic
large-file lines through the mounted fixture checkout. A single promise-
coordinated UI lane then switches repeatedly among foreground sessions while
all streams and the Git watcher are live, scrolls a virtualized long transcript
through large jumps, and exercises changed-file, document, and syntax
A→B→A sequences. The live Happy Agent event stream, the exact virtual
changed-file row/stat pair for `src/changes/modified/deep/large-modified.md`,
and a host-side fixture read are the event/UI barriers; the row is remounted after the real tool
completes and must report the profile's expected insertions plus `−16`
deletions. The lane does not use fixed sleeps as stream or file-arrival
barriers; the selection diagnostic deliberately holds a native range for two
seconds after the cold worker replacement has settled. SSE collectors
attach before submissions, and each run barrier is keyed by its returned run
ID. Every stream,
session switch, scroll, and file interaction has an ISO timestamp and latency,
alongside per-interaction buffered `PerformanceObserver` long-task observations,
before/after performance capture, and cache-oriented cold/warm timing evidence.
The same UI lane also measures transcript scroll stability directly in the
renderer: it samples message-list scrollTop, bottom distance, the first visible
virtual row, the lowest visible row's bottom-edge offset, row rectangles, and
client/scroll heights on every animation frame while dragging the real left-edge
panel and sidebar splitters, folding each panel away and restoring it, resizing the
native window, and growing and shrinking the multiline composer.
Following readers must stay within 8px of the bottom without a temporary
break-and-recovery correction or overlapping virtual rows; parked readers must
retain the same authoritative model-space row and offset through splitter drags in
both directions, panel/sidebar toggles, and window resizing. That is the product's
one-observer width-reflow contract: text naturally rewraps inside the stable row
without DOM-range tracking or per-row measurement. Composer height changes do not
rewrap text, so they retain the exact lowest visible text glyph and bottom-edge
offset. The recorded `scrollStability` phases name the contract they enforce and
distinguish natural text rewrap from a lost scroll anchor.
The standalone `streaming` workload submits through the real composer six times. A
following send must remain exactly pinned while the working status and response
stream grow, including a stable status-to-composer gap; a parked send must retain
the same glyph while the same durable SSE path appends below it, including when
the cleared composer changes the viewport's raw scrollTop. A
third send wheels away from the tail while SSE is active and requires the reader's
new glyph to remain fixed for the rest of the stream. A fourth slow-chunk response
forms a real GFM table over SSE. The prospective header must remain progressively
visible as text before it becomes a table; its own columns may reflow as rows arrive.
Every painted frame must nevertheless keep the completed prefix node, the transcript
at the bottom, and the status-to-composer gap stable. The capture continues through
the settled `Completed in` row and separately requires its 32px activity slot, 24px
composer gap, 14px/20px typography, and color to stay stable without a correction
frame. The explicit live-status to settled-summary structural transition is not
treated as a same-node resize.
A fifth response executes a real `apply_patch` in the mounted worktree and measures
the painted generic-running → settled-file-diff transition. The 32px activity row
and its 20px text/stats line must stay equal while unchanged visible-row spacing
remains rigid. A sixth response applies a trusted 4px upward wheel gesture during
active SSE. That smallest possible escape must take ownership immediately; raw
scrollTop, the first visible row, and every stable visible-row pair must then remain
fixed while the transcript continues growing below the reader.
The Happy Agent JustBash gym mount is the
actual ready managed worktree at `/workspace`; the live tool mutates that same
worktree while clustered sessions stream and switch in the same run. The
changed-file lane establishes a native browser text range only after the
highlight-first viewer reveals its final diff DOM. `changedFileSelection` then
records the exact native selection at 0, 100, 500, 1,000, and 2,000 milliseconds
while the concurrent streams continue.
Every sample must retain the same text, length, connected endpoints, and diff
mode, and Pierre's settled shadow DOM must not mutate at all. This proves stable
file/options identity prevents unrelated store notifications from rebuilding
an unchanged diff; the product does not bookmark or restore native selections.
highlight lane opens `README.md` → `src/long-transcript.md` → `README.md`
through MarkdownDocument/Pierre, requires the fenced-code completion barrier,
and records the Pierre Markdown A→B→A warm cycle. The mixed document lane uses
non-fenced Markdown paths for transport/file-loading timing separately.
The standalone `long-chat-scroll`, `session-switch-load`, and
`changed-files-warm` workloads expose those dimensions independently; `all`
runs them together with the existing boot/catalog/streaming/memory lanes. The
gold protocol frames are not
fabricated into the server: only the recording's submitted user text is reused
through real `submitMessage` calls, and the result records that limitation.
The launcher uses the workspace's Electron binary; when a package install has
not downloaded it yet, point `HAPPY_DESKTOP_ELECTRON_EXECUTABLE` at an installed
host Electron executable. The measured app is never moved into Docker.

Profiles are deterministic and versioned: `smoke`, `realistic`, and `stress`.
An explicit `--root` must be a direct child of `<system-temp>/hdg`; omitting it
is the simplest and safest option. `--artifact-dir` is the sole intentional
escape hatch: artifacts may stay in the run root or be written to the
workspace's `.context` directory.

```sh
pnpm --dir packages/happy-desktop-gym gym:electron prepare --profile realistic
pnpm --dir packages/happy-desktop-gym gym:electron run --root <printed-run-root> --workload mixed-replay
pnpm --dir packages/happy-desktop-gym gym:electron clean --root <printed-run-root>
```

`clean` refuses paths outside the system temporary Gym directory and paths
without the Gym ownership marker. Keep a run for inspection, or clean it
explicitly after collecting the artifacts.

## Browser rendering harness

`gym/playwright` owns the reusable real-browser measurement harness. A consumer
supplies only a framework-specific mount callback; the harness supplies
independently sized surfaces, rendered border-box coordinates, computed CSS,
DOM text-baseline metrics, Retina screenshots, and visible-pixel analysis.

Visible pixels are reconstructed by capturing the integer-aligned render surface
against both black and white, then scanning the selected element's region on
that shared backing-pixel grid. For each backing pixel,
`Cwhite - Cblack = 255 * (1 - alpha)`, so the harness recovers coverage without
assuming a foreground color. `visibleMetrics()` reports exact raster bounds,
nonzero backing-pixel count, total alpha mass, and alpha-weighted optical center
relative to the selected element.

`textMetrics().baseline.fromElementTop` and `.fromSurfaceTop` report the live
DOM first-line baseline. `ink.baseline` and `verticalOffset` remain compatibility
aliases. The baseline comes from a temporary zero-size inline probe and is not
inferred from canvas. `textMetrics().fontMetrics` separately exposes the
browser's raw Canvas `TextMetrics` values.

`renderer.visibleMetrics([first, second])` measures independent elements on one
render surface from one black/white screenshot pair. Elements in one batch
cannot contain one another because changing ancestor backgrounds would otherwise
alter a second measurement's paint. `renderer.screenshot()` writes inspection
PNGs only when `VITE_HAPPY_DESKTOP_WRITE_SCREENSHOTS=1`; use
`pnpm --filter happy-desktop-gym test:playwright:artifacts` for a deliberate
artifact refresh.

### Transcript streaming layout regression

The browser gym's `ConversationStreamingGeometry.test.tsx` consumer mounts the
real `ConversationView` with streamed prose, an Edit activity, and the working
status. Run it from the repository root (with reviewed full access on macOS):

```sh
VITE_HAPPY_DESKTOP_WRITE_SCREENSHOTS=1 pnpm --dir packages/happy-desktop-ui test src/ConversationStreamingGeometry.test.tsx
```

Commit `1d1f9f7e` replaced live Markdown/font layout with character-count height
estimates to avoid retaining streamed prefixes. Those estimates became
authoritative virtual-row offsets: excess height left blank gaps, and insufficient
height overlapped following rows. Before the fix, even the two-paragraph repro
painted 209px but reserved 225px in all three engines.

The regression checks live and settled row bounds, rich Markdown, width changes,
stable row/focus identity, bottom following, and growing expanded shell output.
It also checks that each streamed prefix uses the settled layout algorithm while
leaving the retained history cache unchanged. Chromium, Firefox, and WebKit run
at 2×; inspection PNGs are saved beside the test.

The rich-table fixture preserves a second user-reported payload verbatim and
streams it through ordinary chunks and Markdown delimiters at 800px, 560px, and
360px. This catches the syntax-only stages that complete-message fixtures miss:
an empty table row has padding but no text line, an empty heading has a box and
collapsing margins but no line, and an empty list item still has its marker line.
The model distinguishes an empty rendered element from omitted definitions/HTML;
it never repairs row sizes from DOM measurements.

Known separate limitation: Pretext 0.0.8 and Gecko disagree on narrow URL line
breaks even for settled text. The 360px Firefox replay and an isolated settled
prefix are executable expected failures (not skipped or given a larger tolerance).
The 800px/560px Firefox replays, empty-block cases in every engine, and all
Chromium/WebKit widths must pass. Happy Desktop uses Chromium. This change does
not claim to fix the independent Gecko line-breaking model.
