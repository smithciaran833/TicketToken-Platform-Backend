import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, MessageSquare, Edit, Trash2, MoreVertical, AlertCircle } from "lucide-react";
import { Button, Dropdown, useToast, ToastContainer } from "../../components/ui";

const smsTemplates = [
  { id: "1", name: "Order Confirmation", preview: "Thanks {{first_name}}! Your tickets for {{event_name}} are confirmed. View: {{ticket_link}}", chars: 98, active: true },
  { id: "2", name: "Event Reminder", preview: "Reminder: {{event_name}} is tomorrow at {{event_time}}. See you at {{venue_name}}!", chars: 82, active: true },
  { id: "3", name: "Gate Open Alert", preview: "Gates are now open for {{event_name}}. Show your mobile ticket at entry.", chars: 72, active: true },
  { id: "4", name: "Event Update", preview: "Update for {{event_name}}: {{message}}", chars: 40, active: false },
];

export default function CommSMSTemplates() {
  const toast = useToast();
  const [smsEnabled] = useState(true);

  const getDropdownItems = (_template: typeof smsTemplates[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => {} },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => toast.success("Template deleted"), danger: true },
  ];

  const getCharCountColor = (chars: number) => {
    if (chars <= 160) return "text-green-600";
    if (chars <= 320) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">SMS Templates</h1>
            <p className="text-gray-500">Manage text message templates</p>
          </div>
        </div>
        <Link to="/venue/settings/communication/sms/new">
          <Button>
            <Plus className="w-4 h-4" />
            Create Template
          </Button>
        </Link>
      </div>

      {/* SMS Status */}
      {!smsEnabled && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800">SMS Not Enabled</p>
              <p className="text-sm text-yellow-700 mt-1">
                Contact support to enable SMS messaging for your account.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Character Guidelines */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">
          <strong>SMS Character Limits:</strong> Messages up to 160 characters are sent as a single SMS. 
          Longer messages are split into multiple segments (up to 153 chars each after the first).
        </p>
      </div>

      {/* Templates */}
      <div className="space-y-4">
        {smsTemplates.map((template) => (
          <div key={template.id} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      template.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {template.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 font-mono bg-gray-50 p-3 rounded-lg">
                    {template.preview}
                  </p>
                  <p className={`text-xs mt-2 ${getCharCountColor(template.chars)}`}>
                    {template.chars} characters ({template.chars <= 160 ? "1 segment" : `${Math.ceil(template.chars / 153)} segments`})
                  </p>
                </div>
              </div>
              <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(template)} />
            </div>
          </div>
        ))}
      </div>

      {smsTemplates.length === 0 && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No SMS templates yet.</p>
          <Link to="/venue/settings/communication/sms/new">
            <Button variant="secondary" className="mt-3">Create Your First Template</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
