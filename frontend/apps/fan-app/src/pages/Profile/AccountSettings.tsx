import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Shield, Link2, MapPin, Heart, Bell, ChevronRight } from "lucide-react";

const settingsItems = [
  { icon: Lock, label: "Change Password", path: "/profile/settings/password" },
  { icon: Shield, label: "Two-Factor Authentication", path: "/profile/settings/2fa" },
  { icon: Link2, label: "Linked Accounts", path: "/profile/settings/linked-accounts" },
  { icon: MapPin, label: "Location Preferences", path: "/profile/settings/location" },
  { icon: Heart, label: "Interest Preferences", path: "/profile/settings/interests" },
  { icon: Bell, label: "Notification Settings", path: "/profile/settings/notifications" },
];

export default function AccountSettings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Account Settings</h1>
        </div>
      </header>

      <div className="p-5">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
          {settingsItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <Icon className="w-5 h-5 text-gray-400" />
                <span className="flex-1 font-medium text-gray-900">{item.label}</span>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
