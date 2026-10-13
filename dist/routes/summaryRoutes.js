import { Router } from "express";
import { summarizeAccountTransaction, summarizeAllTransaction, summarizeCategoriesTransactionsController } from "../controllers/summaryController.js";
import { authMiddleware } from "../middlewares/authMidddleware.js";
const summaryRouter = Router();
summaryRouter.get('/all', authMiddleware, summarizeAllTransaction);
summaryRouter.get('/accounts/', authMiddleware, summarizeAccountTransaction);
summaryRouter.get('/categories/', authMiddleware, summarizeCategoriesTransactionsController);
export default summaryRouter;
