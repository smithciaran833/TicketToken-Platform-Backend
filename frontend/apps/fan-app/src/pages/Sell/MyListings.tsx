import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Eye, DollarSign, Tag } from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";

interface Listing {
  id: string;
  eventTitle: string;
  date: string;
  ticketType: string;
  price: number;
  status: "active" | "sold" | "expired";
  views: number;
  image: string;
}

const mockListings: Listing[] = [
  {
    id: "1",
    eventTitle: "Japanese Breakfast",
    date: "Sat, Jul 15",
    ticketType: "General Admission",
    price: 55,
    status: "active",
    views: 24,
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80",
  },
  {
    id: "2",
    eventTitle: "Khruangbin",
    date: "Thu, Aug 3",
    ticketType: "VIP",
    price: 120,
    status: "sold",
    views: 89,
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&q=80",
  },
  {
    id: "3",
    eventTitle: "Bon Iver",
    date: "Mar 22, 2025",
    ticketType: "Floor",
    price: 95,
    status: "expired",
    views: 45,
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=80",
  },
];

const statusStyles = {
  active: { bg: "bg-green-100", text: "text-green-700", label: "Active" },
  sold: { bg: "bg-blue-100", text: "text-blue-700", label: "Sold" },
  expired: { bg: "bg-gray-100", text: "text-gray-600", label: "Expired" },
};

export default function MyListings() {
  const [activeTab, setActiveTab] = useState<"active" | "sold" | "expired">("active");

  const filteredListings = mockListings.filter((l) => l.status === activeTab);

  const tabs = [
    { value: "active", label: "Active", count: mockListings.filter((l) => l.status === "active").length },
    { value: "sold", label: "Sold", count: mockListings.filter((l) => l.status === "sold").length },
    { value: "expired", label: "Expired", count: mockListings.filter((l) => l.status === "expired").length },
  ];

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white px-5 py-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">My Listings</h1>
            <Link
              to="/sell/new"
              className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-purple-600/30"
            >
              <Plus className="w-5 h-5 text-white" />
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value as typeof activeTab)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeTab === tab.value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </header>

        <div className="p-5">
          {filteredListings.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Tag className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                No {activeTab} listings
              </h2>
              <p className="text-gray-500 mb-6">
                {activeTab === "active"
                  ? "List a ticket to start selling"
                  : `Your ${activeTab} listings will appear here`}
              </p>
              {activeTab === "active" && (
                <Link
                  to="/sell/new"
                  className="inline-block px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
                >
                  List a Ticket
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredListings.map((listing) => {
                const status = statusStyles[listing.status];
                return (
                  <Link
                    key={listing.id}
                    to={`/sell/listing/${listing.id}`}
                    className={`block bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${
                      listing.status === "expired" ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex gap-4 p-4">
                      <img
                        src={listing.image}
                        alt={listing.eventTitle}
                        className="w-20 h-20 object-cover rounded-xl"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-gray-900">{listing.eventTitle}</h3>
                            <p className="text-sm text-gray-500">{listing.date}</p>
                            <p className="text-sm text-gray-500">{listing.ticketType}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                            {status.label}
                          </span>
                        </div>

                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-3 text-sm text-gray-500">
                            <div className="flex items-center gap-1">
                              <Eye className="w-4 h-4" />
                              <span>{listing.views}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-lg font-bold text-gray-900">
                            <DollarSign className="w-5 h-5" />
                            <span>{listing.price}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
