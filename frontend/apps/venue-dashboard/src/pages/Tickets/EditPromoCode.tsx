import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Input, Select, DatePicker, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

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
];

const discountTypes = [
  { value: "percentage", label: "Percentage Off (%)" },
  { value: "fixed", label: "Fixed Amount Off ($)" },
  { value: "free", label: "Free Ticket" },
];

const mockPromoCodes: Record<number, any> = {
  1: { id: 1, code: "SUMMER20", discountType: "percentage", discountValue: 20, eventId: "all", ticketTypeId: "all", uses: 145, maxUses: 500, maxUsesPerCustomer: "", validFrom: "2025-06-01", validUntil: "2025-08-01", status: "Active" },
  2: { id: 2, code: "VIPFRIEND", discountType: "fixed", discountValue: 50, eventId: "1", ticketTypeId: "2", uses: 23, maxUses: 100, maxUsesPerCustomer: "1", validFrom: "2025-06-01", validUntil: "2025-07-15", status: "Active" },
};

export default function EditPromoCode() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const promoId = parseInt(id || "1");
  const promo = mockPromoCodes[promoId];

  const [isSaving, setIsSaving] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);

  const [form, setForm] = useState({
    discountType: promo?.discountType || "percentage",
    discountValue: promo?.discountValue?.toString() || "",
    eventId: promo?.eventId || "all",
    ticketTypeId: promo?.ticketTypeId || "all",
    maxUses: promo?.maxUses?.toString() || "",
    maxUsesPerCustomer: promo?.maxUsesPerCustomer || "",
    validFrom: promo?.validFrom || "",
    validUntil: promo?.validUntil || "",
  });

  const handleSubmit = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    toast.success("Promo code updated!");
    navigate("/venue/tickets/promos");
  };

  const handleDeactivate = () => {
    toast.success("Promo code deactivated");
    setShowDeactivateModal(false);
    navigate("/venue/tickets/promos");
  };

  if (!promo) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Promo code not found</p>
        <Link to="/venue/tickets/promos" className="text-purple-600 hover:text-purple-700 mt-2 inline-block">
          Back to Promo Codes
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/tickets/promos" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Promo Code</h1>
            <p className="text-gray-500 font-mono">{promo.code}</p>
          </div>
        </div>
        {promo.status === "Active" && (
          <Button variant="danger" onClick={() => setShowDeactivateModal(true)}>Deactivate</Button>
        )}
      </div>

      {/* Code Display - Not Editable */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Promo Code</label>
        <p className="font-mono text-2xl font-bold text-gray-900">{promo.code}</p>
        <p className="text-sm text-gray-500 mt-1">Code cannot be changed after creation</p>
      </div>

      <div className="space-y-6">
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
              label={form.discountType === "percentage" ? "Discount %" : form.discountType === "fixed" ? "Discount $" : "Free Tickets"}
              type="number"
              min="0"
              max={form.discountType === "percentage" ? "100" : undefined}
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
            />
          </div>
        </div>

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

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage Limits</h2>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Total Uses"
              type="number"
              min={promo.uses}
              placeholder="Unlimited"
              value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
              helper={`${promo.uses} already used`}
            />
            <Input
              label="Uses Per Customer"
              type="number"
              min="1"
              placeholder="Unlimited"
              value={form.maxUsesPerCustomer}
              onChange={(e) => setForm({ ...form, maxUsesPerCustomer: e.target.value })}
            />
          </div>
        </div>

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

        <div className="flex items-center justify-end gap-3 pt-4">
          <Link to="/venue/tickets/promos"><Button variant="secondary">Cancel</Button></Link>
          <Button onClick={handleSubmit} disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</Button>
        </div>
      </div>

      <Modal isOpen={showDeactivateModal} onClose={() => setShowDeactivateModal(false)} title="Deactivate Promo Code" size="sm">
        <p className="text-gray-600">Deactivate <strong>{promo.code}</strong>? Customers won't be able to use it.</p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeactivateModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeactivate}>Deactivate</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
