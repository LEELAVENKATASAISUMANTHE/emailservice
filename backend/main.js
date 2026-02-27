import express from "express";
import dotenv from "dotenv";
import autoconsume from "./utils/autoconsume.js";
import connectMongo from "./db/models/mongo.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await connectMongo();
    await autoconsume();
});
