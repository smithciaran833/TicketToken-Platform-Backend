import { Link } from "react-router-dom";
import { Calendar, ChevronRight, Ticket } from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";

const upcomingTickets = [
  {
    id: "1",
    eventTitle: "Japanese Breakfast",
    date: "Sat, Jul 15",
    time: "8:00 PM",
    venue: "The Fillmore",
    ticketCount: 2,
    daysUntil: 12,
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80",
  },
  {
    id: "2",
    eventTitle: "Khruangbin",
    date: "Thu, Aug 3",
    time: "7:30 PM",
    venue: "The Greek Theatre",
    ticketCount: 2,
    daysUntil: 31,
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&q=80",
  },
];

const pastTickets = [
  {
    id: "3",
    eventTitle: "Bon Iver",
    date: "Mar 22, 2025",
    venue: "Chase Center",
    ticketCount: 2,
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=80",
  },
];

export default function TicketsList() {
  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white px-5 py-6 border-b border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900">My Tickets</h1>
        </header>

        <div className="p-5">
          {/* Upcoming */}
          {upcomingTickets.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Upcoming
              </h2>
              <div className="space-y-3">
                {upcomingTickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    to={`/tickets/${ticket.id}`}
                    className="flex gap-4 bg-white p-4 rounded-2xl shadow-sm transition-all hover:shadow-md active:scale-[0.99]"
                  >
                    <img
                      src={ticket.image}
                      alt={ticket.eventTitle}
                      className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{ticket.eventTitle}</h3>
                      <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{ticket.date} · {ticket.time}</span>
                      </div>
                      <p className="text-sm text-gray-500">{ticket.venue}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                          {ticket.ticketCount} ticket{ticket.ticketCount !== 1 ? "s" : ""}
                        </span>
                        {ticket.daysUntil <= 14 && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                            {ticket.daysUntil} days away
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0 self-center" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Past */}
          {pastTickets.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Past Events
              </h2>
              <div className="space-y-3">
                {pastTickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    to={`/tickets/${ticket.id}`}
                    className="flex gap-4 bg-white p-4 rounded-2xl shadow-sm opacity-70"
                  >
                    <img
                      src={ticket.image}
                      alt={ticket.eventTitle}
                      className="w-16 h-16 rounded-xl object-cover flex-shrink-0 grayscale"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{ticket.eventTitle}</h3>
                      <p className="text-sm text-gray-500">{ticket.date}</p>
                      <p className="text-sm text-gray-500">{ticket.venue}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {upcomingTickets.length === 0 && pastTickets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Ticket className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">No tickets yet</h3>
              <p className="text-gray-500 mb-6">When you purchase tickets, they'll appear here</p>
              <Link
                to="/"
                className="bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold transition-all hover:bg-purple-700 active:scale-[0.98]"
              >
                Browse Events
              </Link>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
