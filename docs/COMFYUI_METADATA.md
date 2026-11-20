# ComfyUI image provenance: initial indicator

This implementation detects **likely native ComfyUI PNG output** without modifying images.

## Indicators

- **ComfyUI Original:** both native-looking JSON `prompt` and `workflow` fields were recognized in PNG text metadata.
- **ComfyUI metadata:** only one such field was found.
- **No badge:** neither was recognized, the file is not PNG, or metadata could not be read.

Both statuses are returned by the browse and details APIs as `comfyui: "original" | "metadata" | null`. Gallery tiles and the viewer display badges; the inspector explains the evidence.

**Important:** “Original” is shorthand for *native-looking ComfyUI save metadata*, **not proof that the pixels are unchanged**. Edits, resizing, upscaling or copies can retain both fields. Genuine ComfyUI output can lack metadata when disabled or stripped. A reliable **Derived** designation requires lineage recorded when imgbae transforms a file or other explicit verification. Do not infer it from missing metadata or filename suffixes.

## Implementation and limits

- PNG signature and basic chunk framing are checked.
- Detect `prompt` and `workflow` in standard uncompressed `tEXt`, uncompressed `iTXt`, and animated PNG `comf` chunks.
- Inspect at most a 1 KiB prefix of each metadata chunk; skip large IDAT chunks using file positions, with a 256-chunk scan cap.
- Do not parse entire untrusted graph JSON, inspect pixels, verify PNG CRCs, or decode `zTXt` / compressed `iTXt`.
- Inspect at most eight directory entries concurrently and keep a bounded 2048-entry in-process cache keyed by real path, file size and mtime.
- Status is informational only. It is **not an authorization, authenticity or deletion signal**.

ComfyUI's built-in SaveImage normally writes a `prompt` and optional `extra_pnginfo` fields, commonly `workflow`, into PNG text. See [ComfyUI SaveImage](https://github.com/Comfy-Org/docs/blob/main/built-in-nodes/SaveImage.mdx) and [workflow metadata](https://github.com/Comfy-Org/docs/blob/main/development/api-development/workflow-metadata.mdx).

## Verification

Run `npm ci && npm run typecheck && npm run test && npm run build`.

The parser tests exercise synthetic PNG chunk streams with complete, partial, malformed and missing metadata, including `iTXt` and `comf`. They do not verify full image decoding, NAS performance, or visual results.

For manual QA, test a native ComfyUI SaveImage PNG, a metadata-stripped PNG, an ordinary photograph and an edited PNG that preserves ComfyUI metadata. Confirm the labels communicate *evidence*, not pixel authenticity; check gallery performance over the real mounted share.
