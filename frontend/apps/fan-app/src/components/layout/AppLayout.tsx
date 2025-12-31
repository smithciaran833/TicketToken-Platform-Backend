import { Link, useLocation } from "react-router-dom";
import { Home, Search, Ticket, DollarSign, User } from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
  hideNav?: boolean;
}

const navItems = [
  { path: "/", icon: Home, label: "Home" },
  { path: "/search", icon: Search, label: "Search" },
  { path: "/tickets", icon: Ticket, label: "Tickets" },
  { path: "/sell", icon: DollarSign, label: "Sell" },
  { path: "/profile", icon: User, label: "Profile" },
];

export default function AppLayout({ children, hideNav = false }: AppLayoutProps) {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className={`flex-1 ${hideNav ? "" : "pb-20"}`}>
        {children}
      </main>

      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
          <div className="max-w-lg mx-auto px-2 py-2">
            <div className="flex items-center justify-between">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
                      active ? "text-purple-600" : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    <Icon className="w-6 h-6" strokeWidth={active ? 2.5 : 2} />
                    <span className={`text-xs ${active ? "font-semibold" : "font-medium"}`}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}
