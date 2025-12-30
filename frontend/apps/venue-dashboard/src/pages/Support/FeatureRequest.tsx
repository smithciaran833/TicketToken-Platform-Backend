import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Lightbulb, ThumbsUp } from "lucide-react";
import { Button, Input, Textarea, Select, useToast, ToastContainer } from "../../components/ui";

const categoryOptions = [
  { value: "", label: "Select category..." },
  { value: "events", label: "Events & Scheduling" },
  { value: "tickets", label: "Ticketing & Sales" },
  { value: "scanning", label: "Scanning & Check-in" },
  { value: "analytics", label: "Analytics & Reports" },
  { value: "marketing", label: "Marketing & Communication" },
  { value: "integrations", label: "Integrations" },
  { value: "mobile", label: "Mobile App" },
  { value: "other", label: "Other" },
];

const impactOptions = [
  { value: "", label: "Select impact..." },
  { value: "critical", label: "Critical - Can't work without it" },
  { value: "high", label: "High - Would significantly improve workflow" },
  { value: "medium", label: "Medium - Nice to have" },
  { value: "low", label: "Low - Minor improvement" },
];

export default function FeatureRequest() {
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    title: "",
    category: "",
    impact: "",
    problem: "",
    solution: "",
    alternatives: "",
  });

  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    if (!form.category) {
      toast.error("Please select a category");
      return;
    }
    if (!form.problem.trim()) {
      toast.error("Please describe the problem");
      return;
    }
    toast.success("Feature request submitted! Thanks for your feedback.");
    setTimeout(() => navigate("/venue/support/features"), 1500);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Request a Feature</h1>
          <p className="text-gray-500">Help shape the future of TicketToken</p>
        </div>
      </div>

      {/* Tip */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-purple-800">Tip: Check existing requests first!</p>
            <p className="text-sm text-purple-700">
              Your idea might already exist. <Link to="/venue/support/features" className="underline">Browse and vote on features</Link> to increase their priority.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <Input
            label="Feature Title"
            placeholder="Give your feature a clear, descriptive name"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Category"
              options={categoryOptions}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <Select
              label="Impact Level"
              options={impactOptions}
              value={form.impact}
              onChange={(e) => setForm({ ...form, impact: e.target.value })}
            />
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <Textarea
            label="What problem does this solve?"
            placeholder="Describe the pain point or challenge you're facing..."
            value={form.problem}
            onChange={(e) => setForm({ ...form, problem: e.target.value })}
            rows={4}
          />

          <Textarea
            label="Describe your ideal solution"
            placeholder="How would you like this to work? Be as specific as possible..."
            value={form.solution}
            onChange={(e) => setForm({ ...form, solution: e.target.value })}
            rows={4}
          />

          <Textarea
            label="What alternatives have you tried? (optional)"
            placeholder="Any workarounds you're currently using..."
            value={form.alternatives}
            onChange={(e) => setForm({ ...form, alternatives: e.target.value })}
            rows={3}
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-4">
          <Button onClick={handleSubmit} className="flex-1">Submit Feature Request</Button>
          <Link to="/venue/support/features">
            <Button variant="secondary">
              <ThumbsUp className="w-4 h-4" />
              Vote on Features
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
