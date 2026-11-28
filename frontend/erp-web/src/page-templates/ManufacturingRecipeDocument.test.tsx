import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../erpApi";
import { ManufacturingRecipeDocument } from "./ManufacturingRecipeDocument";

vi.mock("../erpApi", () => ({ api: vi.fn() }));

describe("ManufacturingRecipeDocument", () => {
  it("draws both editable line groups and sends both with save", async () => {
    vi.mocked(api).mockResolvedValueOnce({ id: "new-recipe", code: "R-1", name: "Test", productStockItemId: "p", outputQuantity: 1,
      isActive: true, rowVersion: "", lines: [], operations: [] });
    render(<ManufacturingRecipeDocument id={null} token="tok" />);
    expect(screen.getByRole("region", { name: "Bileşenler" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Rota" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Satır ekle" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Satır ekle" })[1]);
    fireEvent.change(screen.getByLabelText("Stok kimliği 1"), { target: { value: "component-1" } });
    fireEvent.change(screen.getByLabelText("İş merkezi kimliği 1"), { target: { value: "center-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    const request = vi.mocked(api).mock.calls[0][2] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.lines).toHaveLength(1);
    expect(body.operations).toHaveLength(1);
    expect(body.lines[0].componentStockItemId).toBe("component-1");
    expect(body.operations[0].workCenterId).toBe("center-1");
  });
});
