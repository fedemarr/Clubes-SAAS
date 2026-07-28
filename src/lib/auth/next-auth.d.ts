import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface User {
    emailVerified?: boolean
  }

  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
  }
}
