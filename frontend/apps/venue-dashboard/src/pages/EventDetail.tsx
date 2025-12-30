import { useState } from "react";
import { ArrowLeft, Edit, MoreVertical, Calendar, Clock, MapPin, Users, Copy, XCircle, Share, Download } from "lucide-react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button, Dropdown, Modal, ModalFooter, Input, useToast, ToastContainer } from "../components/ui";

const mockEvents = [
  {
    id: 1,
    name: "Summer Music Festival",
    description: "Join us for the biggest music festival of the summer featuring top artists from around the world.",
    date: "Aug 15, 2025",
    startTime: "6:00 PM",
    doorsTime: "5:00 PM",
    venue: "The Grand Hall",
    address: "123 Main St, New York, NY 10001",
    status: "On Sale",
    image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&h=400&fit=crop",
    ticketsSold: 1234,
    totalCapacity: 2000,
    revenue: 45678,
  },
  {
    id: 2,
    name: "Tech Conference: Innovation Summit",
    description: "A two-day conference featuring the brightest minds in technology.",
    date: "Aug 22, 2025",
    startTime: "9:00 AM",
    doorsTime: "8:30 AM",
    venue: "The Grand Hall",
    address: "123 Main St, New York, NY 10001",
    status: "On Sale",
    image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=400&fit=crop",
    ticketsSold: 856,
    totalCapacity: 1500,
    revenue: 128400,
  },
  {
    id: 3,
    name: "Stand-Up Comedy Night",
    description: "An evening of laughs with top comedians.",
    date: "Jun 10, 2025",
    startTime: "8:00 PM",
    doorsTime: "7:00 PM",
    venue: "The Grand Hall",
    address: "123 Main St, New York, NY 10001",
    status: "Past",
    image: "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&h=400&fit=crop",
    ticketsSold: 450,
    totalCapacity: 450,
    revenue: 13500,
  },
  {
    id: 4,
    name: "Art Gallery Opening",
    description: "Exclusive opening night for our new contemporary art exhibition.",
    date: "Sep 5, 2025",
    startTime: "7:00 PM",
    doorsTime: "6:30 PM",
    venue: "The Grand Hall",
    address: "123 Main St, New York, NY 10001",
    status: "Draft",
    image: "https://images.unsplash.com/photo-1531243269054-5ebf6f34081e?w=800&h=400&fit=crop",
    ticketsSold: 0,
    totalCapacity: 300,
    revenue: 0,
  },
  {
    id: 5,
    name: "Jazz Night",
    description: "An intimate evening of jazz featuring local and international artists.",
    date: "Jul 20, 2025",
    startTime: "8:00 PM",
    doorsTime: "7:00 PM",
    venue: "The Grand Hall",
    address: "123 Main St, New York, NY 10001",
    status: "On Sale",
    image: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=800&h=400&fit=crop",
    ticketsSold: 278,
    totalCapacity: 500,
    revenue: 8340,
  },
  {
    id: 6,
    name: "Cancelled Show",
    description: "This event has been cancelled.",
    date: "Jul 1, 2025",
    startTime: "7:00 PM",
    doorsTime: "6:00 PM",
    venue: "The Grand Hall",
    address: "123 Main St, New York, NY 10001",
    status: "Cancelled",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=400&fit=crop",
    ticketsSold: 150,
    totalCapacity: 400,
    revenue: 0,
  },
];

const mockTicketTypes = [
  { id: 1, eventId: 1, name: "General Admission", price: 65, sold: 987, quantity: 1500 },
  { id: 2, eventId: 1, name: "VIP Access", price: 150, sold: 145, quantity: 200 },
  { id: 3, eventId: 1, name: "Early Bird", price: 50, sold: 300, quantity: 300 },
  { id: 4, eventId: 2, name: "General Admission", price: 299, sold: 654, quantity: 1000 },
  { id: 5, eventId: 2, name: "VIP Pass", price: 599, sold: 102, quantity: 200 },
  { id: 6, eventId: 3, name: "General Admission", price: 30, sold: 400, quantity: 400 },
  { id: 7, eventId: 3, name: "VIP Table", price: 120, sold: 50, quantity: 50 },
];

