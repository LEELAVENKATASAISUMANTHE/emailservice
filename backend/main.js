import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import autoconsume from "./utils/autoconsume.js";
import { connectMongo } from "./db/mongo.js";
import notificationRoutes from "./routes/notification.routes.js";
import studentRoutes from "./routes/student.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/notifications", notificationRoutes);
app.use("/api/student", studentRoutes);
app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await connectMongo();
    await autoconsume();
});
