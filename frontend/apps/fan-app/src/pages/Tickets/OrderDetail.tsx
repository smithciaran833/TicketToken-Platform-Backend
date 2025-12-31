import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Download, CreditCard, HelpCircle } from "lucide-react";

const mockOrder = {
  id: "1",
  orderNumber: "TKT-ABC123",
  orderDate: "July 3, 2025 at 2:34 PM",
  status: "completed",
  event: {
    title: "Japanese Breakfast",
    date: "Saturday, July 15, 2025",
    time: "8:00 PM",
    venue: "The Fillmore",
    city: "San Francisco, CA",
  },
  items: [
    { name: "General Admission", quantity: 2, price: 45.00 },
    { name: "General Parking", quantity: 1, price: 25.00 },
  ],
  subtotal: 115.00,
  fees: 17.25,
  discount: 0,
  total: 132.25,
  paymentMethod: {
    type: "visa",
    last4: "4242",
  },
};

export default function OrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const canRefund = mockOrder.status === "completed";

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Order Details</h1>
            <p className="text-sm text-gray-500">{mockOrder.orderNumber}</p>
          </div>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Status */}
        <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-green-800">Order Completed</p>
            <p className="text-sm text-green-700">{mockOrder.orderDate}</p>
          </div>
        </div>

        {/* Event Summary */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">{mockOrder.event.title}</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-gray-900">{mockOrder.event.date}</p>
                <p className="text-sm text-gray-500">{mockOrder.event.time}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-gray-900">{mockOrder.event.venue}</p>
                <p className="text-sm text-gray-500">{mockOrder.event.city}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Items</h3>
          <div className="space-y-3">
            {mockOrder.items.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div>
                  <p className="text-gray-900">{item.name}</p>
                  <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                </div>
                <p className="font-medium text-gray-900">
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
              </div>
            ))}
          </div>

          {/* Price Breakdown */}
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>${mockOrder.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Fees</span>
              <span>${mockOrder.fees.toFixed(2)}</span>
            </div>
            {mockOrder.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-${mockOrder.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-100">
              <span>Total</span>
              <span>${mockOrder.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Payment Method</h3>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-gray-900 capitalize">{mockOrder.paymentMethod.type} •••• {mockOrder.paymentMethod.last4}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button className="w-full flex items-center justify-center gap-2 py-3 bg-white rounded-xl font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
            <Download className="w-5 h-5" />
            View Receipt
          </button>

          {canRefund && (
            <Link
              to={`/tickets/orders/${orderId}/refund`}
              className="w-full flex items-center justify-center gap-2 py-3 bg-white rounded-xl font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              Request Refund
            </Link>
          )}

          <Link
            to="/support/contact"
            className="w-full flex items-center justify-center gap-2 py-3 bg-white rounded-xl font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <HelpCircle className="w-5 h-5" />
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}
