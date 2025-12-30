import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Calendar,
  Ticket,
  QrCode,
  BarChart3,
  DollarSign,
  Megaphone,
  RefreshCw,
  Users,
  Settings,
  Menu,
  Bell,
  Search,
  Building2,
  Wrench,
} from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: "Dashboard", href: "/venue", icon: LayoutDashboard },
  { name: "Events", href: "/venue/events", icon: Calendar },
  { name: "Tickets", href: "/venue/tickets", icon: Ticket },
  { name: "Scanning", href: "/venue/scanning", icon: QrCode },
  { name: "Analytics", href: "/venue/analytics", icon: BarChart3 },
  { name: "Financials", href: "/venue/financials", icon: DollarSign },
  { name: "Marketing", href: "/venue/marketing", icon: Megaphone },
  { name: "Resale", href: "/venue/resale", icon: RefreshCw },
  { name: "Operations", href: "/venue/operations", icon: Wrench },
  { name: "Team", href: "/venue/team", icon: Users },
  { name: "Settings", href: "/venue/settings", icon: Settings },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const isActive = (href: string) => {
    if (href === "/venue") {
      return location.pathname === "/venue";
    }
    return location.pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-gray-900 transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-16 flex items-center px-4">
          <Link to="/venue" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white">TicketToken</span>
          </Link>
        </div>

        <nav className="px-3 py-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-purple-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
              JD
            </div>
            <div>
              <p className="text-sm font-medium text-white">John Doe</p>
              <p className="text-xs text-gray-500">Venue Manager</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-4">
            <button className="lg:hidden text-gray-500 hover:text-gray-700" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative hidden md:block">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                className="pl-10 pr-4 py-2 w-64 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative text-gray-500 hover:text-gray-700">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">3</span>
            </button>
          </div>
        </header>

        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
