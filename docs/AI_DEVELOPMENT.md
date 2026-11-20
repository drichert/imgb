# AI-directed development — imgbae

**Established:** 2026-11-19. Accepted source and PRs take precedence over chat history or proposed changes.

## Director's product brief

Build a self-hosted image-first file manager for generation output on local or mounted LAN storage. The gallery must remain responsive; expose ComfyUI metadata; later add searching, metadata operations, conversion, upscaling and explicitly confirmed permanent deletion (without trash). Keep public-internet exposure disabled by default and treat LAN access deliberately.

## Roles

The human development director establishes priorities, aesthetic and product direction, acceptance criteria and consequential approvals. AI contributors select tools according to engineering fitness, implement scoped changes, test and document actual evidence. Neither stack fashion nor the director's coding familiarity is a reason to choose a technology.

## Decision log

### 2026-11-19 — Start with metadata evidence for ComfyUI originals

**Human direction:** Make likely original ComfyUI outputs identifiable in the file manager before building a large metadata index.

**AI implementation proposal:** Inspect native PNG metadata fields with bounded reads. Surface evidence in browse/details APIs and gallery/viewer badges; leave files untouched.

**Rejected assumption:** The presence of workflow metadata proves pixels are unedited, or its absence proves a file is derived. Both inferences are invalid; the interface and docs qualify the claim.

**Alternatives not chosen:** scanning full PNG pixel data; immediately adding SQLite; inferring provenance from filenames; claiming a Derived badge without tracked transformations.

**Verification:** Synthetic parser tests are included. Typecheck, build, visual QA and tests on real network-mounted images must still be verified before accepting this PR.

## Next review

- Compare native ComfyUI PNGs with edited copies that retain or strip metadata.
- Verify responsiveness on a mounted network share.
- Define durable provenance before enabling transformations and permanent deletion.
- Maintain project-specific LAN security and authentication gates for future write operations.

At significant milestones record the human direction, AI contribution, rejected options, tests, evidence and limitations. Do not reconstruct unverified historical authorship.
