import { validateGST } from "@/lib/qr-code"

const GST_STATE_CODE_ENTRIES = [
  ["01", "Jammu and Kashmir"],
  ["02", "Himachal Pradesh"],
  ["03", "Punjab"],
  ["04", "Chandigarh"],
  ["05", "Uttarakhand"],
  ["06", "Haryana"],
  ["07", "Delhi"],
  ["08", "Rajasthan"],
  ["09", "Uttar Pradesh"],
  ["10", "Bihar"],
  ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"],
  ["14", "Manipur"],
  ["15", "Mizoram"],
  ["16", "Tripura"],
  ["17", "Meghalaya"],
  ["18", "Assam"],
  ["19", "West Bengal"],
  ["20", "Jharkhand"],
  ["21", "Odisha"],
  ["22", "Chhattisgarh"],
  ["23", "Madhya Pradesh"],
  ["24", "Gujarat"],
  ["25", "Daman and Diu"],
  ["26", "Dadra and Nagar Haveli"],
  ["27", "Maharashtra"],
  ["28", "Andhra Pradesh"],
  ["29", "Karnataka"],
  ["30", "Goa"],
  ["31", "Lakshadweep"],
  ["32", "Kerala"],
  ["33", "Tamil Nadu"],
  ["34", "Puducherry"],
  ["35", "Andaman and Nicobar Islands"],
  ["36", "Telangana"],
  ["37", "Andhra Pradesh (New)"],
] as const

export const GST_STATE_CODES = Object.fromEntries(GST_STATE_CODE_ENTRIES) as Record<string, string>

const normalizeStateKey = (value?: string | null) =>
  (value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[().,-]/g, " ")
    .replace(/\s+/g, " ")

const STATE_TO_CODE: Record<string, string> = GST_STATE_CODE_ENTRIES.reduce((acc, [code, state]) => {
  acc[normalizeStateKey(state)] = code
  return acc
}, {} as Record<string, string>)

STATE_TO_CODE[normalizeStateKey("J&K")] = "01"
STATE_TO_CODE[normalizeStateKey("Jammu & Kashmir")] = "01"
STATE_TO_CODE[normalizeStateKey("Orissa")] = "21"
STATE_TO_CODE[normalizeStateKey("Pondicherry")] = "34"
STATE_TO_CODE[normalizeStateKey("Dadra & Nagar Haveli")] = "26"
STATE_TO_CODE[normalizeStateKey("Daman & Diu")] = "25"
STATE_TO_CODE[normalizeStateKey("Andaman & Nicobar Islands")] = "35"
STATE_TO_CODE[normalizeStateKey("GJ")] = "24"

export function getStateCodeForState(state?: string | null): string | null {
  return STATE_TO_CODE[normalizeStateKey(state)] || null
}

export function getStateNameFromCode(code?: string | null): string | null {
  if (!code) return null
  return GST_STATE_CODES[code] || null
}

export function extractStateCodeFromGST(gstNumber?: string | null): string | null {
  const value = (gstNumber || "").trim().toUpperCase()
  if (!validateGST(value)) return null
  return value.slice(0, 2)
}

export function getStateNameFromGST(gstNumber?: string | null): string | null {
  return getStateNameFromCode(extractStateCodeFromGST(gstNumber))
}

export function doesGSTMatchState(gstNumber?: string | null, state?: string | null): boolean {
  const gstCode = extractStateCodeFromGST(gstNumber)
  const stateCode = getStateCodeForState(state)
  if (!gstCode || !stateCode) return true
  return gstCode === stateCode
}

export function isIntraStateSupplier(
  supplier?: { state?: string | null; gstNumber?: string | null } | null,
  homeState = "Gujarat",
): boolean {
  const homeStateCode = getStateCodeForState(homeState)
  if (!homeStateCode) return false

  const supplierCode =
    extractStateCodeFromGST(supplier?.gstNumber) ||
    getStateCodeForState(supplier?.state)

  return supplierCode === homeStateCode
}

export function getTaxModeLabel(isIntraState: boolean, homeState = "Gujarat"): string {
  return isIntraState ? `SGST + CGST (${homeState})` : "IGST (Inter-state)"
}

export function getSupplierTaxContext(
  supplier?: { state?: string | null; gstNumber?: string | null } | null,
  homeState = "Gujarat",
) {
  const selectedStateCode = getStateCodeForState(supplier?.state)
  const selectedStateName =
    getStateNameFromCode(selectedStateCode) ||
    ((supplier?.state || "").trim() || null)
  const gstStateCode = extractStateCodeFromGST(supplier?.gstNumber)
  const gstStateName = getStateNameFromCode(gstStateCode)
  const resolvedStateCode = gstStateCode || selectedStateCode
  const resolvedStateName =
    getStateNameFromCode(resolvedStateCode) ||
    selectedStateName

  const isIntraState = isIntraStateSupplier(supplier, homeState)

  return {
    isIntraState,
    taxModeLabel: getTaxModeLabel(isIntraState, homeState),
    selectedStateCode,
    selectedStateName,
    gstStateCode,
    gstStateName,
    resolvedStateCode,
    resolvedStateName,
  }
}
