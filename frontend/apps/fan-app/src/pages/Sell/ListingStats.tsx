import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, Heart, TrendingUp, TrendingDown, Minus } from "lucide-react";

const mockStats = {
  eventTitle: "Japanese Breakfast",
  totalViews: 156,
  uniqueViewers: 89,
  saves: 12,
  daysListed: 5,
  viewsOverTime: [
    { day: "Mon", views: 12 },
    { day: "Tue", views: 28 },
    { day: "Wed", views: 35 },
    { day: "Thu", views: 42 },
    { day: "Fri", views: 39 },
  ],
  comparison: {
    avgPrice: 52,
    yourPrice: 55,
    lowestPrice: 45,
    highestPrice: 75,
  },
  priceSuggestion: 50,
};

export default function ListingStats() {
  const { listingId: _listingId } = useParams();
  const navigate = useNavigate();

  const priceComparison = mockStats.comparison.yourPrice - mockStats.comparison.avgPrice;
  const maxViews = Math.max(...mockStats.viewsOverTime.map((d) => d.views));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Listing Stats</h1>
            <p className="text-sm text-gray-500">{mockStats.eventTitle}</p>
          </div>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Eye className="w-4 h-4" />
              <span className="text-sm">Total Views</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{mockStats.totalViews}</p>
            <p className="text-sm text-gray-500">{mockStats.uniqueViewers} unique</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Heart className="w-4 h-4" />
              <span className="text-sm">Saves</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{mockStats.saves}</p>
            <p className="text-sm text-gray-500">{mockStats.daysListed} days listed</p>
          </div>
        </div>

        {/* Views Chart */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Views Over Time
          </h3>
          <div className="flex items-end justify-between h-32 gap-2">
            {mockStats.viewsOverTime.map((day) => (
              <div key={day.day} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full bg-purple-500 rounded-t"
                  style={{ height: `${(day.views / maxViews) * 100}%`, minHeight: 4 }}
                />
                <span className="text-xs text-gray-500">{day.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Price Comparison */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Price Comparison
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Your Price</span>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-gray-900">${mockStats.comparison.yourPrice}</span>
                {priceComparison > 0 ? (
                  <span className="flex items-center text-amber-600 text-sm">
                    <TrendingUp className="w-4 h-4" />
                    ${priceComparison} above avg
                  </span>
                ) : priceComparison < 0 ? (
                  <span className="flex items-center text-green-600 text-sm">
                    <TrendingDown className="w-4 h-4" />
                    ${Math.abs(priceComparison)} below avg
                  </span>
                ) : (
                  <span className="flex items-center text-gray-500 text-sm">
                    <Minus className="w-4 h-4" />
                    At average
                  </span>
                )}
              </div>
            </div>

            <div className="relative h-2 bg-gray-100 rounded-full">
              <div
                className="absolute h-full bg-purple-500 rounded-full"
                style={{
                  left: `${((mockStats.comparison.lowestPrice - mockStats.comparison.lowestPrice) /
                    (mockStats.comparison.highestPrice - mockStats.comparison.lowestPrice)) *
                    100}%`,
                  width: `${((mockStats.comparison.yourPrice - mockStats.comparison.lowestPrice) /
                    (mockStats.comparison.highestPrice - mockStats.comparison.lowestPrice)) *
                    100}%`,
                }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-purple-600 rounded-full border-2 border-white shadow"
                style={{
                  left: `${((mockStats.comparison.yourPrice - mockStats.comparison.lowestPrice) /
                    (mockStats.comparison.highestPrice - mockStats.comparison.lowestPrice)) *
                    100}%`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            </div>

            <div className="flex justify-between text-sm text-gray-500">
              <span>${mockStats.comparison.lowestPrice} (Low)</span>
              <span>${mockStats.comparison.avgPrice} (Avg)</span>
              <span>${mockStats.comparison.highestPrice} (High)</span>
            </div>
          </div>

          {/* Price Suggestion */}
          <div className="mt-6 p-4 bg-green-50 rounded-xl">
            <p className="text-sm text-green-800">
              <strong>Suggested price:</strong> ${mockStats.priceSuggestion}
            </p>
            <p className="text-sm text-green-700 mt-1">
              Based on similar listings and current demand
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
