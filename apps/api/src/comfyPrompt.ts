type Inputs = Record<string, unknown>;
type PromptNode = { class_type: string; inputs: Inputs };
type Setting = { key: string; label: string; value: string };
type Sampler = {
  id: string;
  type: string;
  positive: string[];
  negative: string[];
  settings: Setting[];
};

const settingLabels = {
  seed: 'Seed',
  noise_seed: 'Noise seed',
  steps: 'Steps',
  cfg: 'CFG',
  sampler_name: 'Sampler',
  scheduler: 'Scheduler',
  denoise: 'Denoise',
  add_noise: 'Add noise',
  start_at_step: 'Start step',
  end_at_step: 'End step',
  return_with_leftover_noise: 'Return leftover noise',
} as const;

function isRecord(value: unknown): value is Inputs {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNode(value: unknown): value is PromptNode {
  return isRecord(value) && typeof value.class_type === 'string' && isRecord(value.inputs);
}

function linkedNode(graph: Inputs, link: unknown): PromptNode | undefined {
  if (!Array.isArray(link) || link.length !== 2 || typeof link[0] !== 'string' ||
      typeof link[1] !== 'number' || !Object.hasOwn(graph, link[0])) return;
  const node = graph[link[0]];
  if (isNode(node)) return node;
}

function resolveText(graph: Inputs, input: unknown, showSource: boolean, depth = 0): string | undefined {
  if (typeof input === 'string') return input;
  const node = linkedNode(graph, input);
  if (!node) return;
  // Keep unknown runtime text from creating a match across two literal fragments.
  const source = showSource ? '[' + node.class_type + ' output]' : '\0';
  if (depth === 12) return source;
  if (node.class_type === 'StringConcatenate') {
    const first = resolveText(graph, node.inputs.string_a, showSource, depth + 1);
    const second = resolveText(graph, node.inputs.string_b, showSource, depth + 1);
    const delimiter = resolveText(graph, node.inputs.delimiter, showSource, depth + 1);
    if (first !== undefined && second !== undefined && delimiter !== undefined) {
      if (first.length + second.length + delimiter.length <= 64 * 1024) return first + delimiter + second;
    }
  }
  return typeof node.inputs.value === 'string' ? node.inputs.value : source;
}

function promptTexts(graph: Inputs, conditioning: unknown, showSource: boolean): string[] {
  const texts = new Set<string>();
  const seen = new Set<PromptNode>();
  const pending = [conditioning];
  while (pending.length && seen.size < 256) {
    const node = linkedNode(graph, pending.pop());
    if (!node || seen.has(node)) continue;
    seen.add(node);
    for (const [key, value] of Object.entries(node.inputs)) {
      if (/^text(?:$|_)/.test(key)) {
        const text = resolveText(graph, value, showSource);
        if (typeof text === 'string' && text.trim()) texts.add(text);
      } else if (/^(?:conditioning|positive|negative)(?:$|_|\d)/.test(key)) {
        pending.push(value);
      }
    }
  }
  return [...texts];
}

export function readComfySamplers(prompt: string, showSource = true): Sampler[] {
  return readComfyPrompt(prompt, showSource).samplers;
}

export function readComfyPrompt(prompt: string, showSource = true) {
  const samplers: Sampler[] = [];
  const nodeTypes = new Set<string>();
  let graph: unknown;
  try {
    graph = JSON.parse(prompt, (_key, value: unknown, context?: { source?: string }) => {
      // ComfyUI seeds can exceed JavaScript's safe integer range.
      if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value) &&
          context?.source && /^-?\d+$/.test(context.source)) return context.source;
      return value;
    });
  } catch {
    return { samplers, nodeTypes };
  }
  if (!isRecord(graph)) return { samplers, nodeTypes };

  for (const [id, node] of Object.entries(graph)) {
    if (!isNode(node)) continue;
    if (node.class_type) nodeTypes.add(node.class_type);
    if (!['KSampler', 'KSamplerAdvanced', 'SamplerCustom', 'SamplerCustomAdvanced'].includes(node.class_type)) continue;
    const { inputs } = node;
    const guider = linkedNode(graph, inputs.guider)?.inputs;
    const settings = {
      ...linkedNode(graph, inputs.noise)?.inputs,
      ...linkedNode(graph, inputs.sampler)?.inputs,
      ...linkedNode(graph, inputs.sigmas)?.inputs,
      ...guider,
      ...inputs,
    };
    samplers.push({
      id,
      type: node.class_type,
      positive: promptTexts(graph, inputs.positive ?? guider?.positive ?? guider?.conditioning, showSource),
      negative: promptTexts(graph, inputs.negative ?? guider?.negative, showSource),
      settings: Object.entries(settingLabels).flatMap(([key, label]) => {
        const input = settings[key];
        const value = linkedNode(graph, input)?.inputs.value ?? input;
        return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? [{ key, label, value: String(value) }] : [];
      }),
    });
  }
  return { samplers, nodeTypes };
}

export function readWorkflowNodeTypes(workflow: string): string[] {
  let graph: unknown;
  try {
    graph = JSON.parse(workflow);
  } catch {
    return [];
  }
  if (!isRecord(graph) || !Array.isArray(graph.nodes)) return [];
  return graph.nodes.flatMap((node: unknown) =>
    isRecord(node) && typeof node.type === 'string' && node.type ? [node.type] : []);
}

export type SamplerFilters = {
  prompt?: string;
  sampler?: string;
  scheduler?: string;
  steps?: string;
  cfg?: string;
};

export function matchesComfySampler(sampler: Sampler, filters: SamplerFilters): boolean {
  const prompt = filters.prompt?.toLowerCase();
  if (prompt && ![...sampler.positive, ...sampler.negative].some(
    (text) => text.toLowerCase().includes(prompt),
  )) return false;

  const matchesSetting = (key: string, filter: string | undefined, numeric = false) =>
    filter === undefined || sampler.settings.some(({ key: settingKey, value }) =>
      settingKey === key && (numeric ? value.trim() !== '' && Number(value) === Number(filter)
        : value.trim().toLowerCase() === filter.toLowerCase()));

  return matchesSetting('sampler_name', filters.sampler)
    && matchesSetting('scheduler', filters.scheduler)
    && matchesSetting('steps', filters.steps, true)
    && matchesSetting('cfg', filters.cfg, true);
}
