import { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Bell, Search, ChevronRight, Heart, Calendar, Clock } from "lucide-react";

const featuredEvents = [
  { id: 1, name: "Summer Music Festival", image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800", date: "Jul 15", venue: "Central Park", price: 65 },
  { id: 2, name: "Taylor Swift | Eras Tour", image: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800", date: "Aug 20", venue: "MetLife Stadium", price: 250 },
  { id: 3, name: "NBA Finals Game 7", image: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800", date: "Jun 18", venue: "Madison Square Garden", price: 450 },
];

const nearbyEvents = [
  { id: 4, name: "Jazz Night", image: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=800", date: "Tomorrow", time: "8 PM", venue: "Blue Note", price: 45, distance: "0.8 mi" },
  { id: 5, name: "Comedy Show", image: "https://images.unsplash.com/photo-1585699324551-f6322a8a19f7?w=800", date: "Fri, Jun 14", time: "9 PM", venue: "Comedy Cellar", price: 25, distance: "1.2 mi" },
  { id: 6, name: "Tech Conference", image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800", date: "Mon, Jun 17", time: "9 AM", venue: "Javits Center", price: 199, distance: "2.5 mi" },
];

const categories = [
  { id: "music", name: "Music", emoji: "🎵" },
  { id: "sports", name: "Sports", emoji: "⚽" },
  { id: "comedy", name: "Comedy", emoji: "😂" },
  { id: "theater", name: "Theater", emoji: "🎭" },
  { id: "festivals", name: "Festivals", emoji: "🎪" },
  { id: "family", name: "Family", emoji: "👨‍👩‍👧" },
];

export default function HomeFeed() {
  const [location] = useState("New York, NY");
  const [savedEvents, setSavedEvents] = useState<number[]>([]);

  const toggleSave = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    setSavedEvents(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-4 py-3 sticky top-0 z-40 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <button className="flex items-center gap-1 text-gray-700">
            <MapPin className="w-4 h-4 text-purple-600" />
            <span className="font-medium">{location}</span>
            <ChevronRight className="w-4 h-4 rotate-90" />
          </button>
          <Link to="/notifications" className="relative p-2">
            <Bell className="w-6 h-6 text-gray-700" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </Link>
        </div>
        
        <Link to="/search" className="block">
          <div className="flex items-center gap-3 bg-gray-100 rounded-full px-4 py-2.5">
            <Search className="w-5 h-5 text-gray-400" />
            <span className="text-gray-500">Search events, artists, venues...</span>
          </div>
        </Link>
      </header>

      <div className="pb-4">
        {/* Categories */}
        <div className="px-4 py-4">
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                to={`/search?category=${cat.id}`}
                className="flex flex-col items-center gap-1 min-w-[70px]"
              >
                <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center text-2xl">
                  {cat.emoji}
                </div>
                <span className="text-xs text-gray-600">{cat.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Featured Events */}
        <section className="mb-6">
          <div className="flex items-center justify-between px-4 mb-3">
            <h2 className="text-lg font-bold text-gray-900">Featured</h2>
            <Link to="/featured" className="text-purple-600 text-sm font-medium">See All</Link>
          </div>
          <div className="flex gap-4 overflow-x-auto px-4 pb-2 scrollbar-hide">
            {featuredEvents.map((event) => (
              <Link
                key={event.id}
                to={`/event/${event.id}`}
                className="min-w-[280px] bg-white rounded-2xl overflow-hidden shadow-sm"
              >
                <div className="relative h-40">
                  <img src={event.image} alt={event.name} className="w-full h-full object-cover" />
                  <button
                    onClick={(e) => toggleSave(event.id, e)}
                    className="absolute top-3 right-3 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center"
                  >
                    <Heart className={`w-4 h-4 ${savedEvents.includes(event.id) ? "fill-red-500 text-red-500" : "text-gray-600"}`} />
                  </button>
                  <div className="absolute bottom-3 left-3 px-2 py-1 bg-white/90 rounded-full text-xs font-medium">
                    From ${event.price}
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="font-semibold text-gray-900 mb-1 truncate">{event.name}</h3>
                  <p className="text-sm text-gray-500">{event.date} • {event.venue}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Nearby Events */}
        <section className="mb-6">
          <div className="flex items-center justify-between px-4 mb-3">
            <h2 className="text-lg font-bold text-gray-900">Nearby</h2>
            <Link to="/nearby" className="text-purple-600 text-sm font-medium">See All</Link>
          </div>
          <div className="px-4 space-y-3">
            {nearbyEvents.map((event) => (
              <Link
                key={event.id}
                to={`/event/${event.id}`}
                className="flex gap-4 bg-white rounded-xl p-3 shadow-sm"
              >
                <img src={event.image} alt={event.name} className="w-20 h-20 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{event.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{event.date}</span>
                    <Clock className="w-3.5 h-3.5 ml-1" />
                    <span>{event.time}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">{event.venue} • {event.distance}</span>
                    <span className="text-sm font-semibold text-purple-600">${event.price}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Recommended Section */}
        <section className="px-4">
          <div className="bg-gradient-to-r from-purple-600 to-purple-800 rounded-2xl p-4 text-white">
            <h3 className="font-bold mb-1">Get Personalized Picks</h3>
            <p className="text-purple-200 text-sm mb-3">Tell us what you like and we'll find events for you</p>
            <Link 
              to="/profile/interests" 
              className="inline-block bg-white text-purple-600 px-4 py-2 rounded-full text-sm font-medium"
            >
              Set Preferences
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
