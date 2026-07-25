import React, { createContext, useContext, useState } from 'react';
import { SidebarDrawer } from '../components/SidebarDrawer';

const SidebarContext = createContext({
  isOpen: false,
  openDrawer: () => {},
  closeDrawer: () => {},
  toggleDrawer: () => {},
});

export const SidebarProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const openDrawer = () => setIsOpen(true);
  const closeDrawer = () => setIsOpen(false);
  const toggleDrawer = () => setIsOpen(prev => !prev);

  return (
    <SidebarContext.Provider value={{ isOpen, openDrawer, closeDrawer, toggleDrawer }}>
      {children}
      <SidebarDrawer visible={isOpen} onClose={closeDrawer} />
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => useContext(SidebarContext);
