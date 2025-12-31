import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Share2, Calendar, MapPin } from "lucide-react";

const mockEvent = {
  id: "1",
  title: "Japanese Breakfast",
  subtitle: "Jubilee Tour 2025",
  presenter: "The Fillmore",
  image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80",
  date: "Saturday, July 15, 2025",
  doorsTime: "7:00 PM",
  showTime: "8:00 PM",
  venue: {
    name: "The Fillmore",
    address: "1805 Geary Blvd, San Francisco, CA",
  },
  description: "Japanese Breakfast is the solo musical project of Korean-American musician Michelle Zauner. Following the release of her critically acclaimed album Jubilee, she embarks on a nationwide tour bringing her ethereal sound to intimate venues.",
  ageRestriction: "All Ages",
  genre: "Indie Pop",
  priceRange: { min: 45, max: 85 },
};

export default function EventPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);

  const event = mockEvent;

  return (
    <div className="min-h-screen bg-white">
      <div className="relative">
        <div className="aspect-[4/3] w-full">
          <img src={event.image} alt={event.title} className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
        
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg active:scale-95"
          >
            <ArrowLeft className="w-5 h-5 text-gray-900" />
          </button>
          <div className="flex gap-2">
            <button 
              onClick={() => setSaved(!saved)}
              className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg active:scale-95"
            >
              <Heart className={`w-5 h-5 ${saved ? "fill-red-500 text-red-500" : "text-gray-900"}`} />
            </button>
            <button className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg active:scale-95">
              <Share2 className="w-5 h-5 text-gray-900" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{event.title}</h1>
          {event.subtitle && <p className="text-lg text-gray-500 mt-1">{event.subtitle}</p>}
          <p className="text-purple-600 font-medium mt-2">Presented by {event.presenter}</p>
        </div>

        <div className="flex items-start gap-4 mb-5">
          <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{event.date}</p>
            <p className="text-gray-500">Doors {event.doorsTime} · Show {event.showTime}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 mb-8">
          <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{event.venue.name}</p>
            <p className="text-gray-500">{event.venue.address}</p>
          </div>
        </div>

        <div className="h-px bg-gray-100 mb-6" />

        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">About</h2>
          <p className="text-gray-600 leading-relaxed">{event.description}</p>
        </div>

        <div className="flex items-center gap-3 mb-8">
          <span className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-full">{event.ageRestriction}</span>
          <span className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-full">{event.genre}</span>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">From</p>
            <p className="text-2xl font-bold text-gray-900">${event.priceRange.min}</p>
          </div>
          <Link
            to={`/event/${id}/tickets`}
            className="bg-purple-600 text-white px-8 py-3.5 rounded-xl font-semibold text-lg shadow-lg shadow-purple-600/30 hover:bg-purple-700 active:scale-[0.98]"
          >
            Get Tickets
          </Link>
        </div>
      </div>

      <div className="h-24" />
    </div>
  );
}
