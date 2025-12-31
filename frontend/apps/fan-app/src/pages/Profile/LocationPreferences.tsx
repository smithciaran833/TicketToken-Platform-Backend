import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Navigation, Search, X } from "lucide-react";

const recentLocations = [
  "San Francisco, CA",
  "Oakland, CA",
  "Berkeley, CA",
];

export default function LocationPreferences() {
  const navigate = useNavigate();
  const [location, setLocation] = useState("San Francisco, CA");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleDetectLocation = async () => {
    setIsDetecting(true);
    // Simulate geolocation
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setLocation("San Francisco, CA");
    setIsDetecting(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    navigate("/profile/settings", { state: { locationUpdated: true } });
  };

  const selectLocation = (loc: string) => {
    setLocation(loc);
    setSearchQuery("");
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Location</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Current Location */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Current Location
          </label>
          <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl">
            <MapPin className="w-5 h-5 text-purple-600" />
            <span className="font-medium text-purple-900">{location}</span>
          </div>
        </div>

        {/* Use Current Location */}
        <button
          onClick={handleDetectLocation}
          disabled={isDetecting}
          className="flex items-center justify-center gap-2 w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <Navigation className={`w-5 h-5 ${isDetecting ? "animate-pulse" : ""}`} />
          {isDetecting ? "Detecting..." : "Use Current Location"}
        </button>

        {/* Search */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Search City or ZIP
          </label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter city or ZIP code"
              className="w-full pl-12 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Recent Locations */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Recent Locations
          </label>
          <div className="space-y-2">
            {recentLocations.map((loc) => (
              <button
                key={loc}
                onClick={() => selectLocation(loc)}
                className={`w-full flex items-center gap-3 p-4 rounded-xl transition-colors ${
                  location === loc
                    ? "bg-purple-50 border-2 border-purple-600"
                    : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <MapPin className={`w-5 h-5 ${location === loc ? "text-purple-600" : "text-gray-400"}`} />
                <span className={location === loc ? "text-purple-900 font-medium" : "text-gray-700"}>
                  {loc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-3.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
