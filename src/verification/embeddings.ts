/**
 * Embedding-based topic relevance check.
 *
 * Uses Xenova's ONNX runtime port of sentence-transformers/all-MiniLM-L6-v2
 * to compute cosine similarity between a response and its expected topic.
 * The model runs entirely in-process — no external API calls.
 *
 * Model: all-MiniLM-L6-v2 (22M params)
 * Threshold: ≥ 0.4 (per v3 design spec)
 * Latency: ~30ms after warm model
 */

// @xenova/transformers ships its own type declarations
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — transformers types vary across patch versions
import { pipeline, env } from "@xenova/transformers";

// Suppress the progress bar and model download messages in server output
env.allowLocalModels = false;
env.useBrowserCache = false;

type FeatureExtractionPipeline = (
  input: string | string[],
  options?: { pooling?: string; normalize?: boolean }
) => Promise<{ data: Float32Array }>;

let _extractor: FeatureExtractionPipeline | null = null;

/**
 * Lazy singleton loader for the embedding pipeline.
 * First call downloads ~23 MB of ONNX weights; subsequent calls reuse the
 * cached model from the local filesystem (~/.cache/huggingface/hub).
 */
async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!_extractor) {
    _extractor = (await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    )) as unknown as FeatureExtractionPipeline;
  }
  return _extractor;
}

/**
 * Compute cosine similarity between two strings using all-MiniLM-L6-v2.
 *
 * Because the pipeline is called with `normalize: true`, both embedding
 * vectors have unit length, so cosine similarity reduces to their dot product.
 *
 * @returns A value in [-1, 1]; semantically similar sentences score ≥ 0.4.
 */
export async function computeCosineSimilarity(
  textA: string,
  textB: string
): Promise<number> {
  const extractor = await getExtractor();

  const [outputA, outputB] = await Promise.all([
    extractor(textA, { pooling: "mean", normalize: true }),
    extractor(textB, { pooling: "mean", normalize: true }),
  ]);

  const a = outputA.data;
  const b = outputB.data;

  // Dot product of two unit-norm vectors = cosine similarity
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }

  return dot;
}

/**
 * Check whether a response is topically relevant to the given topic string.
 * Returns the raw similarity score alongside the boolean result so callers
 * can surface the value in check metadata.
 */
export async function checkTopicRelevance(
  response: string,
  topic: string,
  threshold = 0.4
): Promise<{ passed: boolean; score: number }> {
  const score = await computeCosineSimilarity(response, topic);
  return { passed: score >= threshold, score };
}