const mockOrders = [
  { id: "ORD-001", eventId: 1, customerName: "John Smith", total: 143, tickets: 2, date: "Jun 15, 2025" },
  { id: "ORD-002", eventId: 1, customerName: "Sarah Johnson", total: 286, tickets: 4, date: "Jun 14, 2025" },
  { id: "ORD-003", eventId: 1, customerName: "Mike Chen", total: 165, tickets: 1, date: "Jun 13, 2025" },
  { id: "ORD-004", eventId: 2, customerName: "Emily Davis", total: 328.90, tickets: 1, date: "Jun 20, 2025" },
  { id: "ORD-005", eventId: 2, customerName: "Tom Bradley", total: 1317.80, tickets: 2, date: "Jun 19, 2025" },
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
    case "On Sale":
      return "bg-green-100 text-green-700";
    case "Sold Out":
      return "bg-purple-100 text-purple-700";
    case "Past":
      return "bg-gray-100 text-gray-700";
    case "Draft":
      return "bg-yellow-100 text-yellow-700";
    case "Cancelled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const basePath = "/venue/events/" + id;
  const toast = useToast();
  
  const eventId = parseInt(id || "1");
  const event = mockEvents.find(e => e.id === eventId) || mockEvents[0];
  const ticketTypes = mockTicketTypes.filter(t => t.eventId === eventId);
  const recentOrders = mockOrders.filter(o => o.eventId === eventId).slice(0, 5);

  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");

  const daysUntilEvent = 47; // Mock value

  const handleDuplicate = () => {
    setDuplicateName(event.name + " (Copy)");
    setShowDuplicateModal(true);
  };

  const confirmDuplicate = () => {
    toast.success("Event duplicated!");
    setShowDuplicateModal(false);
    navigate(`/venue/events/new`);
  };

  const confirmCancel = () => {
    toast.success("Event cancelled. All ticket holders will be refunded.");
    setShowCancelModal(false);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Event link copied to clipboard!");
  };

  const dropdownItems = [
    {
      label: "Duplicate Event",
      icon: <Copy className="w-4 h-4" />,
      onClick: handleDuplicate,
    },
    {
      label: "Share Event",
      icon: <Share className="w-4 h-4" />,
      onClick: handleShare,
    },
    {
      label: "Download Report",
      icon: <Download className="w-4 h-4" />,
      onClick: () => toast.info("Report downloading..."),
    },
    { divider: true, label: "", onClick: () => {} },
    {
      label: "Cancel Event",
      icon: <XCircle className="w-4 h-4" />,
      danger: true,
      onClick: () => setShowCancelModal(true),
    },
  ];

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/events" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{event.name}</h1>
              <span className={"px-3 py-1 text-sm font-medium rounded-full " + getStatusClasses(event.status)}>
                {event.status}
              </span>
            </div>
            <p className="text-gray-500 mt-1">Event ID: {event.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to={`/venue/events/${id}/edit`}>
            <Button variant="secondary">
              <Edit className="w-4 h-4" />
              <span>Edit</span>
            </Button>
          </Link>
          <Dropdown
            trigger={<MoreVertical className="w-5 h-5" />}
            items={dropdownItems}
          />
        </div>
      </div>

      <div className="mb-6">
        <img
          src={event.image}
          alt={event.name}
          className="w-full h-48 object-cover rounded-lg"
        />
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Tickets Sold</p>
          <p className="text-2xl font-bold text-gray-900">{event.ticketsSold} / {event.totalCapacity}</p>
          <div className="w-full h-2 bg-gray-200 rounded-full mt-2">
            <div 
              className="h-2 bg-purple-600 rounded-full" 
              style={{ width: `${(event.ticketsSold / event.totalCapacity * 100)}%` }}
            />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Revenue</p>
          <p className="text-2xl font-bold text-gray-900">${event.revenue.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Days Until Event</p>
          <p className="text-2xl font-bold text-gray-900">{event.status === "Past" ? "Past" : daysUntilEvent}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Attendance Rate</p>
          <p className="text-2xl font-bold text-gray-900">{event.status === "Past" ? "87%" : "--"}</p>
          {event.status !== "Past" && <p className="text-xs text-gray-400">Available after event</p>}
        </div>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "Overview"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Event Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="text-sm font-medium text-gray-900">{event.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Time</p>
                  <p className="text-sm font-medium text-gray-900">
                    {event.startTime} (Doors: {event.doorsTime})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Venue</p>
                  <p className="text-sm font-medium text-gray-900">{event.venue}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Capacity</p>
                  <p className="text-sm font-medium text-gray-900">{event.totalCapacity}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
            <p className="text-gray-600">{event.description}</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Ticket Types</h2>
              <Link to={basePath + "/tickets"} className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                Manage Tickets →
              </Link>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sold</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {ticketTypes.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{ticket.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">${ticket.price}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{ticket.sold}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{ticket.quantity - ticket.sold}</td>
                  </tr>
                ))}
                {ticketTypes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-sm text-gray-500 text-center">
                      No ticket types yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {recentOrders.map((order) => (
                <div key={order.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">{order.customerName}</p>
                    <p className="text-sm font-medium text-gray-900">${order.total.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-500">{order.tickets} tickets</p>
                    <p className="text-xs text-gray-500">{order.date}</p>
                  </div>
                </div>
              ))}
              {recentOrders.length === 0 && (
                <div className="px-6 py-4 text-sm text-gray-500 text-center">
                  No orders yet
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200">
              <Link to={basePath + "/sales"} className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                View All Orders →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Duplicate Event Modal */}
      <Modal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        title="Duplicate Event"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Create a copy of this event with all its settings. You can edit the details after.
          </p>
          <Input
            label="New Event Name"
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.target.value)}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDuplicateModal(false)}>Cancel</Button>
          <Button onClick={confirmDuplicate}>Duplicate Event</Button>
        </ModalFooter>
      </Modal>

      {/* Cancel Event Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Event"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800 font-medium">Warning: This action cannot be undone</p>
            <p className="text-sm text-red-700 mt-1">
              Cancelling this event will automatically refund all {event.ticketsSold} ticket holders.
              Total refund amount: ${event.revenue.toLocaleString()}
            </p>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowCancelModal(false)}>Keep Event</Button>
          <Button variant="danger" onClick={confirmCancel}>Cancel Event & Refund All</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
