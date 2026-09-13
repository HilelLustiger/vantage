import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ManualHoldingsForm } from "../../components/ManualHoldingsForm";

// Fixture matches the mockup's preflight-abort example (issue #67) — this
// is the only place that shape gets exercised until the backend actually
// reaches this reason (DTO issue derived from this one).
const FIXTURE = { accountHolder: "Hilel Lustiger", accountNumber: "••••-4821" };

describe("ManualHoldingsForm", () => {
  it("renders the account context and two starter rows", () => {
    render(<ManualHoldingsForm {...FIXTURE} onCancel={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByText("Hilel Lustiger")).toBeDefined();
    expect(screen.getByText("••••-4821")).toBeDefined();
    expect(screen.getAllByLabelText("Asset")).toHaveLength(2);
  });

  it("disables confirm until a row has asset/quantity/value filled in", async () => {
    render(<ManualHoldingsForm {...FIXTURE} onCancel={vi.fn()} onConfirm={vi.fn()} />);

    const confirmButton = screen.getByRole("button", { name: /confirm & commit/i });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(screen.getAllByLabelText("Asset")[0], "Migdal Gemel Fund");
    await userEvent.type(screen.getAllByLabelText("Quantity")[0], "12");
    await userEvent.type(screen.getAllByLabelText("Value")[0], "1000");

    expect((confirmButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('adds a new row via "Add holding"', async () => {
    render(<ManualHoldingsForm {...FIXTURE} onCancel={vi.fn()} onConfirm={vi.fn()} />);

    await userEvent.click(screen.getByText("Add holding"));

    expect(screen.getAllByLabelText("Asset")).toHaveLength(3);
  });

  it("calls onConfirm with the entered rows and statement balance", async () => {
    const onConfirm = vi.fn();
    render(<ManualHoldingsForm {...FIXTURE} onCancel={vi.fn()} onConfirm={onConfirm} />);

    await userEvent.type(screen.getAllByLabelText("Asset")[0], "Migdal Gemel Fund");
    await userEvent.type(screen.getAllByLabelText("Quantity")[0], "12");
    await userEvent.type(screen.getAllByLabelText("Value")[0], "1000");
    await userEvent.type(screen.getByLabelText("Statement balance (for cross-check)"), "45000");

    await userEvent.click(screen.getByRole("button", { name: /confirm & commit/i }));

    expect(onConfirm).toHaveBeenCalledWith(
      [
        { assetName: "Migdal Gemel Fund", quantity: "12", value: "1000", currency: "ILS" },
        { assetName: "", quantity: "", value: "", currency: "ILS" },
      ],
      "45000",
    );
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(<ManualHoldingsForm {...FIXTURE} onCancel={onCancel} onConfirm={vi.fn()} />);

    await userEvent.click(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalled();
  });
});
