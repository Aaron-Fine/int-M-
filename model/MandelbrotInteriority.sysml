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
            automatic;
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
            in item renderStatus : RenderStatus;
            in item inspectorResult : InspectorResult;
        }

        part def DefaultExperience {
            attribute viewport : ViewportPreset = ViewportPreset::fullSet;
            attribute semanticView : SemanticView = SemanticView::stability;
            attribute qualityProfile : QualityProfile = QualityProfile::balanced;
            attribute pointerTool : PointerTool = PointerTool::pan;
            attribute renderer : RendererSelection = RendererSelection::automatic;
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

        part def CapabilitySelector;

        part def FirstUseGuidance;

        part def UIShell {
            part viewControls : ViewControls;
            part legend : Legend;
            part inspector : InspectorPanel;
            part canvasPresenter : CanvasPresenter;
            part capabilitySelector : CapabilitySelector;
            part firstUseGuidance : FirstUseGuidance;
            port renderChannel : UIWorkerPort;
        }

        part def CoordinateMapper;

        part def OrbitEngine {
            port semanticTileOutput : SemanticTilePort;
        }

        part def NumericalKernel;

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

        part def OfflineToolchain {
            part fixtureGenerator : HighPrecisionFixtureGenerator;
            part catalogGenerator : CatalogGenerator;
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
             * balanced numerical profile, automatic renderer selection, and a
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
             * If WebGPU is unavailable or rejected, the application shall
             * automatically select a supported fallback without requiring user
             * intervention.
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
            satisfy UserExperienceRequirements::AutomaticRendererFallback
                by app.uiShell.capabilitySelector;
            satisfy UserExperienceRequirements::KeyboardOperation
                by app.uiShell;
            satisfy UserExperienceRequirements::AccessibleInterface
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
             * area-selection zoom, cancellation, reset, and both boundaries
             * of the permitted zoom range.
             */
            objective navigationInteraction {
                verify UserExperienceRequirements::ResponsiveNavigation;
                verify UserExperienceRequirements::RestoreDefaultView;
                verify UserExperienceRequirements::ZoomBoundFeedback;
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
            }
        }

        verification def <'MI-VER-UX-004'> ResilienceAndFallbackTest {
            subject app : Architecture::MandelbrotInteriorityApplication;
            doc /*
             * Inject worker, numerical-budget, and WebGPU capability failures
             * and confirm nonblocking status and automatic recovery.
             */
            objective resilienceAndFallback {
                verify UserExperienceRequirements::NonblockingStatusAndFailure;
                verify UserExperienceRequirements::AutomaticRendererFallback;
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
            }
        }
    }
}
