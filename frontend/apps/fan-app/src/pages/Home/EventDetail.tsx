import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, Heart, MapPin, Clock, Calendar, Star, ChevronRight, Users, Info } from "lucide-react";
import { Button, Badge } from "../../components/ui";

const mockEvent = {
  id: 1,
  name: "Summer Music Festival 2025",
  image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1200",
  date: "Saturday, July 15, 2025",
  time: "4:00 PM - 11:00 PM",
  doorsOpen: "3:00 PM",
  venue: {
    name: "Central Park Great Lawn",
    address: "New York, NY 10024",
  },
  artists: ["The Lumineers", "Hozier", "Vance Joy", "Caamp"],
  description: "Join us for the biggest outdoor music event of the summer! Featuring an incredible lineup of folk and indie artists on the iconic Great Lawn.",
  ageRestriction: "All Ages",
  rating: 4.8,
  reviewCount: 324,
  ticketTypes: [
    { id: 1, name: "General Admission", price: 65, available: true },
    { id: 2, name: "VIP Access", price: 150, available: true, perks: ["Front stage area", "Private bars", "Lounge access"] },
    { id: 3, name: "Premium Package", price: 300, available: false },
  ],
  hasResale: true,
  resaleCount: 12,
  lowestResale: 85,
};

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"about" | "tickets" | "reviews">("about");

  const event = mockEvent; // Would fetch by id

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Hero Image */}
      <div className="relative h-64">
        <img src={event.image} alt={event.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        {/* Header Actions */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            <button className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setSaved(!saved)}
              className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center"
            >
              <Heart className={`w-5 h-5 ${saved ? "fill-red-500 text-red-500" : ""}`} />
            </button>
          </div>
        </div>

        {/* Event Title */}
        <div className="absolute bottom-4 left-4 right-4 text-white">
          <h1 className="text-2xl font-bold mb-1">{event.name}</h1>
          <div className="flex items-center gap-2 text-white/90">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            <span>{event.rating}</span>
            <span className="text-white/60">({event.reviewCount} reviews)</span>
          </div>
        </div>
      </div>

      {/* Quick Info */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{event.date}</p>
            <p className="text-sm text-gray-500">{event.time}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <MapPin className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">{event.venue.name}</p>
            <p className="text-sm text-gray-500">{event.venue.address}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(["about", "tickets", "reviews"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab 
                ? "border-purple-600 text-purple-600" 
                : "border-transparent text-gray-500"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="px-4 py-4">
        {activeTab === "about" && (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">About</h3>
              <p className="text-gray-600">{event.description}</p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Lineup</h3>
              <div className="flex flex-wrap gap-2">
                {event.artists.map((artist) => (
                  <Badge key={artist} variant="purple">{artist}</Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-4 h-4" />
                <span>Doors: {event.doorsOpen}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="w-4 h-4" />
                <span>{event.ageRestriction}</span>
              </div>
            </div>

            <Link 
              to={`/event/${id}/accessibility`}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Info className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-gray-900">Accessibility Info</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </Link>
          </div>
        )}

        {activeTab === "tickets" && (
          <div className="space-y-3">
            {event.ticketTypes.map((ticket) => (
              <div 
                key={ticket.id}
                className={`p-4 border rounded-xl ${ticket.available ? "border-gray-200" : "border-gray-100 bg-gray-50"}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-gray-900">{ticket.name}</h4>
                    {ticket.perks && (
                      <ul className="mt-1 space-y-1">
                        {ticket.perks.map((perk, i) => (
                          <li key={i} className="text-sm text-gray-500">• {perk}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">${ticket.price}</p>
                    {!ticket.available && (
                      <Badge variant="danger">Sold Out</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {event.hasResale && (
              <Link 
                to={`/event/${id}/resale`}
                className="block p-4 border border-purple-200 bg-purple-50 rounded-xl"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-purple-900">Resale Tickets</h4>
                    <p className="text-sm text-purple-600">{event.resaleCount} available from ${event.lowestResale}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-purple-400" />
                </div>
              </Link>
            )}
          </div>
        )}

        {activeTab === "reviews" && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-900">{event.rating}</p>
                <div className="flex gap-0.5 my-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star 
                      key={star} 
                      className={`w-4 h-4 ${star <= Math.round(event.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} 
                    />
                  ))}
                </div>
                <p className="text-sm text-gray-500">{event.reviewCount} reviews</p>
              </div>
            </div>
            
            <p className="text-center text-gray-500 py-8">
              Reviews will appear here after the event
            </p>
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-20 left-0 right-0 p-4 bg-white border-t border-gray-200">
        <Link to={`/event/${id}/select-tickets`}>
          <Button className="w-full">
            Get Tickets — From ${event.ticketTypes.find(t => t.available)?.price || event.lowestResale}
          </Button>
        </Link>
      </div>
    </div>
  );
}
