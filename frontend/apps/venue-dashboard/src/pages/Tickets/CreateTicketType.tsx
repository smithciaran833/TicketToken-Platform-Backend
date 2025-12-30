import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Select, Textarea, Toggle, DatePicker, useToast, ToastContainer } from "../../components/ui";

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

export default function CreateTicketType() {
  const navigate = useNavigate();
  const toast = useToast();
  const [isCreating, setIsCreating] = useState(false);
  
  const [form, setForm] = useState({
    name: "",
    description: "",
    eventId: "",
    price: "",
    quantity: "",
    minPerOrder: "1",
    maxPerOrder: "10",
    saleStart: "",
    saleEnd: "",
    useEventDates: false,
    visibility: "public",
    transferable: true,
    resalable: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!form.name.trim()) newErrors.name = "Name is required";
    if (!form.eventId) newErrors.eventId = "Event is required";
    if (!form.price || parseFloat(form.price) < 0) newErrors.price = "Price must be 0 or greater";
    if (!form.quantity || parseInt(form.quantity) < 1) newErrors.quantity = "Quantity must be at least 1";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    
    setIsCreating(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    toast.success("Ticket type created successfully!");
    navigate("/venue/tickets");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/tickets" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Create Ticket Type</h1>
      </div>

      <div className="space-y-6">
        {/* Event Selection */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Event</h2>
          <Select
            label="Select Event"
            options={events}
            value={form.eventId}
            onChange={(e) => setForm({ ...form, eventId: e.target.value })}
            placeholder="Choose an event"
            error={errors.eventId}
          />
        </div>

        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="space-y-4">
            <Input
              label="Ticket Name"
              placeholder="e.g. General Admission"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              error={errors.name}
            />
            <Textarea
              label="Description"
              placeholder="Describe what's included with this ticket..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                error={errors.price}
              />
              <Input
                label="Quantity Available"
                type="number"
                min="1"
                placeholder="100"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                error={errors.quantity}
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
          <Button onClick={handleSubmit} disabled={isCreating}>
            {isCreating ? "Creating..." : "Create Ticket Type"}
          </Button>
        </div>
      </div>
    </div>
  );
}
