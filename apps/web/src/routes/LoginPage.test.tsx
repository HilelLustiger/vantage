import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";
import { ApiError } from "../lib/apiClient";
import * as AuthContext from "../lib/AuthContext";

describe("LoginPage", () => {
  it("calls login with form values and shows the server's error on failure", async () => {
    const login = vi.fn().mockRejectedValue(new ApiError("invalid credentials", 401));
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: null,
      isLoading: false,
      login,
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret123");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(login).toHaveBeenCalledWith("a@b.com", "secret123");
    await waitFor(() =>
      expect(screen.getByText("invalid credentials")).toBeDefined(),
    );
  });
});
