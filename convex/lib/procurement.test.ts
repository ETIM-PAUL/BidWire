import { describe, expect, it } from "vitest";
import { buildRfqBody, selectAwardCandidate, validateAwardQuantity } from "./procurement";

describe("procurement safeguards", () => {
  it("builds an RFQ containing every requested item", () => {
    const body = buildRfqBody({ projectName: "Bakery fit-out", location: "Lagos", supplierName: "Metro Hardware", replyBy: "Friday, September 25, 2026", items: [{ name: "Oven", spec: "Electric deck oven", quantity: 2, unit: "piece" }, { name: "Mixer", spec: "40L planetary mixer", quantity: 1, unit: "piece" }] });
    expect(body).toContain("2 piece: Oven — Electric deck oven");
    expect(body).toContain("1 piece: Mixer — 40L planetary mixer");
  });
  it("never chooses another supplier for a single-supplier award", () => {
    expect(selectAwardCandidate("single", "supplier-b", [{ supplierId: "supplier-a", unitPrice: 10 }, { supplierId: "supplier-b", unitPrice: 20 }])).toEqual({ supplierId: "supplier-b", unitPrice: 20 });
  });
  it("chooses the lowest available price for a split award", () => {
    expect(selectAwardCandidate("split", undefined, [{ supplierId: "supplier-a", unitPrice: 30 }, { supplierId: "supplier-b", unitPrice: 20 }])).toEqual({ supplierId: "supplier-b", unitPrice: 20 });
  });
  it("rejects invalid award quantities", () => {
    expect(validateAwardQuantity(-1)).toBeTruthy();
    expect(validateAwardQuantity(Number.NaN)).toBeTruthy();
    expect(validateAwardQuantity(2)).toBeNull();
  });
});
