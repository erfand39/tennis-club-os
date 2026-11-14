import type { ResourceSearchItem } from './resource-fields';

export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .slice(0, 100)
    .toLowerCase()
    .replaceAll('ي', 'ی')
    .replaceAll('ك', 'ک')
    .replace(/\s+/g, ' ');
}

const statusOrder = { active: 0, inactive: 1, archived: 2 } as const;
const statusLabels: Record<ResourceSearchItem['status'], string> = {
  active: 'فعال',
  inactive: 'غیرفعال',
  archived: 'آرشیوشده',
};

export function filterAndRankResources(
  items: readonly ResourceSearchItem[],
  rawQuery: string,
  limit = 12,
): ResourceSearchItem[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];
  return items
    .map(item => {
      const normalizedName = normalizeSearchText(item.name);
      const matchIndex = normalizedName.indexOf(query);
      return { item, matchIndex };
    })
    .filter(entry => entry.matchIndex !== -1)
    .sort((a, b) => {
      const statusDiff = statusOrder[a.item.status] - statusOrder[b.item.status];
      if (statusDiff !== 0) return statusDiff;
      const prefixDiff = (a.matchIndex === 0 ? 0 : 1) - (b.matchIndex === 0 ? 0 : 1);
      if (prefixDiff !== 0) return prefixDiff;
      if (a.matchIndex !== b.matchIndex) return a.matchIndex - b.matchIndex;
      const nameDiff = a.item.name.localeCompare(b.item.name, 'fa');
      if (nameDiff !== 0) return nameDiff;
      return a.item.kind.localeCompare(b.item.kind) || a.item.id.localeCompare(b.item.id);
    })
    .slice(0, Math.max(1, limit))
    .map(entry => entry.item);
}

export function formatSearchMeta(
  item: ResourceSearchItem,
  labels: Record<ResourceSearchItem['status'], string> = statusLabels,
): string {
  return [
    item.subtitle,
    item.branch_names.join('، '),
    item.status !== 'active' ? labels[item.status] : '',
  ].filter(Boolean).join(' · ');
}
