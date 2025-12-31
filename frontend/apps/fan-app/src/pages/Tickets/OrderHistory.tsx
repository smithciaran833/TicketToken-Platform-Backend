import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Receipt } from "lucide-react";

interface Order {
  id: string;
  orderNumber: string;
  eventTitle: string;
  date: string;
  total: number;
  status: "completed" | "refunded" | "cancelled";
  itemCount: number;
}

const mockOrders: Order[] = [
  {
    id: "1",
    orderNumber: "TKT-ABC123",
    eventTitle: "Japanese Breakfast",
    date: "Jul 3, 2025",
    total: 115.50,
    status: "completed",
    itemCount: 2,
  },
  {
    id: "2",
    orderNumber: "TKT-DEF456",
    eventTitle: "Khruangbin",
    date: "Jun 28, 2025",
    total: 156.00,
    status: "completed",
    itemCount: 2,
  },
  {
    id: "3",
    orderNumber: "TKT-GHI789",
    eventTitle: "Bon Iver",
    date: "Mar 15, 2025",
    total: 95.00,
    status: "refunded",
    itemCount: 1,
  },
  {
    id: "4",
    orderNumber: "TKT-JKL012",
    eventTitle: "Phoebe Bridgers",
    date: "Feb 20, 2025",
    total: 85.00,
    status: "cancelled",
    itemCount: 1,
  },
];

const statusStyles = {
  completed: "bg-green-100 text-green-700",
  refunded: "bg-blue-100 text-blue-700",
  cancelled: "bg-gray-100 text-gray-600",
};

export default function OrderHistory() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Order History</h1>
        </div>
      </header>

      <div className="px-5 py-6">
        {mockOrders.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Receipt className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">No orders yet</h2>
            <p className="text-gray-500">Your order history will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mockOrders.map((order) => (
              <Link
                key={order.id}
                to={`/tickets/orders/${order.id}`}
                className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-mono text-sm text-gray-500">{order.orderNumber}</p>
                    <h3 className="font-semibold text-gray-900 mt-1">{order.eventTitle}</h3>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusStyles[order.status]}`}>
                      {order.status}
                    </span>
                    <span className="text-sm text-gray-500">
                      {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">${order.total.toFixed(2)}</p>
                    <p className="text-sm text-gray-500">{order.date}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
