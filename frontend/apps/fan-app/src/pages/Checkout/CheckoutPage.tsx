import { useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, CreditCard, Lock } from "lucide-react";

const mockEvent = {
  title: "Japanese Breakfast",
  date: "Sat, Jul 15 · 8:00 PM",
  venue: "The Fillmore",
};

const mockTicketTypes: Record<string, { name: string; price: number }> = {
  ga: { name: "General Admission", price: 45 },
  balcony: { name: "Balcony", price: 65 },
  vip: { name: "VIP Package", price: 150 },
};

export default function CheckoutPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const { quantities = { ga: 2 }, subtotal = 90 } = (location.state as { quantities: Record<string, number>; subtotal: number }) || {};
  
  const [form, setForm] = useState({
    email: "",
    phone: "",
    cardNumber: "",
    expiry: "",
    cvc: "",
  });
  const [processing, setProcessing] = useState(false);

  const serviceFee = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + serviceFee;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    
    setTimeout(() => {
      navigate(`/event/${id}/confirmation`, { 
        state: { quantities, subtotal, serviceFee, total } 
      });
    }, 1500);
  };

  const cartItems = Object.entries(quantities).map(([ticketId, qty]) => ({
    id: ticketId,
    name: mockTicketTypes[ticketId]?.name || "Ticket",
    quantity: qty,
    price: mockTicketTypes[ticketId]?.price || 0,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white px-5 py-4 border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="font-semibold text-gray-900">Checkout</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <div className="bg-white px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-900">Order Summary</h2>
            <button type="button" onClick={() => navigate(-1)} className="text-purple-600 text-sm font-medium">
              Edit
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-3">{mockEvent.title} · {mockEvent.date}</p>
          
          <div className="space-y-2">
            {cartItems.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.quantity}× {item.name}</span>
                <span className="text-gray-900 font-medium">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white px-5 py-5 mt-2">
          <h2 className="font-semibold text-gray-900 mb-4">Contact Info</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(555) 123-4567"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1.5">For ticket delivery and event updates</p>
            </div>
          </div>
        </div>

        <div className="bg-white px-5 py-5 mt-2">
          <h2 className="font-semibold text-gray-900 mb-4">Payment</h2>
          
          <div className="grid grid-cols-2 gap-3 mb-5">
            <button type="button" className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50">
              <span className="font-medium">Apple Pay</span>
            </button>
            <button type="button" className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50">
              <span className="font-medium">Google Pay</span>
            </button>
          </div>

          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-sm text-gray-400">or pay with card</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Card number</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={form.cardNumber}
                  onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
                  placeholder="1234 5678 9012 3456"
                  className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
                <CreditCard className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Expiry</label>
                <input
                  type="text"
                  required
                  value={form.expiry}
                  onChange={(e) => setForm({ ...form, expiry: e.target.value })}
                  placeholder="MM / YY"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">CVC</label>
                <input
                  type="text"
                  required
                  value={form.cvc}
                  onChange={(e) => setForm({ ...form, cvc: e.target.value })}
                  placeholder="123"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white px-5 py-5 mt-2">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-900">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Service fee</span>
              <span className="text-gray-900">${serviceFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-3 border-t border-gray-100">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="font-bold text-xl text-gray-900">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="px-5 py-6">
          <button
            type="submit"
            disabled={processing}
            className="w-full bg-purple-600 text-white py-4 rounded-xl font-semibold text-lg shadow-lg shadow-purple-600/30 hover:bg-purple-700 active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Pay ${total.toFixed(2)}
              </>
            )}
          </button>
          <p className="text-xs text-gray-400 text-center mt-3">Secure checkout powered by Stripe</p>
        </div>
      </form>
    </div>
  );
}
