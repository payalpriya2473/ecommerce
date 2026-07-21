// QR Code generation utility
export async function generatePaymentQR(data: {
  upiId: string
  name: string
  amount?: number
}): Promise<string> {
  // Generate UPI payment string
  const upiString = `upi://pay?pa=${data.upiId}&pn=${encodeURIComponent(data.name)}${data.amount ? `&am=${data.amount}` : ""}&cu=INR`

  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="white"/>
      <text x="100" y="100" text-anchor="middle" font-size="12" fill="black">QR Code: ${data.upiId}</text>
    </svg>
  `)}`
}

export function validateGST(gst: string): boolean {
  if (!gst) return false
  const value = gst.trim().toUpperCase()
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
  return gstRegex.test(value)
}

export function validatePAN(pan: string): boolean {
  if (!pan) return false
  const value = pan.trim().toUpperCase()
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/
  return panRegex.test(value)
}

export function validateIFSC(ifsc: string): boolean {
  if (!ifsc) return false
  const value = ifsc.trim().toUpperCase()
  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/
  return ifscRegex.test(value)
}


export function validateAadhaar(aadhaar: string): boolean {
  const aadhaarRegex = /^[0-9]{12}$/
  return aadhaarRegex.test(aadhaar.replace(/\s/g, ""))
}
