import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, Megaphone, Zap, AlertTriangle, ChevronRight } from "lucide-react";

const announcements = [
  { id: 1, type: "feature", title: "New: Multi-day Event Support", date: "Jan 15, 2025", content: "You can now create events that span multiple days with a single ticket purchase. Perfect for festivals, conferences, and retreats.", read: false },
  { id: 2, type: "update", title: "Scanner App v3.2 Released", date: "Jan 12, 2025", content: "The latest version includes offline mode improvements, faster scanning, and a new team chat feature. Update now from the App Store.", read: false },
  { id: 3, type: "maintenance", title: "Scheduled Maintenance: Jan 20", date: "Jan 10, 2025", content: "We'll be performing system maintenance on January 20 from 2-4 AM EST. The platform may be briefly unavailable during this time.", read: true },
  { id: 4, type: "feature", title: "Analytics Dashboard Redesign", date: "Jan 5, 2025", content: "We've completely redesigned the analytics dashboard with new visualizations, faster loading, and customizable reports.", read: true },
  { id: 5, type: "update", title: "Holiday Support Hours", date: "Dec 20, 2024", content: "Our support team will have limited availability during the holidays. Emergency support remains available 24/7.", read: true },
];

const typeConfig = {
  feature: { icon: Zap, color: "text-purple-600", bg: "bg-purple-100", label: "New Feature" },
  update: { icon: Bell, color: "text-blue-600", bg: "bg-blue-100", label: "Update" },
  maintenance: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-100", label: "Maintenance" },
};

export default function PlatformAnnouncements() {
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<typeof announcements[0] | null>(null);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Platform Announcements</h1>
            <p className="text-gray-500">News, updates, and maintenance notices</p>
          </div>
        </div>
        <Link to="/venue/support/subscribe">
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 hover:text-purple-700">
            <Bell className="w-4 h-4" />
            Subscribe to Updates
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Announcements List */}
        <div className="col-span-2 space-y-4">
          {announcements.map((announcement) => {
            const config = typeConfig[announcement.type as keyof typeof typeConfig];
            const Icon = config.icon;
            return (
              <button
                key={announcement.id}
                onClick={() => setSelectedAnnouncement(announcement)}
                className={`w-full text-left bg-white rounded-lg border p-4 transition-all hover:shadow-md ${
                  selectedAnnouncement?.id === announcement.id 
                    ? "border-purple-500 ring-2 ring-purple-100" 
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.bg}`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {!announcement.read && (
                        <span className="w-2 h-2 bg-purple-600 rounded-full" />
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                      <span className="text-sm text-gray-500">{announcement.date}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900">{announcement.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2">{announcement.content}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail Panel */}
        <div className="col-span-1">
          {selectedAnnouncement ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6 sticky top-4">
              {(() => {
                const config = typeConfig[selectedAnnouncement.type as keyof typeof typeConfig];
                const Icon = config.icon;
                return (
                  <>
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${config.bg} mb-4`}>
                      <Icon className={`w-6 h-6 ${config.color}`} />
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                    <h2 className="text-lg font-semibold text-gray-900 mt-2 mb-1">
                      {selectedAnnouncement.title}
                    </h2>
                    <p className="text-sm text-gray-500 mb-4">{selectedAnnouncement.date}</p>
                    <p className="text-gray-700">{selectedAnnouncement.content}</p>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg border border-dashed border-gray-300 p-6 text-center">
              <Megaphone className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Select an announcement to read more</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
