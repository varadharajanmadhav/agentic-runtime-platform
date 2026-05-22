import { embed, embedMany } from 'ai';
import type { ModelRouter } from './router.js';

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  usage?: { tokens: number };
}

export async function embedText(
  text: string,
  router: ModelRouter,
): Promise<EmbeddingResult> {
  const model = router.getEmbeddingModel();
  const { embedding, usage } = await embed({
    model,
    value: text,
  });
  return { text, embedding, usage };
}

export async function embedTexts(
  texts: string[],
  router: ModelRouter,
  batchSize: number = 50,
): Promise<EmbeddingResult[]> {
  const model = router.getEmbeddingModel();
  const results: EmbeddingResult[] = [];

  // Process in batches to avoid overloading the embedding server
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const { embeddings, usage } = await embedMany({
      model,
      values: batch,
    });
    for (let j = 0; j < batch.length; j++) {
      results.push({
        text: batch[j],
        embedding: embeddings[j],
        usage: usage ? { tokens: Math.floor(usage.tokens / batch.length) } : undefined,
      });
    }
  }

  return results;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vectors must have the same length');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
