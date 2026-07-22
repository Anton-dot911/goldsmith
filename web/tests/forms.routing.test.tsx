import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoutingForm } from "../src/components/forms/RoutingForm.tsx";
import type { JsonSchema } from "../src/lib/preset-form.ts";

const schema: JsonSchema = {
  type: "object",
  properties: {
    routes: {
      type: "array",
      items: { type: "string", enum: ["sql", "rag", "smalltalk"] },
    },
    clarify_ok: { type: "boolean" },
  },
  required: ["routes", "clarify_ok"],
};

function Harness({
  initial,
  input,
  onSave,
}: {
  initial: Record<string, unknown>;
  input: unknown;
  onSave: (value: Record<string, unknown>) => void;
}) {
  const [value, setValue] = useState<Record<string, unknown>>(initial);
  return (
    <>
      <RoutingForm schema={schema} input={input} value={value} onChange={setValue} />
      <button onClick={() => onSave(value)}>save</button>
    </>
  );
}

describe("RoutingForm", () => {
  it("draws the question context, a checkbox per enum route, and clarify_ok", () => {
    render(
      <Harness
        initial={{ routes: [], clarify_ok: false }}
        input={{ question: "how many invoices?" }}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("how many invoices?")).toBeTruthy();
    expect(screen.getByLabelText("sql")).toBeTruthy();
    expect(screen.getByLabelText("rag")).toBeTruthy();
    expect(screen.getByLabelText("smalltalk")).toBeTruthy();
    expect(screen.getByLabelText("clarify_ok")).toBeTruthy();
  });

  it("multi-selects routes in enum order and toggles clarify_ok", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness initial={{ routes: [], clarify_ok: false }} input={{}} onSave={onSave} />);
    // Check in reverse enum order to prove the emitted array follows the schema.
    await user.click(screen.getByLabelText("rag"));
    await user.click(screen.getByLabelText("sql"));
    await user.click(screen.getByLabelText("clarify_ok"));
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(onSave).toHaveBeenLastCalledWith({ routes: ["sql", "rag"], clarify_ok: true });
  });

  it("reflects an existing value and round-trips it unchanged", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const initial = { routes: ["rag"], clarify_ok: true };
    render(<Harness initial={initial} input={{ question: "q" }} onSave={onSave} />);
    expect((screen.getByLabelText("rag") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("sql") as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(onSave.mock.calls.at(-1)?.[0]).toEqual(initial);
  });
});
