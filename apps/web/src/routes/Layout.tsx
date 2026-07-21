import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
  }`;

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="mr-4 text-sm font-semibold text-gray-900">Vantage</span>
          <NavLink to="/" end className={navLinkClasses}>
            Dashboard
          </NavLink>
          <NavLink to="/accounts" className={navLinkClasses}>
            Accounts
          </NavLink>
          <NavLink to="/import" className={navLinkClasses}>
            Import
          </NavLink>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{user?.email}</span>
          <button
            onClick={handleLogout}
            className="rounded-md px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100"
          >
            Log out
          </button>
        </div>
      </nav>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
