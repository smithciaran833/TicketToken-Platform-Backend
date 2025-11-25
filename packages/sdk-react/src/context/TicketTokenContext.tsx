import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { TicketToken, TicketTokenConfig } from '@tickettoken/sdk-typescript';

interface TicketTokenContextValue {
  client: TicketToken;
}

const TicketTokenContext = createContext<TicketTokenContextValue | null>(null);

export interface TicketTokenProviderProps {
  config: TicketTokenConfig;
  children: ReactNode;
}

export const TicketTokenProvider: React.FC<TicketTokenProviderProps> = ({
  config,
  children,
}) => {
  const client = useMemo(() => new TicketToken(config), [
    config.apiKey,
    config.environment,
    config.baseURL,
  ]);

  const value = useMemo(() => ({ client }), [client]);

  return (
    <TicketTokenContext.Provider value={value}>
      {children}
    </TicketTokenContext.Provider>
  );
};

export const useTicketTokenClient = (): TicketToken => {
  const context = useContext(TicketTokenContext);
  
  if (!context) {
    throw new Error(
      'useTicketTokenClient must be used within a TicketTokenProvider'
    );
  }
  
  return context.client;
};
