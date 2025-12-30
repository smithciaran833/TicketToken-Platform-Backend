import {
  LayoutDashboard,
  Calendar,
  Ticket,
  BarChart3,
  DollarSign,
  Users,
  Settings,
  LogOut,
  ScanLine
} from "lucide-react";

const navItems = [
  { name: "Dashboard", icon: LayoutDashboard, href: "/venue" },
  { name: "Events", icon: Calendar, href: "/venue/events" },
  { name: "Tickets", icon: Ticket, href: "/venue/tickets" },
  { name: "Scanning", icon: ScanLine, href: "/venue/scanning" },
  { name: "Analytics", icon: BarChart3, href: "/venue/analytics" },
  { name: "Financials", icon: DollarSign, href: "/venue/financials" },
  { name: "Team", icon: Users, href: "/venue/team" },
  { name: "Settings", icon: Settings, href: "/venue/settings" },
];

interface SidebarProps {
  currentPath: string;
}

export default function Sidebar({ currentPath }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-gray-900 flex flex-col">
      <div className="flex items-center gap-2 h-16 px-6">
        <Ticket className="w-8 h-8 text-purple-500" />
        <span className="text-xl font-bold text-white">TicketToken</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.href;
          const classes = isActive
            ? "flex items-center gap-3 px-3 py-2 rounded-lg bg-purple-600 text-white"
            : "flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white";
          return (
            <a key={item.name} href={item.href} className={classes}>
              <Icon className="w-5 h-5" />
              <span>{item.name}</span>
            </a>
          );
        })}
      </nav>
      <div className="p-3 border-t border-gray-800">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold">
            JD
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-white">John Doe</div>
            <div className="text-xs text-gray-400">john@example.com</div>
          </div>
          <button className="text-gray-400 hover:text-white">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
