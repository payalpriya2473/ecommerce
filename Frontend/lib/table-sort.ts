export type SortDirection = "asc" | "desc"
export type SortState<K extends string = string> = {
  key: K
  direction: SortDirection
}

type SortableValue = string | number | boolean | Date | null | undefined
type SelectorMap<T, K extends string> = Record<K, (item: T) => SortableValue>

function normalizeValue(value: SortableValue): string | number {
  if (value == null) return ""
  if (value instanceof Date) return value.getTime()
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "number") return Number.isNaN(value) ? 0 : value
  return String(value).trim().toLowerCase()
}

export function compareSortableValues(a: SortableValue, b: SortableValue): number {
  const normalizedA = normalizeValue(a)
  const normalizedB = normalizeValue(b)

  if (typeof normalizedA === "number" && typeof normalizedB === "number") {
    return normalizedA - normalizedB
  }

  return String(normalizedA).localeCompare(String(normalizedB), undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

export function sortCollection<T>(
  items: T[],
  selector: (item: T) => SortableValue,
  direction: SortDirection = "asc",
): T[] {
  const sorted = [...items].sort((left, right) => compareSortableValues(selector(left), selector(right)))
  return direction === "asc" ? sorted : sorted.reverse()
}

export function sortCollectionByKey<T, K extends string>(
  items: T[],
  selectors: SelectorMap<T, K>,
  sortState: SortState<K>,
): T[] {
  return sortCollection(items, selectors[sortState.key], sortState.direction)
}
