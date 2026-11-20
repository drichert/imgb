import { Search } from 'lucide-react';
import type { FormEvent } from 'react';

export default function MetadataSearch({
  active, onSearch, onClear,
}: {
  active: boolean;
  onSearch: (criteria: string) => void;
  onClear: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const criteria = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === 'string' && value.trim()) criteria.set(key, value.trim());
    }
    if (criteria.size) onSearch(criteria.toString());
    else onClear();
  }

  return (
    <details className="metadata-search">
      <summary><Search size={16} aria-hidden="true" /> Search ComfyUI metadata</summary>
      <form onSubmit={submit} onReset={onClear}>
        <p>Search PNGs across the library. Enter sampler and scheduler names as shown in ComfyUI.</p>
        <div className="search-fields">
          <label className="search-prompt">Prompt text<input name="prompt" maxLength={2048} placeholder="Positive or negative prompt" /></label>
          <label>Sampler<input name="sampler" maxLength={128} placeholder="e.g. euler" /></label>
          <label>Scheduler<input name="scheduler" maxLength={128} placeholder="e.g. normal" /></label>
          <label>Steps<input name="steps" type="number" min="0" step="1" /></label>
          <label>CFG<input name="cfg" type="number" min="0" step="any" /></label>
        </div>
        <div className="search-actions">
          <button type="submit">Search library</button>
          {active && <button type="reset">Clear search</button>}
        </div>
      </form>
    </details>
  );
}
