import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button, Select, useToast, ToastContainer } from "../../components/ui";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const timezones = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
];

const timeOptions = [
  { value: "closed", label: "Closed" },
  { value: "06:00", label: "6:00 AM" },
  { value: "07:00", label: "7:00 AM" },
  { value: "08:00", label: "8:00 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "16:00", label: "4:00 PM" },
  { value: "17:00", label: "5:00 PM" },
  { value: "18:00", label: "6:00 PM" },
  { value: "19:00", label: "7:00 PM" },
  { value: "20:00", label: "8:00 PM" },
  { value: "21:00", label: "9:00 PM" },
  { value: "22:00", label: "10:00 PM" },
  { value: "23:00", label: "11:00 PM" },
  { value: "00:00", label: "12:00 AM" },
  { value: "01:00", label: "1:00 AM" },
  { value: "02:00", label: "2:00 AM" },
];

export default function VenueHours() {
  const toast = useToast();
  const [timezone, setTimezone] = useState("America/New_York");
  const [sameAsVenue, setSameAsVenue] = useState(true);
  
  const [venueHours, setVenueHours] = useState({
    Monday: { open: "10:00", close: "23:00", closed: false },
    Tuesday: { open: "10:00", close: "23:00", closed: false },
    Wednesday: { open: "10:00", close: "23:00", closed: false },
    Thursday: { open: "10:00", close: "00:00", closed: false },
    Friday: { open: "10:00", close: "02:00", closed: false },
    Saturday: { open: "10:00", close: "02:00", closed: false },
    Sunday: { open: "12:00", close: "22:00", closed: false },
  });

  const [boxOfficeHours, setBoxOfficeHours] = useState({
    Monday: { open: "10:00", close: "18:00", closed: false },
    Tuesday: { open: "10:00", close: "18:00", closed: false },
    Wednesday: { open: "10:00", close: "18:00", closed: false },
    Thursday: { open: "10:00", close: "18:00", closed: false },
    Friday: { open: "10:00", close: "18:00", closed: false },
    Saturday: { open: "12:00", close: "16:00", closed: false },
    Sunday: { open: "closed", close: "closed", closed: true },
  });

  const updateVenueHours = (day: string, field: string, value: string) => {
    setVenueHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day as keyof typeof prev],
        [field]: value,
        closed: value === "closed" && field === "open",
      }
    }));
  };

  const updateBoxOfficeHours = (day: string, field: string, value: string) => {
    setBoxOfficeHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day as keyof typeof prev],
        [field]: value,
        closed: value === "closed" && field === "open",
      }
    }));
  };

  const handleSave = () => {
    toast.success("Hours saved!");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Venue Hours</h1>
            <p className="text-gray-500">Set your operating hours</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Timezone */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="max-w-xs">
          <Select
            label="Timezone"
            options={timezones}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </div>
      </div>

      {/* Venue Hours */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Venue Hours</h2>
        <div className="space-y-3">
          {days.map((day) => {
            const hours = venueHours[day as keyof typeof venueHours];
            return (
              <div key={day} className="flex items-center gap-4">
                <span className="w-28 text-sm font-medium text-gray-700">{day}</span>
                <select
                  value={hours.closed ? "closed" : hours.open}
                  onChange={(e) => updateVenueHours(day, "open", e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                >
                  {timeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {!hours.closed && (
                  <>
                    <span className="text-gray-500">to</span>
                    <select
                      value={hours.close}
                      onChange={(e) => updateVenueHours(day, "close", e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                    >
                      {timeOptions.filter(t => t.value !== "closed").map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Box Office Hours */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Box Office Hours</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sameAsVenue}
              onChange={(e) => setSameAsVenue(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded"
            />
            <span className="text-sm text-gray-600">Same as venue hours</span>
          </label>
        </div>
        
        {!sameAsVenue && (
          <div className="space-y-3">
            {days.map((day) => {
              const hours = boxOfficeHours[day as keyof typeof boxOfficeHours];
              return (
                <div key={day} className="flex items-center gap-4">
                  <span className="w-28 text-sm font-medium text-gray-700">{day}</span>
                  <select
                    value={hours.closed ? "closed" : hours.open}
                    onChange={(e) => updateBoxOfficeHours(day, "open", e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                  >
                    {timeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {!hours.closed && (
                    <>
                      <span className="text-gray-500">to</span>
                      <select
                        value={hours.close}
                        onChange={(e) => updateBoxOfficeHours(day, "close", e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                      >
                        {timeOptions.filter(t => t.value !== "closed").map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {sameAsVenue && (
          <p className="text-sm text-gray-500">Box office hours match venue hours.</p>
        )}
      </div>
    </div>
  );
}
