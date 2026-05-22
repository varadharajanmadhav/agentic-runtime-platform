import { QdrantClient } from '@qdrant/js-client-rest';

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!client) {
    client = new QdrantClient({
      url: process.env.QDRANT_URL ?? 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY || undefined,
    });
  }
  return client;
}

export const COLLECTIONS = {
  CODE_SYMBOLS: 'code_symbols',
  MEMORY: 'memory_entries',
  DOCUMENTS: 'documents',
} as const;

export async function ensureCollections(): Promise<void> {
  const qdrant = getQdrantClient();
  const { collections } = await qdrant.getCollections();
  const existing = new Set(collections.map(c => c.name));

  const toCreate = [
    { name: COLLECTIONS.CODE_SYMBOLS, size: 768 },
    { name: COLLECTIONS.MEMORY, size: 768 },
    { name: COLLECTIONS.DOCUMENTS, size: 768 },
  ];

  for (const col of toCreate) {
    if (!existing.has(col.name)) {
      await qdrant.createCollection(col.name, {
        vectors: { size: col.size, distance: 'Cosine' },
      });
      console.log(`[Qdrant] Created collection: ${col.name}`);
    }
  }
}
