import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button, Input, Select, Textarea, Toggle, useToast, ToastContainer } from "../../components/ui";

const refundWindows = [
  { value: "anytime", label: "Anytime before event" },
  { value: "7days", label: "Up to 7 days before event" },
  { value: "14days", label: "Up to 14 days before event" },
  { value: "30days", label: "Up to 30 days before event" },
  { value: "none", label: "No refunds" },
];

const refundTypes = [
  { value: "full", label: "Full refund" },
  { value: "partial", label: "Partial refund (minus fees)" },
  { value: "credit", label: "Store credit only" },
];

export default function PolicyRefund() {
  const toast = useToast();

  const [form, setForm] = useState({
    enabled: true,
    window: "7days",
    type: "full",
    feePercent: "10",
    allowExchanges: true,
    exchangeWindow: "7days",
    policyText: "Refunds are available up to 7 days before the event. After this period, tickets are non-refundable but may be transferred to another person. If an event is canceled, full refunds will be issued automatically. For postponed events, your tickets will be valid for the new date, or you may request a refund.",
  });

  const handleSave = () => {
    toast.success("Refund policy saved!");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Refund Policy</h1>
            <p className="text-gray-500">Configure your refund rules</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Enable Toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Allow Refunds</h2>
              <p className="text-sm text-gray-500">Enable refund requests for ticket purchases</p>
            </div>
          </div>
          <Toggle
            enabled={form.enabled}
            onChange={(val) => setForm({ ...form, enabled: val })}
          />
        </div>
      </div>

      {form.enabled && (
        <>
          {/* Refund Settings */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Refund Settings</h2>

            <div className="space-y-4">
              <Select
                label="Refund Window"
                options={refundWindows}
                value={form.window}
                onChange={(e) => setForm({ ...form, window: e.target.value })}
              />

              <Select
                label="Refund Type"
                options={refundTypes}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              />

              {form.type === "partial" && (
                <Input
                  label="Processing Fee (%)"
                  type="number"
                  min="0"
                  max="50"
                  value={form.feePercent}
                  onChange={(e) => setForm({ ...form, feePercent: e.target.value })}
                  helper="Percentage deducted from refund amount"
                />
              )}
            </div>
          </div>

          {/* Exchanges */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Ticket Exchanges</h2>
                <p className="text-sm text-gray-500">Allow customers to exchange tickets for different dates</p>
              </div>
              <Toggle
                enabled={form.allowExchanges}
                onChange={(val) => setForm({ ...form, allowExchanges: val })}
              />
            </div>

            {form.allowExchanges && (
              <Select
                label="Exchange Window"
                options={refundWindows.filter(w => w.value !== "none")}
                value={form.exchangeWindow}
                onChange={(e) => setForm({ ...form, exchangeWindow: e.target.value })}
              />
            )}
          </div>

          {/* Policy Text */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Policy Text</h2>
            <Textarea
              label="Displayed to customers at checkout"
              value={form.policyText}
              onChange={(e) => setForm({ ...form, policyText: e.target.value })}
              rows={5}
            />
          </div>
        </>
      )}

      {!form.enabled && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
          <RefreshCw className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Refunds are currently disabled.</p>
          <p className="text-sm text-gray-400 mt-1">Toggle above to enable refund requests.</p>
        </div>
      )}
    </div>
  );
}
