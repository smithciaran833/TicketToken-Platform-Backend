import React from 'react';
import {
  TicketTokenProvider,
  useEvents,
  useMyTickets,
  useCurrentUser,
  usePurchaseTickets,
} from '../src';

// Example React Application using TicketToken SDK
function EventsList() {
  const { events, loading, error, refetch } = useEvents({ limit: 5 });

  if (loading) return <div>Loading events...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Events</h2>
      <button onClick={refetch}>Refresh</button>
      <ul>
        {events.map((event: any) => (
          <li key={event.id}>
            {event.name} - {event.date}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyTickets() {
  const { tickets, loading, error, fetchTickets } = useMyTickets();

  React.useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  if (loading) return <div>Loading tickets...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>My Tickets</h2>
      <ul>
        {tickets.map((ticket: any) => (
          <li key={ticket.id}>
            {ticket.eventName} - Seat: {ticket.seat}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserProfile() {
  const { user, loading, error } = useCurrentUser();

  if (loading) return <div>Loading profile...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!user) return <div>No user found</div>;

  return (
    <div>
      <h2>Profile</h2>
      <p>Name: {user.name}</p>
      <p>Email: {user.email}</p>
    </div>
  );
}

function PurchaseTicketsForm() {
  const { purchaseTickets, loading, error } = usePurchaseTickets();
  const [quantity, setQuantity] = React.useState(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await purchaseTickets({
        eventId: 'evt_123',
        ticketType: 'general-admission',
        quantity,
        paymentMethod: 'card',
      });
      alert('Tickets purchased successfully!');
    } catch (err) {
      console.error('Purchase failed:', err);
    }
  };

  return (
    <div>
      <h2>Purchase Tickets</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Processing...' : 'Purchase'}
        </button>
        {error && <div>Error: {error.message}</div>}
      </form>
    </div>
  );
}

function App() {
  return (
    <TicketTokenProvider
      config={{
        apiKey: 'your-api-key-here',
        environment: 'development',
      }}
    >
      <div className="App">
        <h1>TicketToken React SDK Example</h1>
        <UserProfile />
        <EventsList />
        <MyTickets />
        <PurchaseTicketsForm />
      </div>
    </TicketTokenProvider>
  );
}

export default App;
