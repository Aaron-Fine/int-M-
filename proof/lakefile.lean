import Lake
open Lake DSL

package intMProof where
  lintDriver := "batteries/runLinter"
  lintDriverArgs := #["IntMProof.Axioms"]
  @[default_target]
  lean_lib IntMProof where
    -- Keep root submodules addressable; build every check and lint the aggregate once.
    globs := #[.one `IntMProof, .one `IntMProof.Axioms]

require mathlib from git
  "https://github.com/leanprover-community/mathlib4" @ "v4.33.1"
