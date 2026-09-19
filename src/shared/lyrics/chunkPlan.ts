/** Pure chunk planning shared by extension and standalone client. */

export interface ChunkPlanOptions {
  /** 单请求最多行数，硬上限 */
  maxChunkSize: number;
  /** 同时在途的请求数上限，>=1 */
  concurrency: number;
  /** 拆并发时期望的每块行数，越小并发越充分、请求越多 */
  targetLinesPerChunk?: number;
  /** 低于此行数不额外拆块（拆出来的块太小，请求数反而变多） */
  minParallelLines?: number;
}

export interface ChunkRange {
  start: number;
  length: number;
}

function positiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const floored = Math.floor(value);
  return floored >= 1 ? floored : fallback;
}

/**
 * 把 lineCount 行切成若干区间。
 *
 * 块数同时受两个约束：每块不超过 maxChunkSize（否则模型容易截断/丢标记），
 * 且并发数只限制同时在途的请求数、不限制块数。块大小尽量均衡，
 * 余数分摊到前几块。
 */
export function planChunks(lineCount: number, options: ChunkPlanOptions): ChunkRange[] {
  if (!Number.isFinite(lineCount) || lineCount < 1) return [];
  const total = Math.floor(lineCount);
  const maxChunkSize = positiveInt(options.maxChunkSize, total);
  const concurrency = positiveInt(options.concurrency, 1);
  const minParallelLines = Math.max(0, Math.floor(options.minParallelLines ?? 0) || 0);
  const target = positiveInt(options.targetLinesPerChunk ?? maxChunkSize, maxChunkSize);

  // 每块必须在 maxChunkSize 内；并发只在有余量时进一步细分
  const minimumChunks = Math.ceil(total / maxChunkSize);
  const desiredChunks =
    total < minParallelLines ? minimumChunks : Math.min(concurrency, Math.ceil(total / target));
  const chunkCount = Math.min(total, Math.max(minimumChunks, desiredChunks));

  const baseSize = Math.floor(total / chunkCount);
  let remainder = total % chunkCount;
  const ranges: ChunkRange[] = [];
  let start = 0;
  for (let i = 0; i < chunkCount && start < total; i++) {
    const size = baseSize + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    ranges.push({ start, length: size });
    start += size;
  }
  return ranges;
}
