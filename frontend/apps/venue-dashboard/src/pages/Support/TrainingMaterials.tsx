import { Link } from "react-router-dom";
import { ArrowLeft, FileText, Video, Download, Folder } from "lucide-react";

const categories = [
  {
    name: "Getting Started",
    items: [
      { type: "pdf", title: "Platform Overview Guide", size: "2.4 MB" },
      { type: "video", title: "Welcome to TicketToken", duration: "5:32" },
      { type: "pdf", title: "Quick Start Checklist", size: "156 KB" },
    ],
  },
  {
    name: "Events & Tickets",
    items: [
      { type: "pdf", title: "Event Creation Best Practices", size: "1.8 MB" },
      { type: "video", title: "Setting Up Ticket Types", duration: "8:15" },
      { type: "pdf", title: "Pricing Strategy Guide", size: "980 KB" },
      { type: "video", title: "Managing Promo Codes", duration: "4:45" },
    ],
  },
  {
    name: "Day-of Operations",
    items: [
      { type: "pdf", title: "Scanner App User Guide", size: "3.2 MB" },
      { type: "video", title: "Check-in Best Practices", duration: "6:20" },
      { type: "pdf", title: "Troubleshooting Guide", size: "1.1 MB" },
    ],
  },
  {
    name: "Analytics & Reporting",
    items: [
      { type: "pdf", title: "Understanding Your Dashboard", size: "2.1 MB" },
      { type: "video", title: "Custom Reports Tutorial", duration: "10:05" },
      { type: "pdf", title: "KPIs That Matter", size: "890 KB" },
    ],
  },
];

export default function TrainingMaterials() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support/training" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Training Materials</h1>
          <p className="text-gray-500">Guides, videos, and resources</p>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-6">
        {categories.map((category) => (
          <div key={category.name} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
              <Folder className="w-5 h-5 text-gray-400" />
              <h2 className="font-semibold text-gray-900">{category.name}</h2>
              <span className="text-sm text-gray-500 ml-2">({category.items.length} items)</span>
            </div>
            <div className="divide-y divide-gray-200">
              {category.items.map((item, index) => (
                <div key={index} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      item.type === "pdf" ? "bg-red-100" : "bg-purple-100"
                    }`}>
                      {item.type === "pdf" ? (
                        <FileText className="w-5 h-5 text-red-600" />
                      ) : (
                        <Video className="w-5 h-5 text-purple-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{item.title}</p>
                      <p className="text-sm text-gray-500">
                        {item.type === "pdf" ? item.size : item.duration}
                      </p>
                    </div>
                  </div>
                  <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
