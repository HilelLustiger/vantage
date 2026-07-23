import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Landmark, PieChart, Upload, ArrowLeftRight, LogOut } from "lucide-react";
import { useAuth } from "../lib/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/accounts", label: "Accounts", icon: Landmark, end: false },
  { to: "/assets", label: "Assets", icon: PieChart, end: false },
  { to: "/import", label: "Import", icon: Upload, end: false },
];

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"
  }`;

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white px-4 py-6">
        <div className="mb-8 px-2 text-lg font-semibold text-gray-900">Vantage</div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navLinkClasses}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
          <div
            aria-disabled="true"
            className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-400"
          >
            <ArrowLeftRight size={18} />
            Transactions
            <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-400">
              Coming soon
            </span>
          </div>
        </nav>
        <div className="mt-6 border-t border-gray-200 pt-4">
          <p className="truncate px-2 text-sm text-gray-600">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="mt-2 flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <LogOut size={18} />
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
