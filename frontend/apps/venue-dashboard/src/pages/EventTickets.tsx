import { useState } from "react";
import { ArrowLeft, Plus, MoreVertical, Edit, Copy, Trash2 } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { Button, Dropdown, Modal, ModalFooter, Input, useToast, ToastContainer } from "../components/ui";

const mockEvents: Record<number, string> = {
  1: "Summer Music Festival",
  2: "Tech Conference: Innovation Summit",
  3: "Stand-Up Comedy Night",
  4: "Art Gallery Opening",
  5: "Jazz Night",
  6: "Cancelled Show",
};

const allTicketTypes = [
  // Event 1
  { id: 1, eventId: 1, name: "General Admission", price: 65, quantity: 1500, sold: 987, status: "On Sale", saleStart: "Jun 1, 2025", saleEnd: "Aug 15, 2025" },
  { id: 2, eventId: 1, name: "VIP Access", price: 150, quantity: 200, sold: 145, status: "On Sale", saleStart: "Jun 1, 2025", saleEnd: "Aug 15, 2025" },
  { id: 3, eventId: 1, name: "Early Bird", price: 50, quantity: 300, sold: 300, status: "Sold Out", saleStart: "May 1, 2025", saleEnd: "May 31, 2025" },
  // Event 2
  { id: 4, eventId: 2, name: "General Admission", price: 299, quantity: 1000, sold: 654, status: "On Sale", saleStart: "Jun 1, 2025", saleEnd: "Aug 22, 2025" },
  { id: 5, eventId: 2, name: "VIP Pass", price: 599, quantity: 200, sold: 102, status: "On Sale", saleStart: "Jun 1, 2025", saleEnd: "Aug 22, 2025" },
  { id: 6, eventId: 2, name: "Student", price: 99, quantity: 300, sold: 100, status: "On Sale", saleStart: "Jun 1, 2025", saleEnd: "Aug 22, 2025" },
  // Event 3
  { id: 7, eventId: 3, name: "General Admission", price: 30, quantity: 400, sold: 400, status: "Ended", saleStart: "Apr 1, 2025", saleEnd: "Jun 10, 2025" },
  { id: 8, eventId: 3, name: "VIP Table", price: 120, quantity: 50, sold: 50, status: "Ended", saleStart: "Apr 1, 2025", saleEnd: "Jun 10, 2025" },
  // Event 4
  { id: 9, eventId: 4, name: "General Admission", price: 75, quantity: 250, sold: 0, status: "Scheduled", saleStart: "Aug 1, 2025", saleEnd: "Sep 5, 2025" },
  { id: 10, eventId: 4, name: "Patron", price: 250, quantity: 50, sold: 0, status: "Scheduled", saleStart: "Aug 1, 2025", saleEnd: "Sep 5, 2025" },
  // Event 5
  { id: 11, eventId: 5, name: "General Admission", price: 35, quantity: 400, sold: 212, status: "On Sale", saleStart: "May 1, 2025", saleEnd: "Jul 20, 2025" },
  { id: 12, eventId: 5, name: "Reserved Seating", price: 55, quantity: 100, sold: 67, status: "On Sale", saleStart: "May 1, 2025", saleEnd: "Jul 20, 2025" },
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
    case "Scheduled":
      return "bg-yellow-100 text-yellow-700";
    case "Ended":
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function EventTickets() {
  const { id } = useParams();
  const basePath = "/venue/events/" + id;
  const toast = useToast();
  
  const eventId = parseInt(id || "1");
  const eventName = mockEvents[eventId] || "Event";
  
  const [ticketTypes, setTicketTypes] = useState(allTicketTypes.filter(t => t.eventId === eventId));
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<typeof allTicketTypes[0] | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    quantity: "",
    saleStart: "",
    saleEnd: "",
  });

  const resetForm = () => {
    setFormData({ name: "", price: "", quantity: "", saleStart: "", saleEnd: "" });
  };

  const handleCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const handleEdit = (ticket: typeof allTicketTypes[0]) => {
    setSelectedTicket(ticket);
    setFormData({
      name: ticket.name,
      price: ticket.price.toString(),
      quantity: ticket.quantity.toString(),
      saleStart: ticket.saleStart,
      saleEnd: ticket.saleEnd,
    });
    setShowEditModal(true);
  };

  const handleDuplicate = (ticket: typeof allTicketTypes[0]) => {
    const newTicket = {
      ...ticket,
      id: Math.max(...ticketTypes.map(t => t.id), 0) + 1,
      name: ticket.name + " (Copy)",
      sold: 0,
      status: "Scheduled",
    };
    setTicketTypes([...ticketTypes, newTicket]);
    toast.success("Ticket type duplicated!");
  };

  const handleDelete = (ticket: typeof allTicketTypes[0]) => {
    setSelectedTicket(ticket);
    setShowDeleteModal(true);
  };

  const confirmCreate = () => {
    const newTicket = {
      id: Math.max(...ticketTypes.map(t => t.id), 0) + 1,
      eventId,
      name: formData.name,
      price: parseFloat(formData.price) || 0,
      quantity: parseInt(formData.quantity) || 0,
      sold: 0,
      status: "Scheduled",
      saleStart: formData.saleStart,
      saleEnd: formData.saleEnd,
    };
    setTicketTypes([...ticketTypes, newTicket]);
    toast.success("Ticket type created!");
    setShowCreateModal(false);
    resetForm();
  };

  const confirmEdit = () => {
    if (selectedTicket) {
      setTicketTypes(ticketTypes.map(t => 
        t.id === selectedTicket.id 
          ? { 
              ...t, 
              name: formData.name,
              price: parseFloat(formData.price) || t.price,
              quantity: parseInt(formData.quantity) || t.quantity,
              saleStart: formData.saleStart,
              saleEnd: formData.saleEnd,
            } 
          : t
      ));
      toast.success("Ticket type updated!");
      setShowEditModal(false);
    }
  };

  const confirmDelete = () => {
    if (selectedTicket) {
      setTicketTypes(ticketTypes.filter(t => t.id !== selectedTicket.id));
      toast.success("Ticket type deleted!");
      setShowDeleteModal(false);
    }
  };

  const getDropdownItems = (ticket: typeof allTicketTypes[0]) => [
    {
      label: "Edit",
      icon: <Edit className="w-4 h-4" />,
      onClick: () => handleEdit(ticket),
    },
    {
      label: "Duplicate",
      icon: <Copy className="w-4 h-4" />,
      onClick: () => handleDuplicate(ticket),
    },
    ...(ticket.sold === 0 ? [
      { divider: true, label: "", onClick: () => {} },
      {
        label: "Delete",
        icon: <Trash2 className="w-4 h-4" />,
        danger: true,
        onClick: () => handleDelete(ticket),
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
            <p className="text-gray-500 mt-1">Manage ticket types</p>
          </div>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="w-5 h-5" />
          <span>Add Ticket Type</span>
        </Button>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "Tickets"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sold / Quantity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sale Period</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {ticketTypes.map((ticket) => (
              <tr key={ticket.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{ticket.name}</td>
                <td className="px-6 py-4 text-sm text-gray-900">${ticket.price}</td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">{ticket.sold} / {ticket.quantity}</div>
                  <div className="w-24 h-2 bg-gray-200 rounded-full mt-1">
                    <div 
                      className="h-2 bg-purple-600 rounded-full" 
                      style={{ width: `${(ticket.sold / ticket.quantity * 100)}%` }}
                    />
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{ticket.saleStart} - {ticket.saleEnd}</td>
                <td className="px-6 py-4">
                  <span className={"inline-flex px-2 py-1 text-xs font-medium rounded-full " + getStatusClasses(ticket.status)}>
                    {ticket.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Dropdown
                    trigger={<MoreVertical className="w-5 h-5" />}
                    items={getDropdownItems(ticket)}
                  />
                </td>
              </tr>
            ))}
            {ticketTypes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No ticket types yet. Click "Add Ticket Type" to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Ticket Type"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. General Admission"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Price"
              type="number"
              min="0"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="0.00"
            />
            <Input
              label="Quantity"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              placeholder="100"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Sale Start"
              type="date"
              value={formData.saleStart}
              onChange={(e) => setFormData({ ...formData, saleStart: e.target.value })}
            />
            <Input
              label="Sale End"
              type="date"
              value={formData.saleEnd}
              onChange={(e) => setFormData({ ...formData, saleEnd: e.target.value })}
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
          <Button onClick={confirmCreate}>Create Ticket Type</Button>
        </ModalFooter>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Ticket Type"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Price"
              type="number"
              min="0"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              disabled={selectedTicket ? selectedTicket.sold > 0 : undefined}
            />
            <Input
              label="Quantity"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            />
          </div>
          {selectedTicket && selectedTicket.sold > 0 && (
            <p className="text-sm text-yellow-600">
              Price cannot be changed because {selectedTicket.sold} tickets have been sold.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Sale Start"
              type="date"
              value={formData.saleStart}
              onChange={(e) => setFormData({ ...formData, saleStart: e.target.value })}
            />
            <Input
              label="Sale End"
              type="date"
              value={formData.saleEnd}
              onChange={(e) => setFormData({ ...formData, saleEnd: e.target.value })}
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
          <Button onClick={confirmEdit}>Save Changes</Button>
        </ModalFooter>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Ticket Type"
        size="sm"
      >
        <p className="text-gray-600">
          Are you sure you want to delete "{selectedTicket?.name}"? This action cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
