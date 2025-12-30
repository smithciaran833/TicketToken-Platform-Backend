import { useState } from "react";
import { ArrowLeft, Download, Search, MoreVertical, Eye, RotateCcw, Mail } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { Dropdown, Modal, ModalFooter, Button, useToast, ToastContainer } from "../components/ui";

const mockEvents: Record<number, string> = {
  1: "Summer Music Festival",
  2: "Tech Conference: Innovation Summit",
  3: "Stand-Up Comedy Night",
  4: "Art Gallery Opening",
  5: "Jazz Night",
  6: "Cancelled Show",
};

const allOrders = [
  // Event 1
  { id: "ORD-001", eventId: 1, customer: "John Smith", email: "john@email.com", tickets: 2, ticketType: "General Admission", total: 143, date: "Jun 15, 2025", status: "Complete" },
  { id: "ORD-002", eventId: 1, customer: "Sarah Johnson", email: "sarah@email.com", tickets: 4, ticketType: "General Admission", total: 286, date: "Jun 14, 2025", status: "Complete" },
  { id: "ORD-003", eventId: 1, customer: "Mike Chen", email: "mike@email.com", tickets: 1, ticketType: "VIP Access", total: 165, date: "Jun 13, 2025", status: "Complete" },
  { id: "ORD-004", eventId: 1, customer: "Emily Davis", email: "emily@email.com", tickets: 2, ticketType: "VIP Access", total: 330, date: "Jun 12, 2025", status: "Refunded" },
  { id: "ORD-005", eventId: 1, customer: "Alex Wilson", email: "alex@email.com", tickets: 3, ticketType: "Early Bird", total: 165, date: "May 20, 2025", status: "Complete" },
  { id: "ORD-006", eventId: 1, customer: "Lisa Park", email: "lisa@email.com", tickets: 2, ticketType: "General Admission", total: 143, date: "Jun 10, 2025", status: "Pending" },
  // Event 2
  { id: "ORD-007", eventId: 2, customer: "Rachel Green", email: "rachel@email.com", tickets: 1, ticketType: "General Admission", total: 328.90, date: "Jun 20, 2025", status: "Complete" },
  { id: "ORD-008", eventId: 2, customer: "Tom Bradley", email: "tom@email.com", tickets: 2, ticketType: "VIP Pass", total: 1317.80, date: "Jun 19, 2025", status: "Complete" },
  // Event 3
  { id: "ORD-009", eventId: 3, customer: "Jane Doe", email: "jane@email.com", tickets: 2, ticketType: "General Admission", total: 66, date: "Jun 1, 2025", status: "Complete" },
  // Event 5
  { id: "ORD-010", eventId: 5, customer: "Bob Miller", email: "bob@email.com", tickets: 2, ticketType: "General Admission", total: 77, date: "Jun 1, 2025", status: "Complete" },
];

const tabs = [
  { name: "Overview", path: "" },
  { name: "Tickets", path: "/tickets" },
  { name: "Sales", path: "/sales" },
  { name: "Guest List", path: "/guests" },
  { name: "Settings", path: "/settings" },
];

