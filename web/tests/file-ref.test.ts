import { describe, expect, it } from "vitest";
import {
  INPUTS_BUCKET,
  buildFileRef,
  extensionOf,
  fileNameFromRef,
  inputObjectPath,
  isFileRefInput,
  parseFileRef,
} from "../src/lib/file-ref.ts";

describe("extensionOf", () => {
  it("lowercases and strips the dot", () => {
    expect(extensionOf("Rahunok.PDF")).toBe("pdf");
    expect(extensionOf("scan.JPEG")).toBe("jpeg");
  });
  it("returns empty string when there is no usable extension", () => {
    expect(extensionOf("noext")).toBe("");
    expect(extensionOf(".gitignore")).toBe(""); // leading dot only
    expect(extensionOf("trailing.")).toBe("");
  });
});

describe("inputObjectPath + buildFileRef (bucket-path convention)", () => {
  it("builds <dataset>/<ulid>.<ext> and the storage:// ref", () => {
    const path = inputObjectPath("docflow-invoices", "01J8ZABCDEFGHJKMNPQRSTVWXY", "pdf");
    expect(path).toBe("docflow-invoices/01J8ZABCDEFGHJKMNPQRSTVWXY.pdf");
    expect(buildFileRef(path)).toBe(
      "storage://goldsmith-inputs/docflow-invoices/01J8ZABCDEFGHJKMNPQRSTVWXY.pdf",
    );
    expect(buildFileRef(path)).toContain(`storage://${INPUTS_BUCKET}/`);
  });
  it("omits the extension when there is none", () => {
    expect(inputObjectPath("ds", "01J", "")).toBe("ds/01J");
  });
});

describe("parseFileRef", () => {
  it("splits a valid ref into bucket + path", () => {
    expect(parseFileRef("storage://goldsmith-inputs/ds/01J.pdf")).toEqual({
      bucket: "goldsmith-inputs",
      path: "ds/01J.pdf",
    });
  });
  it("rejects non-storage or malformed refs", () => {
    expect(parseFileRef("https://example.com/x.pdf")).toBeNull();
    expect(parseFileRef("storage://onlybucket")).toBeNull();
    expect(parseFileRef("storage:///nopath")).toBeNull();
    expect(parseFileRef("storage://bucket/")).toBeNull();
  });
  it("round-trips with buildFileRef", () => {
    const ref = buildFileRef("ds/01J.png");
    expect(parseFileRef(ref)).toEqual({ bucket: "goldsmith-inputs", path: "ds/01J.png" });
  });
});

describe("isFileRefInput", () => {
  it("recognizes a file input and rejects text / non-objects", () => {
    expect(isFileRefInput({ file_ref: "storage://goldsmith-inputs/ds/1.pdf" })).toBe(true);
    expect(isFileRefInput({ text: "hi" })).toBe(false);
    expect(isFileRefInput({ file_ref: 123 })).toBe(false);
    expect(isFileRefInput(null)).toBe(false);
    expect(isFileRefInput(["file_ref"])).toBe(false);
  });
});

describe("fileNameFromRef", () => {
  it("returns the last path segment", () => {
    expect(fileNameFromRef("storage://goldsmith-inputs/docflow/01J.pdf")).toBe("01J.pdf");
  });
  it("returns null for a malformed ref", () => {
    expect(fileNameFromRef("not-a-ref")).toBeNull();
  });
});
