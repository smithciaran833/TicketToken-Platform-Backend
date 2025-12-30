import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, X, TrendingUp, Clock, MapPin, SlidersHorizontal } from "lucide-react";

const recentSearches = ["Taylor Swift", "NBA Finals", "Comedy shows"];
const trendingSearches = ["Beyoncé", "US Open", "Broadway", "EDC Las Vegas"];

const searchResults = [
  { id: 1, type: "event", name: "Summer Music Festival", date: "Jul 15", venue: "Central Park", image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400" },
  { id: 2, type: "event", name: "Jazz Night Live", date: "Jun 20", venue: "Blue Note", image: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=400" },
  { id: 3, type: "artist", name: "The Lumineers", genre: "Folk Rock", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400" },
  { id: 4, type: "venue", name: "Madison Square Garden", location: "New York, NY", image: "https://images.unsplash.com/photo-1563693623436-f90e8ad6d489?w=400" },
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  const handleSearch = (value: string) => {
    setQuery(value);
    setShowResults(value.length > 0);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Search Header */}
      <div className="bg-white px-4 py-3 sticky top-0 z-40 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-3 bg-gray-100 rounded-full px-4 py-2.5">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search events, artists, venues..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-500"
              autoFocus
            />
            {query && (
              <button onClick={() => handleSearch("")}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            )}
          </div>
          <button className="p-2">
            <SlidersHorizontal className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {!showResults ? (
        <div className="px-4 py-4">
          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Recent</h2>
              <div className="space-y-2">
                {recentSearches.map((search, i) => (
                  <button
                    key={i}
                    onClick={() => handleSearch(search)}
                    className="flex items-center gap-3 w-full p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{search}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Trending */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Trending</h2>
            <div className="space-y-2">
              {trendingSearches.map((search, i) => (
                <button
                  key={i}
                  onClick={() => handleSearch(search)}
                  className="flex items-center gap-3 w-full p-2 hover:bg-gray-100 rounded-lg"
                >
                  <TrendingUp className="w-4 h-4 text-purple-500" />
                  <span className="text-gray-700">{search}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Browse by Location */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Near You</h2>
            <Link 
              to="/search/map"
              className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm"
            >
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Browse Map</p>
                <p className="text-sm text-gray-500">Find events near you</p>
              </div>
            </Link>
          </section>
        </div>
      ) : (
        <div className="px-4 py-4">
          {/* Search Results */}
          <p className="text-sm text-gray-500 mb-3">{searchResults.length} results for "{query}"</p>
          <div className="space-y-3">
            {searchResults.map((result) => (
              <Link
                key={result.id}
                to={result.type === "event" ? `/event/${result.id}` : `/${result.type}/${result.id}`}
                className="flex gap-3 bg-white rounded-xl p-3 shadow-sm"
              >
                <img 
                  src={result.image} 
                  alt={result.name} 
                  className="w-16 h-16 rounded-lg object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-purple-600 font-medium uppercase">{result.type}</p>
                  <h3 className="font-semibold text-gray-900 truncate">{result.name}</h3>
                  <p className="text-sm text-gray-500">
                    {result.type === "event" && `${result.date} • ${result.venue}`}
                    {result.type === "artist" && result.genre}
                    {result.type === "venue" && result.location}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
