import { db, type Tag } from './schema';

export async function tagsQuery(word: string | null): Promise<Tag[]> {
  if (!word) return [];
  const item = await db.tags.get(word);
  return item ? [item] : [];
}
