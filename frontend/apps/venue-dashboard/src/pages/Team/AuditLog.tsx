import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Search, User, Calendar, Globe } from "lucide-react";
import { Button } from "../../components/ui";

const auditLogs = [
  { id: 1, user: "John Doe", action: "Created event 'Summer Festival'", details: "Event ID: 123", ip: "192.168.1.1", date: "2025-01-15 2:30 PM" },
  { id: 2, user: "Sarah Wilson", action: "Updated ticket prices", details: "GA: $50 → $55", ip: "192.168.1.2", date: "2025-01-15 11:00 AM" },
  { id: 3, user: "John Doe", action: "Invited team member", details: "mike@venue.com", ip: "192.168.1.1", date: "2025-01-14 4:15 PM" },
  { id: 4, user: "Mike Johnson", action: "Processed refund", details: "Order #5678, $150", ip: "192.168.1.3", date: "2025-01-14 2:00 PM" },
  { id: 5, user: "Sarah Wilson", action: "Updated venue settings", details: "Changed operating hours", ip: "192.168.1.2", date: "2025-01-13 10:30 AM" },
  { id: 6, user: "John Doe", action: "Changed team permissions", details: "Sarah Wilson: Manager → Admin", ip: "192.168.1.1", date: "2025-01-12 3:45 PM" },
  { id: 7, user: "System", action: "Automatic payout processed", details: "$12,500 to Bank ****1234", ip: "—", date: "2025-01-11 12:00 AM" },
  { id: 8, user: "John Doe", action: "Enabled 2FA", details: "Authenticator app", ip: "192.168.1.1", date: "2025-01-10 9:00 AM" },
];

const userOptions = [
  { value: "all", label: "All Users" },
  { value: "john", label: "John Doe" },
  { value: "sarah", label: "Sarah Wilson" },
  { value: "mike", label: "Mike Johnson" },
  { value: "system", label: "System" },
];

const actionOptions = [
  { value: "all", label: "All Actions" },
  { value: "event", label: "Event Changes" },
  { value: "team", label: "Team Changes" },
  { value: "settings", label: "Settings Changes" },
  { value: "financial", label: "Financial Actions" },
  { value: "security", label: "Security Actions" },
];

export default function AuditLog() {
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/team" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Audit Log</h1>
            <p className="text-gray-500">Track all actions taken in your venue</p>
          </div>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search actions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            {userOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            {actionOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input
            type="date"
            className="px-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date/Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {auditLogs.map((log) => (
              <tr 
                key={log.id} 
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-sm text-gray-900">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {log.date}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                      <User className="w-3 h-3 text-purple-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-900">{log.user}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">{log.action}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{log.details}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Globe className="w-4 h-4" />
                    {log.ip}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-gray-500">Showing 1-8 of 156 entries</p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled>Previous</Button>
          <Button variant="secondary" size="sm">Next</Button>
        </div>
      </div>
    </div>
  );
}
