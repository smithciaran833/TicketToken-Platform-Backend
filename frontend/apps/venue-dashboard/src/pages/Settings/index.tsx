import { Link } from "react-router-dom";
import { 
  Building2, Camera, Share2, Clock, MapPin, Car, Train, Truck, Volume2,
  DoorOpen, DoorClosed, RotateCcw, Users, Grid, Armchair, Accessibility,
  Crown, Key, Gift, ClipboardList, CreditCard, IdCard,
  FileText, Shield, Wine, Wallet, CheckCircle,
  Palette, Ticket, Mail, Eye, Globe,
  MessageSquare, Bell, RefreshCw,
  Baby, Briefcase, FileEdit,
  AlertTriangle, Route, Cross
} from "lucide-react";

const settingsSections = [
  {
    title: "Profile & Media",
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
    items: [
      { name: "Entry Points", description: "Manage entrances", href: "/venue/settings/entry", icon: DoorOpen },
      { name: "Exit Points", description: "Manage exits", href: "/venue/settings/exit", icon: DoorClosed },
      { name: "Re-Entry Policy", description: "Re-entry rules", href: "/venue/settings/reentry", icon: RotateCcw },
      { name: "Capacity", description: "Venue capacity settings", href: "/venue/settings/capacity", icon: Users },
      { name: "Age Restrictions", description: "Age requirements", href: "/venue/settings/age", icon: Baby },
    ]
  },
  {
    title: "Seating",
    items: [
      { name: "Configurations", description: "Seating layouts", href: "/venue/settings/seating/configs", icon: Grid },
      { name: "Map Builder", description: "Build seating maps", href: "/venue/settings/seating/builder", icon: Armchair },
      { name: "Sections & Zones", description: "Manage sections", href: "/venue/settings/seating/sections", icon: Grid },
      { name: "Accessibility", description: "ADA seating", href: "/venue/settings/seating/accessibility", icon: Accessibility },
    ]
  },
  {
    title: "VIP & Guest Services",
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
    items: [
      { name: "Logo & Colors", description: "Brand identity", href: "/venue/settings/branding/logo", icon: Palette },
      { name: "Ticket Design", description: "Customize tickets", href: "/venue/settings/branding/tickets", icon: Ticket },
      { name: "Email Branding", description: "Email templates", href: "/venue/settings/branding/email", icon: Mail },
      { name: "Custom Domain", description: "Your own domain", href: "/venue/settings/branding/domain", icon: Globe },
    ]
  },
  {
    title: "Communication",
    items: [
      { name: "Email Templates", description: "Manage emails", href: "/venue/settings/communication/email", icon: Mail },
      { name: "SMS Templates", description: "Text messages", href: "/venue/settings/communication/sms", icon: MessageSquare },
      { name: "Notifications", description: "Notification settings", href: "/venue/settings/communication/notifications", icon: Bell },
    ]
  },
  {
    title: "Policies",
    items: [
      { name: "Refund Policy", description: "Refund rules", href: "/venue/settings/policies/refund", icon: RefreshCw },
      { name: "Age Policy", description: "Age requirements", href: "/venue/settings/policies/age", icon: Baby },
      { name: "Bag Policy", description: "Bag restrictions", href: "/venue/settings/policies/bags", icon: Briefcase },
      { name: "Custom Policies", description: "Additional policies", href: "/venue/settings/policies/custom", icon: FileEdit },
    ]
  },
  {
    title: "Safety",
    items: [
      { name: "Emergency Contacts", description: "Emergency info", href: "/venue/settings/safety/emergency", icon: AlertTriangle },
      { name: "Evacuation Plan", description: "Emergency routes", href: "/venue/settings/safety/evacuation", icon: Route },
      { name: "Safety Protocols", description: "Safety procedures", href: "/venue/settings/safety/protocols", icon: Shield },
      { name: "Medical Stations", description: "First aid locations", href: "/venue/settings/safety/medical", icon: Cross },
    ]
  },
];

export default function SettingsIndex() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Configure your venue</p>
      </div>

      <div className="space-y-8">
        {settingsSections.map((section) => (
          <div key={section.title}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{section.title}</h2>
            <div className="grid grid-cols-3 gap-4">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-sm text-gray-500">{item.description}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
