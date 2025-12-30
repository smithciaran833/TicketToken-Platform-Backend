import { useState } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Input, Select, Textarea, Toggle, DatePicker, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const mockTicketTypes: Record<number, any> = {
  1: { id: 1, name: "General Admission", description: "Standard entry to the event", event: "Summer Music Festival", eventId: 1, price: 65, quantity: 1500, sold: 987, minPerOrder: 1, maxPerOrder: 10, visibility: "public", transferable: true, resalable: true, saleStart: "2025-06-01", saleEnd: "2025-08-15", status: "On Sale" },
  2: { id: 2, name: "VIP Access", description: "Premium entry with VIP lounge access", event: "Summer Music Festival", eventId: 1, price: 150, quantity: 200, sold: 145, minPerOrder: 1, maxPerOrder: 4, visibility: "public", transferable: true, resalable: false, saleStart: "2025-06-01", saleEnd: "2025-08-15", status: "On Sale" },
  3: { id: 3, name: "Early Bird", description: "Discounted early bird tickets", event: "Summer Music Festival", eventId: 1, price: 50, quantity: 300, sold: 300, minPerOrder: 1, maxPerOrder: 6, visibility: "public", transferable: true, resalable: true, saleStart: "2025-05-01", saleEnd: "2025-05-31", status: "Sold Out" },
  4: { id: 4, name: "General Admission", description: "Standard entry", event: "Jazz Night", eventId: 5, price: 35, quantity: 500, sold: 212, minPerOrder: 1, maxPerOrder: 8, visibility: "public", transferable: true, resalable: true, saleStart: "2025-05-01", saleEnd: "2025-07-20", status: "On Sale" },
  5: { id: 5, name: "Reserved Seating", description: "Guaranteed seat in reserved section", event: "Jazz Night", eventId: 5, price: 55, quantity: 100, sold: 67, minPerOrder: 1, maxPerOrder: 4, visibility: "public", transferable: false, resalable: false, saleStart: "2025-05-01", saleEnd: "2025-07-20", status: "On Sale" },
  6: { id: 6, name: "General Admission", description: "Standard entry", event: "Tech Conference", eventId: 2, price: 299, quantity: 1000, sold: 654, minPerOrder: 1, maxPerOrder: 5, visibility: "public", transferable: true, resalable: true, saleStart: "2025-06-01", saleEnd: "2025-08-22", status: "On Sale" },
  7: { id: 7, name: "VIP Pass", description: "All-access pass with workshop entry", event: "Tech Conference", eventId: 2, price: 599, quantity: 200, sold: 102, minPerOrder: 1, maxPerOrder: 2, visibility: "presale", transferable: false, resalable: false, saleStart: "2025-06-01", saleEnd: "2025-08-22", status: "On Sale" },
  8: { id: 8, name: "Student", description: "Discounted rate for students with valid ID", event: "Tech Conference", eventId: 2, price: 99, quantity: 300, sold: 100, minPerOrder: 1, maxPerOrder: 1, visibility: "hidden", transferable: false, resalable: false, saleStart: "2025-06-01", saleEnd: "2025-08-22", status: "On Sale" },
  9: { id: 9, name: "General Admission", description: "Standard entry", event: "Art Gallery Opening", eventId: 4, price: 75, quantity: 250, sold: 0, minPerOrder: 1, maxPerOrder: 4, visibility: "public", transferable: true, resalable: true, saleStart: "2025-08-01", saleEnd: "2025-09-05", status: "Scheduled" },
};

const events = [
  { value: "1", label: "Summer Music Festival" },
  { value: "2", label: "Tech Conference" },
  { value: "4", label: "Art Gallery Opening" },
  { value: "5", label: "Jazz Night" },
];

const visibilityOptions = [
  { value: "public", label: "Public - Visible to everyone" },
  { value: "hidden", label: "Hidden - Only accessible with direct link" },
  { value: "presale", label: "Presale Only - Requires presale code" },
];

