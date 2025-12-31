import { MapPin, Navigation, Users, Accessibility, Phone, Globe, Calendar } from "lucide-react";
import Modal from "../../../components/ui/Modal";

interface VenueInfo {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  capacity: number;
  phone?: string;
  website?: string;
  image: string;
  accessibilityFeatures: string[];
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
  };
}

interface VenueInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  venue: VenueInfo;
  isFollowing?: boolean;
  onFollow?: () => void;
}

export default function VenueInfoModal({
  isOpen,
  onClose,
  venue,
  isFollowing = false,
  onFollow,
}: VenueInfoModalProps) {
  const fullAddress = `${venue.address}, ${venue.city}, ${venue.state} ${venue.zip}`;
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="md">
      <div className="-mx-6 -mt-4">
        {/* Venue Image */}
        <div className="aspect-video w-full">
          <img
            src={venue.image}
            alt={venue.name}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="px-6 py-5">
          {/* Venue Name & Type */}
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-900">{venue.name}</h2>
            <p className="text-gray-500">{venue.type}</p>
          </div>

          {/* Address & Directions */}
          <div className="flex items-start gap-3 mb-4">
            <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-gray-900">{venue.address}</p>
              <p className="text-gray-500">
                {venue.city}, {venue.state} {venue.zip}
              </p>
            </div>
          </div>

          
            <a
              href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-gray-100 text-gray-900 font-semibold rounded-xl hover:bg-gray-200 transition-colors mb-6"
          >
            <Navigation className="w-5 h-5" />
            Get Directions
          </a>

          {/* Capacity */}
          <div className="flex items-center gap-3 py-3 border-t border-gray-100">
            <Users className="w-5 h-5 text-gray-400" />
            <span className="text-gray-600">Capacity: {venue.capacity.toLocaleString()}</span>
          </div>

          {/* Accessibility */}
          {venue.accessibilityFeatures.length > 0 && (
            <div className="py-3 border-t border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <Accessibility className="w-5 h-5 text-gray-400" />
                <span className="text-gray-900 font-medium">Accessibility</span>
              </div>
              <div className="flex flex-wrap gap-2 ml-8">
                {venue.accessibilityFeatures.map((feature) => (
                  <span
                    key={feature}
                    className="px-2.5 py-1 bg-gray-100 text-gray-600 text-sm rounded-full"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Contact */}
          {(venue.phone || venue.website) && (
            <div className="py-3 border-t border-gray-100 space-y-2">
              {venue.phone && (
                
                  <a
                    href={`tel:${venue.phone}`}
                  className="flex items-center gap-3 text-gray-600 hover:text-gray-900"
                >
                  <Phone className="w-5 h-5 text-gray-400" />
                  {venue.phone}
                </a>
              )}
              {venue.website && (
                
                  <a
                    href={venue.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-gray-600 hover:text-gray-900"
                >
                  <Globe className="w-5 h-5 text-gray-400" />
                  Visit Website
                </a>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={onFollow}
              className={`flex-1 py-3 rounded-xl font-semibold transition-colors ${
                isFollowing
                  ? "bg-gray-100 text-gray-900 hover:bg-gray-200"
                  : "bg-purple-600 text-white hover:bg-purple-700"
              }`}
            >
              {isFollowing ? "Following" : "Follow Venue"}
            </button>
            
              <a
                href={`/search?venue=${venue.id}`}
              className="flex items-center justify-center gap-2 flex-1 py-3 bg-gray-100 text-gray-900 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              <Calendar className="w-5 h-5" />
              All Events
            </a>
          </div>
        </div>
      </div>
    </Modal>
  );
}
