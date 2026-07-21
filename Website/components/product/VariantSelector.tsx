"use client";
// components/product/VariantSelector.tsx
// Amazon/Flipkart-style storage + color selector for the public product page.
// Drop this inside ProductDetail.tsx, replacing the static price display.

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────

export interface VariantColorImage {
  id: string | number;
  imageUrl: string;
  sortOrder?: number;
  isPrimary?: boolean;
}

export interface VariantColor {
  id: string | number;
  colorName: string;
  colorCode: string;
  images: VariantColorImage[];
}

export interface ProductVariant {
  id: string | number;
  variantLabel: string;
  offerPrice: number;
  nlc: number;
  margin: number;
  incentive: number;
  openingStock: number;
  minimumQty: number;
  colors: VariantColor[];
  images: VariantColorImage[]; // variant-level (no color)
}

interface VariantSelectorProps {
  itemId: string | number;
  /** Called whenever the user picks a storage or color combination. */
  onSelectionChange: (selection: {
    variant: ProductVariant | null;
    color: VariantColor | null;
    price: number;
    images: VariantColorImage[];
  }) => void;
}

// ─── Fetch ────────────────────────────────────────────────────

async function fetchVariants(itemId: string | number): Promise<ProductVariant[]> {
  const res = await fetch(`/api/public/items/${itemId}/variants`, {
    cache: "no-store",
  });
  const json = await res.json();
  return json.success && Array.isArray(json.data) ? json.data : [];
}

// ─── Helpers ─────────────────────────────────────────────────

function formatPrice(n: number) {
  return `Rs ${Math.round(n).toLocaleString("en-IN")}`;
}

function getMrp(variant: ProductVariant): number {
  const base = variant.offerPrice || variant.nlc || 0;
  const m = variant.margin || 0;
  return Math.round(base * (1 + m / 100));
}

