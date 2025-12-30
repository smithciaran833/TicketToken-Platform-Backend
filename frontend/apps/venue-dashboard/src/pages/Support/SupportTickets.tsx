import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Search, Clock, CheckCircle, AlertCircle, MessageCircle } from "lucide-react";
import { Button } from "../../components/ui";

const tickets = [
  { id: "TKT-1234", subject: "Payment not processing", status: "open", priority: "high", created: "Jan 15, 2025", updated: "2 hours ago", messages: 4 },
  { id: "TKT-1230", subject: "Scanner app crashing", status: "in-progress", priority: "medium", created: "Jan 14, 2025", updated: "Yesterday", messages: 6 },
  { id: "TKT-1225", subject: "How to set up promo codes", status: "resolved", priority: "low", created: "Jan 12, 2025", updated: "Jan 13, 2025", messages: 3 },
  { id: "TKT-1220", subject: "Refund request for cancelled event", status: "resolved", priority: "medium", created: "Jan 10, 2025", updated: "Jan 11, 2025", messages: 5 },
  { id: "TKT-1215", subject: "Cannot download reports", status: "closed", priority: "low", created: "Jan 8, 2025", updated: "Jan 9, 2025", messages: 2 },
];

const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string }> = {
  open: { icon: AlertCircle, color: "text-yellow-600", bg: "bg-yellow-100" },
  "in-progress": { icon: Clock, color: "text-blue-600", bg: "bg-blue-100" },
  resolved: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-100" },
  closed: { icon: CheckCircle, color: "text-gray-600", bg: "bg-gray-100" },
};

const priorityColors: Record<string, string> = {
  high: "text-red-600 bg-red-100",
  medium: "text-yellow-600 bg-yellow-100",
  low: "text-gray-600 bg-gray-100",
};

export default function SupportTickets() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredTickets = tickets
    .filter(t => statusFilter === "all" || t.status === statusFilter)
    .filter(t => t.subject.toLowerCase().includes(search.toLowerCase()) || t.id.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Support Tickets</h1>
            <p className="text-gray-500">Track your support requests</p>
          </div>
        </div>
        <Link to="/venue/support/contact">
          <Button>
            <Plus className="w-4 h-4" />
            New Ticket
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex items-center gap-2">
            {["all", "open", "in-progress", "resolved", "closed"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === status
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1).replace("-", " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Messages</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredTickets.map((ticket) => {
              const status = statusConfig[ticket.status];
              const StatusIcon = status.icon;
              return (
                <tr key={ticket.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link to={`/venue/support/tickets/${ticket.id}`} className="block">
                      <p className="font-medium text-gray-900 hover:text-purple-600">{ticket.subject}</p>
                      <p className="text-sm text-gray-500">{ticket.id}</p>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1).replace("-", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[ticket.priority]}`}>
                      {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{ticket.created}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{ticket.updated}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center gap-1 text-sm text-gray-500">
                      <MessageCircle className="w-4 h-4" />
                      {ticket.messages}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
