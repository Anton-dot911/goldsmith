import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QaForm } from "../src/components/forms/QaForm.tsx";

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
      <QaForm input={input} value={value} onChange={setValue} />
      <button onClick={() => onSave(value)}>save</button>
    </>
  );
}

describe("QaForm", () => {
  it("draws the question context, answerable toggle, answer, and source_hint", () => {
    render(
      <Harness
        initial={{ answerable: true, answer: "" }}
        input={{ question: "what is the total?" }}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("what is the total?")).toBeTruthy();
    expect(screen.getByLabelText("answerable")).toBeTruthy();
    expect(screen.getByLabelText("answer")).toBeTruthy();
    expect(screen.getByLabelText("source_hint")).toBeTruthy();
  });

  it("fills answer and an optional source_hint into the expected shape", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness initial={{ answerable: true, answer: "" }} input={{}} onSave={onSave} />);
    await user.type(screen.getByLabelText("answer"), "42 EUR");
    await user.type(screen.getByLabelText("source_hint"), "page 2");
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(onSave).toHaveBeenLastCalledWith({
      answerable: true,
      answer: "42 EUR",
      source_hint: "page 2",
    });
  });

  it("omits source_hint entirely when left blank rather than saving an empty string", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness initial={{ answerable: false, answer: "" }} input={{}} onSave={onSave} />);
    await user.type(screen.getByLabelText("answer"), "no");
    await user.click(screen.getByRole("button", { name: "save" }));
    const saved = onSave.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect("source_hint" in saved).toBe(false);
    expect(saved).toEqual({ answerable: false, answer: "no" });
  });

  it("toggles answerable and round-trips an existing value unchanged", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const initial = { answerable: false, answer: "n/a", source_hint: "hint" };
    render(<Harness initial={initial} input={{}} onSave={onSave} />);
    expect((screen.getByLabelText("answerable") as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(onSave.mock.calls.at(-1)?.[0]).toEqual(initial);
  });
});
