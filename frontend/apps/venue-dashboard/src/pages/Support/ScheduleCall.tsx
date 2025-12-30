import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, Phone, Check } from "lucide-react";
import { Button, Input, Textarea, Select, useToast, ToastContainer } from "../../components/ui";

const topicOptions = [
  { value: "", label: "Select a topic..." },
  { value: "onboarding", label: "Onboarding & Setup" },
  { value: "billing", label: "Billing Questions" },
  { value: "technical", label: "Technical Support" },
  { value: "feature", label: "Feature Walkthrough" },
  { value: "other", label: "Other" },
];

const timeSlots = [
  { date: "2025-01-16", day: "Thursday", slots: ["9:00 AM", "10:00 AM", "11:00 AM", "2:00 PM", "3:00 PM"] },
  { date: "2025-01-17", day: "Friday", slots: ["9:00 AM", "10:00 AM", "1:00 PM", "2:00 PM", "4:00 PM"] },
  { date: "2025-01-20", day: "Monday", slots: ["9:00 AM", "11:00 AM", "1:00 PM", "3:00 PM", "4:00 PM"] },
  { date: "2025-01-21", day: "Tuesday", slots: ["10:00 AM", "11:00 AM", "2:00 PM", "3:00 PM"] },
];

export default function ScheduleCall() {
  const navigate = useNavigate();
  const toast = useToast();
  
  const [topic, setTopic] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [phone, setPhone] = useState("+1 (555) 123-4567");
  const [notes, setNotes] = useState("");
  const [scheduled, setScheduled] = useState(false);

  const handleSchedule = () => {
    if (!topic) {
      toast.error("Please select a topic");
      return;
    }
    if (!selectedDate || !selectedTime) {
      toast.error("Please select a date and time");
      return;
    }
    if (!phone.trim()) {
      toast.error("Please enter your phone number");
      return;
    }
    setScheduled(true);
  };

  if (scheduled) {
    return (
      <div className="max-w-xl mx-auto text-center py-12">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Call Scheduled!</h1>
        <p className="text-gray-600 mb-6">
          We'll call you on {timeSlots.find(d => d.date === selectedDate)?.day}, {selectedDate} at {selectedTime}
        </p>
        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
          <p className="text-sm text-gray-500 mb-1">Topic</p>
          <p className="font-medium text-gray-900 mb-3">{topicOptions.find(t => t.value === topic)?.label}</p>
          <p className="text-sm text-gray-500 mb-1">Phone Number</p>
          <p className="font-medium text-gray-900">{phone}</p>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          A calendar invite has been sent to your email.
        </p>
        <Link to="/venue/support">
          <Button>Back to Help Center</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support/contact" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Schedule a Call</h1>
          <p className="text-gray-500">Book a time to speak with our team</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Topic & Contact */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <Select
              label="What would you like to discuss?"
              options={topicOptions}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />

            <Input
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <Textarea
              label="Notes (optional)"
              placeholder="Anything you'd like us to prepare for the call?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        {/* Right: Time Selection */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Select a Time</h2>
          </div>

          <div className="space-y-4">
            {timeSlots.map((day) => (
              <div key={day.date}>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  {day.day}, {day.date}
                </p>
                <div className="flex flex-wrap gap-2">
                  {day.slots.map((slot) => (
                    <button
                      key={`${day.date}-${slot}`}
                      onClick={() => { setSelectedDate(day.date); setSelectedTime(slot); }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedDate === day.date && selectedTime === slot
                          ? "bg-purple-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Summary */}
      {selectedDate && selectedTime && (
        <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-purple-600" />
            <div>
              <p className="font-medium text-purple-900">
                {timeSlots.find(d => d.date === selectedDate)?.day}, {selectedDate} at {selectedTime}
              </p>
              <p className="text-sm text-purple-700">30 minute call</p>
            </div>
          </div>
          <Button onClick={handleSchedule}>Schedule Call</Button>
        </div>
      )}
    </div>
  );
}
