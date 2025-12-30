import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, MessageCircle, Mail, Phone, Calendar, Upload } from "lucide-react";
import { Button, Input, Textarea, Select, useToast, ToastContainer } from "../../components/ui";

const categoryOptions = [
  { value: "", label: "Select a category..." },
  { value: "billing", label: "Billing & Payments" },
  { value: "events", label: "Events & Tickets" },
  { value: "scanning", label: "Scanning & Check-in" },
  { value: "account", label: "Account & Settings" },
  { value: "technical", label: "Technical Issue" },
  { value: "other", label: "Other" },
];

export default function ContactSupport() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    category: "",
    subject: "",
    description: "",
  });

  const handleSubmit = () => {
    if (!form.category) {
      toast.error("Please select a category");
      return;
    }
    if (!form.subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Please describe your issue");
      return;
    }
    toast.success("Support ticket submitted!");
    setTimeout(() => navigate("/venue/support/tickets"), 1500);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Contact Support</h1>
          <p className="text-gray-500">We're here to help</p>
        </div>
      </div>

      {/* Contact Options */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Link to="/venue/support/chat" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-500 transition-colors text-center">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
            <MessageCircle className="w-6 h-6 text-purple-600" />
          </div>
          <p className="font-medium text-gray-900">Live Chat</p>
          <p className="text-xs text-green-600 mt-1">Available now</p>
        </Link>

        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
            <Mail className="w-6 h-6 text-blue-600" />
          </div>
          <p className="font-medium text-gray-900">Email</p>
          <p className="text-xs text-gray-500 mt-1">support@tickettoken.com</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
            <Phone className="w-6 h-6 text-green-600" />
          </div>
          <p className="font-medium text-gray-900">Phone</p>
          <p className="text-xs text-gray-500 mt-1">1-800-TICKETS</p>
        </div>

        <Link to="/venue/support/schedule" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-500 transition-colors text-center">
          <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mx-auto mb-3">
            <Calendar className="w-6 h-6 text-yellow-600" />
          </div>
          <p className="font-medium text-gray-900">Schedule Call</p>
          <p className="text-xs text-gray-500 mt-1">Book a time</p>
        </Link>
      </div>

      {/* Submit Ticket Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Submit a Support Ticket</h2>
        
        <div className="space-y-4">
          <Select
            label="Category"
            options={categoryOptions}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />

          <Input
            label="Subject"
            placeholder="Brief description of your issue"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />

          <Textarea
            label="Description"
            placeholder="Please provide as much detail as possible..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={5}
          />

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Attachments (optional)</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Drag files here or click to upload</p>
              <p className="text-xs text-gray-500 mt-1">Screenshots, logs, or relevant documents</p>
            </div>
          </div>

          {/* Account Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500 mb-2">Your account information will be attached:</p>
            <div className="text-sm">
              <p><strong>Name:</strong> John Doe</p>
              <p><strong>Email:</strong> john@venue.com</p>
              <p><strong>Venue:</strong> The Grand Theater</p>
            </div>
          </div>

          <Button onClick={handleSubmit} className="w-full">Submit Ticket</Button>
        </div>
      </div>
    </div>
  );
}
