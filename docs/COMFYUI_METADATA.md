# ComfyUI metadata indicator

imgbae shows one **ComfyUI metadata** indicator when it recognizes embedded ComfyUI-style generation metadata in a PNG. The badge is present in the gallery and image viewer; the details panel reports detected / not detected.

## Detection rule

- The backend returns `hasComfyUiMetadata: true` when a recognized PNG `prompt` **or** `workflow` text field contains a JSON-object-looking value.
- It recognizes uncompressed PNG `tEXt`, uncompressed `iTXt`, and the `comf` chunk used in certain animated ComfyUI PNGs.
- No indicator means **not detected**, rather than a claim that the file was never generated or processed in ComfyUI.
- This is **metadata presence**, not proof of original pixels, authorship, unmodified images, or generation history. Files can retain these fields after editing.

The API uses a boolean property in browse and image details responses. The indicator does not alter the file or grant permission for any operation.

## Performance and known limitations

The detector checks PNG signature/chunk structure and inspects at most 1 KiB of each candidate metadata chunk. It skips image pixel data, stops after 256 chunks, and scans no more than eight gallery items concurrently. A process-local cache is bounded to 2048 entries and keyed by real path, file size, and modification time.

It does not decode compressed PNG text, validate complete JSON or CRCs, read every possible custom-node metadata format, or detect ComfyUI fields embedded in non-PNG formats. If metadata changes without size or mtime changing, the process cache can be stale.

## Verification

Run `npm ci && npm run typecheck && npm run test && npm run build`.

Parser tests cover full, partial, absent, malformed and animated-PNG-style metadata using synthetic fixtures. Manual testing with actual ComfyUI SaveImage outputs, a metadata-stripped image, and an edited image retaining metadata remains necessary. Network-share responsiveness is also unverified.

A future metadata inspector can expose exact recognized fields and workflow JSON. A separate provenance system may track transformations, but that should not change the meaning of this badge.
