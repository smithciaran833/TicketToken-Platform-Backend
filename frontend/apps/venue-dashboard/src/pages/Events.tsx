import { useState } from "react";
import { Plus, Search, MoreVertical, List, CalendarDays, Edit, Copy, XCircle } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { Button, Dropdown, Modal, ModalFooter, Input, useToast, ToastContainer } from "../components/ui";

const mockEvents = [
  {
    id: 1,
    name: "Summer Music Festival",
    date: "Aug 15, 2025",
    time: "6:00 PM",
    status: "On Sale",
    ticketsSold: 1234,
    totalTickets: 2000,
    revenue: 45678,
  },
  {
    id: 2,
    name: "Tech Conference: Innovation Summit",
    date: "Aug 22, 2025",
    time: "9:00 AM",
    status: "On Sale",
    ticketsSold: 856,
    totalTickets: 1500,
    revenue: 128400,
  },
  {
    id: 3,
    name: "Stand-Up Comedy Night",
    date: "Jun 10, 2025",
    time: "8:00 PM",
    status: "Past",
    ticketsSold: 450,
    totalTickets: 450,
    revenue: 13500,
  },
  {
    id: 4,
    name: "Art Gallery Opening",
    date: "Sep 5, 2025",
    time: "7:00 PM",
    status: "Draft",
    ticketsSold: 0,
    totalTickets: 300,
    revenue: 0,
  },
  {
    id: 5,
    name: "Jazz Night",
    date: "Jul 20, 2025",
    time: "8:00 PM",
    status: "On Sale",
    ticketsSold: 278,
    totalTickets: 500,
    revenue: 8340,
  },
  {
    id: 6,
    name: "Cancelled Show",
    date: "Jul 1, 2025",
    time: "7:00 PM",
    status: "Cancelled",
    ticketsSold: 150,
    totalTickets: 400,
    revenue: 0,
  },
];

const tabs = ["All", "Upcoming", "Past", "Draft", "Cancelled"];

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

export default function Events() {
  const navigate = useNavigate();
  const toast = useToast();
  
  const [activeTab, setActiveTab] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [events, setEvents] = useState(mockEvents);
  
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<typeof mockEvents[0] | null>(null);
  const [duplicateName, setDuplicateName] = useState("");

  // Filter events based on tab
  const filteredEvents = events.filter(event => {
    // Tab filter
    if (activeTab === "Upcoming" && (event.status === "Past" || event.status === "Cancelled" || event.status === "Draft")) return false;
    if (activeTab === "Past" && event.status !== "Past") return false;
    if (activeTab === "Draft" && event.status !== "Draft") return false;
    if (activeTab === "Cancelled" && event.status !== "Cancelled") return false;
    
    // Search filter
    if (searchQuery && !event.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    
    return true;
  });

  const handleDuplicate = (event: typeof mockEvents[0]) => {
    setSelectedEvent(event);
    setDuplicateName(event.name + " (Copy)");
    setShowDuplicateModal(true);
  };

  const handleCancelEvent = (event: typeof mockEvents[0]) => {
    setSelectedEvent(event);
    setShowCancelModal(true);
  };

  const confirmDuplicate = () => {
    if (selectedEvent) {
      const newEvent = {
        ...selectedEvent,
        id: Math.max(...events.map(e => e.id)) + 1,
        name: duplicateName,
        status: "Draft",
        ticketsSold: 0,
        revenue: 0,
      };
      setEvents([...events, newEvent]);
      toast.success("Event duplicated successfully!");
      setShowDuplicateModal(false);
    }
  };

  const confirmCancel = () => {
    if (selectedEvent) {
      setEvents(events.map(e => 
        e.id === selectedEvent.id ? { ...e, status: "Cancelled" } : e
      ));
      toast.success("Event cancelled. Ticket holders will be refunded.");
      setShowCancelModal(false);
    }
  };

  const getDropdownItems = (event: typeof mockEvents[0]) => [
    {
      label: "Edit",
      icon: <Edit className="w-4 h-4" />,
      onClick: () => navigate(`/venue/events/${event.id}/edit`),
    },
    {
      label: "Duplicate",
      icon: <Copy className="w-4 h-4" />,
      onClick: () => handleDuplicate(event),
    },
    { divider: true, label: "", onClick: () => {} },
    {
      label: "Cancel Event",
      icon: <XCircle className="w-4 h-4" />,
      danger: true,
      onClick: () => handleCancelEvent(event),
    },
  ];

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Events</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <Link
              to="/venue/events"
              className="px-3 py-2 text-sm font-medium bg-purple-50 text-purple-600 flex items-center gap-2"
            >
              <List className="w-4 h-4" />
              List
            </Link>
            <Link
              to="/venue/events/calendar"
              className="px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 flex items-center gap-2"
            >
              <CalendarDays className="w-4 h-4" />
              Calendar
            </Link>
          </div>
          <Link to="/venue/events/new">
            <Button>
              <Plus className="w-5 h-5" />
              <span>Create Event</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={
                activeTab === tab
                  ? "px-4 py-2 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Event
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tickets Sold
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Revenue
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredEvents.map((event) => (
              <tr 
                key={event.id} 
                onClick={() => navigate(`/venue/events/${event.id}`)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{event.name}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">{event.date}</div>
                  <div className="text-sm text-gray-500">{event.time}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={"inline-flex px-2 py-1 text-xs font-medium rounded-full " + getStatusClasses(event.status)}>
                    {event.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {event.ticketsSold} / {event.totalTickets}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  ${event.revenue.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <div onClick={(e) => e.stopPropagation()}>
                    <Dropdown
                      trigger={<MoreVertical className="w-5 h-5" />}
                      items={getDropdownItems(event)}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {filteredEvents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  {searchQuery ? "No events match your search" : "No events found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
            Create a copy of this event with all its settings.
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
        {selectedEvent && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800 font-medium">Warning: This action cannot be undone</p>
              <p className="text-sm text-red-700 mt-1">
                Cancelling "{selectedEvent.name}" will automatically refund all ticket holders.
              </p>
            </div>
          </div>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowCancelModal(false)}>Keep Event</Button>
          <Button variant="danger" onClick={confirmCancel}>Cancel Event</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
