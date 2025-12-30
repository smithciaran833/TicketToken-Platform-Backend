import { useState } from "react";
import { ArrowLeft, Plus, X, Tag, Gift } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Select, Textarea, useToast, ToastContainer } from "../../components/ui";

const availableTickets = [
  { id: 1, name: "General Admission", event: "Summer Music Festival", eventId: 1, price: 65 },
  { id: 2, name: "VIP Access", event: "Summer Music Festival", eventId: 1, price: 150 },
  { id: 4, name: "General Admission", event: "Jazz Night", eventId: 5, price: 35 },
  { id: 5, name: "Reserved Seating", event: "Jazz Night", eventId: 5, price: 55 },
  { id: 6, name: "General Admission", event: "Tech Conference", eventId: 2, price: 299 },
];

const availableAddOns = [
  { id: 1, name: "Parking Pass", price: 25 },
  { id: 2, name: "VIP Lounge Access", price: 75 },
  { id: 3, name: "Meet & Greet", price: 200 },
  { id: 4, name: "Merch Bundle", price: 45 },
  { id: 5, name: "Food & Drink Voucher", price: 20 },
];

const events = [
  { value: "1", label: "Summer Music Festival" },
  { value: "2", label: "Tech Conference" },
  { value: "5", label: "Jazz Night" },
];

interface BundleItem {
  type: "ticket" | "addon";
  itemId: number;
  itemName: string;
  quantity: number;
  unitPrice: number;
}

export default function CreateBundle() {
  const navigate = useNavigate();
  const toast = useToast();
  const [isCreating, setIsCreating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    eventId: "1",
    items: [] as BundleItem[],
    price: "",
    quantity: "",
  });

  const [addItemType, setAddItemType] = useState<"ticket" | "addon">("ticket");
  const [addItemId, setAddItemId] = useState("");
  const [addItemQty, setAddItemQty] = useState(1);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredTickets = availableTickets.filter(t => t.eventId.toString() === form.eventId);

  const calculateOriginalPrice = () => {
    return form.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  };

  const handleAddItem = () => {
    if (!addItemId) return;

    let newItem: BundleItem;

    if (addItemType === "ticket") {
      const ticket = filteredTickets.find(t => t.id.toString() === addItemId);
      if (!ticket) return;
      newItem = {
        type: "ticket",
        itemId: ticket.id,
        itemName: ticket.name,
        quantity: addItemQty,
        unitPrice: ticket.price,
      };
    } else {
      const addon = availableAddOns.find(a => a.id.toString() === addItemId);
      if (!addon) return;
      newItem = {
        type: "addon",
        itemId: addon.id,
        itemName: addon.name,
        quantity: addItemQty,
        unitPrice: addon.price,
      };
    }

    const existingIndex = form.items.findIndex(i => i.type === newItem.type && i.itemId === newItem.itemId);
    if (existingIndex >= 0) {
      const updatedItems = [...form.items];
      updatedItems[existingIndex].quantity += addItemQty;
      setForm({ ...form, items: updatedItems });
    } else {
      setForm({ ...form, items: [...form.items, newItem] });
    }

    setAddItemId("");
    setAddItemQty(1);
  };

  const handleRemoveItem = (index: number) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = "Name is required";
    if (form.items.length === 0) newErrors.items = "Add at least one item";
    if (!form.price || parseFloat(form.price) <= 0) newErrors.price = "Price is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsCreating(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    toast.success("Bundle created successfully!");
    navigate("/venue/tickets/bundles");
  };

  const originalPrice = calculateOriginalPrice();
  const bundlePrice = parseFloat(form.price) || 0;
  const savings = originalPrice - bundlePrice;
  const savingsPercent = originalPrice > 0 ? Math.round((savings / originalPrice) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/tickets/bundles" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Create Bundle</h1>
      </div>

      <div className="space-y-6">
        {/* Event Selection */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Event</h2>
          <Select
            label="Select Event"
            options={events}
            value={form.eventId}
            onChange={(e) => setForm({ ...form, eventId: e.target.value, items: [] })}
          />
        </div>

        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Bundle Information</h2>
          <div className="space-y-4">
            <Input
              label="Bundle Name"
              placeholder="e.g. Date Night Package"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              error={errors.name}
            />
            <Textarea
              label="Description"
              placeholder="Describe what makes this bundle special..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        {/* Bundle Items */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Included Items</h2>

          {errors.items && <p className="text-red-600 text-sm mb-3">{errors.items}</p>}

          {form.items.length > 0 && (
            <div className="space-y-2 mb-4">
              {form.items.map((item, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    {item.type === "ticket" ? (
                      <Tag className="w-5 h-5 text-purple-600" />
                    ) : (
                      <Gift className="w-5 h-5 text-blue-600" />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{item.quantity}x {item.itemName}</p>
                      <p className="text-sm text-gray-500">${item.unitPrice} each</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-gray-900">${item.unitPrice * item.quantity}</span>
                    <button onClick={() => handleRemoveItem(index)} className="text-gray-400 hover:text-red-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-2 border-t">
                <span className="text-sm text-gray-500">Original Value: <strong className="text-gray-900">${originalPrice}</strong></span>
              </div>
            </div>
          )}

          {/* Add Item */}
          <div className="flex items-end gap-3">
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={addItemType}
                onChange={(e) => { setAddItemType(e.target.value as "ticket" | "addon"); setAddItemId(""); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="ticket">Ticket</option>
                <option value="addon">Add-On</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
              <select
                value={addItemId}
                onChange={(e) => setAddItemId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="">Select {addItemType}...</option>
                {addItemType === "ticket"
                  ? filteredTickets.map(t => <option key={t.id} value={t.id}>{t.name} - ${t.price}</option>)
                  : availableAddOns.map(a => <option key={a.id} value={a.id}>{a.name} - ${a.price}</option>)
                }
              </select>
            </div>
            <div className="w-20">
              <label className="block text-sm font-medium text-gray-700 mb-1">Qty</label>
              <input
                type="number"
                min="1"
                value={addItemQty}
                onChange={(e) => setAddItemQty(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <Button variant="secondary" onClick={handleAddItem} disabled={!addItemId}>
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Original Value</label>
              <div className="px-3 py-2 bg-gray-100 rounded-lg text-gray-600 font-medium">
                ${originalPrice}
              </div>
            </div>
            <Input
              label="Bundle Price"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              error={errors.price}
            />
          </div>

          {bundlePrice > 0 && originalPrice > 0 && bundlePrice < originalPrice && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800">
                Customers save <strong>${savings}</strong> ({savingsPercent}% off)
              </p>
            </div>
          )}

          {bundlePrice >= originalPrice && originalPrice > 0 && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800">
                Bundle price should be less than original value to offer savings
              </p>
            </div>
          )}
        </div>

        {/* Quantity */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Availability</h2>
          <Input
            label="Quantity Available (optional)"
            type="number"
            min="1"
            placeholder="Unlimited"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            helper="Leave empty for unlimited availability"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link to="/venue/tickets/bundles">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button onClick={handleSubmit} disabled={isCreating}>
            {isCreating ? "Creating..." : "Create Bundle"}
          </Button>
        </div>
      </div>
    </div>
  );
}
