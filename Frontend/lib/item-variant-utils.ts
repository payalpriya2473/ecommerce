export const sid = (value: unknown) => String(value ?? "");

export const normalizeVariantLabel = (value: unknown) => String(value ?? "").trim();

type VariantLike = {
  id?: string | number | null;
  variant?: string | null;
  openingStock?: number | null;
  minimumQty?: number | null;
  maxMOPPercent?: number | null;
  offerPrice?: number | null;
  stockValue?: number | null;
  margin?: number | null;
  incentive?: number | null;
  maxMOPAmount?: number | null;
  nlc?: number | null;
};

type ItemLike = VariantLike & {
  id?: string | number | null;
  variants?: VariantLike[] | null;
};

export function getItemVariants(item: ItemLike | null | undefined): VariantLike[] {
  if (!item) return [];

  const nested = Array.isArray(item.variants)
    ? item.variants.filter((variant) => normalizeVariantLabel(variant?.variant))
    : [];

  if (nested.length > 0) return nested;

  const flatVariant = normalizeVariantLabel(item.variant);
  if (!flatVariant) return [];

  return [
    {
      id: sid(item.id || flatVariant),
      variant: flatVariant,
      openingStock: item.openingStock ?? 0,
      minimumQty: item.minimumQty ?? 0,
      maxMOPPercent: item.maxMOPPercent ?? 0,
      offerPrice: item.offerPrice ?? 0,
      stockValue: item.stockValue ?? 0,
      margin: item.margin ?? 0,
      incentive: item.incentive ?? 0,
      maxMOPAmount: item.maxMOPAmount ?? 0,
      nlc: item.nlc ?? 0,
    },
  ];
}

export function hasItemVariants(item: ItemLike | null | undefined) {
  return getItemVariants(item).length > 0;
}

export function findItemVariant(
  item: ItemLike | null | undefined,
  variantId?: unknown,
  variantLabel?: unknown,
) {
  const variants = getItemVariants(item);
  const targetId = sid(variantId);
  const targetLabel = normalizeVariantLabel(variantLabel).toLowerCase();

  return (
    variants.find((variant) => targetId && sid(variant.id) === targetId) ||
    variants.find((variant) => targetLabel && normalizeVariantLabel(variant.variant).toLowerCase() === targetLabel) ||
    null
  );
}

export function getVariantKey(variantId?: unknown, variantLabel?: unknown) {
  const targetId = sid(variantId);
  if (targetId) return targetId;
  return normalizeVariantLabel(variantLabel).toLowerCase();
}

export function getItemVariantLineKey(itemId?: unknown, variantId?: unknown, variantLabel?: unknown) {
  const resolvedItemId = sid(itemId);
  if (!resolvedItemId) return "";
  return `${resolvedItemId}::${getVariantKey(variantId, variantLabel)}`;
}
