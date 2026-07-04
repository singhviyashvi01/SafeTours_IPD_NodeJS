import React, { createContext, useState, useContext } from 'react';
import { authService } from '../services/auth';
const AuthContext = createContext({});
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const login = async (email, password) => {
        setIsLoading(true);
        try {
            const loggedInUser = await authService.login(email, password);
            setUser(loggedInUser);
        }
        finally {
            setIsLoading(false);
        }
    };
    const logout = () => {
        setUser(null);
    };
    return (<AuthContext.Provider value={{ user, isLoading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>);
};
export const useAuth = () => useContext(AuthContext);
