import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Combobox } from "../../components/Combobox";

const options = [
  { id: "1", label: "Bank of Example" },
  { id: "2", label: "Example Brokerage" },
];

describe("Combobox", () => {
  it("filters options as the user types", async () => {
    render(<Combobox options={options} value={null} onChange={vi.fn()} />);

    await userEvent.type(screen.getByRole("textbox"), "Brokerage");

    expect(screen.getByRole("button", { name: "Example Brokerage" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Bank of Example" })).toBeNull();
  });

  it("calls onChange with the existing option's id when selected", async () => {
    const onChange = vi.fn();
    render(<Combobox options={options} value={null} onChange={onChange} />);

    await userEvent.type(screen.getByRole("textbox"), "Example Brokerage");
    await userEvent.click(screen.getByRole("button", { name: "Example Brokerage" }));

    expect(onChange).toHaveBeenLastCalledWith({ id: "2", label: "Example Brokerage" });
  });

  it("offers to create a new entry when nothing matches", async () => {
    const onChange = vi.fn();
    render(<Combobox options={options} value={null} onChange={onChange} />);

    await userEvent.type(screen.getByRole("textbox"), "Totally New Institution");
    const createButton = screen.getByRole("button", {
      name: 'Create "Totally New Institution"',
    });
    await userEvent.click(createButton);

    expect(onChange).toHaveBeenLastCalledWith({ id: null, label: "Totally New Institution" });
  });

  it("does not offer to create a new entry when there's an exact match", async () => {
    render(<Combobox options={options} value={null} onChange={vi.fn()} />);

    await userEvent.type(screen.getByRole("textbox"), "Bank of Example");

    expect(screen.queryByRole("button", { name: /^Create/ })).toBeNull();
  });
});
