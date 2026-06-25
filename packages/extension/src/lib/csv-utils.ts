export function csvToJson(csv: string): Record<string, string> {
  const lines = csv.split('\n');
  const obj: Record<string, string> = {};

  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i].split(',');
    if (currentLine.length >= 2) {
      obj[currentLine[1].replace('\r', '')] = currentLine[0];
    }
  }
  return obj;
}

export interface TagEntry {
  word: string;
  tags: string[];
}

export function csvToTags(csv: string): TagEntry[] {
  const lines = csv.split('\n');
  const table: TagEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const entry = lines[i].split(',');
    const word = entry.shift();
    if (!word) continue;
    entry[entry.length - 1] = entry[entry.length - 1]?.replace('\r', '') ?? '';
    table.push({ word, tags: entry.filter((n) => n) });
  }
  return table;
}
