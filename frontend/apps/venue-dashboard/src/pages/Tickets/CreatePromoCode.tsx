import { useState } from "react";
import { ArrowLeft, Wand2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Select, DatePicker, useToast, ToastContainer } from "../../components/ui";

const events = [
  { value: "all", label: "All Events" },
  { value: "1", label: "Summer Music Festival" },
  { value: "2", label: "Tech Conference" },
  { value: "5", label: "Jazz Night" },
];

const ticketTypes = [
  { value: "all", label: "All Ticket Types" },
  { value: "1", label: "General Admission" },
  { value: "2", label: "VIP Access" },
  { value: "3", label: "Early Bird" },
];

const discountTypes = [
  { value: "percentage", label: "Percentage Off (%)" },
  { value: "fixed", label: "Fixed Amount Off ($)" },
  { value: "free", label: "Free Ticket" },
];

export default function CreatePromoCode() {
  const navigate = useNavigate();
  const toast = useToast();
  const [isCreating, setIsCreating] = useState(false);

  const [form, setForm] = useState({
    code: "",
    discountType: "percentage",
    discountValue: "",
    eventId: "all",
    ticketTypeId: "all",
    maxUses: "",
    maxUsesPerCustomer: "",
    validFrom: "",
    validUntil: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setForm({ ...form, code });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.code.trim()) newErrors.code = "Code is required";
    if (!form.discountValue || parseFloat(form.discountValue) <= 0) newErrors.discountValue = "Discount value is required";
    if (form.discountType === "percentage" && parseFloat(form.discountValue) > 100) {
      newErrors.discountValue = "Percentage cannot exceed 100";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (createAnother: boolean = false) => {
    if (!validate()) return;

    setIsCreating(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    toast.success("Promo code created successfully!");

    if (createAnother) {
      setForm({ ...form, code: "" });
      generateCode();
      setIsCreating(false);
    } else {
      navigate("/venue/tickets/promos");
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/tickets/promos" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Create Promo Code</h1>
      </div>

      <div className="space-y-6">
        {/* Code */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Promo Code</h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="Code"
                placeholder="e.g. SUMMER20"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                error={errors.code}
                helper="Letters and numbers only, no spaces"
              />
            </div>
            <div className="pt-7">
              <Button variant="secondary" onClick={generateCode}>
                <Wand2 className="w-4 h-4" />
                Generate
              </Button>
            </div>
          </div>
        </div>

        {/* Discount */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Discount</h2>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Discount Type"
              options={discountTypes}
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value })}
            />
            <Input
              label={form.discountType === "percentage" ? "Discount %" : form.discountType === "fixed" ? "Discount $" : "Number of Free Tickets"}
              type="number"
              min="0"
              max={form.discountType === "percentage" ? "100" : undefined}
              step={form.discountType === "fixed" ? "0.01" : "1"}
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
              error={errors.discountValue}
            />
          </div>
        </div>

        {/* Applies To */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Applies To</h2>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Event(s)"
              options={events}
              value={form.eventId}
              onChange={(e) => setForm({ ...form, eventId: e.target.value })}
            />
            <Select
              label="Ticket Type(s)"
              options={ticketTypes}
              value={form.ticketTypeId}
              onChange={(e) => setForm({ ...form, ticketTypeId: e.target.value })}
            />
          </div>
        </div>

        {/* Usage Limits */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage Limits</h2>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Total Uses"
              type="number"
              min="1"
              placeholder="Unlimited"
              value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
              helper="Leave empty for unlimited"
            />
            <Input
              label="Uses Per Customer"
              type="number"
              min="1"
              placeholder="Unlimited"
              value={form.maxUsesPerCustomer}
              onChange={(e) => setForm({ ...form, maxUsesPerCustomer: e.target.value })}
              helper="Leave empty for unlimited"
            />
          </div>
        </div>

        {/* Valid Dates */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Valid Dates</h2>
          <div className="grid grid-cols-2 gap-4">
            <DatePicker
              label="Start Date"
              value={form.validFrom}
              onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
            />
            <DatePicker
              label="End Date"
              value={form.validUntil}
              onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link to="/venue/tickets/promos">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button variant="secondary" onClick={() => handleSubmit(true)} disabled={isCreating}>
            Create & Add Another
          </Button>
          <Button onClick={() => handleSubmit(false)} disabled={isCreating}>
            {isCreating ? "Creating..." : "Create Promo Code"}
          </Button>
        </div>
      </div>
    </div>
  );
}
