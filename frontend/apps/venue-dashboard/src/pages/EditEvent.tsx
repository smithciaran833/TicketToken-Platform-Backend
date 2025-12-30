import { useState, useEffect } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Input, Select, Textarea, FileUpload, DatePicker, TimePicker, Toggle } from "../components/ui";

// Mock data - in production this comes from API
const mockEvent = {
  id: 1,
  name: "Summer Music Festival",
  category: "concert",
  description: "Join us for the biggest music festival of the summer featuring top artists from around the world.",
  image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&h=400&fit=crop",
  eventDate: "2025-08-15",
  startTime: "18:00",
  endTime: "23:00",
  doorsTime: "17:00",
  tickets: [
    { id: 1, name: "General Admission", price: 65, quantity: 1500, saleStart: "2025-06-01", saleEnd: "2025-08-15" },
    { id: 2, name: "VIP Access", price: 150, quantity: 200, saleStart: "2025-06-01", saleEnd: "2025-08-15" },
  ],
  isPublic: true,
  refundPolicy: "full-7",
  ageRestriction: "all",
};

const categories = [
  { value: "concert", label: "Concert" },
  { value: "sports", label: "Sports" },
  { value: "theater", label: "Theater" },
  { value: "comedy", label: "Comedy" },
  { value: "festival", label: "Festival" },
  { value: "conference", label: "Conference" },
  { value: "workshop", label: "Workshop" },
  { value: "other", label: "Other" },
];

const refundPolicies = [
  { value: "full-7", label: "Full refund until 7 days before event" },
  { value: "full-14", label: "Full refund until 14 days before event" },
  { value: "full-30", label: "Full refund until 30 days before event" },
  { value: "no-refund", label: "No refunds" },
];

const ageRestrictions = [
  { value: "all", label: "All Ages" },
  { value: "18+", label: "18+" },
  { value: "21+", label: "21+" },
];

const steps = [
  { id: 1, name: "Basic Info" },
  { id: 2, name: "Date & Time" },
  { id: 3, name: "Tickets" },
  { id: 4, name: "Settings" },
];

interface TicketType {
  id: number;
  name: string;
  price: number;
  quantity: number;
  saleStart: string;
  saleEnd: string;
}

