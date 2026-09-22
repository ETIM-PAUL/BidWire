export type RfqItem = {
  name: string;
  spec: string;
  quantity: number;
  unit: string;
};

export function buildRfqBody(args: {
  projectName: string;
  location: string;
  supplierName: string;
  replyBy: string;
  items: RfqItem[];
}): string {
  const rows = args.items
    .map((item) => `- ${item.quantity} ${item.unit}: ${item.name} — ${item.spec}`)
    .join("\n");

  return [
    `Dear ${args.supplierName},`,
    "",
    `Please provide a quotation for the following materials for ${args.projectName}. Delivery location: ${args.location}.`,
    "",
    "Items required:",
    rows,
    "",
    "For each item, please provide:",
    "- Unit price",
    "- Available quantity / confirmation of quantity",
    "- Lead time",
    "- Delivery cost",
    "",
    `Please reply by ${args.replyBy}.`,
    "",
    `Kind regards,\nBidWire — ${args.projectName}`,
  ].join("\n");
}

export type AwardCandidate = { supplierId: string; unitPrice: number };

export function selectAwardCandidate(
  mode: "single" | "split",
  supplierId: string | undefined,
  candidates: AwardCandidate[],
): AwardCandidate | undefined {
  if (mode === "single") {
    return candidates.find((candidate) => candidate.supplierId === supplierId);
  }
  return [...candidates].sort((a, b) => a.unitPrice - b.unitPrice)[0];
}

export function validateAwardQuantity(quantity: number): string | null {
  if (!Number.isFinite(quantity) || quantity < 0) return "Quantity must be a finite number greater than or equal to zero.";
  return null;
}
