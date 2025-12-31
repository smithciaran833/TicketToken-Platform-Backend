import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Trash2, Clock, Tag, Info } from "lucide-react";
import { PromoCodeModal } from "./modals";

interface CartItem {
  id: string;
  type: "ticket" | "addon";
  name: string;
  description?: string;
  quantity: number;
  price: number;
}

const mockCartItems: CartItem[] = [
  {
    id: "ticket-ga",
    type: "ticket",
    name: "General Admission",
    description: "Floor access",
    quantity: 2,
    price: 45,
  },
  {
    id: "addon-parking",
    type: "addon",
    name: "General Parking",
    quantity: 1,
    price: 25,
  },
];

const mockEvent = {
  title: "Japanese Breakfast",
  date: "Sat, Jul 15, 2025",
  time: "8:00 PM",
  venue: "The Fillmore",
};

export default function Cart() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState(mockCartItems);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      navigate(`/event/${id}`, { state: { cartExpired: true } });
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, navigate, id]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const removeItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const fees = Math.round(subtotal * 0.15 * 100) / 100; // 15% service fee
  const discount = promoDiscount;
  const total = subtotal + fees - discount;

  const handlePromoSuccess = (code: string, discountAmount: number) => {
    setPromoCode(code);
    setPromoDiscount(discountAmount);
  };

  const removePromo = () => {
    setPromoCode(null);
    setPromoDiscount(0);
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Your Order</h1>
          </div>
        </header>

        <div className="flex flex-col items-center justify-center px-5 py-20">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
            <Tag className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Your cart is empty</h2>
          <p className="text-gray-500 text-center mb-6">
            Add some tickets to get started
          </p>
          <Link
            to={`/event/${id}`}
            className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
          >
            Browse Tickets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-40">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Your Order</h1>
        </div>
      </header>

      {/* Timer Warning */}
      <div className={`px-5 py-3 flex items-center justify-center gap-2 ${
        timeLeft < 120 ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"
      }`}>
        <Clock className="w-4 h-4" />
        <span className="text-sm font-medium">
          Tickets held for {formatTime(timeLeft)}
        </span>
      </div>

      <div className="px-5 py-6">
        {/* Event Summary */}
        <div className="mb-6 pb-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{mockEvent.title}</h2>
          <p className="text-gray-500">
            {mockEvent.date} · {mockEvent.time}
          </p>
          <p className="text-gray-500">{mockEvent.venue}</p>
        </div>

        {/* Cart Items */}
        <div className="space-y-4 mb-6">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between p-4 bg-gray-50 rounded-xl"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{item.name}</h3>
                  <span className="text-gray-500">× {item.quantity}</span>
                </div>
                {item.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                )}
                <p className="text-purple-600 font-semibold mt-1">
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => removeItem(item.id)}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>

        {/* Promo Code */}
        <div className="mb-6">
          {promoCode ? (
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-700">{promoCode}</span>
                <span className="text-green-600">(-${promoDiscount.toFixed(2)})</span>
              </div>
              <button
                onClick={removePromo}
                className="text-sm text-green-700 hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPromoModal(true)}
              className="flex items-center gap-2 text-purple-600 font-medium hover:text-purple-700"
            >
              <Tag className="w-5 h-5" />
              Add Promo Code
            </button>
          )}
        </div>

        {/* Price Breakdown */}
        <div className="space-y-3 py-4 border-t border-gray-100">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <div className="flex items-center gap-1">
              <span>Fees</span>
              <button className="text-gray-400 hover:text-gray-600">
                <Info className="w-4 h-4" />
              </button>
            </div>
            <span>${fees.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span>-${discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-gray-900 pt-3 border-t border-gray-100">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Checkout Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4">
        <div className="max-w-lg mx-auto">
          <Link
            to={`/event/${id}/checkout`}
            className="block w-full py-3.5 bg-purple-600 text-white text-center font-semibold text-lg rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all"
          >
            Checkout · ${total.toFixed(2)}
          </Link>
        </div>
      </div>

      {/* Promo Code Modal */}
      <PromoCodeModal
        isOpen={showPromoModal}
        onClose={() => setShowPromoModal(false)}
        onSuccess={handlePromoSuccess}
        subtotal={subtotal}
      />
    </div>
  );
}
