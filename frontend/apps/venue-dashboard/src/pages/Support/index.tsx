import { Link } from "react-router-dom";
import { 
  Search, Book, Video, Rocket, Award, MessageCircle, Phone, 
  Calendar, AlertTriangle, User, GraduationCap, Bug, Lightbulb,
  Ticket, FileText, Bell, Activity, ChevronRight
} from "lucide-react";

const categories = [
  { name: "Getting Started", description: "New to TicketToken? Start here", icon: Rocket, href: "/venue/support/getting-started" },
  { name: "Events", description: "Creating and managing events", icon: Calendar, href: "/venue/support/articles/events" },
  { name: "Tickets", description: "Ticket types, pricing, and sales", icon: Ticket, href: "/venue/support/articles/tickets" },
  { name: "Payments", description: "Payouts, refunds, and billing", icon: FileText, href: "/venue/support/articles/payments" },
  { name: "Scanning", description: "Entry management and check-in", icon: Activity, href: "/venue/support/articles/scanning" },
  { name: "Settings", description: "Account and venue configuration", icon: Award, href: "/venue/support/articles/settings" },
];

const popularArticles = [
  { id: 1, title: "How to create your first event", category: "Getting Started" },
  { id: 2, title: "Setting up ticket types and pricing", category: "Tickets" },
  { id: 3, title: "Connecting your Stripe account", category: "Payments" },
  { id: 4, title: "Using the mobile scanner app", category: "Scanning" },
  { id: 5, title: "Understanding your analytics dashboard", category: "Analytics" },
];

const quickLinks = [
  { name: "Tutorial Videos", icon: Video, href: "/venue/support/tutorials" },
  { name: "Best Practices", icon: Award, href: "/venue/support/best-practices" },
  { name: "Training Sessions", icon: GraduationCap, href: "/venue/support/training" },
  { name: "Report a Bug", icon: Bug, href: "/venue/support/bug-report" },
  { name: "Request Feature", icon: Lightbulb, href: "/venue/support/feature-request" },
];

export default function HelpCenter() {
  return (
    <div>
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Help Center</h1>
        <p className="text-gray-500">Find answers, tutorials, and support resources</p>
      </div>

      {/* Search */}
      <div className="max-w-2xl mx-auto mb-8">
        <Link to="/venue/support/search">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <div className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-xl text-gray-400 bg-white hover:border-purple-500 transition-colors cursor-pointer">
              Search for help articles...
            </div>
          </div>
        </Link>
      </div>

      {/* Categories */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <Link
              key={category.name}
              to={category.href}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:border-purple-500 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{category.name}</h3>
              <p className="text-sm text-gray-500">{category.description}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Popular Articles */}
        <div className="col-span-2 bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Book className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Popular Articles</h2>
          </div>
          <div className="space-y-3">
            {popularArticles.map((article) => (
              <Link
                key={article.id}
                to={`/venue/support/articles/${article.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900">{article.title}</p>
                  <p className="text-sm text-gray-500">{article.category}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Links & Contact */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h2>
            <div className="space-y-2">
              {quickLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.name}
                    to={link.href}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{link.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg p-6 text-white">
            <MessageCircle className="w-8 h-8 mb-3 text-purple-200" />
            <h3 className="font-semibold mb-2">Need Help?</h3>
            <p className="text-sm text-purple-200 mb-4">Our support team is here for you</p>
            <div className="space-y-2">
              <Link to="/venue/support/contact" className="block w-full px-4 py-2 bg-white text-purple-600 rounded-lg text-sm font-medium text-center hover:bg-purple-50 transition-colors">
                Contact Support
              </Link>
              <Link to="/venue/support/chat" className="block w-full px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium text-center hover:bg-purple-400 transition-colors">
                Live Chat
              </Link>
            </div>
          </div>

          <Link to="/venue/support/emergency" className="block bg-red-50 border border-red-200 rounded-lg p-4 hover:bg-red-100 transition-colors">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <div>
                <p className="font-medium text-red-800">Emergency Support</p>
                <p className="text-sm text-red-600">Critical issues only</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
