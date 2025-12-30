import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye } from "lucide-react";
import { Button, Input, Textarea, Toggle, useToast, ToastContainer } from "../../components/ui";

export default function PolicyCustomCreate() {
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    summary: "",
    content: "",
    showOnCheckout: true,
    showOnEventPage: true,
    requireAcknowledgment: false,
    active: true,
  });

  const [showPreview, setShowPreview] = useState(false);

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Please enter policy name");
      return;
    }
    if (!form.content.trim()) {
      toast.error("Please enter policy content");
      return;
    }
    toast.success("Policy created!");
    setTimeout(() => navigate("/venue/settings/policies/custom"), 1500);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings/policies/custom" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Create Custom Policy</h1>
            <p className="text-gray-500">Add a new venue policy</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="w-4 h-4" />
            {showPreview ? "Edit" : "Preview"}
          </Button>
          <Button onClick={handleSave}>Save Policy</Button>
        </div>
      </div>

      {!showPreview ? (
        <div className="grid grid-cols-3 gap-6">
          {/* Form */}
          <div className="col-span-2 bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <Input
              label="Policy Name"
              placeholder="e.g. Photography Policy"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <Input
              label="Summary"
              placeholder="Brief description for listings"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />

            <Textarea
              label="Policy Content"
              placeholder="Write the full policy text here..."
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={12}
            />
          </div>

          {/* Options */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 h-fit space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Display Options</h2>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Show on Event Page</p>
              </div>
              <Toggle
                enabled={form.showOnEventPage}
                onChange={(val) => setForm({ ...form, showOnEventPage: val })}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Show at Checkout</p>
              </div>
              <Toggle
                enabled={form.showOnCheckout}
                onChange={(val) => setForm({ ...form, showOnCheckout: val })}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Require Acknowledgment</p>
                <p className="text-xs text-gray-500">Customer must accept to purchase</p>
              </div>
              <Toggle
                enabled={form.requireAcknowledgment}
                onChange={(val) => setForm({ ...form, requireAcknowledgment: val })}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Active</p>
              </div>
              <Toggle
                enabled={form.active}
                onChange={(val) => setForm({ ...form, active: val })}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{form.name || "Policy Name"}</h2>
          {form.summary && <p className="text-gray-500 mb-4">{form.summary}</p>}
          <div className="prose prose-sm max-w-none">
            <div className="whitespace-pre-wrap text-gray-700">
              {form.content || "Policy content will appear here..."}
            </div>
          </div>
          {form.requireAcknowledgment && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-5 h-5 text-purple-600 rounded" />
                <span className="text-sm text-gray-700">I have read and agree to this policy</span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
