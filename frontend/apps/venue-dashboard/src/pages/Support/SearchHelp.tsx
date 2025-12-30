import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, FileText, ChevronRight } from "lucide-react";

const allArticles = [
  { id: 1, title: "How to create your first event", category: "Getting Started", snippet: "Learn the basics of creating and publishing your first event on TicketToken..." },
  { id: 2, title: "Setting up ticket types and pricing", category: "Tickets", snippet: "Understand how to create different ticket tiers, set prices, and manage inventory..." },
  { id: 3, title: "Connecting your Stripe account", category: "Payments", snippet: "Step-by-step guide to connecting Stripe for receiving payouts..." },
  { id: 4, title: "Using the mobile scanner app", category: "Scanning", snippet: "Download and set up the scanner app for seamless check-in at your events..." },
  { id: 5, title: "Understanding your analytics dashboard", category: "Analytics", snippet: "Get insights into your sales, attendance, and revenue metrics..." },
  { id: 6, title: "Managing refunds and cancellations", category: "Payments", snippet: "How to process refunds, handle cancellations, and manage your refund policy..." },
  { id: 7, title: "Creating promo codes and discounts", category: "Tickets", snippet: "Set up promotional codes, bulk discounts, and special offers for your events..." },
  { id: 8, title: "Adding team members and permissions", category: "Team", snippet: "Invite staff, assign roles, and manage access permissions for your venue..." },
];

export default function SearchHelp() {
  const [query, setQuery] = useState("");
  
  const filteredArticles = query.length > 0
    ? allArticles.filter(a => 
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.snippet.toLowerCase().includes(query.toLowerCase()) ||
        a.category.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Search Help</h1>
      </div>

      {/* Search Input */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search for help articles..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
        />
      </div>

      {/* Results */}
      {query.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {filteredArticles.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {filteredArticles.map((article) => (
                <Link
                  key={article.id}
                  to={`/venue/support/articles/${article.id}`}
                  className="flex items-start gap-4 p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{article.title}</p>
                    <p className="text-sm text-purple-600 mb-1">{article.category}</p>
                    <p className="text-sm text-gray-500 line-clamp-2">{article.snippet}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">No articles found for "{query}"</p>
              <Link to="/venue/support/contact" className="text-purple-600 hover:text-purple-700 font-medium">
                Contact support for help →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {query.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Start typing to search help articles</p>
        </div>
      )}
    </div>
  );
}
