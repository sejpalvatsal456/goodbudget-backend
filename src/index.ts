import './types/express.js';
import express, { Request, Response } from 'express';
import usersRouter from './routes/usersRoute.js';
import dotenv from 'dotenv';
import accountsRouter from './routes/accountsRoute.js';
import summaryRouter from './routes/summaryRoutes.js';
import authRouter from './routes/authRoute.js';
import transactionsRouter from './routes/transactionsRoute.js';
import cors from 'cors';
import categoryRoute from './routes/categoryRoute.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json())
app.get('/test', (req: Request, res: Response) => {
  return res.json({
    msg: "ok"
  })
})
app.use('/users/', usersRouter);
app.use('/accounts/', accountsRouter);
app.use('/transactions/', transactionsRouter);
app.use('/summary', summaryRouter);
app.use('/auth', authRouter);
app.use('/categories', categoryRoute);

app.listen(PORT, (err) => {
  console.log(`App is running at http://localhost:${PORT}`);
});
