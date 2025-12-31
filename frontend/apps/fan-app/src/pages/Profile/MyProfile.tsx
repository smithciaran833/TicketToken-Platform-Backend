import { Link } from "react-router-dom";
import {
  Settings,
  CreditCard,
  Users,
  Sparkles,
  Accessibility,
  HelpCircle,
  FileText,
  LogOut,
  ChevronRight,
} from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";

const mockUser = {
  name: "John Smith",
  email: "john.smith@example.com",
  avatar: null,
  eventsAttended: 12,
  memberSince: "2024",
};

const menuSections = [
  {
    items: [
      { icon: Settings, label: "Account Settings", path: "/profile/settings" },
      { icon: CreditCard, label: "Payment Methods", path: "/profile/payment-methods" },
      { icon: Users, label: "Following", path: "/profile/following" },
      { icon: Sparkles, label: "NFT Collection", path: "/profile/nfts" },
      { icon: Accessibility, label: "Accessibility", path: "/profile/accessibility" },
    ],
  },
  {
    items: [
      { icon: HelpCircle, label: "Help & Support", path: "/profile/help" },
      { icon: FileText, label: "Legal", path: "/profile/legal" },
    ],
  },
];

export default function MyProfile() {
  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white px-5 py-6 border-b border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        </header>

        <div className="p-5 space-y-6">
          {/* Profile Card */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
                {mockUser.avatar ? (
                  <img
                    src={mockUser.avatar}
                    alt={mockUser.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-bold text-purple-600">
                    {mockUser.name.charAt(0)}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">{mockUser.name}</h2>
                <p className="text-gray-500">{mockUser.email}</p>
              </div>
            </div>

            <Link
              to="/profile/edit"
              className="block w-full mt-4 py-2.5 text-center text-purple-600 font-semibold border border-purple-200 rounded-xl hover:bg-purple-50 transition-colors"
            >
              Edit Profile
            </Link>

            {/* Stats */}
            <div className="flex items-center justify-around mt-5 pt-5 border-t border-gray-100">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{mockUser.eventsAttended}</p>
                <p className="text-sm text-gray-500">Events Attended</p>
              </div>
              <div className="w-px h-10 bg-gray-200" />
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{mockUser.memberSince}</p>
                <p className="text-sm text-gray-500">Member Since</p>
              </div>
            </div>
          </div>

          {/* Menu Sections */}
          {menuSections.map((section, sectionIndex) => (
            <div
              key={sectionIndex}
              className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100"
            >
              {section.items.map((item) => {
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
          ))}

          {/* Log Out */}
          <button className="w-full flex items-center justify-center gap-2 py-4 bg-white rounded-2xl shadow-sm text-red-600 font-semibold hover:bg-red-50 transition-colors">
            <LogOut className="w-5 h-5" />
            Log Out
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
