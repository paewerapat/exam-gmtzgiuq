import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { CombinedGraphQLErrors } from '@apollo/client/errors';

const httpLink = createHttpLink({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3001/graphql',
});

const authLink = setContext((_, { headers }) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  };
});

// Handle token expiry — clear session and redirect to /login on 401/UNAUTHENTICATED
const errorLink = onError(({ error }) => {
  let isUnauth = false;

  if (CombinedGraphQLErrors.is(error)) {
    isUnauth = error.errors.some(
      (e) =>
        e.extensions?.code === 'UNAUTHENTICATED' ||
        e.message === 'Unauthorized',
    );
  } else if (error && 'statusCode' in error && (error as any).statusCode === 401) {
    isUnauth = true;
  }

  if (isUnauth && typeof window !== 'undefined') {
    const hasToken = !!localStorage.getItem('token');
    if (hasToken && window.location.pathname !== '/login') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  }
});

const client = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
    },
  },
});

export default client;
