import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, DollarSign,  TrendingUp } from "lucide-react";

const mockTicket = {
  eventTitle: "Japanese Breakfast",
  ticketType: "General Admission",
  section: "Floor",
  faceValue: 45,
  minPrice: 20,
  maxPrice: 90,
  suggestedPrice: 52,
  feePercent: 10,
};

export default function SetResalePrice() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [price, setPrice] = useState(mockTicket.suggestedPrice.toString());

  const numericPrice = parseFloat(price) || 0;
  const fee = numericPrice * (mockTicket.feePercent / 100);
  const payout = numericPrice - fee;

  const isValid =
    numericPrice >= mockTicket.minPrice && numericPrice <= mockTicket.maxPrice;

  const handleContinue = () => {
    if (!isValid) return;
    navigate(`/sell/new/${ticketId}/confirm`, { state: { price: numericPrice, payout } });
  };

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Set Your Price</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Ticket Summary */}
        <div className="bg-gray-50 rounded-xl p-4">
          <h2 className="font-semibold text-gray-900">{mockTicket.eventTitle}</h2>
          <p className="text-sm text-gray-500">{mockTicket.ticketType}</p>
          {mockTicket.section && (
            <p className="text-sm text-gray-500">{mockTicket.section}</p>
          )}
          <p className="text-sm text-purple-600 font-medium mt-2">
            Face value: ${mockTicket.faceValue}
          </p>
        </div>

        {/* Price Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Your Price
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <DollarSign className="w-6 h-6 text-gray-400" />
            </div>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={`w-full pl-12 pr-4 py-4 text-3xl font-bold bg-gray-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                !isValid && price ? "border-red-300" : "border-gray-200"
              }`}
              min={mockTicket.minPrice}
              max={mockTicket.maxPrice}
            />
          </div>

          {/* Price Rules */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Minimum</span>
              <span className="font-medium text-gray-700">${mockTicket.minPrice}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Maximum (2x face value)</span>
              <span className="font-medium text-gray-700">${mockTicket.maxPrice}</span>
            </div>
          </div>

          {!isValid && price && (
            <p className="text-red-500 text-sm mt-2">
              {numericPrice < mockTicket.minPrice
                ? `Minimum price is $${mockTicket.minPrice}`
                : `Maximum price is $${mockTicket.maxPrice}`}
            </p>
          )}
        </div>

        {/* Suggested Price */}
        <div className="bg-green-50 rounded-xl p-4 flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-green-600 mt-0.5" />
          <div>
            <p className="font-medium text-green-800">Suggested: ${mockTicket.suggestedPrice}</p>
            <p className="text-sm text-green-700 mt-1">
              Based on similar listings and current demand
            </p>
            <button
              onClick={() => setPrice(mockTicket.suggestedPrice.toString())}
              className="text-sm font-medium text-green-700 underline mt-2"
            >
              Use suggested price
            </button>
          </div>
        </div>

        {/* Payout Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Your Payout
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-gray-600">
              <span>Your Price</span>
              <span>${numericPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Platform Fee ({mockTicket.feePercent}%)</span>
              <span>-${fee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xl font-bold text-gray-900 pt-3 border-t border-gray-100">
              <span>You'll Receive</span>
              <span className="text-green-600">${payout.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Continue Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4">
        <button
          onClick={handleContinue}
          disabled={!isValid}
          className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all ${
            isValid
              ? "bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
