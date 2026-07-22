import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DatasetRow, Preset } from "@goldsmith/shared";
import { ExampleDialog } from "../src/components/ExampleDialog.tsx";

function dataset(preset: Preset, json_schema: Record<string, unknown>): DatasetRow {
  return {
    id: "d1",
    slug: "ds",
    title: "DS",
    preset,
    json_schema,
    current_version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

const classificationSchema = {
  type: "object",
  properties: { label: { type: "string", enum: ["positive", "negative", "neutral"] } },
  required: ["label"],
  additionalProperties: false,
};

const routingSchema = {
  type: "object",
  properties: {
    routes: {
      type: "array",
      items: { type: "string", enum: ["sql", "rag", "smalltalk"] },
      minItems: 1,
    },
    clarify_ok: { type: "boolean" },
  },
  required: ["routes", "clarify_ok"],
  additionalProperties: false,
};

const extractionSchema = {
  type: "object",
  properties: {
    invoice_number: { type: "string" },
    total_amount: { type: "number" },
  },
  required: ["invoice_number", "total_amount"],
  additionalProperties: true,
};

describe("ExampleDialog — form mode shares the ajv save-gate", () => {
  it("blocks an invalid expected in form mode and does not save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ExampleDialog
        dataset={dataset("classification", classificationSchema)}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    // No label chosen: the seed is {} which fails the required-label gate.
    await user.click(screen.getByRole("button", { name: "Add example" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/does not match the dataset schema/i)).toBeTruthy();

    // Choosing a label clears the gate and the save goes through.
    await user.selectOptions(screen.getByLabelText("label"), "negative");
    await user.click(screen.getByRole("button", { name: "Add example" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toEqual({
      input: {},
      expected: { label: "negative" },
      tags: [],
    });
  });

  it("saves a valid routing example built entirely in form mode", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ExampleDialog
        dataset={dataset("routing", routingSchema)}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByLabelText("sql"));
    await user.click(screen.getByRole("button", { name: "Add example" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toEqual({
      input: {},
      expected: { routes: ["sql"], clarify_ok: false },
      tags: [],
    });
  });
});

describe("ExampleDialog — raw/form toggle", () => {
  it("preserves in-progress form values across a round-trip to raw and back", async () => {
    const user = userEvent.setup();
    render(
      <ExampleDialog
        dataset={dataset("extraction", extractionSchema)}
        onCancel={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await user.type(screen.getByLabelText("invoice_number"), "INV-1");

    // Form -> raw: the JSON reflects the in-progress value.
    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    const raw = screen.getByLabelText("Expected (JSON)") as HTMLTextAreaElement;
    expect(raw.value).toContain("INV-1");

    // Raw -> form: the value survives and the field is repopulated.
    await user.click(screen.getByRole("button", { name: "Edit as form" }));
    expect((screen.getByLabelText("invoice_number") as HTMLInputElement).value).toBe("INV-1");
  });

  it("defaults the custom preset to raw JSON with no form toggle", () => {
    render(
      <ExampleDialog
        dataset={dataset("custom", { type: "object", additionalProperties: true })}
        onCancel={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByLabelText("Expected (JSON)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Raw JSON" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit as form" })).toBeNull();
  });
});
