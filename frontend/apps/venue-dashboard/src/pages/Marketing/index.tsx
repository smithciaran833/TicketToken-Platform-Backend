
import { Link } from "react-router-dom";
import { Mail, Send, Users, MousePointer, UserMinus, Clock, FileText, Megaphone } from "lucide-react";
import { Button } from "../../components/ui";

const quickStats = {
  messagesSent: 12450,
  openRate: 42.3,
  clickRate: 8.7,
  unsubscribes: 23,
};

const recentCampaigns = [
  { id: 1, title: "Summer Festival Early Bird Announcement", type: "announcement", audience: "All Subscribers", sent: "Jun 28, 2025", opens: 2341, clicks: 456, status: "sent" },
  { id: 2, title: "Jazz Night Reminder", type: "event", audience: "Jazz Night Ticket Holders", sent: "Jun 27, 2025", opens: 198, clicks: 45, status: "sent" },
  { id: 3, title: "Tech Conference Schedule Update", type: "announcement", audience: "Tech Conference Attendees", sent: "Jun 25, 2025", opens: 756, clicks: 234, status: "sent" },
];

const scheduledMessages = [
  { id: 1, title: "Comedy Night - 24hr Reminder", type: "automated", audience: "Comedy Night Ticket Holders", scheduled: "Jul 14, 2025 6:00 PM" },
  { id: 2, title: "Summer Festival - Week Before", type: "automated", audience: "Summer Festival Attendees", scheduled: "Jul 8, 2025 10:00 AM" },
  { id: 3, title: "July Newsletter", type: "announcement", audience: "All Subscribers", scheduled: "Jul 1, 2025 9:00 AM" },
];


function getTypeBadge(type: string) {
  switch (type) {
    case "announcement": return "bg-purple-100 text-purple-700";
    case "event": return "bg-blue-100 text-blue-700";
    case "automated": return "bg-green-100 text-green-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function MarketingDashboard() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Marketing</h1>
          <p className="text-gray-500">Communicate with your audience</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/venue/marketing/announcements/new">
            <Button>
              <Megaphone className="w-4 h-4" />
              New Announcement
            </Button>
          </Link>
        </div>
      </div>

      {/* Audience Size Banner */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-lg p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-purple-200">Total Audience</p>
            <p className="text-4xl font-bold">8,542</p>
            <p className="text-purple-200 text-sm mt-1">subscribers across all lists</p>
          </div>
          <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center">
            <Users className="w-8 h-8" />
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Messages Sent</p>
              <p className="text-2xl font-bold text-gray-900">{quickStats.messagesSent.toLocaleString()}</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Send className="w-5 h-5 text-purple-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">Last 30 days</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Open Rate</p>
              <p className="text-2xl font-bold text-green-600">{quickStats.openRate}%</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <p className="text-sm text-green-600 mt-2">↑ 3.2% vs last month</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Click Rate</p>
              <p className="text-2xl font-bold text-blue-600">{quickStats.clickRate}%</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <MousePointer className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-sm text-blue-600 mt-2">↑ 1.1% vs last month</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Unsubscribes</p>
              <p className="text-2xl font-bold text-gray-900">{quickStats.unsubscribes}</p>
            </div>
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <UserMinus className="w-5 h-5 text-gray-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">Last 30 days</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Link to="/venue/marketing/announcements/new" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Send Announcement</p>
              <p className="text-sm text-gray-500">Broadcast to subscribers</p>
            </div>
          </div>
        </Link>

        <Link to="/venue/marketing/message" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Message Ticket Holders</p>
              <p className="text-sm text-gray-500">Contact event attendees</p>
            </div>
          </div>
        </Link>

        <Link to="/venue/marketing/templates" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Manage Templates</p>
              <p className="text-sm text-gray-500">Create reusable messages</p>
            </div>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Campaigns */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Campaigns</h2>
            <Link to="/venue/marketing/history" className="text-sm text-purple-600 hover:text-purple-700">
              View All
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {recentCampaigns.map((campaign) => (
              <div key={campaign.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{campaign.title}</p>
                    <p className="text-sm text-gray-500">{campaign.audience}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeBadge(campaign.type)}`}>
                    {campaign.type}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>Sent {campaign.sent}</span>
                  <span>•</span>
                  <span>{campaign.opens} opens</span>
                  <span>•</span>
                  <span>{campaign.clicks} clicks</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scheduled Messages */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Scheduled Messages</h2>
            <Link to="/venue/marketing/scheduled" className="text-sm text-purple-600 hover:text-purple-700">
              View All
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {scheduledMessages.map((message) => (
              <div key={message.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{message.title}</p>
                    <p className="text-sm text-gray-500">{message.audience}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeBadge(message.type)}`}>
                    {message.type}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-yellow-600">
                  <Clock className="w-4 h-4" />
                  <span>{message.scheduled}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
