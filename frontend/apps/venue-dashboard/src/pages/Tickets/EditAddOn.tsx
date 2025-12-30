import { useState } from "react";
import { ArrowLeft, Upload, AlertTriangle } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Input, Select, Textarea, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const events = [
  { value: "all", label: "All Events" },
  { value: "1", label: "Summer Music Festival" },
  { value: "2", label: "Tech Conference" },
  { value: "5", label: "Jazz Night" },
];

const categories = [
  { value: "parking", label: "Parking" },
  { value: "merchandise", label: "Merchandise" },
  { value: "food-drink", label: "Food & Drink" },
  { value: "vip-upgrade", label: "VIP Upgrade" },
  { value: "other", label: "Other" },
];

const mockAddOns: Record<number, any> = {
  1: { id: 1, name: "Parking Pass", description: "Reserved parking spot", eventId: "all", category: "parking", price: 25, quantity: null, sold: 234, maxPerOrder: 2, image: null },
  2: { id: 2, name: "VIP Lounge Access", description: "Access to exclusive VIP lounge", eventId: "1", category: "vip-upgrade", price: 75, quantity: null, sold: 89, maxPerOrder: 4, image: null },
  3: { id: 3, name: "Meet & Greet", description: "Meet the artists backstage", eventId: "1", category: "vip-upgrade", price: 200, quantity: 20, sold: 20, maxPerOrder: 1, image: null },
  4: { id: 4, name: "Merch Bundle", description: "T-shirt + Poster combo", eventId: "all", category: "merchandise", price: 45, quantity: null, sold: 0, maxPerOrder: 5, image: null },
};

export default function EditAddOn() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const addOnId = parseInt(id || "1");
  const addOn = mockAddOns[addOnId];

  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [form, setForm] = useState({
    name: addOn?.name || "",
    description: addOn?.description || "",
    eventId: addOn?.eventId || "all",
    category: addOn?.category || "other",
    price: addOn?.price?.toString() || "",
    quantity: addOn?.quantity?.toString() || "",
    maxPerOrder: addOn?.maxPerOrder?.toString() || "4",
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const hasSales = addOn?.sold > 0;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    toast.success("Add-on updated successfully!");
    navigate("/venue/tickets/addons");
  };

  const handleDelete = async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
    toast.success("Add-on deleted!");
    navigate("/venue/tickets/addons");
  };

  if (!addOn) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Add-on not found</p>
        <Link to="/venue/tickets/addons" className="text-purple-600 hover:text-purple-700 mt-2 inline-block">
          Back to Add-Ons
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/tickets/addons" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Edit Add-On</h1>
        </div>
        {!hasSales && (
          <Button variant="danger" onClick={() => setShowDeleteModal(true)}>Delete</Button>
        )}
      </div>

      {hasSales && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">Add-ons have been sold</p>
            <p className="text-sm text-yellow-700">{addOn.sold} units sold. Price cannot be changed.</p>
          </div>
        </div>
      )}

      {hasSales && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sales Summary</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Units Sold</p>
              <p className="text-2xl font-bold text-gray-900">{addOn.sold}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Revenue</p>
              <p className="text-2xl font-bold text-green-600">${(addOn.sold * addOn.price).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Availability</h2>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Available For"
              options={events}
              value={form.eventId}
              onChange={(e) => setForm({ ...form, eventId: e.target.value })}
            />
            <Select
              label="Category"
              options={categories}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add-On Information</h2>
          <div className="space-y-4">
            <Input
              label="Name"
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Image (Optional)</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            {imagePreview ? (
              <div className="space-y-4">
                <img src={imagePreview} alt="Preview" className="max-h-40 mx-auto rounded-lg" />
                <Button variant="secondary" onClick={() => setImagePreview(null)}>Remove Image</Button>
              </div>
            ) : (
              <label className="cursor-pointer">
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600 mb-1">Click to upload an image</p>
                <p className="text-xs text-gray-400">PNG, JPG up to 5MB</p>
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              </label>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing & Limits</h2>
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Price"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              disabled={hasSales}
            />
            <Input
              label="Quantity (Optional)"
              type="number"
              min={hasSales ? addOn.sold : 1}
              placeholder="Unlimited"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              helper={hasSales ? `Minimum ${addOn.sold}` : "Leave empty for unlimited"}
            />
            <Input
              label="Max Per Order"
              type="number"
              min="1"
              value={form.maxPerOrder}
              onChange={(e) => setForm({ ...form, maxPerOrder: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4">
          <Link to="/venue/tickets/addons"><Button variant="secondary">Cancel</Button></Link>
          <Button onClick={handleSubmit} disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</Button>
        </div>
      </div>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Add-On" size="sm">
        <p className="text-gray-600">Are you sure you want to delete <strong>{addOn.name}</strong>?</p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
