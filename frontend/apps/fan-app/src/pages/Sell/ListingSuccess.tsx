import { useLocation, useNavigate, Link } from "react-router-dom";
import { CheckCircle, Eye, Bell } from "lucide-react";

export default function ListingSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const { eventTitle, price } = (location.state as { eventTitle: string; price: number }) || {
    eventTitle: "Your ticket",
    price: 0,
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-12">
        {/* Success Icon */}
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>

        {/* Success Message */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Listed for Sale!</h1>
        <p className="text-gray-500 text-center max-w-xs">
          {eventTitle} is now listed for ${price.toFixed(2)}
        </p>

        {/* Info Cards */}
        <div className="w-full max-w-sm mt-8 space-y-3">
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
            <Eye className="w-5 h-5 text-purple-600 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Track your listing</p>
              <p className="text-sm text-gray-500">
                See views, saves, and stats in your listings
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
            <Bell className="w-5 h-5 text-purple-600 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">We'll notify you</p>
              <p className="text-sm text-gray-500">
                You'll get a notification when your ticket sells
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-4 border-t border-gray-200 space-y-3">
        <Link
          to="/sell"
          className="block w-full py-3.5 bg-purple-600 text-white text-center font-semibold rounded-xl hover:bg-purple-700 transition-colors"
        >
          View My Listings
        </Link>
        <button
          onClick={() => navigate("/")}
          className="w-full py-3.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
