import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Plus, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "../../components/ui";

const allVenues = [
  { 
    id: 1, 
    name: "The Grand Theater",
    revenue: 485000,
    tickets: 12500,
    events: 24,
    avgAttendance: 520,
    sellThrough: 92,
    satisfaction: 4.7,
  },
  { 
    id: 2, 
    name: "Riverside Amphitheater",
    revenue: 320000,
    tickets: 8900,
    events: 18,
    avgAttendance: 495,
    sellThrough: 87,
    satisfaction: 4.5,
  },
  { 
    id: 3, 
    name: "The Jazz Lounge",
    revenue: 95000,
    tickets: 3200,
    events: 42,
    avgAttendance: 76,
    sellThrough: 94,
    satisfaction: 4.8,
  },
];

export default function CompareVenues() {
  const [selectedVenues, setSelectedVenues] = useState<number[]>([1, 2]);

  const addVenue = (id: number) => {
    if (!selectedVenues.includes(id) && selectedVenues.length < 4) {
      setSelectedVenues([...selectedVenues, id]);
    }
  };

  const removeVenue = (id: number) => {
    if (selectedVenues.length > 2) {
      setSelectedVenues(selectedVenues.filter(v => v !== id));
    }
  };

  const selectedData = allVenues.filter(v => selectedVenues.includes(v.id));
  const availableVenues = allVenues.filter(v => !selectedVenues.includes(v.id));

  const getComparisonIndicator = (values: number[], index: number) => {
    const max = Math.max(...values);
    const min = Math.min(...values);
    const value = values[index];
    
    if (value === max && max !== min) {
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    } else if (value === min && max !== min) {
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    }
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const metrics = [
    { key: "revenue", label: "Total Revenue", format: (v: number) => `$${(v / 1000).toFixed(0)}k` },
    { key: "tickets", label: "Tickets Sold", format: (v: number) => v.toLocaleString() },
    { key: "events", label: "Events Held", format: (v: number) => v.toString() },
    { key: "avgAttendance", label: "Avg Attendance", format: (v: number) => v.toString() },
    { key: "sellThrough", label: "Sell-Through Rate", format: (v: number) => `${v}%` },
    { key: "satisfaction", label: "Satisfaction Score", format: (v: number) => `${v}/5` },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venues" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Compare Venues</h1>
            <p className="text-gray-500">Side-by-side venue performance comparison</p>
          </div>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Venue Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Comparing:</span>
          <div className="flex items-center gap-2 flex-1">
            {selectedData.map((venue) => (
              <div 
                key={venue.id} 
                className="flex items-center gap-2 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg"
              >
                <span className="text-sm font-medium">{venue.name}</span>
                {selectedVenues.length > 2 && (
                  <button onClick={() => removeVenue(venue.id)} className="hover:text-purple-900">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {availableVenues.length > 0 && selectedVenues.length < 4 && (
              <div className="relative group">
                <button className="flex items-center gap-1 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-purple-500 hover:text-purple-600">
                  <Plus className="w-4 h-4" />
                  <span className="text-sm">Add Venue</span>
                </button>
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                  {availableVenues.map((venue) => (
                    <button
                      key={venue.id}
                      onClick={() => addVenue(venue.id)}
                      className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                    >
                      {venue.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <span className="text-xs text-gray-500">2-4 venues</span>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-500">Metric</th>
              {selectedData.map((venue) => (
                <th key={venue.id} className="px-6 py-4 text-center text-sm font-medium text-gray-900">
                  {venue.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {metrics.map((metric) => {
              const values = selectedData.map(v => v[metric.key as keyof typeof v] as number);
              return (
                <tr key={metric.key}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-700">{metric.label}</td>
                  {selectedData.map((venue, index) => (
                    <td key={venue.id} className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-lg font-semibold text-gray-900">
                          {metric.format(venue[metric.key as keyof typeof venue] as number)}
                        </span>
                        {getComparisonIndicator(values, index)}
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Visual Comparison */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Comparison</h3>
          <div className="space-y-4">
            {selectedData.map((venue, idx) => {
              const maxRevenue = Math.max(...selectedData.map(v => v.revenue));
              const width = (venue.revenue / maxRevenue) * 100;
              const colors = ["bg-purple-500", "bg-blue-500", "bg-green-500", "bg-yellow-500"];
              return (
                <div key={venue.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700">{venue.name}</span>
                    <span className="font-medium text-gray-900">${(venue.revenue / 1000).toFixed(0)}k</span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${colors[idx]} rounded-full transition-all`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Ranking</h3>
          <div className="space-y-3">
            {[...selectedData]
              .sort((a, b) => b.revenue - a.revenue)
              .map((venue, idx) => (
                <div key={venue.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                    idx === 0 ? "bg-yellow-500" :
                    idx === 1 ? "bg-gray-400" :
                    idx === 2 ? "bg-amber-600" :
                    "bg-gray-300"
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{venue.name}</p>
                    <p className="text-sm text-gray-500">${venue.revenue.toLocaleString()} revenue</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
