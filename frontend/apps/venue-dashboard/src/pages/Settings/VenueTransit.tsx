import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Train, Bus, Car, Bike } from "lucide-react";
import { Button, Input, Textarea, useToast, ToastContainer } from "../../components/ui";

export default function VenueTransit() {
  const toast = useToast();

  const [transit, setTransit] = useState({
    subwayStations: "Times Square - 42nd St (1, 2, 3, 7, N, Q, R, W, S)\n34th St - Penn Station (1, 2, 3, A, C, E)",
    walkingDirections: "Exit at Times Square station, walk 2 blocks east on 42nd Street.",
    busRoutes: "M42, M104, M7 - Stop at 42nd & Broadway",
  });

  const [rideshare, setRideshare] = useState({
    pickup: "Main entrance on 42nd Street",
    dropoff: "Side entrance on 43rd Street for faster access",
    instructions: "For pickup after the show, meet your driver at the designated rideshare zone on 43rd Street.",
  });

  const [bike, setBike] = useState({
    parking: "Bike racks available on the west side of the building. Citi Bike station located at 42nd & 7th Ave.",
  });

  const handleSave = () => {
    toast.success("Transit info saved!");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Transit Information</h1>
            <p className="text-gray-500">Help guests get to your venue</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Public Transit */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Train className="w-5 h-5 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Public Transit</h2>
        </div>

        <div className="space-y-4">
          <Textarea
            label="Nearby Stations"
            placeholder="List nearby subway/metro stations and lines..."
            value={transit.subwayStations}
            onChange={(e) => setTransit({ ...transit, subwayStations: e.target.value })}
            rows={3}
          />
          <Textarea
            label="Walking Directions"
            placeholder="Directions from the nearest station..."
            value={transit.walkingDirections}
            onChange={(e) => setTransit({ ...transit, walkingDirections: e.target.value })}
            rows={2}
          />
        </div>
      </div>

      {/* Bus Routes */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <Bus className="w-5 h-5 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Bus Routes</h2>
        </div>

        <Textarea
          label=""
          placeholder="List bus routes and nearby stops..."
          value={transit.busRoutes}
          onChange={(e) => setTransit({ ...transit, busRoutes: e.target.value })}
          rows={2}
        />
      </div>

      {/* Rideshare */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Car className="w-5 h-5 text-purple-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Rideshare</h2>
        </div>

        <div className="space-y-4">
          <Input
            label="Drop-Off Location"
            placeholder="Where should drivers drop off passengers?"
            value={rideshare.dropoff}
            onChange={(e) => setRideshare({ ...rideshare, dropoff: e.target.value })}
          />
          <Input
            label="Pickup Location"
            placeholder="Where should passengers meet their driver?"
            value={rideshare.pickup}
            onChange={(e) => setRideshare({ ...rideshare, pickup: e.target.value })}
          />
          <Textarea
            label="Additional Instructions"
            placeholder="Any other rideshare info..."
            value={rideshare.instructions}
            onChange={(e) => setRideshare({ ...rideshare, instructions: e.target.value })}
            rows={2}
          />
        </div>
      </div>

      {/* Bike Parking */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
            <Bike className="w-5 h-5 text-yellow-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Bike Parking</h2>
        </div>

        <Textarea
          label=""
          placeholder="Describe bike parking options..."
          value={bike.parking}
          onChange={(e) => setBike({ ...bike, parking: e.target.value })}
          rows={2}
        />
      </div>
    </div>
  );
}
