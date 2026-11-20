import { useEffect, useMemo, useState } from 'react';

type Metadata = {
  entries: { key: string; value: string; chunk: string }[];
  incomplete: boolean;
};

export default function MetadataViewer({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [failed, setFailed] = useState(false);
  const [field, setField] = useState(0);
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    if (!open || metadata) return;
    const controller = new AbortController();
    setFailed(false);
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Metadata unavailable');
        return await response.json() as Metadata;
      })
      .then((result) => {
        if (!controller.signal.aborted) setMetadata(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [open, metadata, url]);

  const entry = metadata?.entries[field];
  const prettified = useMemo(() => {
    if (!entry || raw || !/^\s*[\[{]/.test(entry.value)) return entry?.value;
    try {
      return JSON.stringify(JSON.parse(entry.value), null, 2);
    } catch {
      return entry.value;
    }
  }, [entry, raw]);

  return (
    <details className="metadata-viewer" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Embedded PNG metadata</summary>
      {open && <>
        {failed && <p role="status">Could not load embedded metadata.</p>}
        {!metadata && !failed && <p role="status">Loading metadata…</p>}
        {metadata?.incomplete && <p>Some metadata could not be read or exceeded the scan limits.</p>}
        {metadata && !metadata.entries.length && <p>No readable PNG text fields found.</p>}
        {entry && <>
          <label>
            Field
            <select value={field} onChange={(event) => setField(Number(event.target.value))}>
              {metadata.entries.map(({ key, chunk }, index) =>
                <option key={index} value={index}>{key} ({chunk})</option>
              )}
            </select>
          </label>
          <div className="metadata-modes" role="group" aria-label="Metadata display">
            <button type="button" aria-pressed={!raw} onClick={() => setRaw(false)}>Prettified</button>
            <button type="button" aria-pressed={raw} onClick={() => setRaw(true)}>Raw</button>
          </div>
          <pre tabIndex={0} aria-label={entry.key + ' metadata value'}>{entry.value === '' ? '(empty value)' : prettified}</pre>
        </>}
      </>}
    </details>
  );
}
