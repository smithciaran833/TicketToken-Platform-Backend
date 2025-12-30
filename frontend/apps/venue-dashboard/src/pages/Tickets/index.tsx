import { useState } from "react";
import { Plus, Search, MoreVertical, Edit, Trash2, Copy, Pause, Play, Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Dropdown, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const initialTicketTypes = [
  { id: 1, name: "General Admission", description: "Standard entry to the event", event: "Summer Music Festival", eventId: 1, price: 65, quantity: 1500, sold: 987, minPerOrder: 1, maxPerOrder: 10, visibility: "public", transferable: true, resalable: true, saleStart: "2025-06-01", saleEnd: "2025-08-15", status: "On Sale" },
  { id: 2, name: "VIP Access", description: "Premium entry with VIP lounge access", event: "Summer Music Festival", eventId: 1, price: 150, quantity: 200, sold: 145, minPerOrder: 1, maxPerOrder: 4, visibility: "public", transferable: true, resalable: false, saleStart: "2025-06-01", saleEnd: "2025-08-15", status: "On Sale" },
  { id: 3, name: "Early Bird", description: "Discounted early bird tickets", event: "Summer Music Festival", eventId: 1, price: 50, quantity: 300, sold: 300, minPerOrder: 1, maxPerOrder: 6, visibility: "public", transferable: true, resalable: true, saleStart: "2025-05-01", saleEnd: "2025-05-31", status: "Sold Out" },
  { id: 4, name: "General Admission", description: "Standard entry", event: "Jazz Night", eventId: 5, price: 35, quantity: 500, sold: 212, minPerOrder: 1, maxPerOrder: 8, visibility: "public", transferable: true, resalable: true, saleStart: "2025-05-01", saleEnd: "2025-07-20", status: "On Sale" },
  { id: 5, name: "Reserved Seating", description: "Guaranteed seat in reserved section", event: "Jazz Night", eventId: 5, price: 55, quantity: 100, sold: 67, minPerOrder: 1, maxPerOrder: 4, visibility: "public", transferable: false, resalable: false, saleStart: "2025-05-01", saleEnd: "2025-07-20", status: "On Sale" },
  { id: 6, name: "General Admission", description: "Standard entry", event: "Tech Conference", eventId: 2, price: 299, quantity: 1000, sold: 654, minPerOrder: 1, maxPerOrder: 5, visibility: "public", transferable: true, resalable: true, saleStart: "2025-06-01", saleEnd: "2025-08-22", status: "On Sale" },
  { id: 7, name: "VIP Pass", description: "All-access pass with workshop entry", event: "Tech Conference", eventId: 2, price: 599, quantity: 200, sold: 102, minPerOrder: 1, maxPerOrder: 2, visibility: "presale", transferable: false, resalable: false, saleStart: "2025-06-01", saleEnd: "2025-08-22", status: "On Sale" },
  { id: 8, name: "Student", description: "Discounted rate for students with valid ID", event: "Tech Conference", eventId: 2, price: 99, quantity: 300, sold: 100, minPerOrder: 1, maxPerOrder: 1, visibility: "hidden", transferable: false, resalable: false, saleStart: "2025-06-01", saleEnd: "2025-08-22", status: "On Sale" },
  { id: 9, name: "General Admission", description: "Standard entry", event: "Art Gallery Opening", eventId: 4, price: 75, quantity: 250, sold: 0, minPerOrder: 1, maxPerOrder: 4, visibility: "public", transferable: true, resalable: true, saleStart: "2025-08-01", saleEnd: "2025-09-05", status: "Scheduled" },
];

const events = [
  { value: "all", label: "All Events" },
  { value: "1", label: "Summer Music Festival" },
  { value: "2", label: "Tech Conference" },
  { value: "4", label: "Art Gallery Opening" },
  { value: "5", label: "Jazz Night" },
];

function getStatusClasses(status: string) {
  switch (status) {
    case "On Sale": return "bg-green-100 text-green-700";
    case "Sold Out": return "bg-purple-100 text-purple-700";
    case "Scheduled": return "bg-yellow-100 text-yellow-700";
    case "Paused": return "bg-orange-100 text-orange-700";
    case "Ended": return "bg-gray-100 text-gray-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

function getVisibilityIcon(visibility: string) {
  switch (visibility) {
    case "public": return <Eye className="w-4 h-4 text-green-600" />;
    case "hidden": return <EyeOff className="w-4 h-4 text-gray-400" />;
    case "presale": return <Eye className="w-4 h-4 text-yellow-600" />;
    default: return null;
  }
}

export default function TicketTypesList() {
  const navigate = useNavigate();
  const toast = useToast();
  
  const [ticketTypes, setTicketTypes] = useState(initialTicketTypes);
  const [searchQuery, setSearchQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<typeof initialTicketTypes[0] | null>(null);

  // Filter tickets
  let filteredTickets = ticketTypes;
  
  if (eventFilter !== "all") {
    filteredTickets = filteredTickets.filter(t => t.eventId.toString() === eventFilter);
  }
  
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredTickets = filteredTickets.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.event.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query)
    );
  }

  const handleDuplicate = (ticket: typeof initialTicketTypes[0]) => {
    const newTicket = {
      ...ticket,
      id: Date.now(),
      name: ticket.name + " (Copy)",
      sold: 0,
      status: "Scheduled",
    };
    setTicketTypes([...ticketTypes, newTicket]);
    toast.success("Ticket type duplicated!");
  };

  const handleToggleStatus = (ticket: typeof initialTicketTypes[0]) => {
    const newStatus = ticket.status === "On Sale" ? "Paused" : "On Sale";
    setTicketTypes(ticketTypes.map(t =>
      t.id === ticket.id ? { ...t, status: newStatus } : t
    ));
    toast.success(newStatus === "Paused" ? "Sales paused" : "Sales resumed");
  };

  const handleDelete = () => {
    if (deleteTarget) {
      setTicketTypes(ticketTypes.filter(t => t.id !== deleteTarget.id));
      toast.success("Ticket type deleted!");
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  const getDropdownItems = (ticket: typeof initialTicketTypes[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => navigate(`/venue/tickets/${ticket.id}/edit`) },
    { label: "Duplicate", icon: <Copy className="w-4 h-4" />, onClick: () => handleDuplicate(ticket) },
    ...(ticket.status === "On Sale" || ticket.status === "Paused" ? [
      { 
        label: ticket.status === "On Sale" ? "Pause Sales" : "Resume Sales", 
        icon: ticket.status === "On Sale" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />, 
        onClick: () => handleToggleStatus(ticket) 
      },
    ] : []),
    ...(ticket.sold === 0 ? [
      { divider: true, label: "", onClick: () => {} },
      { label: "Delete", icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => {
        setDeleteTarget(ticket);
        setShowDeleteModal(true);
      }},
    ] : []),
  ];

  // Stats
  const totalTickets = filteredTickets.reduce((sum, t) => sum + t.quantity, 0);
  const totalSold = filteredTickets.reduce((sum, t) => sum + t.sold, 0);
  const totalRevenue = filteredTickets.reduce((sum, t) => sum + (t.sold * t.price), 0);

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Ticket Types</h1>
        <Link to="/venue/tickets/new">
          <Button>
            <Plus className="w-5 h-5" />
            <span>Create Ticket Type</span>
          </Button>
        </Link>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-4 mb-6">
        <Link to="/venue/tickets" className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg font-medium">
          Ticket Types
        </Link>
        <Link to="/venue/tickets/bundles" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
          Bundles
        </Link>
        <Link to="/venue/tickets/addons" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
          Add-Ons
        </Link>
        <Link to="/venue/tickets/promos" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
          Promo Codes
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Types</p>
          <p className="text-2xl font-bold text-gray-900">{filteredTickets.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Capacity</p>
          <p className="text-2xl font-bold text-gray-900">{totalTickets.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Tickets Sold</p>
          <p className="text-2xl font-bold text-purple-600">{totalSold.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Revenue</p>
          <p className="text-2xl font-bold text-green-600">${totalRevenue.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search ticket types..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        >
          {events.map(e => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sold / Qty</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Visibility</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredTickets.map((ticket) => (
              <tr 
                key={ticket.id} 
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/venue/tickets/${ticket.id}/edit`)}
              >
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{ticket.name}</div>
                  <div className="text-xs text-gray-500 truncate max-w-xs">{ticket.description}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{ticket.event}</td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">${ticket.price}</td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">{ticket.sold} / {ticket.quantity}</div>
                  <div className="w-20 h-1.5 bg-gray-200 rounded-full mt-1">
                    <div
                      className="h-1.5 bg-purple-600 rounded-full"
                      style={{ width: `${(ticket.sold / ticket.quantity) * 100}%` }}
                    />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {getVisibilityIcon(ticket.visibility)}
                    <span className="text-sm text-gray-600 capitalize">{ticket.visibility}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={"inline-flex px-2 py-1 text-xs font-medium rounded-full " + getStatusClasses(ticket.status)}>
                    {ticket.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(ticket)} />
                </td>
              </tr>
            ))}
            {filteredTickets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No ticket types found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Ticket Type"
        size="sm"
      >
        <p className="text-gray-600">
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