export default function EditEvent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  
  // Step 1: Basic Info
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  
  // Step 2: Date & Time
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [doorsTime, setDoorsTime] = useState("");
  
  // Step 3: Tickets
  const [tickets, setTickets] = useState<TicketType[]>([]);
  
  // Step 4: Settings
  const [isPublic, setIsPublic] = useState(true);
  const [refundPolicy, setRefundPolicy] = useState("full-7");
  const [ageRestriction, setAgeRestriction] = useState("all");

  // Load existing event data
  useEffect(() => {
    // In production, this would be an API call
    // const event = await api.get(`/events/${id}`);
    const event = mockEvent;
    
    setName(event.name);
    setCategory(event.category);
    setDescription(event.description);
    setExistingImage(event.image);
    setEventDate(event.eventDate);
    setStartTime(event.startTime);
    setEndTime(event.endTime);
    setDoorsTime(event.doorsTime);
    setTickets(event.tickets);
    setIsPublic(event.isPublic);
    setRefundPolicy(event.refundPolicy);
    setAgeRestriction(event.ageRestriction);
    
    setIsLoading(false);
  }, [id]);

  const addTicketType = () => {
    const newId = Math.max(...tickets.map(t => t.id), 0) + 1;
    setTickets([...tickets, { id: newId, name: "", price: 0, quantity: 0, saleStart: "", saleEnd: "" }]);
  };

  const updateTicket = (ticketId: number, field: keyof TicketType, value: string | number) => {
    setTickets(tickets.map(t => t.id === ticketId ? { ...t, [field]: value } : t));
  };

  const removeTicket = (ticketId: number) => {
    if (tickets.length > 1) {
      setTickets(tickets.filter(t => t.id !== ticketId));
    }
  };

  const handleSubmit = () => {
    // In production, this would call the API
    console.log("Updating event:", {
      id,
      name, category, description, image,
      eventDate, startTime, endTime, doorsTime,
      tickets,
      isPublic, refundPolicy, ageRestriction
    });
    navigate(`/venue/events/${id}`);
  };

  const canProgress = () => {
    switch (currentStep) {
      case 1: return name && category;
      case 2: return eventDate && startTime;
      case 3: return tickets.every(t => t.name && t.price >= 0 && t.quantity > 0);
      case 4: return true;
      default: return false;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading event...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Link to={`/venue/events/${id}`} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Edit Event</h1>
          <p className="text-gray-500 mt-1">{name}</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="flex items-center">
                <button
                  onClick={() => setCurrentStep(step.id)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                    currentStep >= step.id
                      ? "bg-purple-600 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {currentStep > step.id ? <Check className="w-5 h-5" /> : step.id}
                </button>
                <span className={`ml-3 text-sm font-medium ${
                  currentStep >= step.id ? "text-gray-900" : "text-gray-500"
                }`}>
                  {step.name}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-24 h-1 mx-4 ${
                  currentStep > step.id ? "bg-purple-600" : "bg-gray-200"
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Form Content */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        {currentStep === 1 && (
          <div className="space-y-6">
            <Input
              label="Event Name"
              placeholder="Enter event name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Select
              label="Category"
              options={categories}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Select a category"
            />
            <Textarea
              label="Description"
              placeholder="Describe your event..."
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              helper="This will be shown on your event page"
            />
            <FileUpload
              label="Event Image"
              onChange={setImage}
              preview={existingImage || undefined}
              helper="Recommended: 1920x1080px"
            />
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <DatePicker
              label="Event Date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4">
              <TimePicker
                label="Start Time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <TimePicker
                label="End Time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                helper="Optional"
              />
            </div>
            <TimePicker
              label="Doors Open"
              value={doorsTime}
              onChange={(e) => setDoorsTime(e.target.value)}
              helper="When attendees can start entering"
            />
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Ticket Types</h3>
              <Button variant="secondary" size="sm" onClick={addTicketType}>
                Add Ticket Type
              </Button>
            </div>
            
            {tickets.map((ticket, index) => (
              <div key={ticket.id} className="p-4 border border-gray-200 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Ticket Type {index + 1}</span>
                  {tickets.length > 1 && (
                    <button
                      onClick={() => removeTicket(ticket.id)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Name"
                    placeholder="e.g. General Admission"
                    value={ticket.name}
                    onChange={(e) => updateTicket(ticket.id, "name", e.target.value)}
                  />
                  <Input
                    label="Price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={ticket.price || ""}
                    onChange={(e) => updateTicket(ticket.id, "price", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Input
                    label="Quantity"
                    type="number"
                    min="1"
                    placeholder="100"
                    value={ticket.quantity || ""}
                    onChange={(e) => updateTicket(ticket.id, "quantity", parseInt(e.target.value) || 0)}
                  />
                  <DatePicker
                    label="Sale Start"
                    value={ticket.saleStart}
                    onChange={(e) => updateTicket(ticket.id, "saleStart", e.target.value)}
                  />
                  <DatePicker
                    label="Sale End"
                    value={ticket.saleEnd}
                    onChange={(e) => updateTicket(ticket.id, "saleEnd", e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <Toggle
              label="Public Event"
              description="Event will be visible to everyone and listed on TicketToken"
              enabled={isPublic}
              onChange={setIsPublic}
            />
            <Select
              label="Refund Policy"
              options={refundPolicies}
              value={refundPolicy}
              onChange={(e) => setRefundPolicy(e.target.value)}
            />
            <Select
              label="Age Restriction"
              options={ageRestrictions}
              value={ageRestriction}
              onChange={(e) => setAgeRestriction(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="secondary"
          onClick={() => setCurrentStep(currentStep - 1)}
          disabled={currentStep === 1}
        >
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Link to={`/venue/events/${id}`}>
            <Button variant="ghost">Cancel</Button>
          </Link>
          {currentStep < 4 ? (
            <Button onClick={() => setCurrentStep(currentStep + 1)} disabled={!canProgress()}>
              Continue
            </Button>
          ) : (
            <Button onClick={handleSubmit}>Save Changes</Button>
          )}
        </div>
      </div>
    </div>
  );
}
