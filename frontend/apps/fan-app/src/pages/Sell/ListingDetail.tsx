import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Eye, Heart, Calendar,  Edit2, Trash2 } from "lucide-react";

const mockListing = {
  id: "1",
  eventTitle: "Japanese Breakfast",
  eventDate: "Saturday, July 15, 2025",
  eventTime: "8:00 PM",
  venue: "The Fillmore",
  ticketType: "General Admission",
  section: "Floor",
  price: 55,
  payout: 49.50,
  feePercent: 10,
  status: "active" as const,
  views: 24,
  saves: 3,
  daysListed: 5,
  image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80",
};

export default function ListingDetail() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const handleRemove = async () => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    navigate("/sell");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Listing Details</h1>
        </div>
      </header>

      {/* Hero Image */}
      <div className="relative aspect-video">
        <img
          src={mockListing.image}
          alt={mockListing.eventTitle}
          className="w-full h-full object-cover"
        />
        <div className="absolute top-4 right-4">
          <span className="px-3 py-1.5 bg-green-500 text-white text-sm font-semibold rounded-full">
            Active
          </span>
        </div>
      </div>

      <div className="px-5 py-6 space-y-6">
        {/* Event Info */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{mockListing.eventTitle}</h2>
          <p className="text-gray-500 mt-1">{mockListing.eventDate} · {mockListing.eventTime}</p>
          <p className="text-gray-500">{mockListing.venue}</p>
          <div className="flex gap-2 mt-3">
            <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded-full">
              {mockListing.ticketType}
            </span>
            {mockListing.section && (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-full">
                {mockListing.section}
              </span>
            )}
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Pricing
          </h3>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-600">Your Price</span>
            <span className="text-2xl font-bold text-gray-900">${mockListing.price}</span>
          </div>
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <span className="text-gray-600">Platform Fee ({mockListing.feePercent}%)</span>
            <span className="text-gray-600">-${(mockListing.price - mockListing.payout).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between pt-4">
            <span className="font-semibold text-gray-900">Your Payout</span>
            <span className="text-xl font-bold text-green-600">${mockListing.payout.toFixed(2)}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Stats
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Eye className="w-6 h-6 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{mockListing.views}</p>
              <p className="text-sm text-gray-500">Views</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Heart className="w-6 h-6 text-red-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{mockListing.saves}</p>
              <p className="text-sm text-gray-500">Saves</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{mockListing.daysListed}</p>
              <p className="text-sm text-gray-500">Days Listed</p>
            </div>
          </div>

          <Link
            to={`/sell/listing/${listingId}/stats`}
            className="block text-center text-purple-600 font-medium mt-4 hover:text-purple-700"
          >
            View Detailed Stats
          </Link>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link
            to={`/sell/listing/${listingId}/edit`}
            className="flex items-center justify-center gap-2 w-full py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
          >
            <Edit2 className="w-5 h-5" />
            Edit Price
          </Link>
          <button
            onClick={() => setShowRemoveModal(true)}
            className="flex items-center justify-center gap-2 w-full py-3 bg-white text-red-600 font-semibold rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
            Remove Listing
          </button>
        </div>
      </div>

      {/* Remove Modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowRemoveModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Remove Listing?</h3>
            <p className="text-gray-500 mb-6">
              Your ticket will be removed from the marketplace and returned to your tickets.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRemoveModal(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
