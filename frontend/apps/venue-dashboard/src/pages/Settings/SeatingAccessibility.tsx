import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Accessibility, Info } from "lucide-react";
import { Button, Input, Textarea, useToast, ToastContainer } from "../../components/ui";

const accessibleSections = [
  { id: 1, section: "Orchestra Center", wheelchairSpaces: 10, companionSeats: 10 },
  { id: 2, section: "Orchestra Left", wheelchairSpaces: 6, companionSeats: 6 },
  { id: 3, section: "Orchestra Right", wheelchairSpaces: 6, companionSeats: 6 },
  { id: 4, section: "Mezzanine", wheelchairSpaces: 4, companionSeats: 4 },
];

export default function SeatingAccessibility() {
  const toast = useToast();

  const [sections, setSections] = useState(accessibleSections);
  const [contactInfo, setContactInfo] = useState({
    email: "accessibility@grandtheater.com",
    phone: "(555) 123-4567 ext. 2",
  });
  const [accommodationProcess, setAccommodationProcess] = useState(
    "Guests requiring accessible seating can purchase tickets online or call our box office. Wheelchair spaces include a companion seat at no additional charge. For other accommodation requests, please contact us at least 48 hours before the event."
  );

  const totalWheelchair = sections.reduce((sum, s) => sum + s.wheelchairSpaces, 0);
  const totalCompanion = sections.reduce((sum, s) => sum + s.companionSeats, 0);

  const updateSection = (id: number, field: string, value: number) => {
    setSections(sections.map(s => 
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const handleSave = () => {
    toast.success("Accessibility settings saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Accessibility Seating</h1>
            <p className="text-gray-500">ADA accessible seating configuration</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Accessibility className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Wheelchair Spaces</p>
              <p className="text-2xl font-bold text-gray-900">{totalWheelchair}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Accessibility className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Companion Seats</p>
              <p className="text-2xl font-bold text-gray-900">{totalCompanion}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Accessible Sections */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Accessible Sections</h2>
        
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Wheelchair Spaces</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Companion Seats</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sections.map((section) => (
                <tr key={section.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{section.section}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0"
                      value={section.wheelchairSpaces}
                      onChange={(e) => updateSection(section.id, "wheelchairSpaces", parseInt(e.target.value) || 0)}
                      className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0"
                      value={section.companionSeats}
                      onChange={(e) => updateSection(section.id, "companionSeats", parseInt(e.target.value) || 0)}
                      className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADA Compliance Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">ADA Compliance</p>
            <p className="mt-1">
              Assembly areas must have wheelchair spaces and companion seats dispersed throughout the venue. 
              The required number depends on total seating capacity. For venues with 501-5,000 seats, 
              provide 6 wheelchair spaces plus 1 for each 150 seats over 500.
            </p>
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Accessibility Contact</h2>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Email"
            type="email"
            value={contactInfo.email}
            onChange={(e) => setContactInfo({ ...contactInfo, email: e.target.value })}
          />
          <Input
            label="Phone"
            type="tel"
            value={contactInfo.phone}
            onChange={(e) => setContactInfo({ ...contactInfo, phone: e.target.value })}
          />
        </div>
      </div>

      {/* Accommodation Process */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Accommodation Request Process</h2>
        <Textarea
          label=""
          placeholder="Describe how guests can request accessibility accommodations..."
          value={accommodationProcess}
          onChange={(e) => setAccommodationProcess(e.target.value)}
          rows={4}
        />
      </div>
    </div>
  );
}
