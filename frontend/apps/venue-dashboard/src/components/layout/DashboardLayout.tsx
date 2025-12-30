import type { ReactNode } from "react";
import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  ChevronDown,
  Check,
  Plus,
  User,
  Key,
  Shield,
  LogOut,
  HelpCircle,
} from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
}

const venues = [
  { id: 1, name: "The Grand Theater", location: "Downtown, New York" },
  { id: 2, name: "Riverside Amphitheater", location: "Brooklyn, New York" },
  { id: 3, name: "The Jazz Lounge", location: "Manhattan, New York" },
];

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
  const [venueDropdownOpen, setVenueDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [currentVenue, setCurrentVenue] = useState(venues[0]);
  const location = useLocation();
  const navigate = useNavigate();
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Close user dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isActive = (href: string) => {
    if (href === "/venue") {
      return location.pathname === "/venue";
    }
    return location.pathname.startsWith(href);
  };

  const switchVenue = (venue: typeof venues[0]) => {
    setCurrentVenue(venue);
    setVenueDropdownOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    navigate("/login");
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
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-gray-800">
          <Link to="/venue" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white">TicketToken</span>
          </Link>
        </div>

        {/* Venue Switcher */}
        <div className="px-3 py-3 border-b border-gray-800">
          <div className="relative">
            <button
              onClick={() => setVenueDropdownOpen(!venueDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-white truncate">{currentVenue.name}</p>
                  <p className="text-xs text-gray-400 truncate">{currentVenue.location}</p>
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${venueDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown */}
            {venueDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden z-50">
                <div className="py-1">
                  {venues.map((venue) => (
                    <button
                      key={venue.id}
                      onClick={() => switchVenue(venue)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 transition-colors"
                    >
                      <div className="w-8 h-8 bg-gray-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-gray-300" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{venue.name}</p>
                        <p className="text-xs text-gray-400 truncate">{venue.location}</p>
                      </div>
                      {currentVenue.id === venue.id && (
                        <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="border-t border-gray-700 py-1">
                  <Link
                    to="/venues"
                    onClick={() => setVenueDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <Building2 className="w-4 h-4" />
                    Manage Venues
                  </Link>
                  <Link
                    to="/venues/new"
                    onClick={() => setVenueDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Venue
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
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

        {/* User Profile */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-800" ref={userDropdownRef}>
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <div className="w-9 h-9 bg-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                JD
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">John Doe</p>
                <p className="text-xs text-gray-500 truncate">Venue Manager</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${userDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {/* User Dropdown */}
            {userDropdownOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden z-50">
                <div className="px-3 py-3 border-b border-gray-700">
                  <p className="text-sm font-medium text-white">John Doe</p>
                  <p className="text-xs text-gray-400">john@thegrandtheater.com</p>
                </div>
                <div className="py-1">
                  <Link
                    to="/account/settings"
                    onClick={() => setUserDropdownOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <User className="w-4 h-4" />
                    Account Settings
                  </Link>
                  <Link
                    to="/account/profile"
                    onClick={() => setUserDropdownOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <User className="w-4 h-4" />
                    Edit Profile
                  </Link>
                  <Link
                    to="/account/password"
                    onClick={() => setUserDropdownOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <Key className="w-4 h-4" />
                    Change Password
                  </Link>
                  <Link
                    to="/account/2fa"
                    onClick={() => setUserDropdownOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                    Two-Factor Auth
                  </Link>
                </div>
                <div className="border-t border-gray-700 py-1">
                  <Link
                    to="/venue/support"
                    onClick={() => setUserDropdownOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <HelpCircle className="w-4 h-4" />
                    Help & Support
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
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
