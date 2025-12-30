
import { ArrowLeft, Download, Users, DollarSign, Ticket, TrendingUp } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { Button, useToast, ToastContainer } from "../components/ui";

const eventName = "Summer Music Festival";

const summaryData = {
  attendance: {
    total: 1847,
    capacity: 2000,
    checkIns: 1756,
    noShows: 91,
  },
  revenue: {
    total: 127450,
    avgTicketPrice: 69,
    refunds: 2340,
    net: 125110,
  },
  salesByType: [
    { name: "General Admission", sold: 1234, revenue: 80210 },
    { name: "VIP Access", sold: 187, revenue: 28050 },
    { name: "Early Bird", sold: 300, revenue: 15000 },
    { name: "Student", sold: 126, revenue: 4190 },
  ],
  salesByPromo: [
    { code: "SUMMER20", uses: 145, discount: 1885 },
    { code: "VIPFRIEND", uses: 23, discount: 1150 },
    { code: "EARLYBIRD", uses: 87, discount: 870 },
  ],
  checkInsByHour: [
    { hour: "5:00 PM", count: 234 },
    { hour: "5:30 PM", count: 456 },
    { hour: "6:00 PM", count: 521 },
    { hour: "6:30 PM", count: 312 },
    { hour: "7:00 PM", count: 156 },
    { hour: "7:30 PM", count: 77 },
  ],
  demographics: {
    ageGroups: [
      { range: "18-24", percent: 28 },
      { range: "25-34", percent: 42 },
      { range: "35-44", percent: 18 },
      { range: "45+", percent: 12 },
    ],
  },
  reviews: {
    average: 4.6,
    total: 234,
  },
};

const tabs = [
  { name: "Overview", path: "" },
  { name: "Summary", path: "/summary" },
  { name: "Reviews", path: "/reviews" },
];

export default function EventSummary() {
  const { id } = useParams();
  const basePath = "/venue/events/" + id;
  const toast = useToast();

  const handleDownload = (format: string) => {
    toast.info(`Downloading ${format} report...`);
  };

  const maxCheckIns = Math.max(...summaryData.checkInsByHour.map(h => h.count));

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to={`/venue/events/${id}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{eventName}</h1>
            <p className="text-gray-500 mt-1">Post-event summary</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => handleDownload("PDF")}>
            <Download className="w-4 h-4" />
            <span>PDF</span>
          </Button>
          <Button variant="secondary" onClick={() => handleDownload("CSV")}>
            <Download className="w-4 h-4" />
            <span>CSV</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "Summary"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Attendance</p>
              <p className="text-2xl font-bold text-gray-900">{summaryData.attendance.checkIns.toLocaleString()}</p>
              <p className="text-xs text-gray-500">{summaryData.attendance.noShows} no-shows</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Net Revenue</p>
              <p className="text-2xl font-bold text-gray-900">${summaryData.revenue.net.toLocaleString()}</p>
              <p className="text-xs text-gray-500">${summaryData.revenue.refunds} refunded</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Ticket className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg Ticket Price</p>
              <p className="text-2xl font-bold text-gray-900">${summaryData.revenue.avgTicketPrice}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Average Rating</p>
              <p className="text-2xl font-bold text-gray-900">{summaryData.reviews.average}</p>
              <p className="text-xs text-gray-500">{summaryData.reviews.total} reviews</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Check-ins Over Time */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Check-ins Over Time</h2>
          <div className="space-y-3">
            {summaryData.checkInsByHour.map((hour) => (
              <div key={hour.hour} className="flex items-center gap-3">
                <span className="text-sm text-gray-500 w-16">{hour.hour}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-600 rounded-full"
                    style={{ width: `${(hour.count / maxCheckIns) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-900 w-12 text-right">{hour.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Demographics */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Age Demographics</h2>
          <div className="space-y-3">
            {summaryData.demographics.ageGroups.map((group) => (
              <div key={group.range} className="flex items-center gap-3">
                <span className="text-sm text-gray-500 w-16">{group.range}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 rounded-full"
                    style={{ width: `${group.percent}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-900 w-12 text-right">{group.percent}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sales by Ticket Type */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sales by Ticket Type</h2>
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                <th className="pb-3">Type</th>
                <th className="pb-3">Sold</th>
                <th className="pb-3 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {summaryData.salesByType.map((type) => (
                <tr key={type.name}>
                  <td className="py-3 text-sm font-medium text-gray-900">{type.name}</td>
                  <td className="py-3 text-sm text-gray-500">{type.sold}</td>
                  <td className="py-3 text-sm font-medium text-gray-900 text-right">${type.revenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sales by Promo Code */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Promo Code Usage</h2>
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                <th className="pb-3">Code</th>
                <th className="pb-3">Uses</th>
                <th className="pb-3 text-right">Discount Given</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {summaryData.salesByPromo.map((promo) => (
                <tr key={promo.code}>
                  <td className="py-3">
                    <span className="font-mono text-sm text-purple-600 bg-purple-50 px-2 py-1 rounded">
                      {promo.code}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-gray-500">{promo.uses}</td>
                  <td className="py-3 text-sm font-medium text-red-600 text-right">-${promo.discount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
