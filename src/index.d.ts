export interface CompressStats {
  tokensBefore: number;
  tokensAfter: number;
  /** tokensAfter / tokensBefore */
  ratio: number;
  /** 1 - ratio */
  saved: number;
  /** sentence/heading/list units found (0 in clean mode) */
  units: number;
  /** units kept */
  kept: number;
}

export interface CompressOptions {
  /** The question or task the text must still answer. Without it, units are ranked by centrality. */
  query?: string;
  /** Share of the estimated tokens to keep, 0 to 1. Default 0.3 with a query, 0.5 without. */
  ratio?: number;
  /** Absolute token budget; wins over ratio. */
  maxTokens?: number;
  /** 'clean' only normalises and deduplicates; 'extractive' (default) also selects units. */
  mode?: 'clean' | 'extractive';
  /** Keep a heading when anything under it is kept. Default true. */
  keepHeadings?: boolean;
  /** Share of a unit's score lent to its neighbours in the same paragraph. Default 0.35. */
  neighbour?: number;
  /** Boost for the first sentence of each paragraph. Default 0.15. */
  lead?: number;
  /** Marker written where material was dropped inside a paragraph. Default '…'. Empty string for none. */
  gap?: string;
  /** Your own token counter (for example a BPE tokenizer). Default: a prose estimate. */
  tokenizer?: (text: string) => number;
}

export interface CompressResult { text: string; stats: CompressStats }

export function compress(text: string, opts?: CompressOptions): CompressResult;
export function compressContext(input: { context: string; question: string }, opts?: CompressOptions): { context: string; question: string; stats: CompressStats };
export function compressMessages(messages: Array<{ role: string; content: unknown }>, opts?: CompressOptions & { minTokens?: number }): { messages: Array<{ role: string; content: unknown }>; stats: CompressStats };
export function estimateTokens(text: string): number;
export function clean(text: string): string;
export function split(text: string): Array<{ text: string; para: number; head: boolean }>;
export function terms(text: string): string[];
export default compress;
