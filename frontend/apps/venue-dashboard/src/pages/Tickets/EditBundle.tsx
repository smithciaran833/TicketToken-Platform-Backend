import { useState } from "react";
import { ArrowLeft, Plus, X, Tag, Gift, AlertTriangle } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Input, Select, Textarea, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const availableTickets = [
  { id: 1, name: "General Admission", event: "Summer Music Festival", eventId: 1, price: 65 },
  { id: 2, name: "VIP Access", event: "Summer Music Festival", eventId: 1, price: 150 },
  { id: 4, name: "General Admission", event: "Jazz Night", eventId: 5, price: 35 },
  { id: 5, name: "Reserved Seating", event: "Jazz Night", eventId: 5, price: 55 },
];

const availableAddOns = [
  { id: 1, name: "Parking Pass", price: 25 },
  { id: 2, name: "VIP Lounge Access", price: 75 },
  { id: 3, name: "Meet & Greet", price: 200 },
  { id: 4, name: "Merch Bundle", price: 45 },
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

const mockBundles: Record<number, any> = {
  1: {
    id: 1, name: "Date Night Package", description: "Perfect for couples",
    event: "Summer Music Festival", eventId: 1,
    items: [
      { type: "ticket", itemId: 1, itemName: "General Admission", quantity: 2, unitPrice: 65 },
      { type: "addon", itemId: 1, itemName: "Parking Pass", quantity: 1, unitPrice: 25 },
    ],
    price: 145, originalPrice: 155, quantity: null, sold: 45, status: "Active"
  },
  2: {
    id: 2, name: "VIP Experience", description: "The ultimate festival experience",
    event: "Summer Music Festival", eventId: 1,
    items: [
      { type: "ticket", itemId: 2, itemName: "VIP Access", quantity: 1, unitPrice: 150 },
      { type: "addon", itemId: 3, itemName: "Meet & Greet", quantity: 1, unitPrice: 200 },
    ],
    price: 320, originalPrice: 350, quantity: 50, sold: 12, status: "Active"
  },
  3: {
    id: 3, name: "Group Pack (4)", description: "Great value for groups",
    event: "Summer Music Festival", eventId: 1,
    items: [
      { type: "ticket", itemId: 1, itemName: "General Admission", quantity: 4, unitPrice: 65 },
      { type: "addon", itemId: 1, itemName: "Parking Pass", quantity: 1, unitPrice: 25 },
    ],
    price: 250, originalPrice: 285, quantity: null, sold: 0, status: "Draft"
  },
};

export default function EditBundle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const bundleId = parseInt(id || "1");
  const bundle = mockBundles[bundleId];

  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [form, setForm] = useState({
    name: bundle?.name || "",
    description: bundle?.description || "",
    eventId: bundle?.eventId?.toString() || "1",
    items: bundle?.items || [] as BundleItem[],
    price: bundle?.price?.toString() || "",
    quantity: bundle?.quantity?.toString() || "",
  });

  const [addItemType, setAddItemType] = useState<"ticket" | "addon">("ticket");
  const [addItemId, setAddItemId] = useState("");
  const [addItemQty, setAddItemQty] = useState(1);

  const hasSales = bundle?.sold > 0;
  const filteredTickets = availableTickets.filter(t => t.eventId.toString() === form.eventId);

  const calculateOriginalPrice = () => {
    return form.items.reduce((sum: number, item: BundleItem) => sum + (item.unitPrice * item.quantity), 0);
  };

  const handleAddItem = () => {
    if (!addItemId) return;

    let newItem: BundleItem;

    if (addItemType === "ticket") {
      const ticket = filteredTickets.find(t => t.id.toString() === addItemId);
      if (!ticket) return;
      newItem = { type: "ticket", itemId: ticket.id, itemName: ticket.name, quantity: addItemQty, unitPrice: ticket.price };
    } else {
      const addon = availableAddOns.find(a => a.id.toString() === addItemId);
      if (!addon) return;
      newItem = { type: "addon", itemId: addon.id, itemName: addon.name, quantity: addItemQty, unitPrice: addon.price };
    }

    const existingIndex = form.items.findIndex((i: BundleItem) => i.type === newItem.type && i.itemId === newItem.itemId);
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
    setForm({ ...form, items: form.items.filter((_: BundleItem, i: number) => i !== index) });
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    toast.success("Bundle updated successfully!");
    navigate("/venue/tickets/bundles");
  };

  const handleDelete = async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
    toast.success("Bundle deleted!");
    navigate("/venue/tickets/bundles");
  };

  if (!bundle) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Bundle not found</p>
        <Link to="/venue/tickets/bundles" className="text-purple-600 hover:text-purple-700 mt-2 inline-block">
          Back to Bundles
        </Link>
      </div>
    );
  }

  const originalPrice = calculateOriginalPrice();
  const bundlePrice = parseFloat(form.price) || 0;
  const savings = originalPrice - bundlePrice;
  const savingsPercent = originalPrice > 0 ? Math.round((savings / originalPrice) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/tickets/bundles" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Bundle</h1>
            <p className="text-gray-500">{bundle.event}</p>
          </div>
        </div>
        {!hasSales && (
          <Button variant="danger" onClick={() => setShowDeleteModal(true)}>Delete</Button>
        )}
      </div>

      {hasSales && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">Bundles have been sold</p>
            <p className="text-sm text-yellow-700">{bundle.sold} bundles sold. Price and items cannot be changed.</p>
          </div>
        </div>
      )}

      {hasSales && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sales Summary</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">Bundles Sold</p>
              <p className="text-2xl font-bold text-gray-900">{bundle.sold}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Revenue</p>
              <p className="text-2xl font-bold text-green-600">${(bundle.sold * bundle.price).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Customer Savings</p>
              <p className="text-2xl font-bold text-blue-600">${(bundle.sold * (bundle.originalPrice - bundle.price)).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Event</h2>
          <Select
            label="Select Event"
            options={events}
            value={form.eventId}
            onChange={(e) => setForm({ ...form, eventId: e.target.value, items: [] })}
            disabled={hasSales}
          />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Bundle Information</h2>
          <div className="space-y-4">
            <Input
              label="Bundle Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Textarea
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Included Items</h2>

          {form.items.length > 0 && (
            <div className="space-y-2 mb-4">
              {form.items.map((item: BundleItem, index: number) => (
                <div key={index} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    {item.type === "ticket" ? <Tag className="w-5 h-5 text-purple-600" /> : <Gift className="w-5 h-5 text-blue-600" />}
                    <div>
                      <p className="font-medium text-gray-900">{item.quantity}x {item.itemName}</p>
                      <p className="text-sm text-gray-500">${item.unitPrice} each</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-gray-900">${item.unitPrice * item.quantity}</span>
                    {!hasSales && (
                      <button onClick={() => handleRemoveItem(index)} className="text-gray-400 hover:text-red-600">
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!hasSales && (
            <div className="flex items-end gap-3">
              <div className="w-28">
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={addItemType}
                  onChange={(e) => { setAddItemType(e.target.value as "ticket" | "addon"); setAddItemId(""); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="ticket">Ticket</option>
                  <option value="addon">Add-On</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                <select value={addItemId} onChange={(e) => setAddItemId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="">Select {addItemType}...</option>
                  {addItemType === "ticket"
                    ? filteredTickets.map(t => <option key={t.id} value={t.id}>{t.name} - ${t.price}</option>)
                    : availableAddOns.map(a => <option key={a.id} value={a.id}>{a.name} - ${a.price}</option>)
                  }
                </select>
              </div>
              <div className="w-20">
                <label className="block text-sm font-medium text-gray-700 mb-1">Qty</label>
                <input type="number" min="1" value={addItemQty} onChange={(e) => setAddItemQty(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <Button variant="secondary" onClick={handleAddItem} disabled={!addItemId}>
                <Plus className="w-4 h-4" /> Add
              </Button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Original Value</label>
              <div className="px-3 py-2 bg-gray-100 rounded-lg text-gray-600 font-medium">${originalPrice}</div>
            </div>
            <Input
              label="Bundle Price"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              disabled={hasSales}
            />
          </div>
          {bundlePrice > 0 && originalPrice > 0 && bundlePrice < originalPrice && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800">Customers save <strong>${savings}</strong> ({savingsPercent}% off)</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Availability</h2>
          <Input
            label="Quantity Available (optional)"
            type="number"
            min={hasSales ? bundle.sold : 1}
            placeholder="Unlimited"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            helper={hasSales ? `Minimum ${bundle.sold} (bundles already sold)` : "Leave empty for unlimited"}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4">
          <Link to="/venue/tickets/bundles"><Button variant="secondary">Cancel</Button></Link>
          <Button onClick={handleSubmit} disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</Button>
        </div>
      </div>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Bundle" size="sm">
        <p className="text-gray-600">Are you sure you want to delete <strong>{bundle.name}</strong>?</p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
