import Lake
open Lake DSL

package intMProof where
  lintDriver := "batteries/runLinter"
  @[default_target]
  lean_lib IntMProof where
    -- Build and lint the aggregate audit once; it imports the theorem root and all checks.
    globs := #[.one `IntMProof.Axioms]

require mathlib from git
  "https://github.com/leanprover-community/mathlib4" @ "v4.33.1"
