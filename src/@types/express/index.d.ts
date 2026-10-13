// Extends Express's Request type so `req.auth` is recognized by TypeScript
// wherever it's used, after authMiddleware has run.

declare global {
  namespace Express {
    interface Request {
      auth?: {
        id: string; // change to `number` if user_id is an integer column
      };
    }
  }
}

export {};