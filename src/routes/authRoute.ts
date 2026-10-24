import { Router } from "express";
import { loginController, refreshController, signupController } from "../controllers/authController.js";

const authRouter = Router();
authRouter.post('/signup', signupController);
authRouter.post('/login', loginController);
authRouter.post("/refresh", refreshController);

export default authRouter;