export default function EditTicketType() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  
  const ticketId = parseInt(id || "1");
  const ticket = mockTicketTypes[ticketId];
  
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  const [form, setForm] = useState({
    name: ticket?.name || "",
    description: ticket?.description || "",
    eventId: ticket?.eventId?.toString() || "",
    price: ticket?.price?.toString() || "",
    quantity: ticket?.quantity?.toString() || "",
    minPerOrder: ticket?.minPerOrder?.toString() || "1",
    maxPerOrder: ticket?.maxPerOrder?.toString() || "10",
    saleStart: ticket?.saleStart || "",
    saleEnd: ticket?.saleEnd || "",
    useEventDates: false,
    visibility: ticket?.visibility || "public",
    transferable: ticket?.transferable ?? true,
    resalable: ticket?.resalable ?? true,
  });

  const hasSales = ticket?.sold > 0;

  const handleSubmit = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    toast.success("Ticket type updated successfully!");
    navigate("/venue/tickets");
  };

  const handleDelete = async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
    toast.success("Ticket type deleted!");
    navigate("/venue/tickets");
  };

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Ticket type not found</p>
        <Link to="/venue/tickets" className="text-purple-600 hover:text-purple-700 mt-2 inline-block">
          Back to Ticket Types
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/tickets" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Ticket Type</h1>
            <p className="text-gray-500">{ticket.event}</p>
          </div>
        </div>
        {!hasSales && (
          <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
            Delete
          </Button>
        )}
      </div>

      {/* Sales Warning */}
      {hasSales && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">Tickets have been sold</p>
            <p className="text-sm text-yellow-700">
              {ticket.sold} tickets sold. Some fields are locked to protect existing orders.
              Price and event cannot be changed.
            </p>
          </div>
        </div>
      )}

      {/* Sales Stats */}
      {hasSales && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sales Summary</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">Tickets Sold</p>
              <p className="text-2xl font-bold text-gray-900">{ticket.sold}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Available</p>
              <p className="text-2xl font-bold text-gray-900">{ticket.quantity - ticket.sold}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Revenue</p>
              <p className="text-2xl font-bold text-green-600">${(ticket.sold * ticket.price).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Event Selection */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Event</h2>
          <Select
            label="Select Event"
            options={events}
            value={form.eventId}
            onChange={(e) => setForm({ ...form, eventId: e.target.value })}
            disabled={hasSales}
          />
          {hasSales && <p className="text-sm text-gray-500 mt-1">Cannot change event after tickets are sold</p>}
        </div>

        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="space-y-4">
            <Input
              label="Ticket Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Textarea
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label="Price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  disabled={hasSales}
                />
                {hasSales && <p className="text-sm text-gray-500 mt-1">Cannot change price after tickets are sold</p>}
              </div>
              <Input
                label="Quantity Available"
                type="number"
                min={hasSales ? ticket.sold : 1}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                helper={hasSales ? `Minimum ${ticket.sold} (tickets already sold)` : undefined}
              />
            </div>
          </div>
        </div>

        {/* Sale Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sale Settings</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Use Event Dates</p>
                <p className="text-sm text-gray-500">Match sale period to event start/end</p>
              </div>
              <Toggle
                enabled={form.useEventDates}
                onChange={(val) => setForm({ ...form, useEventDates: val })}
              />
            </div>
            
            {!form.useEventDates && (
              <div className="grid grid-cols-2 gap-4">
                <DatePicker
                  label="Sale Start Date"
                  value={form.saleStart}
                  onChange={(e) => setForm({ ...form, saleStart: e.target.value })}
                />
                <DatePicker
                  label="Sale End Date"
                  value={form.saleEnd}
                  onChange={(e) => setForm({ ...form, saleEnd: e.target.value })}
                />
              </div>
            )}
          </div>
        </div>

        {/* Purchase Limits */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Purchase Limits</h2>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Minimum Per Order"
              type="number"
              min="1"
              value={form.minPerOrder}
              onChange={(e) => setForm({ ...form, minPerOrder: e.target.value })}
            />
            <Input
              label="Maximum Per Order"
              type="number"
              min="1"
              value={form.maxPerOrder}
              onChange={(e) => setForm({ ...form, maxPerOrder: e.target.value })}
            />
          </div>
        </div>

        {/* Visibility */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Visibility</h2>
          <Select
            label="Who can see this ticket?"
            options={visibilityOptions}
            value={form.visibility}
            onChange={(e) => setForm({ ...form, visibility: e.target.value })}
          />
        </div>

        {/* Advanced Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Advanced Settings</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Transferable</p>
                <p className="text-sm text-gray-500">Allow ticket holders to transfer tickets to others</p>
              </div>
              <Toggle
                enabled={form.transferable}
                onChange={(val) => setForm({ ...form, transferable: val })}
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Resalable</p>
                <p className="text-sm text-gray-500">Allow ticket holders to resell tickets on marketplace</p>
              </div>
              <Toggle
                enabled={form.resalable}
                onChange={(val) => setForm({ ...form, resalable: val })}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link to="/venue/tickets">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Ticket Type"
        size="sm"
      >
        <p className="text-gray-600">
          Are you sure you want to delete <strong>{ticket.name}</strong>? This action cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
