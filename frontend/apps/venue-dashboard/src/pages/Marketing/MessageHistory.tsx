import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, Download, Mail, MessageSquare } from "lucide-react";
import { Button } from "../../components/ui";

const messages = [
  { id: 1, title: "Summer Festival Early Bird Announcement", type: "email", category: "announcement", audience: "All Subscribers", sent: 8542, opens: 2341, clicks: 456, date: "Jun 28, 2025" },
  { id: 2, title: "Jazz Night Reminder", type: "email", category: "event", audience: "Jazz Night Ticket Holders", sent: 245, opens: 198, clicks: 45, date: "Jun 27, 2025" },
  { id: 3, title: "Tech Conference Schedule Update", type: "email", category: "announcement", audience: "Tech Conference Attendees", sent: 856, opens: 756, clicks: 234, date: "Jun 25, 2025" },
  { id: 4, title: "Comedy Night - 24hr Reminder", type: "sms", category: "automated", audience: "Comedy Night Ticket Holders", sent: 312, opens: 0, clicks: 0, date: "Jun 24, 2025" },
  { id: 5, title: "Holiday Event Preview", type: "email", category: "announcement", audience: "Previous Attendees", sent: 3250, opens: 1890, clicks: 567, date: "Jun 20, 2025" },
  { id: 6, title: "Weekly Newsletter", type: "email", category: "announcement", audience: "All Subscribers", sent: 8400, opens: 3024, clicks: 756, date: "Jun 15, 2025" },
];

const typeFilters = [
  { value: "all", label: "All Types" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

const categoryFilters = [
  { value: "all", label: "All Categories" },
  { value: "announcement", label: "Announcements" },
  { value: "event", label: "Event Messages" },
  { value: "automated", label: "Automated" },
];

export default function MessageHistory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filteredMessages = messages.filter(msg => {
    if (searchQuery && !msg.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (typeFilter !== "all" && msg.type !== typeFilter) return false;
    if (categoryFilter !== "all" && msg.category !== categoryFilter) return false;
    return true;
  });

  const handleExport = () => {
    alert("Exporting message history...");
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/marketing" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Message History</h1>
            <p className="text-gray-500">View all sent messages and their performance</p>
          </div>
        </div>
        <Button variant="secondary" onClick={handleExport}>
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {typeFilters.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {categoryFilters.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      {/* Messages Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Audience</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sent</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Opens</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Clicks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredMessages.map((message) => {
              const openRate = message.sent > 0 ? ((message.opens / message.sent) * 100).toFixed(1) : 0;
              const clickRate = message.sent > 0 ? ((message.clicks / message.sent) * 100).toFixed(1) : 0;
              
              return (
                <tr key={message.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-600">{message.date}</td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{message.title}</p>
                    <span className="text-xs text-gray-500 capitalize">{message.category}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {message.type === "email" ? (
                        <Mail className="w-4 h-4 text-purple-500" />
                      ) : (
                        <MessageSquare className="w-4 h-4 text-green-500" />
                      )}
                      <span className="text-sm text-gray-600 capitalize">{message.type}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{message.audience}</td>
                  <td className="px-6 py-4 text-right text-sm text-gray-900">{message.sent.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    {message.type === "email" ? (
                      <div>
                        <p className="text-sm text-gray-900">{message.opens.toLocaleString()}</p>
                        <p className="text-xs text-gray-500">{openRate}%</p>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {message.type === "email" ? (
                      <div>
                        <p className="text-sm text-gray-900">{message.clicks.toLocaleString()}</p>
                        <p className="text-xs text-gray-500">{clickRate}%</p>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
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
