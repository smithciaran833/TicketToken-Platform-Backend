import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ZoomIn, ZoomOut, Grid, MousePointer, Square, Circle, Trash2, Eye, Save, Undo, Redo } from "lucide-react";
import { Button, Select, useToast, ToastContainer } from "../../components/ui";

const configurations = [
  { value: "1", label: "Theater Style" },
  { value: "2", label: "Standing Room" },
  { value: "3", label: "Banquet" },
];

const pricingTiers = [
  { value: "vip", label: "VIP - $150", color: "bg-purple-500" },
  { value: "premium", label: "Premium - $100", color: "bg-blue-500" },
  { value: "standard", label: "Standard - $75", color: "bg-green-500" },
  { value: "economy", label: "Economy - $50", color: "bg-gray-500" },
];

const tools = [
  { id: "select", icon: MousePointer, label: "Select" },
  { id: "section", icon: Square, label: "Add Section" },
  { id: "row", icon: Grid, label: "Add Row" },
  { id: "seat", icon: Circle, label: "Add Seat" },
  { id: "delete", icon: Trash2, label: "Delete" },
];

export default function SeatingMapBuilder() {
  const toast = useToast();
  const [selectedConfig, setSelectedConfig] = useState("1");
  const [selectedTool, setSelectedTool] = useState("select");
  const [selectedTier, setSelectedTier] = useState("standard");
  const [zoom, setZoom] = useState(100);
  const [showGrid, setShowGrid] = useState(true);

  const handleSave = () => {
    toast.success("Seating map saved!");
  };

  return (
    <div className="h-[calc(100vh-8rem)]">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings/seating/configs" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Seating Map Builder</h1>
            <p className="text-sm text-gray-500">Design your venue layout</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select
            label=""
            options={configurations}
            value={selectedConfig}
            onChange={(e) => setSelectedConfig(e.target.value)}
          />
          <Link to={`/venue/settings/seating/preview?config=${selectedConfig}`}>
            <Button variant="secondary">
              <Eye className="w-4 h-4" />
              Preview
            </Button>
          </Link>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4" />
            Save
          </Button>
        </div>
      </div>

      <div className="flex gap-4 h-full">
        {/* Tools Panel */}
        <div className="w-64 bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
          {/* Tools */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Tools</h3>
            <div className="grid grid-cols-3 gap-2">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => setSelectedTool(tool.id)}
                    className={`p-3 rounded-lg flex flex-col items-center gap-1 transition-colors ${
                      selectedTool === tool.id
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs">{tool.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pricing Tier */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Pricing Tier</h3>
            <div className="space-y-2">
              {pricingTiers.map((tier) => (
                <label
                  key={tier.value}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${
                    selectedTier === tier.value ? "bg-gray-100" : "hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="tier"
                    value={tier.value}
                    checked={selectedTier === tier.value}
                    onChange={(e) => setSelectedTier(e.target.value)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded ${tier.color}`} />
                  <span className="text-sm">{tier.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Zoom Controls */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">View</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(Math.max(50, zoom - 10))}
                className="p-2 bg-gray-100 rounded hover:bg-gray-200"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 w-12 text-center">{zoom}%</span>
              <button
                onClick={() => setZoom(Math.min(200, zoom + 10))}
                className="p-2 bg-gray-100 rounded hover:bg-gray-200"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
            <label className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded"
              />
              <span className="text-sm text-gray-600">Show Grid</span>
            </label>
          </div>

          {/* Undo/Redo */}
          <div className="mt-auto">
            <div className="flex gap-2">
              <button className="flex-1 p-2 bg-gray-100 rounded hover:bg-gray-200 flex items-center justify-center gap-1 text-sm">
                <Undo className="w-4 h-4" />
                Undo
              </button>
              <button className="flex-1 p-2 bg-gray-100 rounded hover:bg-gray-200 flex items-center justify-center gap-1 text-sm">
                <Redo className="w-4 h-4" />
                Redo
              </button>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden relative">
          <div 
            className={`w-full h-full ${showGrid ? "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAyMCAwIEwgMCAwIDAgMjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2UwZTBlMCIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')]" : "bg-gray-50"}`}
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}
          >
            {/* Stage */}
            <div className="absolute top-8 left-1/2 transform -translate-x-1/2 w-96 h-16 bg-gray-800 rounded-lg flex items-center justify-center text-white text-sm">
              STAGE
            </div>

            {/* Sample Sections */}
            <div className="absolute top-32 left-1/2 transform -translate-x-1/2">
              {/* Orchestra */}
              <div className="mb-4">
                <div className="text-xs text-gray-500 text-center mb-2">ORCHESTRA</div>
                <div className="flex flex-wrap justify-center gap-1">
                  {Array.from({ length: 80 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-sm cursor-pointer hover:opacity-80 ${
                        i < 20 ? "bg-purple-500" : i < 50 ? "bg-blue-500" : "bg-green-500"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Mezzanine */}
              <div className="mt-8">
                <div className="text-xs text-gray-500 text-center mb-2">MEZZANINE</div>
                <div className="flex flex-wrap justify-center gap-1">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-sm bg-gray-500 cursor-pointer hover:opacity-80"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Help Text */}
          <div className="absolute bottom-4 left-4 bg-black/70 text-white text-xs px-3 py-2 rounded">
            Select a tool and click on the canvas to add elements
          </div>
        </div>

        {/* Properties Panel */}
        <div className="w-64 bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Properties</h3>
          <div className="text-sm text-gray-500 text-center py-8">
            Select an element to view its properties
          </div>
        </div>
      </div>
    </div>
  );
}
