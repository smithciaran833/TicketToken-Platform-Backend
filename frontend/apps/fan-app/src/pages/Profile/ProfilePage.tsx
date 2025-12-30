import { Link } from "react-router-dom";
import { 
  User, Settings, CreditCard, Heart, Bell, Users, HelpCircle, 
  FileText, LogOut, ChevronRight, Sparkles, Shield
} from "lucide-react";

const menuSections = [
  {
    items: [
      { icon: Settings, label: "Account Settings", path: "/profile/settings" },
      { icon: CreditCard, label: "Payment Methods", path: "/profile/payments" },
      { icon: Bell, label: "Notifications", path: "/profile/notifications" },
    ]
  },
  {
    items: [
      { icon: Heart, label: "Saved Events", path: "/profile/saved" },
      { icon: Users, label: "Following", path: "/profile/following" },
      { icon: Sparkles, label: "NFT Collection", path: "/profile/nfts" },
    ]
  },
  {
    items: [
      { icon: Shield, label: "Accessibility", path: "/profile/accessibility" },
      { icon: HelpCircle, label: "Help Center", path: "/profile/help" },
      { icon: FileText, label: "Legal", path: "/profile/legal" },
    ]
  },
];

export default function ProfilePage() {
  const user = {
    name: "John Smith",
    email: "john@example.com",
    eventsAttended: 12,
    avatar: null,
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white px-4 py-6 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
            ) : (
              <User className="w-8 h-8 text-purple-600" />
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{user.name}</h1>
            <p className="text-gray-500">{user.email}</p>
          </div>
          <Link to="/profile/edit" className="text-purple-600 font-medium">Edit</Link>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded-full">
            {user.eventsAttended} events attended
          </span>
        </div>
      </header>

      {/* Menu Sections */}
      <div className="p-4 space-y-4">
        {menuSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="bg-white rounded-xl overflow-hidden shadow-sm">
            {section.items.map((item, itemIndex) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center justify-between p-4 ${
                    itemIndex !== section.items.length - 1 ? "border-b border-gray-100" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-900">{item.label}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </Link>
              );
            })}
          </div>
        ))}

        {/* Logout */}
        <button className="w-full bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 text-red-600">
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Log Out</span>
        </button>
      </div>
    </div>
  );
}
