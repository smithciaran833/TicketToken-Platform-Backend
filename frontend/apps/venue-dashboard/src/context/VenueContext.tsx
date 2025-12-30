import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
  logo?: string;
}

const MOCK_VENUES: Venue[] = [
  {
    id: 'venue-1',
    name: 'The Grand Arena',
    address: '123 Main Street',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    timezone: 'America/Chicago',
  },
  {
    id: 'venue-2', 
    name: 'Downtown Theater',
    address: '456 Congress Ave',
    city: 'Austin',
    state: 'TX',
    zip: '78702',
    timezone: 'America/Chicago',
  },
];

interface VenueContextType {
  currentVenue: Venue | null;
  venues: Venue[];
  setCurrentVenue: (venue: Venue) => void;
  loading: boolean;
}

const VenueContext = createContext<VenueContextType | undefined>(undefined);

export function VenueProvider({ children }: { children: ReactNode }) {
  const [venues] = useState<Venue[]>(MOCK_VENUES);
  const [currentVenue, setCurrentVenue] = useState<Venue | null>(MOCK_VENUES[0]);
  const [loading] = useState(false);

  return (
    <VenueContext.Provider value={{ currentVenue, venues, setCurrentVenue, loading }}>
      {children}
    </VenueContext.Provider>
  );
}

export function useVenue() {
  const context = useContext(VenueContext);
  if (context === undefined) {
    throw new Error('useVenue must be used within a VenueProvider');
  }
  return context;
}
