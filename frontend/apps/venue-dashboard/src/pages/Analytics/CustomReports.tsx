import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Play, Save, BarChart3, PieChart, TrendingUp, Table } from "lucide-react";
import { Button, Input, Select, useToast, ToastContainer } from "../../components/ui";

const dataSources = [
  { value: "sales", label: "Sales Data" },
  { value: "attendance", label: "Attendance Data" },
  { value: "revenue", label: "Revenue Data" },
  { value: "customers", label: "Customer Data" },
];

const availableMetrics: Record<string, string[]> = {
  sales: ["Tickets Sold", "Orders", "Average Order Value", "Conversion Rate", "Refunds"],
  attendance: ["Check-ins", "No-shows", "Attendance Rate", "Peak Times"],
  revenue: ["Gross Revenue", "Net Revenue", "Fees Collected", "Refunds Given"],
  customers: ["New Customers", "Repeat Customers", "Customer Lifetime Value"],
};

const dimensions = [
  { value: "event", label: "By Event" },
  { value: "ticketType", label: "By Ticket Type" },
  { value: "date", label: "By Date" },
  { value: "week", label: "By Week" },
  { value: "month", label: "By Month" },
];

const visualizations = [
  { value: "table", label: "Table", icon: Table },
  { value: "bar", label: "Bar Chart", icon: BarChart3 },
  { value: "line", label: "Line Chart", icon: TrendingUp },
  { value: "pie", label: "Pie Chart", icon: PieChart },
];

const dateRanges = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];

const mockPreviewData = [
  { dimension: "Summer Music Festival", metric1: 1432, metric2: 523 },
  { dimension: "Tech Conference", metric1: 856, metric2: 312 },
  { dimension: "Jazz Night", metric1: 245, metric2: 98 },
  { dimension: "Comedy Night", metric1: 312, metric2: 156 },
];

export default function CustomReports() {
  const navigate = useNavigate();
  const toast = useToast();

  const [reportName, setReportName] = useState("");
  const [dataSource, setDataSource] = useState("sales");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["Tickets Sold", "Orders"]);
  const [dimension, setDimension] = useState("event");
  const [dateRange, setDateRange] = useState("30d");
  const [visualization, setVisualization] = useState("table");
  const [showPreview, setShowPreview] = useState(false);

  const toggleMetric = (metric: string) => {
    if (selectedMetrics.includes(metric)) {
      setSelectedMetrics(selectedMetrics.filter(m => m !== metric));
    } else {
      setSelectedMetrics([...selectedMetrics, metric]);
    }
  };

  const handleRun = () => {
    if (selectedMetrics.length === 0) {
      toast.error("Please select at least one metric");
      return;
    }
    setShowPreview(true);
    toast.success("Report generated!");
  };

  const handleSave = () => {
    if (!reportName.trim()) {
      toast.error("Please enter a report name");
      return;
    }
    toast.success("Report saved!");
    navigate("/venue/analytics/reports/saved");
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/analytics" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Custom Reports</h1>
            <p className="text-gray-500">Build your own analytics reports</p>
          </div>
        </div>
        <Link to="/venue/analytics/reports/saved">
          <Button variant="secondary">View Saved Reports</Button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Report Builder */}
        <div className="col-span-2 space-y-6">
          {/* Report Name */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Report Details</h2>
            <Input
              label="Report Name"
              placeholder="e.g. Monthly Sales Summary"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
            />
          </div>

          {/* Data Source & Metrics */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Source</h2>
            <Select
              label="Select Data Source"
              options={dataSources}
              value={dataSource}
              onChange={(e) => { setDataSource(e.target.value); setSelectedMetrics([]); }}
            />

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Metrics to Include</label>
              <div className="flex flex-wrap gap-2">
                {availableMetrics[dataSource]?.map((metric) => (
                  <button
                    key={metric}
                    onClick={() => toggleMetric(metric)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      selectedMetrics.includes(metric)
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {metric}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dimensions & Filters */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Dimensions & Filters</h2>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Group By"
                options={dimensions}
                value={dimension}
                onChange={(e) => setDimension(e.target.value)}
              />
              <Select
                label="Date Range"
                options={dateRanges}
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
              />
            </div>
          </div>

          {/* Visualization */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Visualization</h2>
            <div className="grid grid-cols-4 gap-3">
              {visualizations.map((viz) => {
                const Icon = viz.icon;
                return (
                  <button
                    key={viz.value}
                    onClick={() => setVisualization(viz.value)}
                    className={`p-4 rounded-lg border-2 transition-colors flex flex-col items-center gap-2 ${
                      visualization === viz.value
                        ? "border-purple-500 bg-purple-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${visualization === viz.value ? "text-purple-600" : "text-gray-400"}`} />
                    <span className={`text-sm font-medium ${visualization === viz.value ? "text-purple-700" : "text-gray-600"}`}>
                      {viz.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button onClick={handleRun}>
              <Play className="w-4 h-4" />
              Run Report
            </Button>
            <Button variant="secondary" onClick={handleSave}>
              <Save className="w-4 h-4" />
              Save Report
            </Button>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
            
            {!showPreview ? (
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-center">
                  Configure your report and click<br />"Run Report" to see preview
                </p>
              </div>
            ) : (
              <div>
                {visualization === "table" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                            {dimensions.find(d => d.value === dimension)?.label}
                          </th>
                          {selectedMetrics.slice(0, 2).map((m, i) => (
                            <th key={i} className="px-3 py-2 text-right text-xs font-medium text-gray-500">{m}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {mockPreviewData.map((row, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-gray-900">{row.dimension}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{row.metric1}</td>
                            {selectedMetrics.length > 1 && (
                              <td className="px-3 py-2 text-right text-gray-600">{row.metric2}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {visualization === "bar" && (
                  <div className="space-y-3">
                    {mockPreviewData.map((row, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-700 truncate max-w-[120px]">{row.dimension}</span>
                          <span className="text-gray-500">{row.metric1}</span>
                        </div>
                        <div className="h-4 bg-gray-200 rounded">
                          <div 
                            className="h-4 bg-purple-500 rounded"
                            style={{ width: `${(row.metric1 / 1500) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {visualization === "line" && (
                  <div className="h-48 flex items-end justify-between gap-2 border-b border-l border-gray-300 p-4">
                    {mockPreviewData.map((row, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        <div 
                          className="w-3 h-3 bg-purple-500 rounded-full"
                          style={{ marginBottom: `${(row.metric1 / 1500) * 120}px` }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {visualization === "pie" && (
                  <div className="flex items-center justify-center">
                    <div className="w-32 h-32 rounded-full bg-gradient-conic from-purple-500 via-blue-500 via-green-500 to-yellow-500" 
                         style={{ background: "conic-gradient(#8b5cf6 0% 40%, #3b82f6 40% 65%, #10b981 65% 85%, #f59e0b 85% 100%)" }} 
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Report Summary */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-2">Report Configuration</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Source: {dataSources.find(d => d.value === dataSource)?.label}</li>
              <li>• Metrics: {selectedMetrics.length > 0 ? selectedMetrics.join(", ") : "None selected"}</li>
              <li>• Group by: {dimensions.find(d => d.value === dimension)?.label}</li>
              <li>• Date range: {dateRanges.find(d => d.value === dateRange)?.label}</li>
              <li>• Visualization: {visualizations.find(v => v.value === visualization)?.label}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
