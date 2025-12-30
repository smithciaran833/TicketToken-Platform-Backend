import { Link } from "react-router-dom";
import {
  Building2, Camera, Share2, Clock, MapPin, Car, Train, Truck, Volume2,
  DoorOpen, DoorClosed, RotateCcw, Users, Grid, Armchair, Accessibility,
  Crown, Key, Gift, ClipboardList, CreditCard, IdCard,
  FileText, Shield, Wine, Wallet, CheckCircle,
  Palette, Ticket, Mail, Eye, Globe,
  MessageSquare, Bell, RefreshCw,
  Baby, Briefcase, FileEdit,
  AlertTriangle, Route, Cross, ChevronRight
} from "lucide-react";

interface SettingsItem {
  name: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SettingsSection {
  title: string;
  id: string;
  items: SettingsItem[];
}

const settingsSections: SettingsSection[] = [
  {
    title: "Profile & Media",
    id: "profile-media",
    items: [
      { name: "Venue Profile", description: "Basic venue information", href: "/venue/settings/profile", icon: Building2 },
      { name: "Photos & Videos", description: "Manage venue media", href: "/venue/settings/media", icon: Camera },
      { name: "Social Links", description: "Connect social accounts", href: "/venue/settings/social", icon: Share2 },
      { name: "Venue Hours", description: "Operating hours", href: "/venue/settings/hours", icon: Clock },
      { name: "Preview Page", description: "See public venue page", href: "/venue/settings/preview", icon: Eye },
    ]
  },
  {
    title: "Location & Access",
    id: "location-access",
    items: [
      { name: "Location", description: "Address and map", href: "/venue/settings/location", icon: MapPin },
      { name: "Parking", description: "Parking information", href: "/venue/settings/parking", icon: Car },
      { name: "Transit", description: "Public transit info", href: "/venue/settings/transit", icon: Train },
      { name: "Load-In", description: "Artist/vendor load-in", href: "/venue/settings/loadin", icon: Truck },
      { name: "Curfew & Noise", description: "Noise restrictions", href: "/venue/settings/curfew", icon: Volume2 },
    ]
  },
  {
    title: "Entry & Capacity",
    id: "entry-capacity",
    items: [
      { name: "Entry Points", description: "Manage entrances", href: "/venue/settings/entry", icon: DoorOpen },
      { name: "Exit Points", description: "Manage exits", href: "/venue/settings/exit", icon: DoorClosed },
      { name: "Re-Entry Policy", description: "Re-entry rules", href: "/venue/settings/reentry", icon: RotateCcw },
      { name: "Capacity", description: "Venue capacity settings", href: "/venue/settings/capacity", icon: Users },
    ]
  },
  {
    title: "Seating",
    id: "seating",
    items: [
      { name: "Configurations", description: "Seating layouts", href: "/venue/settings/seating/configs", icon: Grid },
      { name: "Map Builder", description: "Build seating maps", href: "/venue/settings/seating/builder", icon: Armchair },
      { name: "Sections & Zones", description: "Manage sections", href: "/venue/settings/seating/sections", icon: Grid },
      { name: "Accessibility", description: "ADA seating", href: "/venue/settings/seating/accessibility", icon: Accessibility },
      { name: "Preview Map", description: "View seating map", href: "/venue/settings/seating/preview", icon: Eye },
    ]
  },
  {
    title: "VIP & Guest Services",
    id: "vip-guest",
    items: [
      { name: "VIP Areas", description: "Manage VIP spaces", href: "/venue/settings/vip/areas", icon: Crown },
      { name: "Access Rules", description: "VIP access control", href: "/venue/settings/vip/access", icon: Key },
      { name: "Amenities", description: "VIP perks", href: "/venue/settings/vip/amenities", icon: Gift },
      { name: "Guest Lists", description: "Guest list settings", href: "/venue/settings/vip/guestlists", icon: ClipboardList },
      { name: "Will Call", description: "Will call pickup", href: "/venue/settings/vip/willcall", icon: CreditCard },
      { name: "ID Verification", description: "ID check rules", href: "/venue/settings/vip/idverify", icon: IdCard },
    ]
  },
  {
    title: "Legal & Compliance",
    id: "legal-compliance",
    items: [
      { name: "Tax Information", description: "Tax settings", href: "/venue/settings/legal/tax", icon: FileText },
      { name: "Insurance", description: "Insurance certificates", href: "/venue/settings/legal/insurance", icon: Shield },
      { name: "Liquor License", description: "Alcohol permits", href: "/venue/settings/legal/liquor", icon: Wine },
      { name: "Payout Setup", description: "Stripe Connect", href: "/venue/settings/legal/payouts", icon: Wallet },
      { name: "Verification", description: "Venue verification", href: "/venue/settings/legal/verification", icon: CheckCircle },
    ]
  },
  {
    title: "Branding",
    id: "branding",
    items: [
      { name: "Logo & Colors", description: "Brand identity", href: "/venue/settings/branding/logo", icon: Palette },
      { name: "Ticket Design", description: "Customize tickets", href: "/venue/settings/branding/tickets", icon: Ticket },
      { name: "Email Branding", description: "Email templates", href: "/venue/settings/branding/email", icon: Mail },
      { name: "Custom Domain", description: "Your own domain", href: "/venue/settings/branding/domain", icon: Globe },
    ]
  },
  {
    title: "Communication",
    id: "communication",
    items: [
      { name: "Email Templates", description: "Manage emails", href: "/venue/settings/communication/email", icon: Mail },
      { name: "SMS Templates", description: "Text messages", href: "/venue/settings/communication/sms", icon: MessageSquare },
      { name: "Notifications", description: "Notification settings", href: "/venue/settings/communication/notifications", icon: Bell },
    ]
  },
  {
    title: "Policies",
    id: "policies",
    items: [
      { name: "Refund Policy", description: "Refund rules", href: "/venue/settings/policies/refund", icon: RefreshCw },
      { name: "Age Policy", description: "Age requirements", href: "/venue/settings/policies/age", icon: Baby },
      { name: "Bag Policy", description: "Bag restrictions", href: "/venue/settings/policies/bags", icon: Briefcase },
      { name: "Custom Policies", description: "Additional policies", href: "/venue/settings/policies/custom", icon: FileEdit },
    ]
  },
  {
    title: "Safety",
    id: "safety",
    items: [
      { name: "Emergency Contacts", description: "Emergency info", href: "/venue/settings/safety/emergency", icon: AlertTriangle },
      { name: "Evacuation Plan", description: "Emergency routes", href: "/venue/settings/safety/evacuation", icon: Route },
      { name: "Safety Protocols", description: "Safety procedures", href: "/venue/settings/safety/protocols", icon: Shield },
      { name: "Medical Stations", description: "First aid locations", href: "/venue/settings/safety/medical", icon: Cross },
    ]
  },
];

function SideNav() {
  return (
    <div className="w-56 flex-shrink-0">
      <div className="sticky top-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
        <p className="text-sm text-gray-500 mb-6">Configure your venue</p>
        <nav className="space-y-1">
          {settingsSections.map(function(section) {
            return (
              
                key={section.id}
                href={"#" + section.id}
                className="block px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {section.title}
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function SettingsContent() {
  return (
    <div className="flex-1 min-w-0">
      <div className="space-y-8">
        {settingsSections.map(function(section) {
          return (
            <div key={section.id} id={section.id}>
              <h2 className="text-base font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">
                {section.title}
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {section.items.map(function(item) {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gray-100 group-hover:bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
                          <Icon className="w-4 h-4 text-gray-500 group-hover:text-purple-600 transition-colors" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{item.name}</p>
                          <p className="text-xs text-gray-500">{item.description}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsIndex() {
  return (
    <div className="flex gap-8">
      <SideNav />
      <SettingsContent />
    </div>
  );
}
