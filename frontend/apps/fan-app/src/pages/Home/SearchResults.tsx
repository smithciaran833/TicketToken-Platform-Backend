import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, SlidersHorizontal, ChevronDown, Calendar, MapPin } from "lucide-react";
import FilterModal from "./FilterModal";

type ResultType = "all" | "events" | "artists" | "venues";

interface Event {
  id: string;
  title: string;
  date: string;
  venue: string;
  city: string;
  price: number;
  image: string;
}

interface Artist {
  id: string;
  name: string;
  genres: string[];
  image: string;
  upcomingEvents: number;
}

interface Venue {
  id: string;
  name: string;
  city: string;
  type: string;
  image: string;
  upcomingEvents: number;
}

const mockEvents: Event[] = [
  { id: "1", title: "Japanese Breakfast", date: "Sat, Jul 15", venue: "The Fillmore", city: "San Francisco", price: 45, image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80" },
  { id: "2", title: "Khruangbin", date: "Thu, Aug 3", venue: "The Greek Theatre", city: "Berkeley", price: 65, image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&q=80" },
  { id: "3", title: "Turnstile", date: "Fri, Aug 18", venue: "The Warfield", city: "San Francisco", price: 40, image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&q=80" },
];

const mockArtists: Artist[] = [
  { id: "a1", name: "Japanese Breakfast", genres: ["Indie Pop", "Rock"], image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80", upcomingEvents: 3 },
  { id: "a2", name: "Khruangbin", genres: ["Funk", "Psychedelic"], image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&q=80", upcomingEvents: 5 },
];

const mockVenues: Venue[] = [
  { id: "v1", name: "The Fillmore", city: "San Francisco", type: "Concert Hall", image: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=300&q=80", upcomingEvents: 24 },
  { id: "v2", name: "The Greek Theatre", city: "Berkeley", type: "Amphitheater", image: "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=300&q=80", upcomingEvents: 18 },
];

const sortOptions = [
  { value: "relevance", label: "Relevance" },
  { value: "date", label: "Date" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
];

export default function SearchResults() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";

  const [activeTab, setActiveTab] = useState<ResultType>("all");
  const [sortBy, setSortBy] = useState("relevance");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeFilters, setActiveFilters] = useState(0);

  const tabs: { value: ResultType; label: string; count: number }[] = [
    { value: "all", label: "All", count: mockEvents.length + mockArtists.length + mockVenues.length },
    { value: "events", label: "Events", count: mockEvents.length },
    { value: "artists", label: "Artists", count: mockArtists.length },
    { value: "venues", label: "Venues", count: mockVenues.length },
  ];

  const handleApplyFilters = (filters: any) => {
    // Count active filters
    let count = 0;
    if (filters.dateRange) count++;
    if (filters.priceRange[0] > 0 || filters.priceRange[1] < 500) count++;
    if (filters.categories.length > 0) count++;
    setActiveFilters(count);
    setShowFilterModal(false);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <Link
              to="/search"
              className="flex-1 flex items-center gap-3 bg-gray-100 rounded-xl px-4 py-2.5"
            >
              <Search className="w-5 h-5 text-gray-400" />
              <span className="text-gray-900">{query}</span>
            </Link>
            <button
              onClick={() => setShowFilterModal(true)}
              className="relative p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <SlidersHorizontal className="w-5 h-5 text-gray-600" />
              {activeFilters > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {activeFilters}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-5 gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.value
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </header>

      {/* Sort Bar */}
      <div className="px-5 py-3 flex items-center justify-between bg-gray-50 border-b border-gray-200">
        <span className="text-sm text-gray-500">
          {tabs.find((t) => t.value === activeTab)?.count} results
        </span>
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1 text-sm font-medium text-gray-700"
          >
            {sortOptions.find((o) => o.value === sortBy)?.label}
            <ChevronDown className="w-4 h-4" />
          </button>
          {showSortMenu && (
            <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 py-2 min-w-[160px] z-20">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSortBy(option.value);
                    setShowSortMenu(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                    sortBy === option.value ? "text-purple-600 font-medium" : "text-gray-700"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="px-5 py-6 space-y-8">
        {/* Events */}
        {(activeTab === "all" || activeTab === "events") && mockEvents.length > 0 && (
          <div>
            {activeTab === "all" && (
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
                Events
              </h2>
            )}
            <div className="space-y-3">
              {mockEvents.map((event) => (
                <Link
                  key={event.id}
                  to={`/event/${event.id}`}
                  className="flex gap-4 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <img
                    src={event.image}
                    alt={event.title}
                    className="w-20 h-20 object-cover rounded-lg"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900">{event.title}</h3>
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{event.date}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{event.venue}, {event.city}</span>
                    </div>
                    <p className="text-purple-600 font-semibold mt-1">From ${event.price}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Artists */}
        {(activeTab === "all" || activeTab === "artists") && mockArtists.length > 0 && (
          <div>
            {activeTab === "all" && (
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
                Artists
              </h2>
            )}
            <div className="space-y-3">
              {mockArtists.map((artist) => (
                <Link
                  key={artist.id}
                  to={`/artist/${artist.id}`}
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <img
                    src={artist.image}
                    alt={artist.name}
                    className="w-16 h-16 object-cover rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900">{artist.name}</h3>
                    <p className="text-sm text-gray-500">{artist.genres.join(", ")}</p>
                    <p className="text-sm text-purple-600 mt-1">
                      {artist.upcomingEvents} upcoming events
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Venues */}
        {(activeTab === "all" || activeTab === "venues") && mockVenues.length > 0 && (
          <div>
            {activeTab === "all" && (
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
                Venues
              </h2>
            )}
            <div className="space-y-3">
              {mockVenues.map((venue) => (
                <Link
                  key={venue.id}
                  to={`/venue/${venue.id}`}
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <img
                    src={venue.image}
                    alt={venue.name}
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900">{venue.name}</h3>
                    <p className="text-sm text-gray-500">{venue.type} · {venue.city}</p>
                    <p className="text-sm text-purple-600 mt-1">
                      {venue.upcomingEvents} upcoming events
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter Modal */}
      <FilterModal
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onApply={handleApplyFilters}
      />
    </div>
  );
}
