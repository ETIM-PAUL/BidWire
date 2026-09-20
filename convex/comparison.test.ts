import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function signedInAs(t: ReturnType<typeof convexTest>, email: string) {
  const userId = await t.run(async (ctx) => {
    return ctx.db.insert("users", { email });
  });
  return t.withIdentity({ subject: `${userId}|test-session`, issuer: "test" });
}

// Hand-verified fixture (Phase 8 acceptance criterion: "Split-order savings
// calculation is verified by hand on a 3-supplier fixture"):
//
//              Cement (10 bag)   Sand (5 tonne)   Tile (20 sqm)   Delivery   Basket
// Supplier A   $10 -> $100       $50 -> $250      $15 -> $300     $20        $670
// Supplier B   $9  -> $90        $55 -> $275      $14 -> $280     $30        $675
// Supplier C   $12 -> $120       $45 -> $225      $20 -> $400     $15        $760
//
// Best full-coverage single supplier: A at $670 (lowest of 670/675/760).
// Best split (cheapest price per row): cement $9 (B), sand $45 (C), tile $14 (B)
//   items = 10*9 + 5*45 + 20*14 = 90 + 225 + 280 = 595
//   suppliers used: B, C -> delivery = 30 + 15 = 45
//   split total = 595 + 45 = 640
// Split savings = 670 - 640 = 30.
describe("comparisonMatrix (Phase 8 acceptance criterion: 3-supplier split-order fixture)", () => {
  test("computes the hand-verified basket totals and split savings", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "compare-owner1@example.com");
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Split order test",
      jobDescription: "Test",
      location: "Test City",
      currency: "USD",
    });

    const cementId = await t.run(async (ctx) =>
      ctx.db.insert("lineItems", {
        projectId,
        name: "Cement",
        spec: "94lb bag",
        quantity: 10,
        unit: "bag",
        category: "Masonry",
        sortOrder: 0,
      }),
    );
    const sandId = await t.run(async (ctx) =>
      ctx.db.insert("lineItems", {
        projectId,
        name: "Sand",
        spec: "coarse",
        quantity: 5,
        unit: "tonne",
        category: "Masonry",
        sortOrder: 1,
      }),
    );
    const tileId = await t.run(async (ctx) =>
      ctx.db.insert("lineItems", {
        projectId,
        name: "Tile",
        spec: "ceramic",
        quantity: 20,
        unit: "sqm",
        category: "Tiling",
        sortOrder: 2,
      }),
    );

    async function seedSupplierQuote(
      name: string,
      prices: { cement: number; sand: number; tile: number },
      deliveryCost: number,
    ) {
      const supplierId = await t.run(async (ctx) =>
        ctx.db.insert("suppliers", {
          projectId,
          name,
          source: "demo",
          categories: ["Masonry", "Tiling"],
          status: "replied",
        }),
      );
      const messageId = await t.run(async (ctx) =>
        ctx.db.insert("messages", {
          projectId,
          supplierId,
          providerMessageId: `msg-${name}`,
          direction: "in",
          subject: "quote",
          bodyText: "quote",
          attachmentIds: [],
          receivedAt: Date.now(),
          processed: true,
        }),
      );
      const quoteId = await t.run(async (ctx) =>
        ctx.db.insert("quotes", {
          projectId,
          supplierId,
          messageId,
          currency: "USD",
          confidence: 0.9,
          deliveryCost,
          version: 1,
        }),
      );
      await t.run(async (ctx) => {
        await ctx.db.insert("quoteLines", {
          quoteId,
          projectId,
          supplierId,
          lineItemId: cementId,
          rawDescription: "cement",
          unitPrice: prices.cement,
          unit: "bag",
          quantity: 10,
          total: prices.cement * 10,
          matchConfidence: 0.9,
        });
        await ctx.db.insert("quoteLines", {
          quoteId,
          projectId,
          supplierId,
          lineItemId: sandId,
          rawDescription: "sand",
          unitPrice: prices.sand,
          unit: "tonne",
          quantity: 5,
          total: prices.sand * 5,
          matchConfidence: 0.9,
        });
        await ctx.db.insert("quoteLines", {
          quoteId,
          projectId,
          supplierId,
          lineItemId: tileId,
          rawDescription: "tile",
          unitPrice: prices.tile,
          unit: "sqm",
          quantity: 20,
          total: prices.tile * 20,
          matchConfidence: 0.9,
        });
      });
      return supplierId;
    }

    const supplierA = await seedSupplierQuote(
      "Supplier A",
      { cement: 10, sand: 50, tile: 15 },
      20,
    );
    const supplierB = await seedSupplierQuote(
      "Supplier B",
      { cement: 9, sand: 55, tile: 14 },
      30,
    );
    await seedSupplierQuote("Supplier C", { cement: 12, sand: 45, tile: 20 }, 15);

    const result = await asOwner.query(api.comparison.comparisonMatrix, { projectId });

    expect(result.columns).toHaveLength(3);
    const basketBySupplier = Object.fromEntries(
      result.columns.map((c) => [c.supplierName, c.basketTotal]),
    );
    expect(basketBySupplier["Supplier A"]).toBeCloseTo(670);
    expect(basketBySupplier["Supplier B"]).toBeCloseTo(675);
    expect(basketBySupplier["Supplier C"]).toBeCloseTo(760);
    for (const col of result.columns) {
      expect(col.coveragePercent).toBe(100);
    }

    expect(result.bestFullCoverageSupplierId).toBe(supplierA);
    expect(result.bestFullCoverageBasketTotal).toBeCloseTo(670);
    expect(result.bestSplitBasketTotal).toBeCloseTo(640);
    expect(result.splitSavings).toBeCloseTo(30);

    const cementRow = result.rows.find((r) => r.name === "Cement")!;
    expect(cementRow.bestPrice).toBeCloseTo(9);
    expect(cementRow.bestSupplierId).toBe(supplierB);
    expect(cementRow.worstPrice).toBeCloseTo(12);
  });

  test("a partial-coverage supplier is never picked as the best full-coverage basket, even if cheaper", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "compare-owner2@example.com");
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Partial coverage test",
      jobDescription: "Test",
      location: "Test City",
      currency: "USD",
    });
    const cementId = await t.run(async (ctx) =>
      ctx.db.insert("lineItems", {
        projectId,
        name: "Cement",
        spec: "bag",
        quantity: 10,
        unit: "bag",
        category: "Masonry",
        sortOrder: 0,
      }),
    );
    const sandId = await t.run(async (ctx) =>
      ctx.db.insert("lineItems", {
        projectId,
        name: "Sand",
        spec: "coarse",
        quantity: 5,
        unit: "tonne",
        category: "Masonry",
        sortOrder: 1,
      }),
    );

    // Full supplier: covers both items, higher total.
    const fullSupplierId = await t.run(async (ctx) =>
      ctx.db.insert("suppliers", {
        projectId,
        name: "Full Supplier",
        source: "demo",
        categories: ["Masonry"],
        status: "replied",
      }),
    );
    const fullMessageId = await t.run(async (ctx) =>
      ctx.db.insert("messages", {
        projectId,
        supplierId: fullSupplierId,
        providerMessageId: "msg-full",
        direction: "in",
        subject: "quote",
        bodyText: "quote",
        attachmentIds: [],
        receivedAt: Date.now(),
        processed: true,
      }),
    );
    const fullQuoteId = await t.run(async (ctx) =>
      ctx.db.insert("quotes", {
        projectId,
        supplierId: fullSupplierId,
        messageId: fullMessageId,
        currency: "USD",
        confidence: 0.9,
        version: 1,
      }),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("quoteLines", {
        quoteId: fullQuoteId,
        projectId,
        supplierId: fullSupplierId,
        lineItemId: cementId,
        rawDescription: "cement",
        unitPrice: 20,
        unit: "bag",
        quantity: 10,
        total: 200,
        matchConfidence: 0.9,
      });
      await ctx.db.insert("quoteLines", {
        quoteId: fullQuoteId,
        projectId,
        supplierId: fullSupplierId,
        lineItemId: sandId,
        rawDescription: "sand",
        unitPrice: 20,
        unit: "tonne",
        quantity: 5,
        total: 100,
        matchConfidence: 0.9,
      });
    });

    // Partial supplier: only cement, very cheap - much lower raw basket
    // total, but must NOT be treated as the "best full-coverage" option.
    const partialSupplierId = await t.run(async (ctx) =>
      ctx.db.insert("suppliers", {
        projectId,
        name: "Partial Supplier",
        source: "demo",
        categories: ["Masonry"],
        status: "replied",
      }),
    );
    const partialMessageId = await t.run(async (ctx) =>
      ctx.db.insert("messages", {
        projectId,
        supplierId: partialSupplierId,
        providerMessageId: "msg-partial",
        direction: "in",
        subject: "quote",
        bodyText: "quote",
        attachmentIds: [],
        receivedAt: Date.now(),
        processed: true,
      }),
    );
    const partialQuoteId = await t.run(async (ctx) =>
      ctx.db.insert("quotes", {
        projectId,
        supplierId: partialSupplierId,
        messageId: partialMessageId,
        currency: "USD",
        confidence: 0.9,
        version: 1,
      }),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("quoteLines", {
        quoteId: partialQuoteId,
        projectId,
        supplierId: partialSupplierId,
        lineItemId: cementId,
        rawDescription: "cement only",
        unitPrice: 5,
        unit: "bag",
        quantity: 10,
        total: 50,
        matchConfidence: 0.9,
      });
    });

    const result = await asOwner.query(api.comparison.comparisonMatrix, { projectId });
    const partialCol = result.columns.find((c) => c.supplierName === "Partial Supplier")!;
    expect(partialCol.coveragePercent).toBe(50);
    expect(partialCol.missingLineItemIds).toEqual([sandId]);
    expect(partialCol.basketTotal).toBeCloseTo(50); // cheapest raw total...

    // ...but the full-coverage pick must still be the actually-viable one.
    expect(result.bestFullCoverageSupplierId).toBe(fullSupplierId);
    expect(result.bestFullCoverageBasketTotal).toBeCloseTo(300);
  });

  test("matches a supplier's scraped list price to the right row as a published-price reference", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "compare-owner3@example.com");
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Published price test",
      jobDescription: "Test",
      location: "Test City",
      currency: "USD",
    });
    const cementId = await t.run(async (ctx) =>
      ctx.db.insert("lineItems", {
        projectId,
        name: "Portland cement",
        spec: "94lb bag",
        quantity: 10,
        unit: "bag",
        category: "Masonry",
        sortOrder: 0,
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("suppliers", {
        projectId,
        name: "Scraped Supplier",
        source: "firecrawl",
        categories: ["Masonry"],
        status: "candidate",
        listPrices: [{ itemHint: "Portland cement 94lb", price: 8.5, unit: "bag" }],
      }),
    );
    const quotingSupplierId = await t.run(async (ctx) =>
      ctx.db.insert("suppliers", {
        projectId,
        name: "Quoting Supplier",
        source: "demo",
        categories: ["Masonry"],
        status: "replied",
      }),
    );
    const messageId = await t.run(async (ctx) =>
      ctx.db.insert("messages", {
        projectId,
        supplierId: quotingSupplierId,
        providerMessageId: "msg-1",
        direction: "in",
        subject: "quote",
        bodyText: "quote",
        attachmentIds: [],
        receivedAt: Date.now(),
        processed: true,
      }),
    );
    const quoteId = await t.run(async (ctx) =>
      ctx.db.insert("quotes", {
        projectId,
        supplierId: quotingSupplierId,
        messageId,
        currency: "USD",
        confidence: 0.9,
        version: 1,
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("quoteLines", {
        quoteId,
        projectId,
        supplierId: quotingSupplierId,
        lineItemId: cementId,
        rawDescription: "cement",
        unitPrice: 11,
        unit: "bag",
        quantity: 10,
        total: 110,
        matchConfidence: 0.9,
      }),
    );

    const result = await asOwner.query(api.comparison.comparisonMatrix, { projectId });
    expect(result.rows[0].publishedPrice).toBeCloseTo(8.5);
  });
});

describe("comparisonMatrix ownership", () => {
  test("a different user cannot read another project's comparison matrix", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "compare-owner4@example.com");
    const asOther = await signedInAs(t, "compare-other@example.com");
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Ownership test",
      jobDescription: "Test",
      location: "Test City",
      currency: "USD",
    });
    await expect(
      asOther.query(api.comparison.comparisonMatrix, { projectId }),
    ).rejects.toThrow();
  });
});
