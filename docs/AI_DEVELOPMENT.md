# AI-directed development — imgbae

**Established:** 2026-11-19. Accepted source and PRs take precedence over chat history or proposed changes.

## Director's product brief

Build a self-hosted image-first file manager for generation output on local or mounted LAN storage. The gallery must remain responsive; expose ComfyUI metadata; later add searching, metadata operations, conversion, upscaling and explicitly confirmed permanent deletion (without trash). Keep public-internet exposure disabled by default and treat LAN access deliberately.

## Roles

The human development director establishes priorities, aesthetic and product direction, acceptance criteria and consequential approvals. AI contributors select tools according to engineering fitness, implement scoped changes, test and document actual evidence. Neither stack fashion nor the director's coding familiarity is a reason to choose a technology.

## Decision log

### 2026-11-19 — Detect ComfyUI metadata presence, not originality

**Human direction:** Identify files carrying recognizable ComfyUI metadata in the gallery and viewer. An initial emphasis on “original” was explicitly revised: the metadata signal matters, not pixel originality.

**AI implementation proposal:** Inspect native PNG metadata fields with bounded reads. Expose one boolean metadata-presence signal in browse/details APIs and one consistently labeled gallery/viewer badge; leave files untouched.

**Course correction:** The director rejected the original-versus-derived classification as irrelevant to this feature. ComfyUI metadata may survive edits, and its absence does not prove a file was never produced by ComfyUI. The UI must display “ComfyUI metadata” only when recognized, without inferring image history.

**Alternatives not chosen:** scanning full PNG pixel data; immediately adding SQLite; inferring metadata from filenames; assigning original/derived classifications without tracked transformations.

**Verification:** Synthetic parser tests are included. Typecheck, build, visual QA and tests on real network-mounted images must still be verified before accepting this PR.

## Next review

- Check images with either a prompt or workflow field, edited copies retaining metadata, and metadata-stripped PNGs.
- Verify responsiveness on a mounted network share.
- Define durable provenance before enabling transformations and permanent deletion.
- Maintain project-specific LAN security and authentication gates for future write operations.

At significant milestones record the human direction, AI contribution, rejected options, tests, evidence and limitations. Do not reconstruct unverified historical authorship.
