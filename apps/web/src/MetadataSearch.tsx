import { Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

type SearchOptions = {
  samplers: string[];
  schedulers: string[];
  steps: number[];
  cfg: number[];
  incomplete: boolean;
};

export default function MetadataSearch({
  active, onSearch, onClear,
}: {
  active: boolean;
  onSearch: (criteria: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SearchOptions>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setFailed(false);
    fetch('/api/search?options=1', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load search options');
        return await response.json() as SearchOptions;
      })
      .then((result) => {
        if (!controller.signal.aborted) setOptions(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [open]);

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
    <details className="metadata-search" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><Search size={16} aria-hidden="true" /> Search ComfyUI metadata</summary>
      <form onSubmit={submit} onReset={onClear}>
        <p>Search PNGs across the library. For Steps and CFG, type a value or choose a suggestion.</p>
        {open && !options && !failed && <p role="status">Finding filter options…</p>}
        {failed && <p role="status">Could not refresh filter options. Reopen search to try again.</p>}
        {options?.incomplete && <p>Some files could not be read. Filter options may be incomplete.</p>}
        <div className="search-fields">
          <label className="search-prompt">Prompt text<input name="prompt" maxLength={2048} placeholder="Positive or negative prompt" /></label>
          <label>Sampler
            <select name="sampler" disabled={!options?.samplers.length}>
              <option value="">Any sampler</option>
              {options?.samplers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>Scheduler
            <select name="scheduler" disabled={!options?.schedulers.length}>
              <option value="">Any scheduler</option>
              {options?.schedulers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>Steps<input name="steps" type="number" min="0" step="1" list="search-step-values" /></label>
          <datalist id="search-step-values">
            {options?.steps?.map((value) => <option key={value} value={value} />)}
          </datalist>
          <label>CFG<input name="cfg" type="number" min="0" step="any" list="search-cfg-values" /></label>
          <datalist id="search-cfg-values">
            {options?.cfg?.map((value) => <option key={value} value={value} />)}
          </datalist>
        </div>
        <div className="search-actions">
          <button type="submit">Search library</button>
          {active && <button type="reset">Clear search</button>}
        </div>
      </form>
    </details>
  );
}
