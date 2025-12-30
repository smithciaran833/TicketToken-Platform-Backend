import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Eye, DollarSign } from "lucide-react";
import { Tabs, Button } from "../../components/ui";

const activeListings = [
  { id: 1, eventName: "NBA Finals Game 5", date: "Jun 18", ticketType: "Section 102", price: 450, views: 234, daysListed: 3 },
];

const soldListings = [
  { id: 2, eventName: "Comedy Night", date: "May 20", ticketType: "GA", price: 35, soldDate: "May 15", payout: 31.50 },
];

export default function MyListings() {
  const [activeTab, setActiveTab] = useState("active");

  const tabs = [
    { id: "active", label: "Active", count: activeListings.length },
    { id: "sold", label: "Sold", count: soldListings.length },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-4 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">My Listings</h1>
          <Link to="/sell/new">
            <Button size="sm">
              <Plus className="w-4 h-4" />
              List Ticket
            </Button>
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white px-4">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {activeTab === "active" ? (
          activeListings.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DollarSign className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 mb-4">No active listings</p>
              <Link to="/sell/new">
                <Button>List a Ticket</Button>
              </Link>
            </div>
          ) : (
            activeListings.map((listing) => (
              <Link
                key={listing.id}
                to={`/sell/${listing.id}`}
                className="block bg-white rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{listing.eventName}</h3>
                    <p className="text-sm text-gray-500">{listing.date} • {listing.ticketType}</p>
                  </div>
                  <p className="font-bold text-gray-900">${listing.price}</p>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    {listing.views} views
                  </span>
                  <span>{listing.daysListed} days listed</span>
                </div>
              </Link>
            ))
          )
        ) : (
          soldListings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No sold tickets yet</p>
            </div>
          ) : (
            soldListings.map((listing) => (
              <div
                key={listing.id}
                className="bg-white rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{listing.eventName}</h3>
                    <p className="text-sm text-gray-500">{listing.date} • {listing.ticketType}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">+${listing.payout}</p>
                    <p className="text-xs text-gray-400">Sold {listing.soldDate}</p>
                  </div>
                </div>
              </div>
            ))
          )
        )}
      </div>

      {/* Seller Account Link */}
      <div className="px-4 mt-4">
        <Link
          to="/sell/settings"
          className="block bg-white rounded-xl p-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Seller Account</p>
              <p className="text-sm text-gray-500">Manage payouts & settings</p>
            </div>
            <span className="text-purple-600 text-sm font-medium">View →</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
