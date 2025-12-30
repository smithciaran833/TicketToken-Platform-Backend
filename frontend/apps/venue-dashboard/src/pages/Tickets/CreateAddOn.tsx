import { useState } from "react";
import { ArrowLeft, Upload } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Select, Textarea, useToast, ToastContainer } from "../../components/ui";

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

export default function CreateAddOn() {
  const navigate = useNavigate();
  const toast = useToast();
  const [isCreating, setIsCreating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    eventId: "all",
    category: "other",
    price: "",
    quantity: "",
    maxPerOrder: "4",
    image: null as File | null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setForm({ ...form, image: file });
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = "Name is required";
    if (!form.price || parseFloat(form.price) < 0) newErrors.price = "Price must be 0 or greater";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsCreating(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    toast.success("Add-on created successfully!");
    navigate("/venue/tickets/addons");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/tickets/addons" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Create Add-On</h1>
      </div>

      <div className="space-y-6">
        {/* Event & Category */}
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

        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add-On Information</h2>
          <div className="space-y-4">
            <Input
              label="Name"
              placeholder="e.g. Parking Pass"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              error={errors.name}
            />
            <Textarea
              label="Description"
              placeholder="Describe what's included..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        {/* Image Upload */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Image (Optional)</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            {imagePreview ? (
              <div className="space-y-4">
                <img src={imagePreview} alt="Preview" className="max-h-40 mx-auto rounded-lg" />
                <Button variant="secondary" onClick={() => { setForm({ ...form, image: null }); setImagePreview(null); }}>
                  Remove Image
                </Button>
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

        {/* Pricing & Limits */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing & Limits</h2>
          <div className="grid grid-cols-3 gap-4">
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
              label="Quantity (Optional)"
              type="number"
              min="1"
              placeholder="Unlimited"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              helper="Leave empty for unlimited"
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

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link to="/venue/tickets/addons">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button onClick={handleSubmit} disabled={isCreating}>
            {isCreating ? "Creating..." : "Create Add-On"}
          </Button>
        </div>
      </div>
    </div>
  );
}
