import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountsPage } from "../../pages/AccountsPage";
import * as AuthContext from "../../context/AuthContext";

const institution = { id: "inst-1", name: "Existing Bank" };
const account = {
  id: "acc-1",
  institutionId: "inst-1",
  institutionName: "Existing Bank",
  name: "Brokerage",
  ownerUserIds: ["user-1"],
  ownerEmails: ["me@example.com"],
};
const currentUser = { id: "user-1", email: "me@example.com" };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

function mockApi({
  accounts = [account],
  institutions = [institution],
  users = [currentUser],
}: {
  accounts?: (typeof account)[];
  institutions?: (typeof institution)[];
  users?: (typeof currentUser)[];
} = {}) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (path === "/api/accounts" && method === "GET") return jsonResponse(accounts);
    if (path === "/api/institutions" && method === "GET") return jsonResponse(institutions);
    if (path === "/api/users" && method === "GET") return jsonResponse(users);
    if (path === "/api/accounts" && method === "POST") {
      const body = JSON.parse(init!.body as string);
      return jsonResponse(
        {
          id: "acc-new",
          institutionName: body.newInstitutionName ?? "Existing Bank",
          ownerEmails: [currentUser.email],
          ...body,
        },
        201,
      );
    }
    throw new Error(`unexpected fetch: ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubAuth() {
  vi.spyOn(AuthContext, "useAuth").mockReturnValue({
    user: currentUser,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

describe("AccountsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists accounts with institution name and owner email", async () => {
    stubAuth();
    mockApi();

    render(<AccountsPage />);

    await waitFor(() => expect(screen.getByText("Brokerage")).toBeDefined());
    expect(screen.getByText("Existing Bank")).toBeDefined();
    expect(screen.getByText("me@example.com")).toBeDefined();
  });

  it("shows an empty state when there are no accounts", async () => {
    stubAuth();
    mockApi({ accounts: [] });

    render(<AccountsPage />);

    await waitFor(() => expect(screen.getByText("No accounts yet.")).toBeDefined());
  });

  it("creates an account against an existing institution without creating a new one", async () => {
    stubAuth();
    const fetchMock = mockApi();

    render(<AccountsPage />);
    await waitFor(() => expect(screen.getByText("Brokerage")).toBeDefined());

    await userEvent.click(screen.getByRole("button", { name: /add account/i }));
    await userEvent.type(screen.getByLabelText("Name"), "New Account");
    await userEvent.type(
      screen.getByPlaceholderText("Search or create an institution"),
      "Existing Bank",
    );
    await userEvent.click(await screen.findByRole("button", { name: "Existing Bank" }));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/accounts",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const postCall = fetchMock.mock.calls.find(
      ([path, init]) => path === "/api/accounts" && (init as RequestInit)?.method === "POST",
    )!;
    const body = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(body.institutionId).toBe("inst-1");
    expect(body.newInstitutionName).toBeUndefined();
  });

  it("sends newInstitutionName inline when the typed name doesn't match an existing one — no separate institution-create request", async () => {
    stubAuth();
    const fetchMock = mockApi();

    render(<AccountsPage />);
    await waitFor(() => expect(screen.getByText("Brokerage")).toBeDefined());

    await userEvent.click(screen.getByRole("button", { name: /add account/i }));
    await userEvent.type(screen.getByLabelText("Name"), "New Account");
    await userEvent.type(
      screen.getByPlaceholderText("Search or create an institution"),
      "Brand New Bank",
    );
    await userEvent.click(await screen.findByRole("button", { name: 'Create "Brand New Bank"' }));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/accounts",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const accountCall = fetchMock.mock.calls.find(
      ([path, init]) => path === "/api/accounts" && (init as RequestInit)?.method === "POST",
    )!;
    const body = JSON.parse((accountCall[1] as RequestInit).body as string);
    expect(body.newInstitutionName).toBe("Brand New Bank");
    expect(body.institutionId).toBeUndefined();
  });
});
