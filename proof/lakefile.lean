import Lake
open Lake DSL

package intMProof where
  lintDriver := "batteries/runLinter"
  @[default_target]
  lean_lib IntMProof where
    -- Include axiom checks that are intentionally outside the theorem root's imports.
    globs := #[.andSubmodules `IntMProof]

require mathlib from git
  "https://github.com/leanprover-community/mathlib4" @ "v4.33.1"
