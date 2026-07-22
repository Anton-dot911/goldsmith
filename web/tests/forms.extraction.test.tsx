import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExtractionForm } from "../src/components/forms/ExtractionForm.tsx";
import type { JsonSchema } from "../src/lib/preset-form.ts";

// A dataset schema exercising every branch of the schema-driven renderer:
// required primitives, a date, a nullable field, and an array-of-objects.
const schema: JsonSchema = {
  type: "object",
  properties: {
    invoice_number: { type: "string" },
    total_amount: { type: "number" },
    issue_date: { type: "string", format: "date" },
    note: { type: ["string", "null"] },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: { sku: { type: "string" }, qty: { type: "number" } },
      },
    },
  },
  required: ["invoice_number", "total_amount"],
};

// Controlled harness: owns the `expected` object like the dialog does, and hands
// the current value to onSave when the button is clicked.
function Harness({
  initial,
  onSave,
}: {
  initial: Record<string, unknown>;
  onSave: (value: Record<string, unknown>) => void;
}) {
  const [value, setValue] = useState<Record<string, unknown>>(initial);
  return (
    <>
      <ExtractionForm schema={schema} value={value} onChange={setValue} />
      <button onClick={() => onSave(value)}>save</button>
    </>
  );
}

describe("ExtractionForm — schema in, fields out", () => {
  it("renders an input per schema property plus the null toggle and row controls", () => {
    render(<Harness initial={{}} onSave={vi.fn()} />);
    expect(screen.getByLabelText("invoice_number")).toBeTruthy();
    expect(screen.getByLabelText("total_amount")).toBeTruthy();
    expect(screen.getByLabelText("issue_date")).toBeTruthy();
    // Nullable field draws an explicit null toggle.
    expect(screen.getByLabelText("note null")).toBeTruthy();
    // Array-of-objects draws an add control.
    expect(screen.getByRole("button", { name: "add lines" })).toBeTruthy();
  });
});

describe("ExtractionForm — fill, save, value shape", () => {
  it("emits only the touched keys (untouched optionals stay absent)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness initial={{}} onSave={onSave} />);

    await user.type(screen.getByLabelText("invoice_number"), "INV-1");
    await user.type(screen.getByLabelText("total_amount"), "42.5");
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(onSave).toHaveBeenLastCalledWith({ invoice_number: "INV-1", total_amount: 42.5 });
  });

  it("round-trips an existing value deep-equal when saved unchanged", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const initial = {
      invoice_number: "INV-9",
      total_amount: 100,
      issue_date: "2026-01-02",
      lines: [{ sku: "A", qty: 2 }],
    };
    render(<Harness initial={initial} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "save" }));

    const saved = onSave.mock.calls.at(-1)?.[0];
    expect(saved).toEqual(initial);
  });
});

describe("ExtractionForm — array row add/remove", () => {
  it("adds a row, fills it, and can remove rows", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness initial={{}} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "add lines" }));
    await user.type(screen.getByLabelText("lines.0.sku"), "X");
    const qty = screen.getByLabelText("lines.0.qty");
    await user.clear(qty);
    await user.type(qty, "3");
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(onSave).toHaveBeenLastCalledWith({ lines: [{ sku: "X", qty: 3 }] });

    // Add a second row, then remove the first.
    await user.click(screen.getByRole("button", { name: "add lines" }));
    await user.type(screen.getByLabelText("lines.1.sku"), "Y");
    await user.click(screen.getByRole("button", { name: "remove lines.0" }));
    await user.click(screen.getByRole("button", { name: "save" }));

    const saved = onSave.mock.calls.at(-1)?.[0] as { lines: unknown[] };
    expect(saved.lines).toEqual([{ sku: "Y", qty: 0 }]);
  });
});

describe("ExtractionForm — null toggle", () => {
  it("produces an explicit null, not a missing key and not an empty string", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness initial={{}} onSave={onSave} />);

    await user.click(screen.getByLabelText("note null"));
    await user.click(screen.getByRole("button", { name: "save" }));

    const saved = onSave.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect("note" in saved).toBe(true);
    expect(saved.note).toBeNull();
    expect(saved.note).not.toBe("");
  });

  it("disables the underlying input while null is toggled on", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{}} onSave={vi.fn()} />);
    const noteInput = screen.getByLabelText("note");
    expect((noteInput as HTMLInputElement).disabled).toBe(false);
    await user.click(screen.getByLabelText("note null"));
    expect((noteInput as HTMLInputElement).disabled).toBe(true);
  });
});

describe("ExtractionForm — nested object section", () => {
  it("renders and edits a nested object as a section", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const nestedSchema: JsonSchema = {
      type: "object",
      properties: {
        vendor: { type: "object", properties: { name: { type: "string" } } },
      },
    };
    function NestedHarness() {
      const [value, setValue] = useState<Record<string, unknown>>({});
      return (
        <>
          <ExtractionForm schema={nestedSchema} value={value} onChange={setValue} />
          <button onClick={() => onSave(value)}>save</button>
        </>
      );
    }
    render(<NestedHarness />);
    await user.type(screen.getByLabelText("vendor.name"), "Acme");
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(onSave).toHaveBeenLastCalledWith({ vendor: { name: "Acme" } });
  });
});
