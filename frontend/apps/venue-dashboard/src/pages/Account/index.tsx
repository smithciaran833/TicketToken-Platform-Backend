import { Link } from "react-router-dom";
import { User, Lock, Shield, Bell, CreditCard, Building2, ChevronRight } from "lucide-react";

const sections = [
  {
    title: "Profile",
    description: "Manage your personal information",
    icon: User,
    href: "/account/profile",
  },
  {
    title: "Password",
    description: "Change your password",
    icon: Lock,
    href: "/account/password",
  },
  {
    title: "Two-Factor Authentication",
    description: "Add an extra layer of security",
    icon: Shield,
    href: "/account/2fa",
  },
  {
    title: "Notifications",
    description: "Manage email and push notifications",
    icon: Bell,
    href: "/account/notifications",
  },
];

const user = {
  name: "John Doe",
  email: "john@venue.com",
  avatar: null,
  role: "Owner",
  joined: "January 2024",
};

export default function AccountSettings() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Account Settings</h1>
      <p className="text-gray-500 mb-8">Manage your account and preferences</p>

      {/* Profile Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            {user.name.split(" ").map(n => n[0]).join("")}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900">{user.name}</h2>
            <p className="text-gray-500">{user.email}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                {user.role}
              </span>
              <span className="text-sm text-gray-400">Member since {user.joined}</span>
            </div>
          </div>
          <Link to="/account/profile">
            <button className="px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg font-medium">
              Edit Profile
            </button>
          </Link>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {sections.map((section, index) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.title}
              to={section.href}
              className={`flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors ${
                index !== sections.length - 1 ? "border-b border-gray-200" : ""
              }`}
            >
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Icon className="w-5 h-5 text-gray-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{section.title}</p>
                <p className="text-sm text-gray-500">{section.description}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </Link>
          );
        })}
      </div>

      {/* Danger Zone */}
      <div className="mt-6 bg-white rounded-lg border border-red-200 p-6">
        <h3 className="font-semibold text-red-800 mb-2">Danger Zone</h3>
        <p className="text-sm text-gray-600 mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 font-medium">
          Delete Account
        </button>
      </div>
    </div>
  );
}
