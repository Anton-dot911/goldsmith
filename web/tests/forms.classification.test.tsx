import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClassificationForm } from "../src/components/forms/ClassificationForm.tsx";
import type { JsonSchema } from "../src/lib/preset-form.ts";

const schema: JsonSchema = {
  type: "object",
  properties: { label: { type: "string", enum: ["positive", "negative", "neutral"] } },
  required: ["label"],
};

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
      <ClassificationForm schema={schema} value={value} onChange={setValue} />
      <button onClick={() => onSave(value)}>save</button>
    </>
  );
}

describe("ClassificationForm", () => {
  it("renders a select of the schema's label enum", () => {
    render(<Harness initial={{}} onSave={vi.fn()} />);
    const select = screen.getByLabelText("label") as HTMLSelectElement;
    const options = [...select.options].map((o) => o.value);
    // Placeholder plus the three enum labels.
    expect(options).toEqual(["", "positive", "negative", "neutral"]);
  });

  it("selects a label into the expected shape", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness initial={{}} onSave={onSave} />);
    await user.selectOptions(screen.getByLabelText("label"), "positive");
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(onSave).toHaveBeenLastCalledWith({ label: "positive" });
  });

  it("clears the key when the placeholder is chosen (so the gate can reject it)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness initial={{ label: "neutral" }} onSave={onSave} />);
    await user.selectOptions(screen.getByLabelText("label"), "");
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(onSave.mock.calls.at(-1)?.[0]).toEqual({});
  });

  it("reflects and round-trips an existing value unchanged", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness initial={{ label: "negative" }} onSave={onSave} />);
    expect((screen.getByLabelText("label") as HTMLSelectElement).value).toBe("negative");
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(onSave.mock.calls.at(-1)?.[0]).toEqual({ label: "negative" });
  });
});
