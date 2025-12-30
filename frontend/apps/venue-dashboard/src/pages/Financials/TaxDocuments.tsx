import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, FileText, ExternalLink } from "lucide-react";
import { Button, useToast, ToastContainer } from "../../components/ui";

const taxYears = [
  { value: "2025", label: "2025" },
  { value: "2024", label: "2024" },
  { value: "2023", label: "2023" },
];

const documents = {
  "2025": [
    { id: 1, name: "Transaction Summary (YTD)", type: "summary", available: true },
  ],
  "2024": [
    { id: 1, name: "1099-K", type: "1099", available: true },
    { id: 2, name: "Transaction Summary", type: "summary", available: true },
    { id: 3, name: "Annual Report", type: "report", available: true },
  ],
  "2023": [
    { id: 1, name: "1099-K", type: "1099", available: true },
    { id: 2, name: "Transaction Summary", type: "summary", available: true },
    { id: 3, name: "Annual Report", type: "report", available: true },
  ],
};

const taxInfo = {
  businessName: "Awesome Venues LLC",
  taxId: "***-**-1234",
  address: "123 Main Street, New York, NY 10001",
};

export default function TaxDocuments() {
  const toast = useToast();
  const [selectedYear, setSelectedYear] = useState("2024");

  const yearDocs = documents[selectedYear as keyof typeof documents] || [];

  const handleDownload = (docName: string) => {
    toast.success(`Downloading ${docName}...`);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/financials" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tax Documents</h1>
          <p className="text-gray-500">Download tax forms and reports</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm font-medium text-gray-700">Tax Year:</label>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
        >
          {taxYears.map(year => (
            <option key={year.value} value={year.value}>{year.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Documents</h2>
        
        {yearDocs.length > 0 ? (
          <div className="space-y-3">
            {yearDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{doc.name}</p>
                    <p className="text-sm text-gray-500">Tax Year {selectedYear}</p>
                  </div>
                </div>
                <Button variant="secondary" onClick={() => handleDownload(doc.name)}>
                  <Download className="w-4 h-4" />
                  Download PDF
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No documents available for {selectedYear}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tax Information on File</h2>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-500">Business Name</p>
            <p className="font-medium text-gray-900">{taxInfo.businessName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Tax ID (EIN/SSN)</p>
            <p className="font-medium text-gray-900">{taxInfo.taxId}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Address</p>
            <p className="font-medium text-gray-900">{taxInfo.address}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t">
          <a 
            href="https://dashboard.stripe.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-purple-600 hover:text-purple-700 text-sm font-medium inline-flex items-center gap-1"
          >
            Update Tax Information in Stripe
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> 1099-K forms are issued by Stripe and will be available by January 31st for the previous tax year 
          if your gross payments exceed the IRS reporting threshold. For questions about your tax obligations, please consult a tax professional.
        </p>
      </div>
    </div>
  );
}
