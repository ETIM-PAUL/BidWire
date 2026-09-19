import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import { extractAttachmentText } from "./quoteExtraction";

describe("extractAttachmentText (Phase 7 fixture: PDF quote)", () => {
  test("extracts readable text from a real PDF attachment", async () => {
    const pdfBytes = readFileSync(join(__dirname, "__fixtures__/sample-quote.pdf"));
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const fakeStorage = {
      get: async (_id: Id<"_storage">) => blob,
    };

    const text = await extractAttachmentText(
      { storage: fakeStorage },
      ["fake-storage-id" as Id<"_storage">],
    );

    expect(text).toContain("Portland cement");
    expect(text).toContain("9500 per bag");
    expect(text).toContain("Sand");
  });

  test("skips non-PDF attachments without throwing", async () => {
    const blob = new Blob(["not a pdf"], { type: "text/plain" });
    const fakeStorage = { get: async (_id: Id<"_storage">) => blob };

    const text = await extractAttachmentText(
      { storage: fakeStorage },
      ["fake-storage-id" as Id<"_storage">],
    );
    expect(text).toBe("");
  });

  test("a missing attachment doesn't throw", async () => {
    const fakeStorage = { get: async (_id: Id<"_storage">) => null };
    const text = await extractAttachmentText(
      { storage: fakeStorage },
      ["missing-id" as Id<"_storage">],
    );
    expect(text).toBe("");
  });
});
