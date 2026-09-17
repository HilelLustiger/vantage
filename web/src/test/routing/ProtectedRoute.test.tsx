import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "../../routing/ProtectedRoute";
import * as AuthContext from "../../context/AuthContext";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>protected content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("redirects to /login when there is no authenticated user", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderAt("/");

    expect(screen.getByText("login page")).toBeDefined();
  });

  it("renders the protected content when a user is authenticated", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: { id: "1", email: "a@b.com" },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderAt("/");

    expect(screen.getByText("protected content")).toBeDefined();
  });

  it("renders nothing while the auth check is still loading", () => {
    vi.spyOn(AuthContext, "useAuth").mockReturnValue({
      user: null,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    const { container } = renderAt("/");

    expect(container.textContent).toBe("");
  });
});
