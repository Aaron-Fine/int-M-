package MandelbrotInteriority {

    package SystemContext {

        part def User;

        part def ModernBrowser;

        part def CloudflarePages;

        part def DevelopmentEnvironment;

        part operatingContext {
            part user : User;
            part browser : ModernBrowser;
            part staticHost : CloudflarePages;
            part developmentEnvironment : DevelopmentEnvironment;
        }
    }

    package Architecture {

        enum def ViewportPreset {
            fullSet;
        }

        enum def SemanticView {
            stability;
            multiplier;
            period;
        }

        enum def QualityProfile {
            quick;
            balanced;
            detailed;
        }

        enum def PointerTool {
            pan;
            zoomArea;
        }

        enum def RendererSelection {
            workerCpu;
        }

        enum def CatalogOverlaySelection {
            essentialComponents;
            hidden;
        }

        enum def ThemeSelection {
            systemPreference;
            light;
            dark;
        }

        enum def InspectorSelection {
            closedUntilSelection;
            open;
        }

        item def RenderRequest;

        item def CancelRequest;

        item def CancelAcknowledgment;

        item def CancelQuiescence;

        item def SemanticTile;

        item def ColorizedFrame;

        item def RenderStatus;

        item def InspectorRequest;

        item def InspectorResult;

        port def SemanticTilePort {
            out item semanticTile : SemanticTile;
        }

        port def UIWorkerPort {
            out item renderRequest : RenderRequest;
            out item cancelRequest : CancelRequest;
            out item inspectorRequest : InspectorRequest;
            in item colorizedFrame : ColorizedFrame;
            in item cancelAcknowledgment : CancelAcknowledgment;
            in item cancelQuiescence : CancelQuiescence;
            in item renderStatus : RenderStatus;
            in item inspectorResult : InspectorResult;
        }

        part def DefaultExperience {
            attribute viewport : ViewportPreset = ViewportPreset::fullSet;
            attribute semanticView : SemanticView = SemanticView::stability;
            attribute qualityProfile : QualityProfile = QualityProfile::balanced;
            attribute pointerTool : PointerTool = PointerTool::pan;
            attribute renderer : RendererSelection = RendererSelection::workerCpu;
            attribute catalogOverlay : CatalogOverlaySelection =
                CatalogOverlaySelection::essentialComponents;
            attribute theme : ThemeSelection = ThemeSelection::systemPreference;
            attribute inspector : InspectorSelection =
                InspectorSelection::closedUntilSelection;
        }

        part def ViewControls;

        part def Legend;

        part def InspectorPanel;

        part def CanvasPresenter;

        part def RendererLifecycle;

        part def FirstUseGuidance;

        part def RenderTraceRecorder {
            doc /*
             * Bounded always-on ring of request summaries recorded at request
             * and band boundaries only. Each frame keeps the delivery source
             * set by the worker (computed, in-flight replay, semantic cache,
             * recolor) and its compute identity; cancellations keep both the
             * acknowledgment and the child-quiescence timing.
             */
        }

        part def UIShell {
            part viewControls : ViewControls;
            part legend : Legend;
            part inspector : InspectorPanel;
            part canvasPresenter : CanvasPresenter;
            part rendererLifecycle : RendererLifecycle;
            part firstUseGuidance : FirstUseGuidance;
            part renderTraceRecorder : RenderTraceRecorder;
            port renderChannel : UIWorkerPort;
        }

        part def CoordinateMapper;

        part def OrbitEngine {
            port semanticTileOutput : SemanticTilePort;
        }

        part def NumericalKernel;

        part def CycleVerifier {
            doc /*
             * The single declared acceptance procedure: every candidate
             * source (lag scan, watched lag, checkpoint, analytic paths)
             * proposes, and only this verifier may accept an attracting
             * cycle and its primitive period.
             */
        }

        part def TileWorkerPool {
            doc /*
             * Nested workers for the stable pass. Cancellation is reported as
             * quiescent only after every child has stopped or the pool has
             * been reset.
             */
        }

        part def SemanticTileStore {
            doc /*
             * Retains the current stable, view-independent semantic tile.
             * Identity includes viewport, raster size, quality limits, and
             * semantic-algorithm version, but excludes palette selection.
             */
            port semanticTileInput : ~SemanticTilePort;
            port semanticTileOutput : SemanticTilePort;
        }

        part def PaletteMapper {
            doc /*
             * Maps worker-local semantic tiles to colorized frames. A semantic
             * view change reuses cached or in-progress dynamics results.
             */
            port semanticTileInput : ~SemanticTilePort;
        }

        part def CatalogMatcher;

        part def RenderCoordinator;

        part def RenderingWorker {
            part renderCoordinator : RenderCoordinator;
            part coordinateMapper : CoordinateMapper;
            part orbitEngine : OrbitEngine;
            part numericalKernel : NumericalKernel;
            part cycleVerifier : CycleVerifier;
            part tileWorkerPool : TileWorkerPool;
            part semanticTileStore : SemanticTileStore;
            part paletteMapper : PaletteMapper;
            part catalogMatcher : CatalogMatcher;
            port userInterface : ~UIWorkerPort;

            connect orbitEngine.semanticTileOutput
                to semanticTileStore.semanticTileInput;
            connect semanticTileStore.semanticTileOutput
                to paletteMapper.semanticTileInput;
        }

        part def CatalogData;

        part def MandelbrotInteriorityApplication {
            part defaultExperience : DefaultExperience;
            part uiShell : UIShell;
            part renderingWorker : RenderingWorker;
            part catalogData : CatalogData;

            connect uiShell.renderChannel to renderingWorker.userInterface;
        }

        part def HighPrecisionFixtureGenerator;

        part def CatalogGenerator;

        part def EvidenceHarness {
            doc /*
             * Frozen benchmark corpus, environment capture, paired browser
             * runners, and manifest tooling for Phase 2 performance evidence.
             */
        }

        part def OfflineToolchain {
            part fixtureGenerator : HighPrecisionFixtureGenerator;
            part catalogGenerator : CatalogGenerator;
            part evidenceHarness : EvidenceHarness;
        }
    }

    package UserExperienceRequirements {

        requirement <'MI-UX-001'> FirstUseRendering {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * On first use, the application shall begin rendering a
             * recognizable full-set view without requiring user configuration.
             */
        }

        requirement <'MI-UX-002'> SensibleDefaults {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * The default presentation shall use the stability view, a
             * balanced numerical profile, the selected Worker CPU renderer,
             * and a
             * minimal catalog overlay.
             */
        }

        requirement <'MI-UX-003'> ProgressiveFirstFrame {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * The first useful frame shall appear within the coarse-frame
             * performance budget and shall progressively refine without
             * clearing the canvas.
             */
        }

        requirement <'MI-UX-004'> TruthfulIntermediateResults {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Intermediate rendering shall not represent
             * bounded-but-unclassified pixels as established interior points.
             */
        }

        requirement <'MI-UX-005'> NonblockingFirstUseGuidance {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * First-use guidance shall be compact, nonmodal, dismissible, and
             * shall not delay rendering or interaction.
             */
        }

        requirement <'MI-UX-006'> FocusedPrimaryControls {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * The initially visible controls shall provide semantic and named
             * quality selection, pointer tools, zoom, reset, catalog
             * visibility, and inspection. They shall not require raw numerical
             * parameters or unrelated advanced controls for normal use.
             */
        }

        requirement <'MI-UX-007'> ResponsiveNavigation {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Pan, point zoom, and area-selection zoom actions shall provide
             * immediate visual feedback while superseded rendering work is
             * cancelled and replaced.
             */
        }

        requirement <'MI-UX-008'> RestoreDefaultView {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * The application shall provide an always-available action that
             * restores the default full-set viewport and presentation.
             */
        }

        requirement <'MI-UX-009'> ZoomBoundFeedback {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Reaching the configured zoom bound shall produce visible,
             * understandable feedback rather than silently ignoring input.
             */
        }

        requirement <'MI-UX-010'> SemanticLegend {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Every semantic view shall display a legend and discoverable
             * plain-language definitions explaining the represented quantity,
             * scale, units or normalization, and unresolved treatment.
             */
        }

        requirement <'MI-UX-011'> NonColorStateDistinction {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Escaped, attracting-cycle, unresolved, selected, and
             * catalog-identified states shall remain distinguishable without
             * relying exclusively on hue. Selected and zoom-relevant catalog
             * labels shall remain readable.
             */
        }

        requirement <'MI-UX-012'> EvidenceBoundedInspector {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Selecting a point shall reveal canonical c, status, evidence,
             * and available dynamical values with discoverable definitions,
             * without reporting precision unsupported by the evidence.
             */
        }

        requirement <'MI-UX-013'> NonblockingStatusAndFailure {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Rendering progress, fallback operation, numerical limits, and
             * recoverable failures shall be communicated without blocking
             * continued interaction.
             */
        }

        requirement <'MI-UX-014'> AutomaticRendererFallback {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Status: OBE. Original requirement: If WebGPU is unavailable or
             * rejected, the application shall automatically select a
             * supported fallback without requiring user intervention. Phase 0
             * instead selected Worker CPU as the production renderer.
             * MI-UX-017 supersedes this requirement without reusing its
             * identifier.
             */
        }

        requirement <'MI-UX-015'> KeyboardOperation {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Primary navigation, view and quality selection, reset, catalog
             * selection, inspection, and explanatory disclosures shall be
             * keyboard operable with visible focus.
             */
        }

        requirement <'MI-UX-016'> AccessibleInterface {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * The application shall conform to WCAG 2.2 Level AA for
             * applicable interface content and controls.
             */
        }

        requirement <'MI-UX-017'> RendererRecoveryAndFallback {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * The Worker CPU renderer shall recover automatically from one
             * consecutive worker or render failure and shall expose a manual
             * retry after recovery is exhausted. Any future optional renderer
             * shall fall back automatically to Worker CPU when unavailable or
             * rejected.
             */
        }

        requirement <'MI-UX-019'> ShareableState {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * The viewport (exact decimal centre and span), semantic view,
             * quality profile, and selection shall be encoded in a versioned
             * URL and restored on load. Malformed or out-of-range values
             * shall fall back to defaults with a notice, and an older version
             * shall never be reinterpreted silently.
             */
        }

        requirement <'MI-UX-020'> CatalogNavigation {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Every catalog entry shall be reachable and selectable by
             * keyboard and by a list grouped by period. Activating an entry
             * shall zoom to it, never past the zoom ceiling, and select it.
             * Curated entries may carry annotation text, and a glossary shall
             * explain periods, characteristic rays and internal and angled
             * internal addresses. At most 40 catalog markers shall be
             * interactive at once, lowest periods first; the selected entry
             * shall be shown whenever it is in view; the marker focus order
             * shall not depend on the view; a marker shall be left off only
             * when the cap is reached or its dot would cover another
             * marker's, and a colliding label shall be hidden while its
             * marker stays.
             */
        }

        requirement <'MI-UX-018'> PeriodViewEmphasis {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * The period view shall emphasize at most five periods per view,
             * chosen by area in the frame shown, and draw every other period
             * in one neutral color. The legend shall list exactly the
             * emphasized periods in ascending order, with their exact period
             * numbers, their shares of the attracting-cycle area and the
             * colors the raster uses, plus the neutral class. Each emphasized
             * period shall be identifiable without relying on hue through
             * that legend and by isolation: (mouse) hovering, focusing or
             * activating its legend entry shall dim every pixel not of that period, with
             * at least 3:1 contrast between the period and the dimmed field,
             * until the entry is released or activated again, Escape is
             * pressed, a stable frame no longer emphasizes the period, or
             * the interior view changes.
             */
        }

        requirement <'MI-UX-021'> PaletteAcceptance {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Each semantic view's palette shall meet the declared minimum
             * CIEDE2000 differences, set from the simulated minima of the Phase 1
             * palette, which passed the Phase 1 colour-vision sign-off (the
             * period-color floor raised to 11 for the accepted palette),
             * between the escaped and unresolved classes and among and
             * against the period-view classes under normal and simulated
             * protan, deutan and tritan vision; where interior colors overlap
             * those classes by design, the unresolved texture and the
             * multiplier stripes shall meet their own floors. The stability
             * ramp shall be monotonic in luminance, text drawn over the
             * raster shall keep at least 4.5:1 contrast, and every legend
             * color shall derive from the colorizer's palette.
             */
        }
    }


    package PerformanceRequirements {

        requirement <'MI-PERF-001'> ReproducibleEvidence {
            subject toolchain : Architecture::OfflineToolchain;
            doc /*
             * The offline toolchain shall reproduce the declared corpus and
             * retain build, environment, raw observations, metric
             * definitions, and semantic-comparison evidence for every
             * normative run.
             */
        }

        requirement <'MI-PERF-002'> BoundedSystematicDetection {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * The classifier shall perform finite, profile-bounded systematic
             * detection and may report a higher opportunistic period only
             * after the same primitive-period and attraction checks.
             */
        }

        requirement <'MI-PERF-003'> CuratedCatalogIntegrity {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * The curated identity layer shall remain intact. If workstream F
             * ships, the generated period-12 core shall be deterministically
             * reproducible and versioned extension shards shall load without
             * blocking rendering or weakening the curated catalog.
             */
        }

        requirement <'MI-PERF-004'> CommonAcceptance {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * No checkpoint, catalog, algebraic, Newton, SIMD, or subdivision
             * path shall emit attracting-cycle status without the common
             * declared acceptance procedure (closed-form analytic paths
             * accept by the verifier's attraction margin with a declared
             * binary64 allowance, ADR 0010); exhausted or ambiguous work
             * shall remain unresolved.
             */
        }

        requirement <'MI-PERF-005'> GuardedAcceleratedKernel {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * An optional accelerated kernel shall be capability-detected and
             * self-tested, preserve the semantic contract, and automatically
             * use the scalar Worker CPU path on unsupported or failed
             * execution.
             */
        }

        requirement <'MI-PERF-006'> BoundedResponsiveRendering {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Rendering shall remain progressive, cancellable,
             * memory-bounded, and within versioned responsiveness and
             * stable-frame budgets on the supported target class.
             */
        }

        requirement <'MI-PERF-007'> BoundedObservation {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Always-on observation shall operate only at request/band
             * boundaries, distinguish computed, cached, replayed, and
             * recolored frames, and meet retention/overhead limits.
             */
        }

        requirement <'MI-PERF-008'> AccessibleCatalogPresentation {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Catalog presentation, the curated centers and, if F ships,
             * dynamic marker loading and clustering, shall remain
             * keyboard-operable, screen-reader understandable, focus-stable,
             * and bounded in simultaneous interactive markers.
             */
        }
    }

    package RequirementSatisfaction {

        part uxSatisfactionContext {
            part app : Architecture::MandelbrotInteriorityApplication;

            satisfy UserExperienceRequirements::FirstUseRendering
                by app.uiShell;
            satisfy UserExperienceRequirements::SensibleDefaults
                by app.defaultExperience;
            satisfy UserExperienceRequirements::ProgressiveFirstFrame
                by app.renderingWorker.renderCoordinator;
            satisfy UserExperienceRequirements::TruthfulIntermediateResults
                by app.renderingWorker.semanticTileStore;
            satisfy UserExperienceRequirements::NonblockingFirstUseGuidance
                by app.uiShell.firstUseGuidance;
            satisfy UserExperienceRequirements::FocusedPrimaryControls
                by app.uiShell.viewControls;
            satisfy UserExperienceRequirements::ResponsiveNavigation
                by app.renderingWorker.renderCoordinator;
            satisfy UserExperienceRequirements::RestoreDefaultView
                by app.uiShell.viewControls;
            satisfy UserExperienceRequirements::ZoomBoundFeedback
                by app.uiShell.viewControls;
            satisfy UserExperienceRequirements::SemanticLegend
                by app.uiShell.legend;
            satisfy UserExperienceRequirements::NonColorStateDistinction
                by app.renderingWorker.paletteMapper;
            satisfy UserExperienceRequirements::EvidenceBoundedInspector
                by app.uiShell.inspector;
            satisfy UserExperienceRequirements::NonblockingStatusAndFailure
                by app.uiShell;
            satisfy UserExperienceRequirements::KeyboardOperation
                by app.uiShell;
            satisfy UserExperienceRequirements::AccessibleInterface
                by app.uiShell;
            satisfy UserExperienceRequirements::RendererRecoveryAndFallback
                by app.uiShell.rendererLifecycle;
            satisfy UserExperienceRequirements::PeriodViewEmphasis
                by app.renderingWorker.paletteMapper;
            satisfy UserExperienceRequirements::PeriodViewEmphasis
                by app.uiShell.legend;
            satisfy UserExperienceRequirements::PaletteAcceptance
                by app.renderingWorker.paletteMapper;
            satisfy UserExperienceRequirements::ShareableState
                by app.uiShell;
            satisfy UserExperienceRequirements::CatalogNavigation
                by app.uiShell;
        }

        part perfSatisfactionContext {
            part app : Architecture::MandelbrotInteriorityApplication;
            part toolchain : Architecture::OfflineToolchain;

            satisfy PerformanceRequirements::ReproducibleEvidence
                by toolchain.evidenceHarness;
            satisfy PerformanceRequirements::BoundedSystematicDetection
                by app.renderingWorker.orbitEngine;
            satisfy PerformanceRequirements::CuratedCatalogIntegrity
                by app.catalogData;
            satisfy PerformanceRequirements::CommonAcceptance
                by app.renderingWorker.cycleVerifier;
            satisfy PerformanceRequirements::GuardedAcceleratedKernel
                by app.renderingWorker.numericalKernel;
            satisfy PerformanceRequirements::BoundedResponsiveRendering
                by app.renderingWorker.tileWorkerPool;
            satisfy PerformanceRequirements::BoundedObservation
                by app.uiShell.renderTraceRecorder;
            satisfy PerformanceRequirements::AccessibleCatalogPresentation
                by app.uiShell;
        }
    }

    package Verification {

        verification def <'MI-VER-UX-001'> FirstUseExperienceTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Use a fresh-browser Playwright run, reference screenshots, and
             * performance traces to exercise the default first-use path.
             */
            objective firstUseExperience {
                verify UserExperienceRequirements::FirstUseRendering;
                verify UserExperienceRequirements::SensibleDefaults;
                verify UserExperienceRequirements::ProgressiveFirstFrame;
                verify UserExperienceRequirements::TruthfulIntermediateResults;
                verify UserExperienceRequirements::NonblockingFirstUseGuidance;
                verify UserExperienceRequirements::FocusedPrimaryControls;
            }
        }

        verification def <'MI-VER-UX-002'> NavigationInteractionTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Exercise pointer and keyboard navigation, point and
             * area-selection zoom, cancellation, reset, both boundaries of
             * the permitted zoom range, and shareable links: round trip,
             * copy, malformed fields, and unknown or missing versions.
             */
            objective navigationInteraction {
                verify UserExperienceRequirements::ResponsiveNavigation;
                verify UserExperienceRequirements::RestoreDefaultView;
                verify UserExperienceRequirements::ZoomBoundFeedback;
                verify UserExperienceRequirements::ShareableState;
                verify UserExperienceRequirements::CatalogNavigation;
            }
        }

        verification def <'MI-VER-UX-003'> SemanticComprehensionTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Inspect every semantic view, its plain-language definitions,
             * adaptive catalog labels, and golden-fixture point, including
             * simulated color-vision deficiencies and unresolved results.
             * Worker tests confirm that view changes reuse cached or
             * in-progress semantic evidence.
             */
            objective semanticComprehension {
                verify UserExperienceRequirements::SemanticLegend;
                verify UserExperienceRequirements::NonColorStateDistinction;
                verify UserExperienceRequirements::EvidenceBoundedInspector;
                verify UserExperienceRequirements::PeriodViewEmphasis;
                verify UserExperienceRequirements::PaletteAcceptance;
            }
        }

        verification def <'MI-VER-UX-004'> ResilienceAndFallbackTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Inject worker startup, message-decoding, and render failures;
             * confirm bounded automatic recovery, persistent nonblocking
             * status, manual retry, and continued control operation. Exercise
             * optional-renderer capability fallback when such a renderer is
             * introduced.
             */
            objective resilienceAndFallback {
                verify UserExperienceRequirements::NonblockingStatusAndFailure;
                verify UserExperienceRequirements::RendererRecoveryAndFallback;
            }
        }

        verification def <'MI-VER-UX-005'> AccessibilityTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Combine Playwright keyboard scenarios, automated accessibility
             * analysis, and manual canvas and focus review.
             */
            objective accessibility {
                verify UserExperienceRequirements::KeyboardOperation;
                verify UserExperienceRequirements::AccessibleInterface;
                verify UserExperienceRequirements::CatalogNavigation;
            }
        }

        verification def <'MI-VER-UX-006'> ImageRegressionTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Each semantic view shall have committed goldens for the
             * default view and two zoomed views, with a documented tolerance
             * and update procedure. Unit tests hash the colorized frame bytes
             * of every semantic view (zero tolerance, the gate); browser
             * screenshots in the pinned Playwright container are advisory.
             * These goldens and screenshots guard against regressions of the
             * colour requirements that MI-VER-UX-003 verifies; they are not
             * themselves evidence of correctness.
             */
            objective imageRegression {
                verify UserExperienceRequirements::NonColorStateDistinction;
                verify UserExperienceRequirements::PeriodViewEmphasis;
                verify UserExperienceRequirements::PaletteAcceptance;
            }
        }

        verification def <'MI-VER-PERF-001'> BenchmarkAndObservabilityTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Run the frozen corpus with the evidence harness in branded
             * browsers on the declared target, storing every sample with a
             * manifest; exercise computed, cache, replay, recolor, and
             * cancellation deliveries and the observation overhead and
             * retention limits.
             */
            objective benchmarkAndObservability {
                verify PerformanceRequirements::ReproducibleEvidence;
                verify PerformanceRequirements::BoundedObservation;
            }
        }

        verification def <'MI-VER-PERF-002'> ClassifierAgreementTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Adjudicate classifier results against the high-precision oracle
             * and the reference lag scan, including candidate rejection and
             * unresolved-rate checks.
             */
            objective classifierAgreement {
                verify PerformanceRequirements::BoundedSystematicDetection;
                verify PerformanceRequirements::CommonAcceptance;
            }
        }

        verification def <'MI-VER-PERF-003'> CatalogDeterminismTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Check catalog completeness, deterministic generation when a
             * generated layer ships, and keyboard, focus, and marker-cap
             * accessibility of catalog presentation. Schema v2 entries carry
             * residuals, method and provenance; ids derive from the
             * characteristic rays and v1 ids remain aliases (ADR 0011).
             */
            objective catalogDeterminism {
                verify PerformanceRequirements::CuratedCatalogIntegrity;
                verify PerformanceRequirements::AccessibleCatalogPresentation;
            }
        }

        verification def <'MI-VER-PERF-004'> RenderingBudgetTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Measure cancellation, cache, and memory behavior and the
             * stable-frame budgets in both release browsers.
             */
            objective renderingBudget {
                verify PerformanceRequirements::BoundedResponsiveRendering;
            }
        }

        verification def <'MI-VER-PERF-005'> AcceleratedKernelTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * When an accelerated kernel exists: capability detection,
             * backend parity, and forced-failure fallback in both browsers.
             */
            objective acceleratedKernel {
                verify PerformanceRequirements::GuardedAcceleratedKernel;
            }
        }
    }
}
