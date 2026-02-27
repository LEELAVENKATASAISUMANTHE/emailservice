import express from "express";
import dotenv from "dotenv";
import autoconsume from "./utils/autoconsume.js";
import { connectMongo } from "./db/mongo.js";
import notificationRoutes from "./routes/notification.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/api/notifications", notificationRoutes);

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await connectMongo();
    await autoconsume();
});