function getDiscount(variant: ProductVariant): number {
  const price = variant.offerPrice || 0;
  const mrp = getMrp(variant);
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

// ─── Component ────────────────────────────────────────────────

export function VariantSelector({ itemId, onSelectionChange }: VariantSelectorProps) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVariantId, setSelectedVariantId] = useState<string | number | null>(null);
  const [selectedColorId, setSelectedColorId] = useState<string | number | null>(null);

  // Derived
  const selectedVariant = variants.find((v) => String(v.id) === String(selectedVariantId)) ?? null;
  const availableColors = selectedVariant?.colors ?? [];
  const selectedColor = availableColors.find((c) => String(c.id) === String(selectedColorId)) ?? null;

  // Determine images to show
  const activeImages: VariantColorImage[] =
    selectedColor?.images?.length
      ? selectedColor.images
      : selectedVariant?.images?.length
      ? selectedVariant.images
      : [];

  const activePrice = selectedVariant?.offerPrice ?? 0;
  const activeMrp = selectedVariant ? getMrp(selectedVariant) : 0;
  const activeDiscount = selectedVariant ? getDiscount(selectedVariant) : 0;

  // Load
  useEffect(() => {
    setLoading(true);
    fetchVariants(itemId).then((data) => {
      setVariants(data);
      if (data.length > 0) {
        setSelectedVariantId(data[0].id);
        if (data[0].colors.length > 0) setSelectedColorId(data[0].colors[0].id);
        else setSelectedColorId(null);
      }
      setLoading(false);
    });
  }, [itemId]);

  // Notify parent
  useEffect(() => {
    onSelectionChange({
      variant: selectedVariant,
      color: selectedColor,
      price: activePrice,
      images: activeImages,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariantId, selectedColorId]);

  const handleVariantClick = (v: ProductVariant) => {
    setSelectedVariantId(v.id);
    // auto-select first color of new variant
    if (v.colors.length > 0) setSelectedColorId(v.colors[0].id);
    else setSelectedColorId(null);
  };

  const handleColorClick = (c: VariantColor) => {
    setSelectedColorId(c.id);
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-24" />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 w-24 bg-gray-200 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (variants.length === 0) return null;

  return (
    <div className="space-y-5">
      {/* ── Price ─────────────────────────────────────────────── */}
      {activePrice > 0 && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fee2e2",
            borderRadius: 14,
            padding: "16px 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "'Poppins', sans-serif",
                fontSize: "2.1rem",
                fontWeight: 800,
                color: "#dc2626",
              }}
            >
              {formatPrice(activePrice)}
            </span>
            {activeMrp > activePrice && (
              <span style={{ fontSize: "1rem", color: "#94a3b8", textDecoration: "line-through" }}>
                {formatPrice(activeMrp)}
              </span>
            )}
            {activeDiscount > 0 && (
              <span
                style={{
                  padding: "3px 12px",
                  borderRadius: 50,
                  background: "#16a34a",
                  color: "#fff",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                }}
              >
                {activeDiscount}% off
              </span>
            )}
          </div>
          <p style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 4 }}>
            Inclusive of all taxes
          </p>
          {activePrice > 0 && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 10,
                padding: "7px 13px",
                background: "#fff",
                borderRadius: 8,
                fontSize: "0.8rem",
                color: "#1e293b",
                border: "1px solid #e2e8f0",
              }}
            >
              💳 EMI from{" "}
              <strong style={{ color: "#dc2626" }}>
                {formatPrice(Math.round(activePrice / 24))}/month
              </strong>
              <a href="#" style={{ color: "#2563eb", fontWeight: 600, marginLeft: 6 }}>
                View Plans
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── Storage Selector ──────────────────────────────────── */}
      <div className="space-y-2">
        <p
          style={{
            fontSize: "0.85rem",
            fontWeight: 700,
            color: "#1e293b",
          }}
        >
          Storage / Variant
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {variants.map((v) => {
            const selected = String(v.id) === String(selectedVariantId);
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => handleVariantClick(v)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 10,
                  border: selected ? "2px solid #dc2626" : "2px solid #e2e8f0",
                  background: selected ? "#fef2f2" : "#fff",
                  color: selected ? "#dc2626" : "#475569",
                  fontWeight: selected ? 700 : 500,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  boxShadow: selected ? "0 0 0 3px rgba(220,38,38,0.12)" : "none",
                }}
              >
                {v.variantLabel}
                <span
                  style={{
                    display: "block",
                    fontSize: "0.7rem",
                    color: selected ? "#dc2626" : "#94a3b8",
                    fontWeight: 500,
                    marginTop: 1,
                  }}
                >
                  {formatPrice(v.offerPrice || v.nlc || 0)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Color Selector ────────────────────────────────────── */}
      {availableColors.length > 0 && (
        <div className="space-y-2">
          <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>
            Color:{" "}
            <span style={{ fontWeight: 400, color: "#64748b" }}>
              {selectedColor?.colorName || ""}
            </span>
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {availableColors.map((c) => {
              const selected = String(c.id) === String(selectedColorId);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleColorClick(c)}
                  title={c.colorName}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: c.colorCode,
                    border: selected
                      ? "3px solid #dc2626"
                      : "3px solid #e2e8f0",
                    boxShadow: selected
                      ? "0 0 0 3px rgba(220,38,38,0.2)"
                      : "0 1px 4px rgba(0,0,0,0.12)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    outline: "none",
                    flexShrink: 0,
                  }}
                  aria-label={c.colorName}
                />
              );
            })}
          </div>
          {/* Color name labels */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {availableColors.map((c) => {
              const selected = String(c.id) === String(selectedColorId);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleColorClick(c)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 50,
                    border: selected ? "1.5px solid #dc2626" : "1.5px solid #e2e8f0",
                    background: selected ? "#fef2f2" : "#f8fafc",
                    color: selected ? "#dc2626" : "#475569",
                    fontSize: "0.75rem",
                    fontWeight: selected ? 700 : 400,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {c.colorName}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}