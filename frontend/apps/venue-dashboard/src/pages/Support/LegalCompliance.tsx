import { Link } from "react-router-dom";
import { ArrowLeft, Shield, Download, FileText, ExternalLink, CheckCircle } from "lucide-react";

const guides = [
  { id: 1, title: "GDPR Compliance Guide", description: "How to comply with EU data protection regulations", size: "1.2 MB" },
  { id: 2, title: "CCPA Compliance Guide", description: "California Consumer Privacy Act requirements", size: "980 KB" },
  { id: 3, title: "ADA Accessibility Guide", description: "Making your events accessible to all attendees", size: "1.5 MB" },
  { id: 4, title: "PCI DSS Compliance", description: "Payment card industry data security standards", size: "890 KB" },
  { id: 5, title: "Tax Collection Guide", description: "Sales tax and VAT collection requirements by region", size: "2.1 MB" },
];

const certifications = [
  { name: "SOC 2 Type II", status: "certified", date: "2024" },
  { name: "PCI DSS Level 1", status: "certified", date: "2024" },
  { name: "GDPR Compliant", status: "certified", date: "2024" },
  { name: "ISO 27001", status: "in-progress", date: "Expected 2025" },
];

export default function LegalCompliance() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Compliance & Security</h1>
          <p className="text-gray-500">Guides and certifications</p>
        </div>
      </div>

      {/* Certifications */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-semibold text-gray-900">Our Certifications</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {certifications.map((cert) => (
            <div 
              key={cert.name}
              className={`p-4 rounded-lg border ${
                cert.status === "certified" 
                  ? "bg-green-50 border-green-200" 
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {cert.status === "certified" ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <div className="w-4 h-4 border-2 border-gray-300 rounded-full" />
                )}
                <span className="font-medium text-gray-900">{cert.name}</span>
              </div>
              <p className="text-sm text-gray-500 ml-6">
                {cert.status === "certified" ? `Certified ${cert.date}` : cert.date}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Compliance Guides */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Compliance Guides</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {guides.map((guide) => (
            <div key={guide.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{guide.title}</p>
                  <p className="text-sm text-gray-500">{guide.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400">{guide.size}</span>
                <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security Overview */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Security Overview</h2>
        <div className="prose max-w-none text-gray-600">
          <p>
            TicketToken takes security seriously. We employ industry-standard security 
            measures to protect your data and your customers' information.
          </p>
          <ul>
            <li>256-bit SSL encryption for all data in transit</li>
            <li>AES-256 encryption for data at rest</li>
            <li>Regular penetration testing by third-party security firms</li>
            <li>24/7 security monitoring and incident response</li>
            <li>Multi-factor authentication available for all accounts</li>
          </ul>
        </div>
        <div className="mt-4">
          <a href="#" className="text-purple-600 hover:text-purple-700 flex items-center gap-1">
            View full security documentation <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
