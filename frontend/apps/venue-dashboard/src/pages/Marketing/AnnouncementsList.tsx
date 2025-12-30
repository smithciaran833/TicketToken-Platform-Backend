import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Search, MoreVertical, Edit, Copy, Trash2 } from "lucide-react";
import { Button, Dropdown } from "../../components/ui";

const announcements = [
  { id: 1, title: "Summer Festival Early Bird Announcement", audience: "All Subscribers", audienceCount: 8542, sentDate: "Jun 28, 2025", status: "sent", opens: 2341, clicks: 456, openRate: 27.4 },
  { id: 2, title: "July Newsletter", audience: "All Subscribers", audienceCount: 8542, sentDate: null, scheduledDate: "Jul 1, 2025 9:00 AM", status: "scheduled", opens: 0, clicks: 0, openRate: 0 },
  { id: 3, title: "Tech Conference Schedule Update", audience: "Tech Conference Attendees", audienceCount: 856, sentDate: "Jun 25, 2025", status: "sent", opens: 756, clicks: 234, openRate: 88.3 },
  { id: 4, title: "New Venue Features", audience: "All Subscribers", audienceCount: 8542, sentDate: null, scheduledDate: null, status: "draft", opens: 0, clicks: 0, openRate: 0 },
  { id: 5, title: "Holiday Event Preview", audience: "Previous Attendees", audienceCount: 3250, sentDate: "Jun 20, 2025", status: "sent", opens: 1890, clicks: 567, openRate: 58.2 },
];

const tabs = ["All", "Sent", "Scheduled", "Draft"];

function getStatusBadge(status: string) {
  switch (status) {
    case "sent": return { bg: "bg-green-100", text: "text-green-700", label: "Sent" };
    case "scheduled": return { bg: "bg-yellow-100", text: "text-yellow-700", label: "Scheduled" };
    case "draft": return { bg: "bg-gray-100", text: "text-gray-700", label: "Draft" };
    default: return { bg: "bg-gray-100", text: "text-gray-700", label: status };
  }
}

export default function AnnouncementsList() {
  const [activeTab, setActiveTab] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAnnouncements = announcements.filter(ann => {
    if (activeTab !== "All" && ann.status !== activeTab.toLowerCase()) return false;
    if (searchQuery && !ann.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getDropdownItems = (_announcement: typeof announcements[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => {} },
    { label: "Duplicate", icon: <Copy className="w-4 h-4" />, onClick: () => {} },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => {} },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/marketing" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Announcements</h1>
            <p className="text-gray-500">Broadcast messages to your audience</p>
          </div>
        </div>
        <Link to="/venue/marketing/announcements/new">
          <Button>
            <Plus className="w-4 h-4" />
            New Announcement
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
            <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
              {tab === "All" ? announcements.length : announcements.filter(a => a.status === tab.toLowerCase()).length}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search announcements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
      </div>

      {/* Announcements Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Announcement</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Audience</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Performance</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredAnnouncements.map((announcement) => {
              const status = getStatusBadge(announcement.status);
              return (
                <tr key={announcement.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link to={`/venue/marketing/announcements/${announcement.id}`} className="font-medium text-purple-600 hover:text-purple-700">
                      {announcement.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{announcement.audience}</p>
                    <p className="text-xs text-gray-500">{announcement.audienceCount.toLocaleString()} recipients</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {announcement.status === "sent" && announcement.sentDate}
                    {announcement.status === "scheduled" && announcement.scheduledDate}
                    {announcement.status === "draft" && "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.bg} ${status.text}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {announcement.status === "sent" ? (
                      <div className="text-sm">
                        <p className="text-gray-900">{announcement.openRate}% open rate</p>
                        <p className="text-gray-500">{announcement.opens} opens • {announcement.clicks} clicks</p>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(announcement)} />
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
