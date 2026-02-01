'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  isEmailVerified: boolean;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface LoginResponse {
  login: {
    accessToken: string;
    user: User;
  };
}

interface GoogleLoginResponse {
  googleLogin: {
    accessToken: string;
    user: User;
  };
}

interface RegisterResponse {
  register: {
    accessToken: string;
    user: User;
  };
}

const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      accessToken
      user {
        id
        email
        firstName
        lastName
        avatar
        isEmailVerified
        createdAt
      }
    }
  }
`;

const GOOGLE_LOGIN_MUTATION = gql`
  mutation GoogleLogin($credential: String!) {
    googleLogin(credential: $credential) {
      accessToken
      user {
        id
        email
        firstName
        lastName
        avatar
        isEmailVerified
        createdAt
      }
    }
  }
`;

const REGISTER_MUTATION = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      accessToken
      user {
        id
        email
        firstName
        lastName
        avatar
        isEmailVerified
        createdAt
      }
    }
  }
`;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  type LoginVars = { email: string; password: string };
  type GoogleLoginVars = { credential: string };
  type RegisterVars = {
    input: { email: string; password: string; firstName?: string; lastName?: string };
  };

  const [loginMutation] = useMutation<LoginResponse, LoginVars>(LOGIN_MUTATION);
  const [googleLoginMutation] = useMutation<GoogleLoginResponse, GoogleLoginVars>(GOOGLE_LOGIN_MUTATION);
  const [registerMutation] = useMutation<RegisterResponse, RegisterVars>(REGISTER_MUTATION);

  useEffect(() => {
    // Check if user is logged in on mount
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const { data } = await loginMutation({
        variables: { email, password },
      });

      if (!data?.login) {
        throw new Error('Login failed: no data returned');
      }

      const { accessToken, user: userData } = data.login;
      localStorage.setItem('token', accessToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      router.push('/');
    } catch (error: unknown) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const loginWithGoogle = async (credential: string) => {
    try {
      const { data } = await googleLoginMutation({
        variables: { credential },
      });

      if (!data?.googleLogin) {
        throw new Error('Google login failed: no data returned');
      }

      const { accessToken, user: userData } = data.googleLogin;
      localStorage.setItem('token', accessToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      router.push('/');
    } catch (error: unknown) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  const register = async (email: string, password: string, firstName?: string, lastName?: string) => {
    try {
      const { data } = await registerMutation({
        variables: {
          input: { email, password, firstName, lastName },
        },
      });

      if (!data?.register) {
        throw new Error('Register failed: no data returned');
      }

      const { accessToken, user: userData } = data.register;
      localStorage.setItem('token', accessToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      router.push('/');
    } catch (error: unknown) {
      console.error('Register error:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
