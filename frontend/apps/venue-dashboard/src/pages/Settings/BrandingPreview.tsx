import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Monitor, Tablet, Smartphone, Edit } from "lucide-react";
import { Button } from "../../components/ui";

const tabs = [
  { id: "event", label: "Event Page" },
  { id: "ticket", label: "Ticket" },
  { id: "email", label: "Email" },
  { id: "venue", label: "Venue Page" },
];

export default function BrandingPreview() {
  const [activeTab, setActiveTab] = useState("event");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  const getPreviewWidth = () => {
    switch (device) {
      case "tablet": return "max-w-2xl";
      case "mobile": return "max-w-sm";
      default: return "max-w-full";
    }
  };

  const getEditLink = () => {
    switch (activeTab) {
      case "event": return "/venue/settings/profile";
      case "ticket": return "/venue/settings/branding/tickets";
      case "email": return "/venue/settings/branding/email";
      case "venue": return "/venue/settings/profile";
      default: return "/venue/settings";
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Preview Branding</h1>
            <p className="text-sm text-gray-500">See how your brand appears across platforms</p>
          </div>
        </div>
        <Link to={getEditLink()}>
          <Button variant="secondary">
            <Edit className="w-4 h-4" />
            Edit
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-white shadow text-gray-900"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Device Toggle */}
        {(activeTab === "event" || activeTab === "venue") && (
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setDevice("desktop")}
              className={`p-2 rounded-md transition-colors ${
                device === "desktop" ? "bg-white shadow text-gray-900" : "text-gray-600"
              }`}
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDevice("tablet")}
              className={`p-2 rounded-md transition-colors ${
                device === "tablet" ? "bg-white shadow text-gray-900" : "text-gray-600"
              }`}
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDevice("mobile")}
              className={`p-2 rounded-md transition-colors ${
                device === "mobile" ? "bg-white shadow text-gray-900" : "text-gray-600"
              }`}
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="bg-gray-100 rounded-lg p-8 h-[calc(100%-6rem)] overflow-auto">
        <div className={`${getPreviewWidth()} mx-auto`}>
          {activeTab === "event" && (
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="h-48 bg-gradient-to-r from-purple-600 to-purple-800" />
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Summer Music Festival</h2>
                <p className="text-gray-500 mb-4">July 15, 2025 • 7:00 PM • Grand Theater</p>
                <p className="text-gray-600 mb-6">
                  Join us for an unforgettable night of live music featuring top artists from around the world.
                </p>
                <button className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium">
                  Get Tickets
                </button>
              </div>
            </div>
          )}

          {activeTab === "ticket" && (
            <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-6 text-white shadow-xl max-w-md mx-auto">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-purple-600 font-bold">GT</span>
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">Summer Music Festival</h3>
              <p className="text-white/80 text-sm mb-4">Jul 15, 2025 • 7:00 PM • Grand Theater</p>
              <div className="border-t border-white/20 pt-4 flex justify-between items-end">
                <div>
                  <p className="text-white/60 text-xs">VIP Access</p>
                  <p className="font-bold">Section A / Row 12 / Seat 5</p>
                </div>
                <div className="w-16 h-16 bg-white rounded-lg" />
              </div>
            </div>
          )}

          {activeTab === "email" && (
            <div className="bg-white rounded-lg shadow-lg overflow-hidden max-w-lg mx-auto">
              <div className="bg-purple-600 px-6 py-4 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-white rounded-lg">
                  <span className="font-bold text-purple-600">GT</span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Your Order Confirmation</h3>
                <p className="text-gray-600 mb-4">Thank you for your purchase!</p>
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <p className="font-medium">Summer Music Festival</p>
                  <p className="text-sm text-gray-500">2x VIP Tickets - $300.00</p>
                </div>
                <button className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium">
                  View Your Tickets
                </button>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t text-center">
                <p className="text-xs text-gray-500">© 2025 Grand Theater Entertainment LLC</p>
              </div>
            </div>
          )}

          {activeTab === "venue" && (
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="h-48 bg-gradient-to-r from-purple-600 to-purple-800 relative">
                <div className="absolute bottom-4 left-4 text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">⭐ 4.8 (234 reviews)</span>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">The Grand Theater</h2>
                <p className="text-gray-500 mb-4">Downtown, New York • Open until 11 PM</p>
                <p className="text-gray-600 mb-6">
                  A historic 2,500-seat venue located in the heart of downtown, hosting world-class entertainment since 1920.
                </p>
                <h3 className="font-semibold text-gray-900 mb-3">Upcoming Events</h3>
                <div className="space-y-2">
                  <div className="p-3 bg-gray-50 rounded-lg flex justify-between items-center">
                    <span className="font-medium">Summer Music Festival</span>
                    <button className="text-purple-600 text-sm font-medium">Tickets</button>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg flex justify-between items-center">
                    <span className="font-medium">Jazz Night</span>
                    <button className="text-purple-600 text-sm font-medium">Tickets</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
