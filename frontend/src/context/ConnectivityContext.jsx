import React, { createContext, useContext, useEffect, useState } from 'react';
import { connectivityStore } from '../connectivity/connectivityStore';

/** Exposes the connectivity state (ONLINE / WEAK / OFFLINE) to every component. */
const ConnectivityContext = createContext(connectivityStore.getState());

export const useConnectivity = () => useContext(ConnectivityContext);

export const ConnectivityProvider = ({ children }) => {
  const [value, setValue] = useState(connectivityStore.getState());

  useEffect(() => {
    connectivityStore.start();
    const off = connectivityStore.subscribe(setValue);
    setValue(connectivityStore.getState());
    return off;
  }, []);

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
};
