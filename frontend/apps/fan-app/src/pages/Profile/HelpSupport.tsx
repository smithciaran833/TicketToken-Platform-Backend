import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, MessageCircle, FileText,  Mail, ChevronRight } from "lucide-react";

const helpCategories = [
  { label: "Buying Tickets", count: 12 },
  { label: "Selling Tickets", count: 8 },
  { label: "Transfers & Refunds", count: 6 },
  { label: "Account & Billing", count: 10 },
  { label: "Event Day", count: 5 },
  { label: "NFTs & Collectibles", count: 4 },
];

const popularArticles = [
  { id: "1", title: "How to transfer a ticket" },
  { id: "2", title: "Refund policy explained" },
  { id: "3", title: "Adding tickets to Apple Wallet" },
  { id: "4", title: "What to do if you can't find your tickets" },
];

export default function HelpSupport() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Help & Support</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search for help..."
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Contact Options */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/profile/help/contact"
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          >
            <MessageCircle className="w-6 h-6 text-purple-600" />
            <span className="font-medium text-gray-900">Live Chat</span>
          </Link>
          <Link
            to="/profile/help/contact"
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          >
            <Mail className="w-6 h-6 text-purple-600" />
            <span className="font-medium text-gray-900">Email Us</span>
          </Link>
        </div>

        {/* Categories */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Help Topics
          </h2>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {helpCategories.map((category) => (
              <Link
                key={category.label}
                to={`/profile/help/category/${category.label.toLowerCase().replace(/ /g, "-")}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900">{category.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{category.count} articles</span>
                  <ChevronRight className="w-5 h-5 text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Popular Articles */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Popular Articles
          </h2>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {popularArticles.map((article) => (
              <Link
                key={article.id}
                to={`/profile/help/article/${article.id}`}
                className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <FileText className="w-5 h-5 text-gray-400" />
                <span className="text-gray-900">{article.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
