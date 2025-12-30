import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, List, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui";

const mockEvents = [
  { id: 1, name: "Summer Music Festival", date: "2025-01-15", time: "6:00 PM", status: "On Sale" },
  { id: 2, name: "Tech Conference", date: "2025-01-15", time: "9:00 AM", status: "On Sale" },
  { id: 3, name: "Comedy Night", date: "2025-01-18", time: "8:00 PM", status: "On Sale" },
  { id: 4, name: "Jazz Evening", date: "2025-01-22", time: "7:00 PM", status: "Draft" },
  { id: 5, name: "Art Gallery Opening", date: "2025-01-25", time: "6:00 PM", status: "On Sale" },
  { id: 6, name: "New Year Party", date: "2025-01-01", time: "9:00 PM", status: "Past" },
];

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getStatusColor(status: string) {
  switch (status) {
    case "On Sale": return "bg-green-500";
    case "Draft": return "bg-yellow-500";
    case "Past": return "bg-gray-400";
    case "Cancelled": return "bg-red-500";
    default: return "bg-purple-500";
  }
}

export default function EventCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 0, 1)); // January 2025

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const firstDayWeekday = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const monthName = currentDate.toLocaleString("default", { month: "long", year: "numeric" });

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return mockEvents.filter(e => e.date === dateStr);
  };

  const calendarDays = [];
  
  // Empty cells before first day
  for (let i = 0; i < firstDayWeekday; i++) {
    calendarDays.push(null);
  }
  
  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Events</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <Link
              to="/venue/events"
              className="px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 flex items-center gap-2"
            >
              <List className="w-4 h-4" />
              List
            </Link>
            <Link
              to="/venue/events/calendar"
              className="px-3 py-2 text-sm font-medium bg-purple-50 text-purple-600 flex items-center gap-2"
            >
              <CalendarDays className="w-4 h-4" />
              Calendar
            </Link>
          </div>
          <Link to="/venue/events/new">
            <Button>
              <Plus className="w-5 h-5" />
              <span>Create Event</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        {/* Calendar Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900">{monthName}</h2>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 border-b border-gray-200">
          {daysOfWeek.map(day => (
            <div key={day} className="px-2 py-3 text-center text-sm font-medium text-gray-500">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, index) => {
            const events = day ? getEventsForDay(day) : [];
            const isToday = day === new Date().getDate() && 
                           month === new Date().getMonth() && 
                           year === new Date().getFullYear();
            
            return (
              <div
                key={index}
                className={`min-h-32 p-2 border-b border-r border-gray-200 ${
                  day ? "bg-white" : "bg-gray-50"
                }`}
              >
                {day && (
                  <>
                    <span className={`inline-flex items-center justify-center w-7 h-7 text-sm ${
                      isToday 
                        ? "bg-purple-600 text-white rounded-full" 
                        : "text-gray-900"
                    }`}>
                      {day}
                    </span>
                    <div className="mt-1 space-y-1">
                      {events.slice(0, 3).map(event => (
                        <Link
                          key={event.id}
                          to={`/venue/events/${event.id}`}
                          className="block"
                        >
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 transition-colors">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor(event.status)}`} />
                            <span className="text-xs font-medium text-gray-700 truncate">
                              {event.name}
                            </span>
                          </div>
                        </Link>
                      ))}
                      {events.length > 3 && (
                        <p className="text-xs text-gray-500 px-2">
                          +{events.length - 3} more
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm text-gray-600">On Sale</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="text-sm text-gray-600">Draft</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-400" />
          <span className="text-sm text-gray-600">Past</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-sm text-gray-600">Cancelled</span>
        </div>
      </div>
    </div>
  );
}