function getStatusClasses(status: string) {
  switch (status) {
    case "Complete":
      return "bg-green-100 text-green-700";
    case "Refunded":
      return "bg-red-100 text-red-700";
    case "Pending":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function EventSales() {
  const { id } = useParams();
  const basePath = "/venue/events/" + id;
  const toast = useToast();
  
  const eventId = parseInt(id || "1");
  const eventName = mockEvents[eventId] || "Event";
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<typeof allOrders[0] | null>(null);

  // Filter orders for this event
  let orders = allOrders.filter(o => o.eventId === eventId);
  
  // Apply status filter
  if (statusFilter !== "All") {
    orders = orders.filter(o => o.status === statusFilter);
  }
  
  // Apply search filter
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    orders = orders.filter(o => 
      o.customer.toLowerCase().includes(query) ||
      o.email.toLowerCase().includes(query) ||
      o.id.toLowerCase().includes(query)
    );
  }

  const handleViewOrder = (order: typeof allOrders[0]) => {
    setSelectedOrder(order);
    setShowOrderModal(true);
  };

  const handleRefund = (order: typeof allOrders[0]) => {
    setSelectedOrder(order);
    setShowRefundModal(true);
  };

  const confirmRefund = () => {
    toast.success(`Refund processed for order ${selectedOrder?.id}`);
    setShowRefundModal(false);
  };

  const handleExport = () => {
    toast.success("Exporting orders to CSV...");
  };

  const handleResendConfirmation = (order: typeof allOrders[0]) => {
    toast.success(`Confirmation email sent to ${order.email}`);
  };

  const getDropdownItems = (order: typeof allOrders[0]) => [
    {
      label: "View Details",
      icon: <Eye className="w-4 h-4" />,
      onClick: () => handleViewOrder(order),
    },
    {
      label: "Resend Confirmation",
      icon: <Mail className="w-4 h-4" />,
      onClick: () => handleResendConfirmation(order),
    },
    ...(order.status === "Complete" ? [
      { divider: true, label: "", onClick: () => {} },
      {
        label: "Issue Refund",
        icon: <RotateCcw className="w-4 h-4" />,
        danger: true,
        onClick: () => handleRefund(order),
      },
    ] : []),
  ];

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to={`/venue/events/${id}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{eventName}</h1>
            <p className="text-gray-500 mt-1">All orders for this event</p>
          </div>
        </div>
        <button 
          onClick={handleExport}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
        >
          <Download className="w-5 h-5" />
          <span>Export</span>
        </button>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "Sales"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <select 
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="All">All Statuses</option>
          <option value="Complete">Complete</option>
          <option value="Refunded">Refunded</option>
          <option value="Pending">Pending</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tickets</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-purple-600">{order.id}</td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{order.customer}</div>
                  <div className="text-sm text-gray-500">{order.email}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">{order.tickets}x {order.ticketType}</div>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">${order.total.toFixed(2)}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{order.date}</td>
                <td className="px-6 py-4">
                  <span className={"inline-flex px-2 py-1 text-xs font-medium rounded-full " + getStatusClasses(order.status)}>
                    {order.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Dropdown
                    trigger={<MoreVertical className="w-5 h-5" />}
                    items={getDropdownItems(order)}
                  />
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  {searchQuery || statusFilter !== "All" ? "No orders match your filters" : "No orders yet"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Order Detail Modal */}
      <Modal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        title="Order Details"
        size="md"
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500">Order ID</p>
                <p className="font-medium text-purple-600">{selectedOrder.id}</p>
              </div>
              <span className={"inline-flex px-2 py-1 text-xs font-medium rounded-full " + getStatusClasses(selectedOrder.status)}>
                {selectedOrder.status}
              </span>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm text-gray-500">Customer</p>
              <p className="font-medium">{selectedOrder.customer}</p>
              <p className="text-sm text-gray-500">{selectedOrder.email}</p>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm text-gray-500">Order Details</p>
              <div className="flex justify-between mt-2">
                <span>{selectedOrder.tickets}x {selectedOrder.ticketType}</span>
                <span className="font-medium">${selectedOrder.total.toFixed(2)}</span>
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm text-gray-500">Order Date</p>
              <p>{selectedOrder.date}</p>
            </div>
          </div>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowOrderModal(false)}>Close</Button>
          {selectedOrder?.status === "Complete" && (
            <Button variant="danger" onClick={() => { setShowOrderModal(false); handleRefund(selectedOrder); }}>
              Issue Refund
            </Button>
          )}
        </ModalFooter>
      </Modal>

      {/* Refund Modal */}
      <Modal
        isOpen={showRefundModal}
        onClose={() => setShowRefundModal(false)}
        title="Issue Refund"
        size="sm"
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                This will refund ${selectedOrder.total.toFixed(2)} to {selectedOrder.customer}.
              </p>
            </div>
            <p className="text-sm text-gray-600">
              The customer will receive their refund within 5-10 business days.
            </p>
          </div>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowRefundModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={confirmRefund}>Confirm Refund</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
