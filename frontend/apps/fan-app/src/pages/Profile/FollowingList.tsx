import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft,  Music, MapPin } from "lucide-react";

type Tab = "artists" | "venues";

interface Artist {
  id: string;
  name: string;
  image: string;
  genre: string;
  upcomingEvents: number;
}

interface Venue {
  id: string;
  name: string;
  image: string;
  city: string;
  upcomingEvents: number;
}

const mockArtists: Artist[] = [
  { id: "a1", name: "Japanese Breakfast", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&q=80", genre: "Indie Pop", upcomingEvents: 3 },
  { id: "a2", name: "Khruangbin", image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=200&q=80", genre: "Funk", upcomingEvents: 5 },
  { id: "a3", name: "Tyler, The Creator", image: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=200&q=80", genre: "Hip Hop", upcomingEvents: 2 },
];

const mockVenues: Venue[] = [
  { id: "v1", name: "The Fillmore", image: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=200&q=80", city: "San Francisco", upcomingEvents: 24 },
  { id: "v2", name: "The Greek Theatre", image: "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=200&q=80", city: "Berkeley", upcomingEvents: 18 },
];

export default function FollowingList() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("artists");
  const [artists, setArtists] = useState(mockArtists);
  const [venues, setVenues] = useState(mockVenues);

  const unfollowArtist = (id: string) => {
    setArtists((prev) => prev.filter((a) => a.id !== id));
  };

  const unfollowVenue = (id: string) => {
    setVenues((prev) => prev.filter((v) => v.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="px-5 py-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Following</h1>
        </div>

        {/* Tabs */}
        <div className="flex px-5">
          <button
            onClick={() => setActiveTab("artists")}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "artists"
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-gray-500"
            }`}
          >
            Artists ({artists.length})
          </button>
          <button
            onClick={() => setActiveTab("venues")}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "venues"
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-gray-500"
            }`}
          >
            Venues ({venues.length})
          </button>
        </div>
      </header>

      <div className="px-5 py-6">
        {activeTab === "artists" ? (
          artists.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Music className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">No artists followed</h2>
              <p className="text-gray-500">Follow artists to get updates on new events</p>
            </div>
          ) : (
            <div className="space-y-3">
              {artists.map((artist) => (
                <div key={artist.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <img
                      src={artist.image}
                      alt={artist.name}
                      className="w-14 h-14 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900">{artist.name}</h3>
                      <p className="text-sm text-gray-500">{artist.genre}</p>
                      <p className="text-sm text-purple-600">{artist.upcomingEvents} upcoming events</p>
                    </div>
                    <button
                      onClick={() => unfollowArtist(artist.id)}
                      className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                    >
                      Following
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : venues.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">No venues followed</h2>
            <p className="text-gray-500">Follow venues to get updates on new events</p>
          </div>
        ) : (
          <div className="space-y-3">
            {venues.map((venue) => (
              <div key={venue.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <img
                    src={venue.image}
                    alt={venue.name}
                    className="w-14 h-14 rounded-xl object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900">{venue.name}</h3>
                    <p className="text-sm text-gray-500">{venue.city}</p>
                    <p className="text-sm text-purple-600">{venue.upcomingEvents} upcoming events</p>
                  </div>
                  <button
                    onClick={() => unfollowVenue(venue.id)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    Following
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
