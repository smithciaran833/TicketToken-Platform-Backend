import { Link } from "react-router-dom";
import { ArrowLeft, Download, FileText, AlertCircle } from "lucide-react";
import { Button } from "../../components/ui";

const taxForms = [
  { id: 1, name: "1099-K (2024)", description: "Payment card and third-party network transactions", year: 2024, available: true },
  { id: 2, name: "1099-K (2023)", description: "Payment card and third-party network transactions", year: 2023, available: true },
  { id: 3, name: "1099-K (2022)", description: "Payment card and third-party network transactions", year: 2022, available: true },
  { id: 4, name: "W-9 (On File)", description: "Request for Taxpayer Identification Number", year: 2024, available: true },
];

const taxResources = [
  { title: "Understanding Your 1099-K", description: "What the form means and how to use it" },
  { title: "Sales Tax Collection Guide", description: "When and how to collect sales tax" },
  { title: "Deductible Business Expenses", description: "Common deductions for event venues" },
];

export default function TaxForms() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tax Documents</h1>
          <p className="text-gray-500">Download tax forms and resources</p>
        </div>
      </div>

      {/* Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800">2024 Tax Documents Available Soon</p>
            <p className="text-sm text-blue-700">
              1099-K forms for tax year 2024 will be available by January 31, 2025.
            </p>
          </div>
        </div>
      </div>

      {/* Tax Forms */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Tax Forms</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {taxForms.map((form) => (
            <div key={form.id} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{form.name}</p>
                  <p className="text-sm text-gray-500">{form.description}</p>
                </div>
              </div>
              <Button variant="secondary" size="sm">
                <Download className="w-4 h-4" />
                Download
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Tax Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Tax Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">Business Name</p>
            <p className="font-medium text-gray-900">The Grand Theater LLC</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">EIN</p>
            <p className="font-medium text-gray-900">**-***1234</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">Business Address</p>
            <p className="font-medium text-gray-900">123 Main St, New York, NY 10001</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">W-9 Status</p>
            <p className="font-medium text-green-600">Verified ✓</p>
          </div>
        </div>
        <Link to="/venue/settings/legal/tax" className="inline-block mt-4 text-purple-600 hover:text-purple-700 text-sm">
          Update tax information →
        </Link>
      </div>

      {/* Resources */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tax Resources</h2>
        <div className="space-y-3">
          {taxResources.map((resource, index) => (
            <a key={index} href="#" className="block p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <p className="font-medium text-gray-900">{resource.title}</p>
              <p className="text-sm text-gray-500">{resource.description}</p>
            </a>
          ))}
        </div>
        <p className="mt-4 text-sm text-gray-500">
          Disclaimer: This information is for general guidance only. Please consult a tax professional for specific advice.
        </p>
      </div>
    </div>
  );
}
