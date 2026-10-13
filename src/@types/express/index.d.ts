// Extends Express's Request type so `req.auth` is recognized by TypeScript
// wherever it's used, after authMiddleware has run.
import { Request } from "express";

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      id: string;
    };
  }
}