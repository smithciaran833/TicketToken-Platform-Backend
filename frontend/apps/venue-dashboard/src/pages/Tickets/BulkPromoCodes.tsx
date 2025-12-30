import { useState } from "react";
import { ArrowLeft, Download, Copy } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Select, DatePicker, useToast, ToastContainer } from "../../components/ui";

const discountTypes = [
  { value: "percentage", label: "Percentage Off (%)" },
  { value: "fixed", label: "Fixed Amount Off ($)" },
];

export default function BulkPromoCodes() {
  const navigate = useNavigate();
  const toast = useToast();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);

  const [form, setForm] = useState({
    prefix: "",
    count: "10",
    codeLength: "8",
    discountType: "percentage",
    discountValue: "10",
    maxUsesEach: "1",
    validUntil: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const generateRandomCode = (prefix: string, length: number) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = prefix;
    const remaining = length - prefix.length;
    for (let i = 0; i < remaining; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (parseInt(form.count) < 1 || parseInt(form.count) > 1000) newErrors.count = "Must be between 1-1000";
    if (parseInt(form.codeLength) < 4 || parseInt(form.codeLength) > 16) newErrors.codeLength = "Must be between 4-16";
    if (form.prefix.length >= parseInt(form.codeLength)) newErrors.prefix = "Prefix too long for code length";
    if (!form.discountValue || parseFloat(form.discountValue) <= 0) newErrors.discountValue = "Required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleGenerate = async () => {
    if (!validate()) return;

    setIsGenerating(true);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const codes: string[] = [];
    const count = parseInt(form.count);
    const length = parseInt(form.codeLength);

    for (let i = 0; i < count; i++) {
      codes.push(generateRandomCode(form.prefix.toUpperCase(), length));
    }

    setGeneratedCodes(codes);
    setGenerated(true);
    setIsGenerating(false);
    toast.success(`${count} promo codes generated!`);
  };

  const handleExport = () => {
    const csv = "Code,Discount,Max Uses,Valid Until\n" +
      generatedCodes.map(code => 
        `${code},${form.discountType === "percentage" ? form.discountValue + "%" : "$" + form.discountValue},${form.maxUsesEach},${form.validUntil}`
      ).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "promo_codes.csv";
    a.click();
    toast.success("CSV downloaded!");
  };

  const handleSave = async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
    toast.success("Promo codes saved!");
    navigate("/venue/tickets/promos");
  };

  const copyAllCodes = () => {
    navigator.clipboard.writeText(generatedCodes.join("\n"));
    toast.success("All codes copied!");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/tickets/promos" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Bulk Create Promo Codes</h1>
      </div>

      {!generated ? (
        <div className="space-y-6">
          {/* Generation Options */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Code Generation</h2>
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Number of Codes"
                type="number"
                min="1"
                max="1000"
                value={form.count}
                onChange={(e) => setForm({ ...form, count: e.target.value })}
                error={errors.count}
              />
              <Input
                label="Code Prefix (Optional)"
                placeholder="e.g. VIP"
                value={form.prefix}
                onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })}
                error={errors.prefix}
                helper="Added to start of each code"
              />
              <Input
                label="Code Length"
                type="number"
                min="4"
                max="16"
                value={form.codeLength}
                onChange={(e) => setForm({ ...form, codeLength: e.target.value })}
                error={errors.codeLength}
              />
            </div>
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>Preview:</strong>{" "}
                <span className="font-mono">
                  {form.prefix || ""}{Array(Math.max(0, parseInt(form.codeLength || "8") - (form.prefix?.length || 0))).fill("X").join("")}
                </span>
              </p>
            </div>
          </div>

          {/* Discount Settings */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Discount Settings</h2>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Discount Type"
                options={discountTypes}
                value={form.discountType}
                onChange={(e) => setForm({ ...form, discountType: e.target.value })}
              />
              <Input
                label={form.discountType === "percentage" ? "Discount %" : "Discount $"}
                type="number"
                min="0"
                max={form.discountType === "percentage" ? "100" : undefined}
                value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                error={errors.discountValue}
              />
            </div>
          </div>

          {/* Usage & Validity */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage & Validity</h2>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Max Uses Per Code"
                type="number"
                min="1"
                value={form.maxUsesEach}
                onChange={(e) => setForm({ ...form, maxUsesEach: e.target.value })}
                helper="Each code can be used this many times"
              />
              <DatePicker
                label="Valid Until"
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
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? "Generating..." : `Generate ${form.count} Codes`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-green-800 mb-2">
              ✓ {generatedCodes.length} Promo Codes Generated
            </h2>
            <p className="text-green-700">
              {form.discountType === "percentage" ? `${form.discountValue}% off` : `$${form.discountValue} off`} • 
              {form.maxUsesEach} use{parseInt(form.maxUsesEach) !== 1 ? "s" : ""} per code
              {form.validUntil && ` • Valid until ${form.validUntil}`}
            </p>
          </div>

          {/* Generated Codes Preview */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Generated Codes</h2>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={copyAllCodes}>
                  <Copy className="w-4 h-4" />
                  Copy All
                </Button>
                <Button variant="secondary" onClick={handleExport}>
                  <Download className="w-4 h-4" />
                  Export CSV
                </Button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg">
              <div className="grid grid-cols-4 gap-2 p-4">
                {generatedCodes.map((code, index) => (
                  <button
                    key={index}
                    onClick={() => { navigator.clipboard.writeText(code); toast.success("Copied!"); }}
                    className="font-mono text-sm bg-purple-50 text-purple-700 px-3 py-2 rounded hover:bg-purple-100 transition-colors text-center"
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-3">Click any code to copy it</p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4">
            <Button variant="secondary" onClick={() => { setGenerated(false); setGeneratedCodes([]); }}>
              Generate More
            </Button>
            <div className="flex gap-3">
              <Link to="/venue/tickets/promos">
                <Button variant="secondary">Discard & Back</Button>
              </Link>
              <Button onClick={handleSave}>
                Save All Codes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
