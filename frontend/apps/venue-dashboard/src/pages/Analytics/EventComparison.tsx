import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, X } from "lucide-react";
import { Button } from "../../components/ui";

const availableEvents = [
  { id: 1, name: "Summer Music Festival", date: "Jul 15, 2025" },
  { id: 2, name: "Tech Conference", date: "Sep 15, 2025" },
  { id: 5, name: "Jazz Night", date: "Jul 20, 2025" },
  { id: 6, name: "Comedy Night", date: "Dec 20, 2024" },
  { id: 4, name: "Art Gallery Opening", date: "Sep 5, 2025" },
];

const mockData: Record<number, { ticketsSold: number; revenue: number; attendance: number; sellThrough: number; avgPrice: number; promoUsage: number; resaleActivity: number }> = {
  1: { ticketsSold: 1432, revenue: 98500, attendance: 89, sellThrough: 95, avgPrice: 69, promoUsage: 23, resaleActivity: 12 },
  2: { ticketsSold: 856, revenue: 256800, attendance: 94, sellThrough: 100, avgPrice: 300, promoUsage: 15, resaleActivity: 8 },
  5: { ticketsSold: 245, revenue: 12250, attendance: 92, sellThrough: 82, avgPrice: 50, promoUsage: 31, resaleActivity: 2 },
  6: { ticketsSold: 312, revenue: 9360, attendance: 100, sellThrough: 100, avgPrice: 30, promoUsage: 45, resaleActivity: 0 },
  4: { ticketsSold: 175, revenue: 8750, attendance: 100, sellThrough: 70, avgPrice: 50, promoUsage: 18, resaleActivity: 5 },
};

const metrics = [
  { key: "ticketsSold", label: "Tickets Sold", format: "number" },
  { key: "revenue", label: "Revenue", format: "currency" },
  { key: "attendance", label: "Attendance Rate", format: "percent" },
  { key: "sellThrough", label: "Sell-Through Rate", format: "percent" },
  { key: "avgPrice", label: "Avg Ticket Price", format: "currency" },
  { key: "promoUsage", label: "Promo Code Usage", format: "percent" },
  { key: "resaleActivity", label: "Resale Activity", format: "percent" },
];

function formatValue(value: number, format: string) {
  if (format === "currency") return `$${value.toLocaleString()}`;
  if (format === "percent") return `${value}%`;
  return value.toLocaleString();
}

export default function EventComparison() {
  const [selectedEvents, setSelectedEvents] = useState<number[]>([1, 2]);

  const addEvent = (id: number) => {
    if (selectedEvents.length < 5 && !selectedEvents.includes(id)) {
      setSelectedEvents([...selectedEvents, id]);
    }
  };

  const removeEvent = (id: number) => {
    setSelectedEvents(selectedEvents.filter(e => e !== id));
  };

  const availableToAdd = availableEvents.filter(e => !selectedEvents.includes(e.id));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/analytics" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Compare Events</h1>
            <p className="text-gray-500">Side-by-side event performance comparison</p>
          </div>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Event Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          {selectedEvents.map(id => {
            const event = availableEvents.find(e => e.id === id);
            return (
              <div key={id} className="flex items-center gap-2 bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full">
                <span className="text-sm font-medium">{event?.name}</span>
                <button onClick={() => removeEvent(id)} className="hover:text-purple-900">
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          {selectedEvents.length < 5 && availableToAdd.length > 0 && (
            <div className="relative">
              <select
                onChange={(e) => { addEvent(parseInt(e.target.value)); e.target.value = ""; }}
                className="appearance-none bg-gray-100 text-gray-600 px-3 py-1.5 pr-8 rounded-full text-sm cursor-pointer hover:bg-gray-200"
                defaultValue=""
              >
                <option value="" disabled>+ Add Event</option>
                {availableToAdd.map(event => (
                  <option key={event.id} value={event.id}>{event.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-2">Select up to 5 events to compare</p>
      </div>

      {/* Comparison Table */}
      {selectedEvents.length >= 2 ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
                {selectedEvents.map(id => {
                  const event = availableEvents.find(e => e.id === id);
                  return (
                    <th key={id} className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">
                      <div>
                        <p className="text-gray-900 normal-case text-sm font-semibold">{event?.name}</p>
                        <p className="text-gray-500 font-normal">{event?.date}</p>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {metrics.map((metric) => {
                const values = selectedEvents.map(id => mockData[id]?.[metric.key as keyof typeof mockData[number]] || 0);
                const maxValue = Math.max(...values);

                return (
                  <tr key={metric.key} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{metric.label}</td>
                    {selectedEvents.map((id) => {
                      const value = mockData[id]?.[metric.key as keyof typeof mockData[number]] || 0;
                      const isMax = value === maxValue && values.filter(v => v === maxValue).length === 1;

                      return (
                        <td key={id} className="px-6 py-4 text-right">
                          <span className={`text-lg font-semibold ${isMax ? "text-green-600" : "text-gray-900"}`}>
                            {formatValue(value, metric.format)}
                          </span>
                          {isMax && <span className="ml-2 text-xs text-green-600">★ Best</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Select at least 2 events to compare</p>
        </div>
      )}

      {/* Visual Comparison Charts */}
      {selectedEvents.length >= 2 && (
        <div className="grid grid-cols-2 gap-6 mt-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Comparison</h3>
            <div className="space-y-3">
              {selectedEvents.map(id => {
                const event = availableEvents.find(e => e.id === id);
                const data = mockData[id];
                const maxRevenue = Math.max(...selectedEvents.map(i => mockData[i]?.revenue || 0));

                return (
                  <div key={id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700 truncate max-w-[200px]">{event?.name}</span>
                      <span className="text-sm font-medium text-gray-900">${data?.revenue.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-3 bg-gray-200 rounded-full">
                      <div
                        className="h-3 bg-green-500 rounded-full"
                        style={{ width: `${(data?.revenue / maxRevenue) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Attendance Comparison</h3>
            <div className="space-y-3">
              {selectedEvents.map(id => {
                const event = availableEvents.find(e => e.id === id);
                const data = mockData[id];

                return (
                  <div key={id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700 truncate max-w-[200px]">{event?.name}</span>
                      <span className="text-sm font-medium text-gray-900">{data?.attendance}%</span>
                    </div>
                    <div className="w-full h-3 bg-gray-200 rounded-full">
                      <div
                        className="h-3 bg-purple-500 rounded-full"
                        style={{ width: `${data?.attendance}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
