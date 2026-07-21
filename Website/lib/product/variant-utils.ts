import type { Item } from "@/lib/api/publicApi";

type ItemColor = NonNullable<Item["colors"]>[number];

function cleanColorName(value?: string | null) {
  return (value ?? "").trim();
}

export function normalizeColorName(value?: string | null) {
  return cleanColorName(value).toLowerCase();
}

export function buildVariantKey(
  itemId: string | number,
  colorId?: string | number | null
) {
  return colorId != null && String(colorId) !== ""
    ? `${String(itemId)}::${String(colorId)}`
    : String(itemId);
}

export function getDisplayColorName(value?: string | null) {
  const colorName = cleanColorName(value);
  return colorName && normalizeColorName(colorName) !== "default" ? colorName : null;
}

export function resolveItemColor(
  item: Pick<Item, "primaryImage" | "colors">,
  preferredImage?: string | null
): ItemColor | undefined {
  const colors = item.colors ?? [];

  return (
    colors.find((color) => color.id != null && color.primaryImage === item.primaryImage) ??
    (preferredImage
      ? colors.find((color) => color.id != null && color.primaryImage === preferredImage)
      : undefined) ??
    colors.find((color) => color.id != null) ??
    undefined
  );
}

export function getResolvedSelection(
  item: Pick<Item, "id" | "primaryImage" | "colors">,
  preferredImage?: string | null
) {
  const matchedColor = resolveItemColor(item, preferredImage);
  const colorId = matchedColor?.id ?? null;
  const colorName = getDisplayColorName(matchedColor?.colorName);
  const primaryImage =
    matchedColor?.primaryImage ?? preferredImage ?? item.primaryImage ?? null;

  return {
    colorId,
    colorName,
    primaryImage,
    wishlistId: buildVariantKey(item.id, colorId),
  };
}

export function buildProductDetailUrl(input: {
  itemId: string | number;
  colorId?: string | number | null;
  colorName?: string | null;
}) {
  const params = new URLSearchParams({ id: String(input.itemId) });

  if (input.colorId != null && String(input.colorId) !== "") {
    params.set("colorId", String(input.colorId));
  }

  const colorName = getDisplayColorName(input.colorName);
  if (colorName) {
    params.set("color", colorName);
  }

  return `/product?${params.toString()}`;
}

export function buildProductDetailUrlForItem(
  item: Pick<Item, "id" | "primaryImage" | "colors">,
  preferredImage?: string | null
) {
  const selection = getResolvedSelection(item, preferredImage);
  return buildProductDetailUrl({
    itemId: item.id,
    colorId: selection.colorId,
    colorName: selection.colorName,
  });
}

export function buildProductDetailUrlForStoredItem(input: {
  id: string | number;
  itemId?: string | number;
  colorId?: string | number | null;
  colorName?: string | null;
}) {
  return buildProductDetailUrl({
    itemId: input.itemId ?? input.id,
    colorId: input.colorId,
    colorName: input.colorName,
  });
}
