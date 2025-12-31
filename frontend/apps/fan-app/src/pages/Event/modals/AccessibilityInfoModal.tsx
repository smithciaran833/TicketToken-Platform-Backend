import {
  Accessibility,
  Car,
  Ear,
  Hand,
  PawPrint,
  ArrowUp,
  Phone,
  Mail,
} from "lucide-react";
import Modal, { ModalFooter } from "../../../components/ui/Modal";

interface AccessibilityInfo {
  wheelchairAccessible: boolean;
  accessibleParking: boolean;
  accessibleRestrooms: boolean;
  assistiveListening: boolean;
  signLanguage: boolean;
  elevatorAccess: boolean;
  serviceAnimals: boolean;
  accessibleSeatingInfo?: string;
  contactEmail?: string;
  contactPhone?: string;
}

interface AccessibilityInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessibility: AccessibilityInfo;
  venueName: string;
  onRequestAccommodations?: () => void;
}

const features = [
  { key: "wheelchairAccessible", label: "Wheelchair Accessible", icon: Accessibility },
  { key: "accessibleParking", label: "Accessible Parking", icon: Car },
  { key: "accessibleRestrooms", label: "Accessible Restrooms", icon: Accessibility },
  { key: "assistiveListening", label: "Assistive Listening Devices", icon: Ear },
  { key: "signLanguage", label: "Sign Language Interpretation", icon: Hand },
  { key: "elevatorAccess", label: "Elevator Access", icon: ArrowUp },
  { key: "serviceAnimals", label: "Service Animals Welcome", icon: PawPrint },
];

export default function AccessibilityInfoModal({
  isOpen,
  onClose,
  accessibility,
  venueName,
  onRequestAccommodations,
}: AccessibilityInfoModalProps) {
  const availableFeatures = features.filter(
    (f) => accessibility[f.key as keyof AccessibilityInfo]
  );
  const unavailableFeatures = features.filter(
    (f) => !accessibility[f.key as keyof AccessibilityInfo]
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Accessibility" size="md">
      <div className="space-y-6">
        {/* Venue Name */}
        <p className="text-gray-500">Accessibility features at {venueName}</p>

        {/* Available Features */}
        {availableFeatures.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Available
            </h3>
            <div className="space-y-3">
              {availableFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.key}
                    className="flex items-center gap-3 p-3 bg-green-50 rounded-xl"
                  >
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <Icon className="w-5 h-5 text-green-600" />
                    </div>
                    <span className="text-gray-900 font-medium">{feature.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unavailable Features */}
        {unavailableFeatures.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Not Available
            </h3>
            <div className="space-y-3">
              {unavailableFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.key}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <Icon className="w-5 h-5 text-gray-400" />
                    </div>
                    <span className="text-gray-500">{feature.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Accessible Seating Info */}
        {accessibility.accessibleSeatingInfo && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Accessible Seating
            </h3>
            <p className="text-gray-600 leading-relaxed">
              {accessibility.accessibleSeatingInfo}
            </p>
          </div>
        )}

        {/* Contact Info */}
        {(accessibility.contactEmail || accessibility.contactPhone) && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Questions?
            </h3>
            <div className="space-y-2">
              {accessibility.contactPhone && (
                
                  <a
                    href={`tel:${accessibility.contactPhone}`}
                  className="flex items-center gap-3 text-gray-600 hover:text-gray-900"
                >
                  <Phone className="w-5 h-5 text-gray-400" />
                  {accessibility.contactPhone}
                </a>
              )}
              {accessibility.contactEmail && (
                
                  <a
                    href={`mailto:${accessibility.contactEmail}`}
                  className="flex items-center gap-3 text-gray-600 hover:text-gray-900"
                >
                  <Mail className="w-5 h-5 text-gray-400" />
                  {accessibility.contactEmail}
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <ModalFooter>
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-600 font-medium hover:text-gray-900 transition-colors"
        >
          Close
        </button>
        <button
          onClick={onRequestAccommodations}
          className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
        >
          Request Accommodations
        </button>
      </ModalFooter>
    </Modal>
  );
}
