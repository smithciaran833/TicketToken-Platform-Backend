import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, X, Clock, Tag } from "lucide-react";
import { Button, Input, Modal, ModalFooter } from "../../components/ui";

const mockCart = {
  event: {
    name: "Summer Music Festival 2025",
    date: "Sat, Jul 15 • 4:00 PM",
    venue: "Central Park Great Lawn",
  },
  items: [
    { id: 1, name: "General Admission", quantity: 2, price: 65 },
    { id: 2, name: "VIP Access", quantity: 1, price: 150 },
  ],
  fees: 28.00,
  holdExpires: 600,
};

export default function Cart() {
  const navigate = useNavigate();
  const [items, setItems] = useState(mockCart.items);
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [timeLeft] = useState(mockCart.holdExpires);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal + mockCart.fees - promoDiscount;

  const removeItem = (id: number) => {
    setItems(items.filter(item => item.id !== id));
  };

  const applyPromo = () => {
    if (promoCode.toUpperCase() === "SUMMER20") {
      setPromoDiscount(subtotal * 0.2);
    }
    setShowPromoModal(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <p className="text-gray-500 mb-4">Your cart is empty</p>
        <Button onClick={() => navigate(-1)}>Browse Events</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <header className="bg-white px-4 py-3 sticky top-0 z-40 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="font-semibold text-gray-900">Your Order</h1>
        </div>
      </header>

      {/* Timer Warning */}
      <div className="bg-amber-50 px-4 py-2 flex items-center gap-2 text-amber-700">
        <Clock className="w-4 h-4" />
        <span className="text-sm">Tickets held for {formatTime(timeLeft)}</span>
      </div>

      {/* Event Info */}
      <div className="bg-white px-4 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">{mockCart.event.name}</h2>
        <p className="text-sm text-gray-500">{mockCart.event.date}</p>
        <p className="text-sm text-gray-500">{mockCart.event.venue}</p>
      </div>

      {/* Cart Items */}
      <div className="bg-white mt-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex-1">
              <p className="font-medium text-gray-900">{item.name}</p>
              <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
            </div>
            <div className="flex items-center gap-4">
              <p className="font-medium text-gray-900">${(item.price * item.quantity).toFixed(2)}</p>
              <button onClick={() => removeItem(item.id)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}

        {/* Promo Code */}
        <button 
          onClick={() => setShowPromoModal(true)}
          className="flex items-center gap-2 px-4 py-3 text-purple-600"
        >
          <Tag className="w-4 h-4" />
          <span className="text-sm font-medium">
            {promoDiscount > 0 ? `SUMMER20 applied (-$${promoDiscount.toFixed(2)})` : "Add Promo Code"}
          </span>
        </button>
      </div>

      {/* Price Breakdown */}
      <div className="bg-white mt-2 px-4 py-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-900">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Fees</span>
            <span className="text-gray-900">${mockCart.fees.toFixed(2)}</span>
          </div>
          {promoDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Promo Discount</span>
              <span>-${promoDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-gray-100 text-base">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-bold text-gray-900">${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Checkout Button */}
      <div className="fixed bottom-20 left-0 right-0 p-4 bg-white border-t border-gray-200">
        <Link to="/checkout">
          <Button className="w-full">Checkout — ${total.toFixed(2)}</Button>
        </Link>
      </div>

      {/* Promo Modal */}
      <Modal isOpen={showPromoModal} onClose={() => setShowPromoModal(false)} title="Promo Code">
        <div className="space-y-4">
          <Input
            placeholder="Enter code"
            value={promoCode}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPromoCode(e.target.value)}
          />
          <p className="text-xs text-gray-500">Try: SUMMER20</p>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowPromoModal(false)}>Cancel</Button>
          <Button onClick={applyPromo}>Apply</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
