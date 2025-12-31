import { useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Ticket, AlertTriangle} from "lucide-react";

const mockTicket = {
  eventTitle: "Japanese Breakfast",
  eventDate: "Saturday, July 15, 2025",
  eventTime: "8:00 PM",
  venue: "The Fillmore",
  ticketType: "General Admission",
  section: "Floor",
  image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80",
};

export default function ConfirmListing() {
  const { ticketId: _ticketId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { price, payout } = (location.state as { price: number; payout: number }) || {
    price: 55,
    payout: 49.5,
  };

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isListing, setIsListing] = useState(false);

  const handleListTicket = async () => {
    if (!agreedToTerms) return;

    setIsListing(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    navigate("/sell/success", { state: { eventTitle: mockTicket.eventTitle, price } });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Confirm Listing</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Listing Summary */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <img
            src={mockTicket.image}
            alt={mockTicket.eventTitle}
            className="w-full aspect-video object-cover"
          />
          <div className="p-5">
            <h2 className="text-xl font-bold text-gray-900">{mockTicket.eventTitle}</h2>

            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 text-gray-600">
                <Calendar className="w-5 h-5 text-gray-400" />
                <span>{mockTicket.eventDate} · {mockTicket.eventTime}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <MapPin className="w-5 h-5 text-gray-400" />
                <span>{mockTicket.venue}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <Ticket className="w-5 h-5 text-gray-400" />
                <span>{mockTicket.ticketType} · {mockTicket.section}</span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600">Your Price</span>
                <span className="text-xl font-bold text-gray-900">${price.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Your Payout</span>
                <span className="text-lg font-semibold text-green-600">${payout.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Important Note */}
        <div className="bg-amber-50 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Important</p>
            <p className="text-sm text-amber-700 mt-1">
              When your ticket sells, it will be automatically transferred to the buyer.
              You will no longer have access to this ticket.
            </p>
          </div>
        </div>

        {/* Terms Agreement */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 mt-0.5"
          />
          <span className="text-gray-600 text-sm">
            I agree to the{" "}
            <a href="#" className="text-purple-600 underline">
              Resale Terms of Service
            </a>{" "}
            and understand that my ticket will be transferred to the buyer upon sale.
          </span>
        </label>
      </div>

      {/* List Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4">
        <button
          onClick={handleListTicket}
          disabled={!agreedToTerms || isListing}
          className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all ${
            agreedToTerms && !isListing
              ? "bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isListing ? "Listing..." : "List for Sale"}
        </button>
      </div>
    </div>
  );
}
