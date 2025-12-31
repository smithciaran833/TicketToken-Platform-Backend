import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, DollarSign, Info } from "lucide-react";

const mockListing = {
  eventTitle: "Japanese Breakfast",
  ticketType: "General Admission",
  currentPrice: 55,
  faceValue: 45,
  minPrice: 20,
  maxPrice: 90, // 2x face value
  feePercent: 10,
};

export default function EditListing() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const [price, setPrice] = useState(mockListing.currentPrice.toString());
  const [isSaving, setIsSaving] = useState(false);

  const numericPrice = parseFloat(price) || 0;
  const fee = numericPrice * (mockListing.feePercent / 100);
  const payout = numericPrice - fee;

  const isValid =
    numericPrice >= mockListing.minPrice && numericPrice <= mockListing.maxPrice;

  const handleSave = async () => {
    if (!isValid) return;

    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    navigate(`/sell/listing/${listingId}`, { state: { priceUpdated: true } });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Edit Listing</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Ticket Info */}
        <div className="bg-gray-50 rounded-xl p-4">
          <h2 className="font-semibold text-gray-900">{mockListing.eventTitle}</h2>
          <p className="text-sm text-gray-500">{mockListing.ticketType}</p>
          <p className="text-sm text-gray-500 mt-1">Face value: ${mockListing.faceValue}</p>
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
              min={mockListing.minPrice}
              max={mockListing.maxPrice}
            />
          </div>

          {/* Price Rules */}
          <div className="flex items-start gap-2 mt-3 text-sm text-gray-500">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Price must be between ${mockListing.minPrice} and ${mockListing.maxPrice} (2x face value)
            </span>
          </div>

          {!isValid && price && (
            <p className="text-red-500 text-sm mt-2">
              {numericPrice < mockListing.minPrice
                ? `Minimum price is $${mockListing.minPrice}`
                : `Maximum price is $${mockListing.maxPrice}`}
            </p>
          )}
        </div>

        {/* Payout Preview */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Payout Preview
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-gray-600">
              <span>Your Price</span>
              <span>${numericPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Platform Fee ({mockListing.feePercent}%)</span>
              <span>-${fee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-3 border-t border-gray-100">
              <span>Your Payout</span>
              <span className="text-green-600">${payout.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4">
        <button
          onClick={handleSave}
          disabled={!isValid || isSaving}
          className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all ${
            isValid && !isSaving
              ? "bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
