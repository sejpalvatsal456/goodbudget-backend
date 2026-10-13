import type {} from "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    auth? : { id: string };
  }
};

export {};