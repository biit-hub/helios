export function optionNames(
  rows: readonly { id: string; name: string }[],
  kind: string,
) {
  const result = new Map<string, string>();
  const groups = new Map<string, { id: string; name: string }[]>();
  for (const row of rows) {
    const key = row.name.trim().toLocaleLowerCase("de");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.id.localeCompare(b.id));
    group.forEach((row, index) =>
      result.set(
        row.id,
        group.length > 1
          ? row.name + " · " + kind + " " + (index + 1)
          : row.name,
      ),
    );
  }
  return result;
}
